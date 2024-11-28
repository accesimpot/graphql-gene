import {
  getDefaultTypeDefLinesObject,
  getDefaultFieldLinesObject,
  generateDefaultQueryFilterTypeDefs,
  populateArgsDefForDefaultResolver,
  type GenePlugin,
  type TypeDefLines,
} from 'graphql-gene'
import { DataTypes } from 'sequelize'
import {
  GeneModel,
  SEQUELIZE_TYPE_TO_GRAPHQL,
  SEQUELIZE_TYPE_TO_GRAPHQL_WITH_DATE_AS_STRING,
} from './constants'

type PopulateTypeDefs = GenePlugin<typeof GeneModel>['populateTypeDefs']
type PopulateTypeDefsOptions = Parameters<PopulateTypeDefs>[0]

export const populateTypeDefs: PopulateTypeDefs = options => {
  options.typeDefLines[options.typeName] =
    options.typeDefLines[options.typeName] || getDefaultTypeDefLinesObject()

  const mainTypeDef = options.typeDefLines[options.typeName]
  const attributes = options.model.getAttributes()

  Object.entries(attributes).forEach(([attributeKey, attributeValue]) => {
    const isIncluded = options.isFieldIncluded(attributeKey)
    if (!isIncluded) return

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

      mainTypeDef.lines[attributeKey] =
        mainTypeDef.lines[attributeKey] || getDefaultFieldLinesObject()
      mainTypeDef.lines[attributeKey].typeDef = graphqlType
    }
  })

  const { afterTypeDefHooks } = generateAssociationFields({
    typeDefLines: options.typeDefLines,
    model: options.model,
    isFieldIncluded: options.isFieldIncluded,
    typeName: options.typeName,
  })

  return { afterTypeDefHooks }
}

function generateAssociationFields(
  options: Pick<PopulateTypeDefsOptions, 'model' | 'isFieldIncluded' | 'typeName'> & {
    typeDefLines: TypeDefLines
  }
) {
  const lines = options.typeDefLines[options.typeName].lines
  const afterTypeDefHooks: (() => void)[] = []

  Object.entries(options.model.associations).forEach(([attributeKey, association]) => {
    if (!options.isFieldIncluded(attributeKey)) return

    const associationModelName = association.target.name
    let returnType = associationModelName
    let isList = false

    if (association.isMultiAssociation) {
      returnType = `[${returnType}!]`
      isList = true
    }

    lines[attributeKey] = lines[attributeKey] || getDefaultFieldLinesObject()
    lines[attributeKey].typeDef = returnType

    if (isList) {
      populateArgsDefForDefaultResolver({
        fieldLineConfig: lines[attributeKey],
        graphqlType: options.typeName,
        fieldKey: attributeKey,
        isList,
      })

      // Each association field is filterable (default resolver arguments)
      afterTypeDefHooks.push(() => {
        generateDefaultQueryFilterTypeDefs({
          typeDefLines: options.typeDefLines,
          graphqlType: options.typeName,
          fieldKey: attributeKey,
          fieldType: associationModelName,
          isList,
        })
      })
    }
  })
  return { afterTypeDefHooks }
}