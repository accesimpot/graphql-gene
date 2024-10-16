import type { GenePlugin } from 'graphql-gene'
import {
  getDefaultFieldLinesObject,
  getDefaultTypeDefLinesObject,
  normalizeFieldConfig,
} from './utils'
import type { GeneModel } from './defineConfig'

export const plugin = (): GenePlugin<typeof GeneModel> => {
  return {
    isMatching: model => typeof model === 'function' && !!model.prototype,

    getTypeDef: options => {
      const typeDefObject = getDefaultTypeDefLinesObject()
      const fields = new options.model()

      Object.entries(fields).forEach(([fieldKey, fieldConfig]) => {
        const normalizedFieldConfig = normalizeFieldConfig(fieldConfig as '')
        if (typeof normalizedFieldConfig.returnType !== 'string') return

        typeDefObject.lines[fieldKey] =
          typeDefObject.lines[fieldKey] || getDefaultFieldLinesObject()
        typeDefObject.lines[fieldKey].typeDef = normalizedFieldConfig.returnType
      })

      return typeDefObject
    },
  }
}
