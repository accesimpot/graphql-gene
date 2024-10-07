import type { GenePlugin, PluginSettings } from 'graphql-gene'
import type { InferAttributes } from 'sequelize'
import { Model } from 'sequelize-typescript'
import { defaultResolver } from './defaultResolver'
import { getTypeDef } from './getTypeDef'
import type { GeneModel } from './constants'

declare module 'graphql-gene/plugin-settings' {
  export interface GenePluginSettings<M> {
    sequelize: PluginSettings<{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isMatching: M extends { sequelize: any } ? true : false
      fieldName: M extends Model ? (keyof InferAttributes<M> extends string ? string : 'id') : 'id'
    }>
  }
}

export const plugin = (): GenePlugin<typeof GeneModel> => {
  return {
    isMatching: model => isSequelizeFieldConfig(model),

    getTypeDef,
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
