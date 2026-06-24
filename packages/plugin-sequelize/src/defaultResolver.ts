import { parseType, type GraphQLResolveInfo } from 'graphql'
import {
  isListType,
  type GeneDefaultResolverArgs,
  type GeneTypeConfig,
  type GraphqlToTypescript,
} from 'graphql-gene'
import type { GeneContext } from 'graphql-gene/context'
import type { Model as SequelizeModel, ModelStatic } from 'sequelize'
import { getQueryInclude, getFieldFindOptions } from './utils'
import { stripAssociationListWrapperIncludes } from './utils/includePostProcess'

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
  const model = options.model as ModelStatic<SequelizeModel>

  const isList = isListType(parseType(options.config.returnType))
  const findFn = isList ? 'findAll' : 'findOne'

  const topLevelFindOptions = getFieldFindOptions({
    args: options.args,
    isList,
    filterContext: {
      ownerGraphqlType: model.name,
      includes: [],
    },
  })
  const includeOptions = getQueryInclude(options.info)

  const mergedInclude = [...(topLevelFindOptions.include ?? []), ...(includeOptions?.include ?? [])]

  if (mergedInclude.length) {
    stripAssociationListWrapperIncludes(model, mergedInclude)
  }

  const { include: _discardedTopInclude, ...restTopLevelFindOptions } = topLevelFindOptions
  const { include: _discardedInclude, ...restIncludeOptions } = includeOptions ?? {}

  return (await model[findFn]({
    ...restTopLevelFindOptions,
    ...restIncludeOptions,
    ...(mergedInclude.length > 0 ? { include: mergedInclude } : {}),
  })) as GraphqlToTypescript<ModelKey>
}
