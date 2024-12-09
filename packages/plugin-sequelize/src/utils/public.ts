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

function getFieldConfig(sourceType: string, field: string) {
  const extendedTypes = getGloballyExtendedTypes()
  if (!(sourceType in extendedTypes)) return

  const fieldConfigs = extendedTypes[sourceType as keyof typeof extendedTypes]
  if (!fieldConfigs) return

  if (field in fieldConfigs) return normalizeFieldConfig(fieldConfigs[field])
}

function untilFindOptions(options: UntilHandlerDetails<DefaultResolverIncludeOptions>) {
  const { sourceType, field } = options
  const fieldConfig = getFieldConfig(sourceType, field)

  if (fieldConfig?.findOptions) {
    const findOptions = fieldConfig.findOptions
    return {
      afterAllSelections() {
        findOptions(options)
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

    next({ state, field, args, isList }) {
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
  targetType: ValidGraphqlType,
  options: { depth?: number; lookFromOperationRoot?: boolean } = {}
) {
  const includeOptions: DefaultResolverIncludeOptions = {}

  const until: Parameters<typeof lookahead>[0]['until'] = ({ type, nextSelectionSet }) => {
    if (type !== targetType) return false
    if (!nextSelectionSet) return false

    lookDeeper({
      info,
      state: includeOptions,
      type,
      until: untilFindOptions,
      selectionSet: nextSelectionSet,

      next({ state, field, args, isList }) {
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

  const argPage = typeof options.args.page === 'number' ? options.args.page : PAGE_ARG_DEFAULT
  const argPerPage =
    typeof options.args.perPage === 'number' ? options.args.perPage : PER_PAGE_ARG_DEFAULT

  includeOptions.offset = (argPage - 1) * argPerPage
  includeOptions.limit = argPerPage

  return includeOptions
}
