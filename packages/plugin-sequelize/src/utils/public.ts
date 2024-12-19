import { GraphQLError, type GraphQLResolveInfo } from 'graphql'
import {
  getGloballyExtendedTypes,
  isEmptyObject,
  isObject,
  normalizeFieldConfig,
  PAGE_ARG_DEFAULT,
  PER_PAGE_ARG_DEFAULT,
  QUERY_ORDER_VALUES,
  type ValidGraphqlType,
} from 'graphql-gene'
import { lookahead, lookDeeper, type UntilHandlerDetails } from 'graphql-lookahead'
import type { OrderItem } from 'sequelize'
import type { Model } from 'sequelize-typescript'
import type { DefaultResolverIncludeOptions, GeneSequelizeWhereOptions } from '../types'
import { populateWhereOptions } from './internal'
import { isMarkedAsAssociation } from './associationMap'

const QUERY_TYPE = 'Query'
const MUTATION_TYPE = 'Mutation'

export function isSequelizeFieldConfig<T>(
  fieldConfigs: T
): fieldConfigs is T extends typeof Model ? T & Model : T {
  return (
    fieldConfigs &&
    (typeof fieldConfigs === 'object' || typeof fieldConfigs === 'function') &&
    'sequelize' in fieldConfigs
  )
}

function getTypeConfig(type: string) {
  const extendedTypes = getGloballyExtendedTypes()
  if (!(type in extendedTypes.geneConfig)) return

  return extendedTypes.geneConfig[type as keyof typeof extendedTypes.geneConfig]
}

function getFieldConfig(sourceType: string, field: string) {
  const extendedTypes = getGloballyExtendedTypes()
  if (!(sourceType in extendedTypes.config)) return

  const fieldConfigs = extendedTypes.config[sourceType as keyof typeof extendedTypes.config]
  if (!fieldConfigs) return

  if (field in fieldConfigs) return normalizeFieldConfig(fieldConfigs[field])
}

function untilFindOptions(options: UntilHandlerDetails<DefaultResolverIncludeOptions>) {
  const { sourceType, type, field } = options
  const typeConfig = getTypeConfig(type)
  const fieldConfig = getFieldConfig(sourceType, field)

  if (typeConfig?.findOptions || fieldConfig?.findOptions) {
    return {
      afterAllSelections() {
        if (typeConfig?.findOptions) {
          options.state.include = options.state.include || []
          const possibleState = options.state?.include?.find(opt => opt.association === field)
          const state = possibleState || { association: field }
          if (!possibleState) options.state.include.push(state)

          typeConfig?.findOptions?.(Object.assign(options, { findOptions: state }))
        }
        // Using `Object.assign` instead of object spread operator to prevent executing the
        // getters if not requested (i.e. `fieldDef`, `args`).
        fieldConfig?.findOptions?.(Object.assign(options, { findOptions: options.state }))
      },
    }
  }
  return false
}

export function getQueryInclude(info: GraphQLResolveInfo) {
  const includeOptions: DefaultResolverIncludeOptions = {}

  lookahead({
    info,
    state: includeOptions,
    until: untilFindOptions,

    next({ state, sourceType, field, args, isList }) {
      if (!isMarkedAsAssociation(sourceType, field)) return {}

      const include = getFieldIncludeOptions({ association: field, args, isList })

      state.include = state.include || []
      state.include.push(include)

      return include
    },
  })

  return isEmptyObject(includeOptions)
    ? undefined
    : (includeOptions as Required<Pick<typeof includeOptions, 'include'>>)
}

export function getQueryIncludeOf(
  info: GraphQLResolveInfo,
  target:
    | ValidGraphqlType
    | ((details: UntilHandlerDetails<DefaultResolverIncludeOptions>) => boolean),
  options: { depth?: number; lookFromOperationRoot?: boolean } = {}
) {
  const includeOptions: DefaultResolverIncludeOptions = {}
  const isMatchingTarget: Exclude<typeof target, string> =
    typeof target === 'string' ? ({ type }) => type === target : target

  const until = (details: UntilHandlerDetails<DefaultResolverIncludeOptions>) => {
    if (!isMatchingTarget(details)) return false

    const { type, nextSelectionSet } = details
    if (!nextSelectionSet) return false

    lookDeeper({
      info,
      state: includeOptions,
      type,
      until: untilFindOptions,
      selectionSet: nextSelectionSet,

      next({ state, sourceType, field, args, isList }) {
        if (!isMarkedAsAssociation(sourceType, field)) return {}

        const include = getFieldIncludeOptions({ association: field, args, isList })

        state.include = state.include || []
        state.include.push(include)

        return include
      },
    })
    return true
  }

  const lookDeeperOptions = { info, depth: options.depth, until }

  if (options.lookFromOperationRoot) {
    lookDeeper({
      ...lookDeeperOptions,
      state: {},
      type: info.operation.operation === 'mutation' ? MUTATION_TYPE : QUERY_TYPE,
      selectionSet: info.operation.selectionSet,
    })
  } else {
    lookahead(lookDeeperOptions)
  }

  return isEmptyObject(includeOptions)
    ? undefined
    : (includeOptions as Required<Pick<typeof includeOptions, 'include'>>)
}

export function getFieldFindOptions(options: {
  args: { [arg: string]: unknown }
  isList: boolean
}) {
  return getFieldIncludeOptions(options)
}

export function getFieldIncludeOptions(options: {
  association?: string
  args: { [arg: string]: unknown }
  isList: boolean
}) {
  const includeOptions: DefaultResolverIncludeOptions = {}
  if (options.association) includeOptions.association = options.association

  const where: GeneSequelizeWhereOptions = {}

  if (!options.isList) {
    if (options.association) return includeOptions

    if (typeof options.args.id === 'string') {
      includeOptions.where = where
      includeOptions.where.id = options.args.id
    }
  }
  // TODO: Possible improvement: Return from here if not using default resolver

  if (isObject(options.args.where)) {
    includeOptions.where = where
    populateWhereOptions(options.args.where, where)
  }

  if (Array.isArray(options.args.order)) {
    const orderOptions: OrderItem[] = []

    options.args.order.forEach(fieldOrderValue => {
      if (typeof fieldOrderValue !== 'string') return

      const [, field, orderValue] =
        fieldOrderValue.match(new RegExp(`^(.+)_(${QUERY_ORDER_VALUES.join('|')})$`)) || []
      if (field && orderValue) {
        orderOptions.push([field, orderValue])
      } else {
        throw new GraphQLError('Invalid order value.')
      }
    })
    includeOptions.order = orderOptions
  }

  if (options.isList) {
    const argPage = typeof options.args.page === 'number' ? options.args.page : PAGE_ARG_DEFAULT
    const argPerPage =
      typeof options.args.perPage === 'number' ? options.args.perPage : PER_PAGE_ARG_DEFAULT

    includeOptions.offset = (argPage - 1) * argPerPage
    includeOptions.limit = argPerPage
  }

  return includeOptions
}
