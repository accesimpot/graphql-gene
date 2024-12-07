import { isObject } from '.'
import type {
  StrictExtendedTypes,
  NarrowExtendedTypes,
  StrictArgsDefinition,
} from '../defineConfig'
import type { GraphqlReturnTypes, ValidGraphqlType } from '../types'

declare global {
  // eslint-disable-next-line no-var
  var __graphqlGeneExtendedTypes: StrictExtendedTypes | undefined
}

export function getGloballyExtendedTypes() {
  globalThis.__graphqlGeneExtendedTypes = globalThis.__graphqlGeneExtendedTypes || {}

  return globalThis.__graphqlGeneExtendedTypes
}

export function extendTypes<
  T extends {
    [TypeName in keyof T]: {
      [Field in keyof T[TypeName]]: {
        [K in keyof T[TypeName][Field]]: K extends 'returnType'
          ? GraphqlReturnTypes<ValidGraphqlType>
          : K extends 'args'
            ? StrictArgsDefinition
            : T[TypeName][Field][K]
      }
    }
  },
>(types: NarrowExtendedTypes<T>) {
  const globalTypes = getGloballyExtendedTypes()

  Object.entries(types).forEach(([graphqlType, fieldConfigs]) => {
    if (!isObject(fieldConfigs)) {
      throw new Error(`Provided field config for type "${graphqlType}" must be an object.`)
    }
    const type = graphqlType as 'Query'
    globalTypes[type] = globalTypes[type] || {}
    globalTypes[type] = { ...globalTypes[type], ...fieldConfigs }
  })
}
