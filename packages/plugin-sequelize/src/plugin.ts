import {
  getDefaultTypeDefLinesObject,
  getDefaultFieldLinesObject,
  type GeneConfig,
  type GenerateSchemaOptions,
  type TypeDefLines,
  type FieldLines,
} from 'graphql-gene'
import { DataTypes, HasMany } from 'sequelize'
import { Model } from 'sequelize-typescript'
import {
  SEQUELIZE_TYPE_TO_GRAPHQL,
  SEQUELIZE_TYPE_TO_GRAPHQL_WITH_DATE_AS_STRING,
} from './constants'

type GenePlugin<M = object> = {
  /**
   * Function receiving the model and returning true if the plugin should run.
   */
  include: (model: M) => boolean

  /**
   * Return an object with the field name as key and the GraphQL type definition as value
   * @example
   * {
   *   getTypeDef: () => ({ fields: { name: 'String!', role: 'RoleEnum' } }),
   * }
   */
  getTypeDef(details: {
    model: M
    typeName: string
    exclude: string[]
    schemaOptions: GenerateSchemaOptions
  }): TypeDefLines[0]
}

// eslint-disable-next-line unused-imports/no-unused-vars
class GeneModel extends Model {
  static geneConfig?: GeneConfig
}

export const plugin = (): GenePlugin<typeof GeneModel> => {
  return {
    include: model => isSequelizeFieldConfig(model),

    getTypeDef(options) {
      const typeDefObject = getDefaultTypeDefLinesObject()
      const attributes = options.model.getAttributes()

      Object.entries(attributes).forEach(([attributeKey, attributeValue]) => {
        if (options.exclude.includes(attributeKey)) return

        const dataType = attributeValue.type.constructor.name
        let realDataType = dataType

        // Skip id field of associations
        if (attributeValue.type instanceof DataTypes.INTEGER && 'references' in attributeValue)
          return

        // Get return type of virtual attribute
        if (attributeValue.type instanceof DataTypes.VIRTUAL) {
          if (!('returnType' in attributeValue.type)) {
            throw new Error(
              `Virtual attribute "${attributeKey}" of "${options.typeName}" must have a "returnType" defined. Example using decorators: @Column(DataType.VIRTUAL(DataType.BOOLEAN))`
            )
          }
          realDataType = attributeValue.type.returnType.constructor.name
        }

        const baseTypeMap = options.schemaOptions.hasDateScalars
          ? SEQUELIZE_TYPE_TO_GRAPHQL
          : SEQUELIZE_TYPE_TO_GRAPHQL_WITH_DATE_AS_STRING

        const typeMap = { ...baseTypeMap, ...options.schemaOptions.dataTypeMap }

        if (realDataType in typeMap && typeMap[realDataType as keyof typeof typeMap]) {
          let graphqlType = typeMap[realDataType as keyof typeof typeMap]

          if (graphqlType === 'String' && attributeValue.primaryKey) graphqlType = 'ID'

          if (attributeValue.allowNull === false) graphqlType += '!'

          typeDefObject.lines[attributeKey] =
            typeDefObject.lines[attributeKey] || getDefaultFieldLinesObject()
          typeDefObject.lines[attributeKey].typeDef = graphqlType
        }
      })

      generateAssociationFields({ model: options.model, lines: typeDefObject.lines })

      return typeDefObject
    },
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

function generateAssociationFields(options: { model: typeof Model; lines: FieldLines }) {
  Object.entries(options.model.associations).forEach(([attributeKey, association]) => {
    const associationModelName = association.target.name
    let graphqlType = associationModelName

    if (association instanceof HasMany) graphqlType = `[${graphqlType}!]`

    options.lines[attributeKey].typeDef = graphqlType
  })
}
