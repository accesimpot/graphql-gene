import { defineGraphqlGeneConfig, type GeneConfig, type InferFields } from 'graphql-gene'
import { BelongsTo, Column, DataType, ForeignKey, type ModelStatic } from 'sequelize-typescript'

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

export function Polymorphic<M extends ModelStatic = ModelStatic>(
  possibleTypes: () => ModelStatic[]
) {
  return (constructor: M & { geneConfig?: GeneConfig<M> }) => {
    const BaseModel = constructor
    const targetTypes = possibleTypes()

    const exclude: string[] = []

    targetTypes.forEach(TargetModel => {
      const typeName = TargetModel.name
      const attributeName = getAttributeByModelName(typeName)
      const attributeIdName = getAttributeIdName(attributeName)

      // Define the association
      Column(DataType.INTEGER)(BaseModel.prototype, attributeIdName)
      ForeignKey(() => TargetModel)(BaseModel.prototype, attributeIdName)
      BelongsTo(() => TargetModel)(BaseModel.prototype, attributeName)

      exclude.push(attributeIdName, attributeName)
    })

    BaseModel.geneConfig = defineGraphqlGeneConfig(BaseModel, {
      exclude: exclude as InferFields<M>[],

      findOptions(details) {
        console.log(details)

        // const includeOptions: DefaultResolverIncludeOptions = {}

        // lookahead({
        //   info,
        //   state: includeOptions,
        //   until: handleUntilFindOptions,
        //   next: handleNextIncludeOptions,
        //   nextFragment: handleNextFragmentIncludeOptions,
        // })
      },
    })
  }
}
