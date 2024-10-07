import { GraphQLError, parseType, type GraphQLResolveInfo } from 'graphql'
import {
  AND_OR_OPERATORS,
  isListType,
  QUERY_ORDER_VALUES,
  type GeneContext,
  type GeneDefaultResolverArgs,
  type GeneTypeConfig,
  type GraphqlToTypescript,
  type ValueOf,
} from 'graphql-gene'
import type { FindOptions, ModelStatic, OrderItem } from 'sequelize'
import { Model } from 'sequelize-typescript'
import { getQueryInclude } from './utils'
import type { GeneSequelizeWhereOptions } from './types'
import { GENE_TO_SEQUELIZE_OPERATORS } from './constants'

export async function defaultResolver<
  M,
  ModelKey extends string,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends Record<string, string> = Record<string, string>,
>(options: {
  model: M
  modelKey: ModelKey
  config: GeneTypeConfig<TSource, TContext, TArgDefs>
  args: GeneDefaultResolverArgs<M>
  info: GraphQLResolveInfo
}) {
  const model = options.model as ModelStatic<Model>
  const includeOptions = getQueryInclude(options.info)

  const isList = isListType(parseType(options.config.returnType))
  const findFn = isList ? 'findAll' : 'findOne'

  const findOptions: Omit<FindOptions, 'where' | 'order'> & {
    where?: GeneSequelizeWhereOptions
    order?: OrderItem[]
  } = {}
  const { args } = options

  if (isList) {
    findOptions.offset = args.page * args.perPage
    findOptions.limit = args.perPage
  } else if (args.id) {
    findOptions.where = findOptions.where || {}
    findOptions.where.id = args.id
  }

  if (args.where) {
    findOptions.where = findOptions.where || {}
    const whereOptions = findOptions.where
    populateWhereOptions(args.where, whereOptions)
  }

  if (args.order) {
    findOptions.order = findOptions.order || []
    const orderOptions = findOptions.order

    args.order.forEach(fieldOrderValue => {
      const [, field, orderValue] =
        fieldOrderValue.match(new RegExp(`^(.+)_(${QUERY_ORDER_VALUES.join('|')})$`)) || []
      if (field && orderValue) {
        orderOptions.push([field, orderValue])
      } else {
        throw new GraphQLError('Invalid order value.')
      }
    })
  }
  return (await model[findFn]({
    ...findOptions,
    ...includeOptions,
  })) as GraphqlToTypescript<ModelKey>
}

function populateWhereOptions<M>(
  whereArgs: GeneDefaultResolverArgs<M>['where'],
  state: GeneSequelizeWhereOptions
) {
  for (const attr in whereArgs) {
    const parseOperators = (
      operator: string,
      value:
        | (typeof whereArgs)[keyof typeof whereArgs]
        | (typeof whereArgs)[keyof typeof whereArgs][]
    ) => {
      if (!(operator in GENE_TO_SEQUELIZE_OPERATORS)) return

      const findOptionsGetter =
        GENE_TO_SEQUELIZE_OPERATORS[operator as keyof typeof GENE_TO_SEQUELIZE_OPERATORS]
      return findOptionsGetter(value as string)
    }

    if (AND_OR_OPERATORS.includes(attr)) {
      const nestedWheres: ValueOf<GeneSequelizeWhereOptions>[] = []
      const parsedOperators = parseOperators(attr, nestedWheres)

      if (parsedOperators) {
        const [op] = parsedOperators
        state[op] = nestedWheres as (typeof state)[symbol]

        if (Array.isArray(state[op]) && Array.isArray(whereArgs[attr])) {
          whereArgs[attr].forEach((nestedWhereArgs: typeof whereArgs) => {
            const nextState = {} as GeneSequelizeWhereOptions
            state[op].push(nextState)
            populateWhereOptions(nestedWhereArgs, nextState)
          })
        }
      }
    } else {
      state[attr] = state[attr] || {}

      Object.entries(whereArgs[attr]).forEach(([operator, value]) => {
        const parsedOperators = parseOperators(operator, value)
        if (!parsedOperators) return

        const [op, opValue] = parsedOperators
        state[attr][op] = opValue
      })
    }
  }
}
