import type { StrictExtendedTypes, NarrowExtendedTypes } from '../defineConfig'

declare global {
  // eslint-disable-next-line no-var
  var __graphqlGeneExtendedTypes: StrictExtendedTypes | undefined
}

export function getGloballyExtendedTypes() {
  globalThis.__graphqlGeneExtendedTypes = globalThis.__graphqlGeneExtendedTypes || {}

  return globalThis.__graphqlGeneExtendedTypes
}

export function extendTypes<T extends Record<string, Record<string, object>>>(
  types: NarrowExtendedTypes<T>
) {
  const globalTypes = getGloballyExtendedTypes()

  Object.entries(types).forEach(([graphqlType, fieldConfigs]) => {
    const type = graphqlType as 'Query'
    globalTypes[type] = globalTypes[type] || {}
    globalTypes[type] = { ...globalTypes[type], ...fieldConfigs }
  })
}
