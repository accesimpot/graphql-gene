import { GraphQLError, isListType as isListTypeObject, type GraphQLResolveInfo } from 'graphql'
import { isObject, QUERY_ORDER_VALUES, type ValidGraphqlType } from 'graphql-gene'
import { lookahead, lookDeeper } from 'graphql-lookahead'
import type { IncludeOptions, OrderItem } from 'sequelize'
import type { Model } from 'sequelize-typescript'
import type { GeneSequelizeWhereOptions } from '../types'
import { populateWhereOptions, isEmptyObject } from './internal'

type DefaultResolverIncludeOptions = Pick<
  IncludeOptions,
  'where' | 'order' | 'association' | 'limit'
> & {
  include?: DefaultResolverIncludeOptions[]
  /**
   * "offset" is missing in IncludeOptions
   * @see https://github.com/sequelize/sequelize/issues/12969
   */
  offset?: number
}

const QUERY_TYPE = 'Query'

export function isSequelizeFieldConfig<T>(
  fieldConfigs: T
): fieldConfigs is T extends typeof Model ? T & Model : T {
  return (
    fieldConfigs &&
    (typeof fieldConfigs === 'object' || typeof fieldConfigs === 'function') &&
    'sequelize' in fieldConfigs
  )
}

export function getQueryInclude(info: GraphQLResolveInfo) {
  const includeOptions: DefaultResolverIncludeOptions = {}

  lookahead({
    info,
    state: includeOptions,

    next({ state, field, fieldDef, args }) {
      const isList = isListTypeObject(fieldDef.type)
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
      selectionSet: nextSelectionSet,

      next({ state, field, fieldDef, args }) {
        const isList = isListTypeObject(fieldDef.type)
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
      type: QUERY_TYPE,
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

  // Both "page" and "perPage" arguments have default values so they should always be numbers
  // if they are valid.
  if (typeof options.args.page === 'number' && typeof options.args.perPage === 'number') {
    includeOptions.offset = options.args.page * options.args.perPage
    includeOptions.limit = options.args.perPage
  }

  return includeOptions
}
