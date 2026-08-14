import type { GenePlugin, PluginSettings, PrototypeOrNot, TypeDefLines } from 'graphql-gene'
import type { InferAttributes, Sequelize } from 'sequelize'
import { Model } from 'sequelize-typescript'
import { attachAssociationListWrapperResolvers } from './associationListResolvers'
import { attachGqlSourceHydrationResolvers } from './attachGqlSourceHydration'
import { defaultResolver } from './defaultResolver'
import { populateTypeDefs } from './populateTypeDefs'
import type { GeneModel } from './constants'
import type { DefaultResolverIncludeOptions } from './types'
import { isSequelizeFieldConfig } from './utils/public'

declare module 'graphql-gene/plugin-settings' {
  export interface GenePluginSettings<M> {
    sequelize: PluginSettings<{
      isMatching: PrototypeOrNot<M> extends Model ? true : false
      fieldName: PrototypeOrNot<M> extends Model
        ? keyof InferAttributes<PrototypeOrNot<M>> extends string
          ? keyof InferAttributes<PrototypeOrNot<M>>
          : 'id'
        : 'id'
      findOptionsState: DefaultResolverIncludeOptions
      modelClassOf: PrototypeOrNot<M> extends Model
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          abstract new (...args: any) => PrototypeOrNot<M>
        : never
    }>
  }
}

export type SequelizePluginOptions = {
  /**
   * The Sequelize instance your models are registered with. Passing it guarantees the models
   * are initialized (attributes and associations) before the schema is generated, instead of
   * relying on the module evaluation order of the file defining the instance.
   */
  sequelize?: Sequelize
}

export const plugin = (options: SequelizePluginOptions = {}): GenePlugin<typeof GeneModel> => {
  if (options.sequelize && !Object.keys(options.sequelize.models).length) {
    throw new Error(
      'The Sequelize instance given to "pluginSequelize" has no registered model. Pass your models to `new Sequelize({ models })` or `sequelize.addModels`.'
    )
  }

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

    attachSchemaResolvers({ schema, types }) {
      attachAssociationListWrapperResolvers(schema, types)
      attachGqlSourceHydrationResolvers(schema, types)
    },
  }
}
