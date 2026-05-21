import { GraphQLError, getNamedType, type GraphQLResolveInfo } from 'graphql'
import {
  getGloballyExtendedTypes,
  isEmptyObject,
  isObject,
  isRegisteredPolymorphicAbstractType,
  normalizeFieldConfig,
  LIMIT_ARG_DEFAULT,
  QUERY_ORDER_VALUES,
  SKIP_ARG_DEFAULT,
  type ValidGraphqlType,
} from 'graphql-gene'
import {
  lookahead,
  lookDeeper,
  type UntilHandlerDetails,
  type NextHandlerDetails,
  type NextFragmentHandlerDetails,
} from 'graphql-lookahead'
import type { OrderItem } from 'sequelize'
import type { Model } from 'sequelize-typescript'
import type { DefaultResolverIncludeOptions, GeneSequelizeWhereOptions } from '../types'
import { populateWhereOptions, type PopulateWhereOptionsContext } from './internal'
import {
  GENE_ASSOCIATION_LIST_ITEMS_FIELD,
  getGeneAssociationListWrapperMeta,
} from './associationListRegistry'
import {
  isAssociationListWrapperOutputType,
  scanAssociationWrapperFacets,
} from './associationListWrapperShape'
import { isMarkedAsAssociation } from './associationMap'
import { getAttributeByModelName } from './polymorphic'
import { isSafeArray } from './guards'

export * from './polymorphic'
export { markFieldAsAssociation, isMarkedAsAssociation } from './associationMap'

/** Frames the current Sequelize include object when traversing synthetic wrapper facets so lookahead state stays distinct from ORM include shapes. */
const GENE_ASSOCIATION_INCLUDE_FRAME_KEY = '__geneAssociationIncludeFrame'

function unwrapAssociationIncludeFrame(state: unknown): DefaultResolverIncludeOptions {
  if (
    isObject(state) &&
    GENE_ASSOCIATION_INCLUDE_FRAME_KEY in state &&
    isObject((state as Record<string, unknown>)[GENE_ASSOCIATION_INCLUDE_FRAME_KEY])
  ) {
    return (state as Record<string, DefaultResolverIncludeOptions>)[
      GENE_ASSOCIATION_INCLUDE_FRAME_KEY
    ]
  }
  return state as DefaultResolverIncludeOptions
}

function frameAssociationInclude(
  include: DefaultResolverIncludeOptions
): DefaultResolverIncludeOptions {
  return {
    [GENE_ASSOCIATION_INCLUDE_FRAME_KEY]: include,
  } as unknown as DefaultResolverIncludeOptions
}

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

function handleUntilFindOptions(options: UntilHandlerDetails<DefaultResolverIncludeOptions>) {
  const rootState = unwrapAssociationIncludeFrame(options.state)
  const { sourceType, type, field } = options
  const typeConfig = getTypeConfig(type)
  const fieldConfig = getFieldConfig(sourceType, field)

  if (
    getGeneAssociationListWrapperMeta(sourceType) &&
    field === GENE_ASSOCIATION_LIST_ITEMS_FIELD
  ) {
    if (!typeConfig?.findOptions && !fieldConfig?.findOptions) return false

    return {
      afterAllSelections() {
        typeConfig?.findOptions?.(Object.assign(options, { findOptions: rootState }))
        fieldConfig?.findOptions?.(Object.assign(options, { findOptions: rootState }))
      },
    }
  }

  if (typeConfig?.findOptions || fieldConfig?.findOptions) {
    return {
      afterAllSelections() {
        if (typeConfig?.findOptions) {
          rootState.include = rootState.include || []
          const possibleState = rootState.include?.find(opt => opt.association === field)
          const nestedState = possibleState || { association: field }
          if (!possibleState) rootState.include.push(nestedState)

          typeConfig?.findOptions?.(Object.assign(options, { findOptions: nestedState }))
        }
        fieldConfig?.findOptions?.(Object.assign(options, { findOptions: rootState }))
      },
    }
  }
  return false
}

function handleNextIncludeOptions(details: NextHandlerDetails<DefaultResolverIncludeOptions>) {
  const {
    state: rawState,
    sourceType,
    field,
    args,
    isList,
    nextSelectionSet,
    info,
    fieldDef,
  } = details
  const state = unwrapAssociationIncludeFrame(rawState)

  if (
    getGeneAssociationListWrapperMeta(sourceType) &&
    field === GENE_ASSOCIATION_LIST_ITEMS_FIELD
  ) {
    return frameAssociationInclude(state)
  }

  if (!isMarkedAsAssociation(sourceType, field)) return {}

  const namedReturn = getNamedType(fieldDef.type)

  if (isAssociationListWrapperOutputType(fieldDef.type)) {
    const { hasItems, hasCount } = scanAssociationWrapperFacets(
      info,
      namedReturn.name,
      nextSelectionSet
    )
    if (!hasItems || !hasCount) return {}

    const include = getFieldIncludeOptions({
      association: field,
      args,
      isList: true,
    })

    state.include = state.include || []
    state.include.push(include)

    return include
  }

  const include = getFieldIncludeOptions({
    association: field,
    args,
    isList,
  })

  state.include = state.include || []
  state.include.push(include)

  return include
}

function handleNextFragmentIncludeOptions(
  details: NextFragmentHandlerDetails<DefaultResolverIncludeOptions>
) {
  const state = unwrapAssociationIncludeFrame(details.state)
  const { type, sourceType } = details
  if (!isRegisteredPolymorphicAbstractType(sourceType)) return {}

  const include: DefaultResolverIncludeOptions = { association: getAttributeByModelName(type) }

  state.include = state.include || []
  state.include.push(include)

  return include
}

export function getQueryInclude(info: GraphQLResolveInfo) {
  const includeOptions: DefaultResolverIncludeOptions = {}

  lookahead({
    info,
    state: includeOptions,
    until: handleUntilFindOptions,
    next: handleNextIncludeOptions,
    nextFragment: handleNextFragmentIncludeOptions,
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
      until: handleUntilFindOptions,
      selectionSet: nextSelectionSet,

      next: handleNextIncludeOptions,
      nextFragment: handleNextFragmentIncludeOptions,
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
  omitAssociation?: boolean
  filterContext?: PopulateWhereOptionsContext
}) {
  return getFieldIncludeOptions(options)
}

export function getFieldIncludeOptions(options: {
  association?: string
  args: { [arg: string]: unknown }
  isList: boolean
  omitAssociation?: boolean
  /** Enables one-level-deep association predicates in `where` (see PLAN §2.7). */
  filterContext?: PopulateWhereOptionsContext
}) {
  const includeOptions: DefaultResolverIncludeOptions = {}
  if (options.association && !options.omitAssociation) {
    includeOptions.association = options.association
  }

  const where: GeneSequelizeWhereOptions = {}
  const deepIncludes: DefaultResolverIncludeOptions[] = []

  if (!options.isList) {
    if (options.association && !options.omitAssociation) return includeOptions

    if (typeof options.args.id === 'string') {
      includeOptions.where = where
      includeOptions.where.id = options.args.id
    }
  }

  if (isObject(options.args.where)) {
    includeOptions.where = where
    populateWhereOptions(
      options.args.where,
      where,
      options.filterContext ? { ...options.filterContext, includes: deepIncludes } : undefined
    )
  }

  if (deepIncludes.length) {
    includeOptions.include = includeOptions.include || []
    includeOptions.include.push(...deepIncludes)
  }

  if (isSafeArray(options.args.order)) {
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
    const skip = typeof options.args.skip === 'number' ? options.args.skip : SKIP_ARG_DEFAULT
    const limit = typeof options.args.limit === 'number' ? options.args.limit : LIMIT_ARG_DEFAULT

    includeOptions.offset = skip
    includeOptions.limit = limit
  }

  return includeOptions
}
