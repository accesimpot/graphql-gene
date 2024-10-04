import type { GraphQLResolveInfo } from 'graphql'
import type { NestedObject, ValidGraphqlType } from 'graphql-gene'
import { lookahead, lookDeeper } from 'graphql-lookahead'
import type { IncludeOptions } from 'sequelize'
import type { Model } from 'sequelize-typescript'

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
  const includeOptions: IncludeOptions = {}

  lookahead({
    info,
    state: includeOptions,

    next({ state, field }) {
      const nextState: IncludeOptions = { association: field }

      state.include = state.include || []
      state.include.push(nextState)

      return nextState
    },
  })
  return includeOptions
}

export function getQueryIncludeOf(info: GraphQLResolveInfo, targetType: ValidGraphqlType) {
  const includedAssociations: NestedObject = {}

  lookahead({
    info,

    next({ type, nextSelectionSet }) {
      if (type !== targetType) return

      lookDeeper({
        info,
        state: includedAssociations,
        type,
        selectionSet: nextSelectionSet,

        next({ state, field }) {
          state[field] = state[field] || {}
          return state[field]
        },
      })
    },
  })
  return buildIncludeOptions(includedAssociations)
}

export function buildIncludeOptions(nestedObject: NestedObject) {
  const includeOptions: IncludeOptions = {}

  const build = (state: IncludeOptions, obj: NestedObject) => {
    for (const field in obj) {
      const nextState: IncludeOptions = { association: field }
      state.include = state.include || []
      state.include.push(nextState)

      build(nextState, obj[field])
    }
  }
  build(includeOptions, nestedObject)

  return includeOptions
}
