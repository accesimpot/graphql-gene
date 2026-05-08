import {
  defineGraphqlGeneConfig,
  registerPolymorphicAbstractType,
  type GeneConfig,
  type GraphqlTypeName,
  type InferFields,
} from 'graphql-gene'
import { BelongsTo, Column, DataType, ForeignKey, type ModelStatic } from 'sequelize-typescript'

/**
 * Declares a polymorphic hub model: one join row points to exactly one concrete block
 * (or other variant) via Sequelize `BelongsTo` + FK columns that this decorator injects.
 *
 * Usage:
 * `@Polymorphic(() => [HeroBlock, TextBlock])` right before `@Table`.
 *
 * Sequelize’s default shape for a nested `HasMany`/`include` keeps one property per concrete
 * association on each hub instance, e.g.
 * `blocks = [{ heroBlock: HeroBlock, textBlock: null }, { heroBlock: null, textBlock: TextBlock }]`.
 * A type-level Gene directive then rewrites the parent field so GraphQL resolvers see an array
 * of concrete model instances (`instanceof HeroBlock` / `TextBlock`), e.g.
 * `[hero, text]`, which matches how clients query with `... on HeroBlock` / `... on TextBlock`.
 *
 * GraphQL’s `resolveType` for the hub interface maps each list element to the concrete
 * GraphQL type using `__typename` when set, otherwise `constructor.name`
 * (see `graphql-gene` → `polymorphicConcreteTypeName` / `attachPolymorphicAbstractResolveTypes`).
 *
 * @param possibleTypes - Factory returning concrete Sequelize model classes this hub can join to.
 */
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
          /**
           * Rewrites `source[field]` (e.g. `page.blocks`) from hub rows with populated
           * `heroBlock` / `textBlock` (and nulls on the rest) into the single loaded concrete
           * instance per row via {@link resolveAssociation}, so the value shape matches
           * GraphQL fragments and `resolveType` (`constructor.name`).
           */
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

/**
 * Picks the Sequelize nested instance that was actually included for this row
 * (see `_options.includeNames`), or returns the hub row unchanged.
 */
function resolveAssociation(item: ModelStatic & { _options?: { includeNames?: string[] } }) {
  const { includeNames = [] } = item._options || {}
  // e.g. includeNames = ['heroBlock', 'textBlock']

  for (const name of includeNames) {
    const association = item[name as keyof typeof item]
    if (association) return association // return the concrete instance
  }
  return item // return the hub row unchanged as a fallback
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
