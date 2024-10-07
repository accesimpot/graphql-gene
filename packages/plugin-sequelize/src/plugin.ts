import type { GenePlugin } from 'graphql-gene'
import { Model } from 'sequelize-typescript'

import { defaultResolver } from './defaultResolver'
import { getTypeDef } from './getTypeDef'
import type { GeneModel } from './constants'
import type { InferAttributes } from 'sequelize'

declare module 'graphql-gene/plugin-settings' {
  export interface GenePluginSettings<M> {
    sequelize: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isMatching: M extends { sequelize: any } ? true : false
      fields: M extends Model ? keyof InferAttributes<M> : 'id'
    }
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
