import {
  getDefaultTypeDefLinesObject,
  getDefaultFieldLinesObject,
  type FieldLines,
  type GenePlugin,
} from 'graphql-gene'
import { DataTypes, HasMany } from 'sequelize'
import { Model } from 'sequelize-typescript'
import {
  GeneModel,
  SEQUELIZE_TYPE_TO_GRAPHQL,
  SEQUELIZE_TYPE_TO_GRAPHQL_WITH_DATE_AS_STRING,
} from './constants'

export const getTypeDef: GenePlugin<typeof GeneModel>['getTypeDef'] = options => {
  const typeDefObject = getDefaultTypeDefLinesObject()
  const attributes = options.model.getAttributes()

  Object.entries(attributes).forEach(([attributeKey, attributeValue]) => {
    if (!options.isFieldIncluded(attributeKey)) return

    const dataType = attributeValue.type.constructor.name
    let realDataType = dataType

    // Skip id field of associations
    if (attributeValue.type instanceof DataTypes.INTEGER && 'references' in attributeValue) return

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
}

function generateAssociationFields(options: { model: typeof Model; lines: FieldLines }) {
  Object.entries(options.model.associations).forEach(([attributeKey, association]) => {
    const associationModelName = association.target.name
    let graphqlType = associationModelName

    if (association instanceof HasMany) graphqlType = `[${graphqlType}!]`

    options.lines[attributeKey] = options.lines[attributeKey] || getDefaultFieldLinesObject()
    options.lines[attributeKey].typeDef = graphqlType
  })
}
