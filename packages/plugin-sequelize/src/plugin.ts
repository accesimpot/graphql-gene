import type { GenePlugin, PluginSettings, PrototypeOrNot, TypeDefLines } from 'graphql-gene'
import type { InferAttributes } from 'sequelize'
import { Model } from 'sequelize-typescript'
import { defaultResolver } from './defaultResolver'
import { populateTypeDefs } from './populateTypeDefs'
import type { GeneModel } from './constants'

declare module 'graphql-gene/plugin-settings' {
  export interface GenePluginSettings<M> {
    sequelize: PluginSettings<{
      isMatching: PrototypeOrNot<M> extends Model ? true : false
      fieldName: PrototypeOrNot<M> extends Model
        ? keyof InferAttributes<PrototypeOrNot<M>> extends string
          ? keyof InferAttributes<PrototypeOrNot<M>>
          : 'id'
        : 'id'
    }>
  }
}

export const plugin = (): GenePlugin<typeof GeneModel> => {
  return {
    isMatching: model => isSequelizeFieldConfig(model),

    /**
     * @deprecated In favor of "populateTypeDefs"
     */
    getTypeDef(options) {
      const typeDefLines: TypeDefLines = {}
      populateTypeDefs({ typeDefLines, ...options })

      return typeDefLines[options.typeName]
    },
    populateTypeDefs,
    defaultResolver,
  }
}

function isSequelizeFieldConfig<T>(
  fieldConfigs: T
): fieldConfigs is T extends typeof Model ? T & Model : T {
  return (
    fieldConfigs &&
    (typeof fieldConfigs === 'object' || typeof fieldConfigs === 'function') &&
    'sequelize' in fieldConfigs
  )
}
