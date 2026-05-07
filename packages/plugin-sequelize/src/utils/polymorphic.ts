import {
  defineGraphqlGeneConfig,
  registerPolymorphicAbstractType,
  type GeneConfig,
  type GraphqlTypeName,
  type InferFields,
} from 'graphql-gene'
import { BelongsTo, Column, DataType, ForeignKey, type ModelStatic } from 'sequelize-typescript'

export function Polymorphic<M extends ModelStatic = ModelStatic>(
  possibleTypes: () => ModelStatic[]
) {
  return (constructor: M & { geneConfig?: GeneConfig<M> }) => {
    const BaseModel = constructor
    const BaseModelName = BaseModel.name as GraphqlTypeName
    const rawTargetTypes = possibleTypes()
    const targetTypes = rawTargetTypes as (ModelStatic & { geneConfig?: GeneConfig })[]

    targetTypes.forEach(TargetModel => {
      const typeName = TargetModel.name
      const attributeName = getAttributeByModelName(typeName)
      const attributeIdName = getAttributeIdName(attributeName)

      // Define the association
      Column(DataType.INTEGER)(BaseModel.prototype, attributeIdName)
      ForeignKey(() => TargetModel)(BaseModel.prototype, attributeIdName)
      BelongsTo(() => TargetModel)(BaseModel.prototype, attributeName)

      TargetModel.geneConfig = TargetModel.geneConfig || {}
      TargetModel.geneConfig.__implementedInterfaces =
        TargetModel.geneConfig.__implementedInterfaces || []

      TargetModel.geneConfig.__implementedInterfaces.push(BaseModelName)
    })

    registerPolymorphicAbstractType(BaseModelName)

    BaseModel.geneConfig = defineGraphqlGeneConfig(BaseModel, {
      varType: 'interface',
      include: ['id' as InferFields<M>],

      directives: [
        {
          name: '',
          handler({ source, field }) {
            const rawItems = source[field as keyof typeof source] as ModelStatic | ModelStatic[]
            const items = Array.isArray(rawItems) ? rawItems : [rawItems]

            // Overwrite original field entries
            source[field as keyof typeof source] = items.map(resolveAssociation)
          },
        },
      ],
    })
  }
}

function resolveAssociation(item: ModelStatic & { _options?: { includeNames?: string[] } }) {
  const { includeNames = [] } = item._options || {}

  for (const name of includeNames) {
    const association = item[name as keyof typeof item]
    if (association) return association
  }
  return item
}

/**
 * Get the expected attribute name for a given associated model.
 * @example
 * getAttributeByModelName('HeroBlock') // => 'heroBlock'
 * getAttributeByModelName('TextBlock') // => 'textBlock'
 */
export function getAttributeByModelName(modelName: string) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

function getAttributeIdName(attributeName: string) {
  return `${attributeName}Id`
}
