import { parseType, type GraphQLResolveInfo } from 'graphql'
import {
  isListType,
  type GeneDefaultResolverArgs,
  type GeneTypeConfig,
  type GraphqlToTypescript,
} from 'graphql-gene'
import type { GeneContext } from 'graphql-gene/context'
import type { ModelStatic } from 'sequelize'
import { Model } from 'sequelize-typescript'
import { getQueryInclude, getFieldFindOptions } from './utils'

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

  const isList = isListType(parseType(options.config.returnType))
  const findFn = isList ? 'findAll' : 'findOne'

  const topLevelFindOptions = getFieldFindOptions({ args: options.args, isList })
  const includeOptions = getQueryInclude(options.info)

  return (await model[findFn]({
    ...topLevelFindOptions,
    include: includeOptions,
  })) as GraphqlToTypescript<ModelKey>
}
