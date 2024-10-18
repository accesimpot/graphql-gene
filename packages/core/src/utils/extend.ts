import type { ExtendedTypes } from '../defineConfig'

declare global {
  // eslint-disable-next-line no-var
  var __graphqlGeneExtendedTypes: ExtendedTypes | undefined
}

export function getGloballyExtendedTypes() {
  globalThis.__graphqlGeneExtendedTypes = globalThis.__graphqlGeneExtendedTypes || {}

  return globalThis.__graphqlGeneExtendedTypes
}

export function extendTypes(types: ExtendedTypes) {
  const globalTypes = getGloballyExtendedTypes()

  Object.entries(types).forEach(([graphqlType, fieldConfigs]) => {
    const type = graphqlType as 'Query'
    globalTypes[type] = globalTypes[type] || {}
    globalTypes[type] = { ...globalTypes[type], ...fieldConfigs }
  })
}
