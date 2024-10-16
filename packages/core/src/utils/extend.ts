import type { GeneTypeConfig, QueryMutationTypes } from '../defineConfig'
import type { GraphQLFieldName, SomeRequired } from '../types'

declare global {
  // eslint-disable-next-line no-var
  var __graphqlGeneQueryMutationTypes: QueryMutationTypes | undefined

  // eslint-disable-next-line no-var
  var __graphqlGeneQueryFieldModel: Record<string, unknown>
}

export function getExtendedQueryMutationTypes() {
  globalThis.__graphqlGeneQueryMutationTypes = globalThis.__graphqlGeneQueryMutationTypes || {}

  return globalThis.__graphqlGeneQueryMutationTypes
}

export function getModelForQueryField(queryField: string) {
  globalThis.__graphqlGeneQueryFieldModel = globalThis.__graphqlGeneQueryFieldModel || {}

  if (queryField in globalThis.__graphqlGeneQueryFieldModel) {
    return globalThis.__graphqlGeneQueryFieldModel[queryField]
  }
}

export function extendQuery<M>(
  model: M,
  queryFields: Record<GraphQLFieldName, SomeRequired<GeneTypeConfig, 'resolver'>>
) {
  const globalTypes = getExtendedQueryMutationTypes()

  Object.keys(queryFields).forEach(fieldName => {
    globalThis.__graphqlGeneQueryFieldModel = globalThis.__graphqlGeneQueryFieldModel || {}
    globalThis.__graphqlGeneQueryFieldModel[fieldName] = model
  })

  globalTypes.Query = { ...globalTypes.Query, ...(queryFields as typeof globalTypes.Query) }
}
