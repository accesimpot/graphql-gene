import type {
  StrictExtendedTypes,
  NarrowExtendedTypes,
  StrictArgsDefinition,
  GeneDirectiveConfig,
  GeneConfig,
} from '../defineConfig'
import type { GraphqlReturnTypes, ValidGraphqlType } from '../types'
import { isObject } from '.'

declare global {
  // eslint-disable-next-line no-var
  var __graphqlGeneExtendedTypes:
    | { config: StrictExtendedTypes; geneConfig: { [type: string]: GeneConfig | undefined } }
    | undefined
}

export function getGloballyExtendedTypes(): NonNullable<
  typeof globalThis.__graphqlGeneExtendedTypes
> {
  globalThis.__graphqlGeneExtendedTypes = globalThis.__graphqlGeneExtendedTypes ?? {
    config: {},
    geneConfig: {},
  }

  return globalThis.__graphqlGeneExtendedTypes
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setGeneConfigByType<TGeneConfig extends GeneConfig<any>>(
  type: string,
  geneConfig: TGeneConfig | undefined
) {
  if (!geneConfig) return

  const globalTypes = getGloballyExtendedTypes()
  globalTypes.geneConfig[type] = geneConfig
}

export function extendTypes<
  T extends {
    [TypeName in keyof T]: {
      [Field in keyof T[TypeName]]: {
        [K in keyof T[TypeName][Field]]: K extends 'returnType'
          ? GraphqlReturnTypes<ValidGraphqlType>
          : K extends 'args'
            ? StrictArgsDefinition
            : K extends 'directives'
              ? GeneDirectiveConfig[]
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
    globalTypes.config[type] = globalTypes.config[type] || {}
    globalTypes.config[type] = { ...globalTypes.config[type], ...fieldConfigs }
  })
}
