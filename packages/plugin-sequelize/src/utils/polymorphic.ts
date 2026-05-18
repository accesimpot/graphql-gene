import {
  defineGraphqlGeneConfig,
  registerPolymorphicAbstractType,
  type GeneConfig,
  type GraphqlTypeName,
  type InferFields,
} from 'graphql-gene'
import { BelongsTo, HasMany, type ModelStatic } from 'sequelize-typescript'

type ModelStaticWithGene = ModelStatic & { geneConfig?: GeneConfig }

/** Column naming for Sequelize’s polymorphic junction (`BelongsTo` + inverse scoped `HasMany`). */
export type PolymorphicJunctionOptions = {
  /** Attribute storing the FK to the concrete row (same column on every polymorphic association). */
  foreignKey: string
  /** Stored value equals `TargetModel.name` for each row (`HeroBlock`, `TextBlock`, …). */
  discriminatorKey: string
}

/** Reads a column from a Sequelize `Model` instance (`get(key)` when available, else property access). */
function getModelAttributeValue(record: unknown, key: string): unknown {
  if (record !== null && typeof record === 'object' && 'get' in record) {
    const getter = (record as { get: (k: string) => unknown }).get
    if (typeof getter === 'function') return getter.call(record, key)
  }

  return (record as Record<string, unknown>)[key]
}

/**
 * Declares a polymorphic **hub / junction** row: exactly one concrete model is referenced via one shared FK +
 * discriminator on the pivot.
 *
 * Sequelize expects the discriminator to be enforced by an **inverse, scoped `HasMany` from each concrete model
 * back to this hub**, while the hub declares plain `BelongsTo` accessors without `scope` (see Sequelize polymorphic /
 * association-scopes docs).
 *
 * Usage (`@Polymorphic` immediately before `@Table`, after declaring junction columns):
 *
 * ```ts
 * @Column(DataType.INTEGER)
 * declare blockId!: number | null;
 *
 * @Column(DataType.STRING)
 * declare blockType!: string | null;
 *
 * @Polymorphic(() => [HeroBlock, TextBlock], { foreignKey: 'blockId', discriminatorKey: 'blockType' })
 * @Table
 * export class PageBlock extends Model {}
 * ```
 *
 * The FK and discriminator columns must exist on this hub model (`foreignKey` / `discriminatorKey`).
 *
 * This matches Sequelize’s polymorphic junction pattern (“many‑to‑many polymorphic” pivot row), see:
 * [`sequelize.org` polymorphic junction](https://sequelize.org/docs/v6/advanced-association-concepts/polymorphic-associations/#configuring-a-many-to-many-polymorphic-association).
 *
 * **Why junction instead of nullable FK-per-type columns**
 *
 * - `limit`, `skip`, and list-level filters apply to pivot rows (`Page.blocks`) as one list, not separately per association.
 * - Operations that select only `{ id __typename }` can be satisfied from the discriminator + FK on the junction row
 *   so clients never need phantom includes for concrete tables.
 *
 * GraphQL lookahead still maps inline fragments like `... on HeroBlock` to the matching nested Sequelize include
 * (`association: 'heroBlock'`, casing derived from `{Model.name}` via {@link getAttributeByModelName}).
 *
 * `resolveType` on the hub interface prefers `__typename` on emitted values (`polymorphicConcreteTypeName`).
 *
 * @param possibleTypes — Factory returning concrete Sequelize models this pivot can attach to.
 */
export function Polymorphic<M extends ModelStatic = ModelStatic>(
  possibleTypes: () => ModelStatic[],
  junction: PolymorphicJunctionOptions
) {
  return (constructor: M & { geneConfig?: GeneConfig<M> }) => {
    const BaseModel = constructor
    const BaseModelName = BaseModel.name as GraphqlTypeName
    const rawTargetTypes = possibleTypes()
    const targetTypes = rawTargetTypes as ModelStatic[]
    const associationNames = targetTypes.map(t => getAttributeByModelName(t.name))

    targetTypes.forEach(_TargetModel => {
      const TargetModel = _TargetModel as ModelStaticWithGene
      const typeName = TargetModel.name as string
      const attributeName = getAttributeByModelName(typeName)
      const inverseKey = buildInversePolymorphicHasManyKey(BaseModel.name, typeName)

      HasMany(() => BaseModel as ModelStatic, {
        foreignKey: junction.foreignKey,
        constraints: false,
        scope: { [junction.discriminatorKey]: typeName },
      })(TargetModel.prototype, inverseKey)

      if (!TargetModel.geneConfig) {
        TargetModel.geneConfig = defineGraphqlGeneConfig(TargetModel, {}) as GeneConfig
      }

      ensureAssociationExcludedFromGeneConfig(TargetModel, inverseKey)

      BelongsTo(() => TargetModel, {
        foreignKey: junction.foreignKey,
        constraints: false,
      })(BaseModel.prototype, attributeName)

      const concreteGeneConfig = TargetModel.geneConfig
      concreteGeneConfig.__implementedInterfaces =
        concreteGeneConfig.__implementedInterfaces || []

      concreteGeneConfig.__implementedInterfaces.push(BaseModelName)
    })

    registerPolymorphicAbstractType(BaseModelName)

    BaseModel.geneConfig = defineGraphqlGeneConfig(BaseModel, {
      varType: 'interface',
      include: ['id' as InferFields<M>],

      __polymorphicJunction: {
        foreignKey: junction.foreignKey,
        discriminatorKey: junction.discriminatorKey,
      },
      __polymorphicAssociations: associationNames,

      directives: [
        {
          name: '',
          /**
           * Normalizes Sequelize hub rows (`PageBlock`): prefer eager-loaded concrete `heroBlock` / `textBlock`
           * when present; otherwise emit `{ id, __typename }` from the discriminator + FK for type-only selections.
           * Uses {@link resolvePolymorphicHubRow} per list item.
           */
          handler({ source, field }) {
            const rawItems = source[field as keyof typeof source] as unknown
            const items = Array.isArray(rawItems) ? rawItems : [rawItems]

            source[field as keyof typeof source] = items.map(resolvePolymorphicHubRow) as never
          },
        },
      ],
    } as GeneConfig<M>)
  }
}

type PolymorphicHubInstance = Record<string, unknown> & {
  constructor: ModelStaticWithGene & {
    geneConfig?: GeneConfig & {
      __polymorphicAssociations?: readonly string[]
      __polymorphicJunction?: { foreignKey: string; discriminatorKey: string }
    }
  }
  _options?: { includeNames?: string[] }
}

/** Resolves one hub list element to a concrete block instance, a `{ id, __typename }` stub, or the raw hub row. */
function resolvePolymorphicHubRow(hubInstance: PolymorphicHubInstance): unknown {
  const cfg = hubInstance.constructor.geneConfig
  const associationNames = cfg?.__polymorphicAssociations ?? []
  const junction = cfg?.__polymorphicJunction

  if (junction) {
    const fkRaw = getModelAttributeValue(hubInstance, junction.foreignKey)
    const discriminatorRaw = getModelAttributeValue(hubInstance, junction.discriminatorKey)
    const typename =
      discriminatorRaw === null || discriminatorRaw === undefined ? '' : String(discriminatorRaw)

    if (typename.length > 0 && fkRaw !== null && fkRaw !== undefined) {
      const canonicalKey = getAttributeByModelName(typename)
      const canonical = hubInstance[canonicalKey]
      if (isConcreteModelInstance(canonical, typename)) return canonical

      for (const name of associationNames) {
        const inst = hubInstance[name]
        if (isConcreteModelInstance(inst, typename)) return inst
      }

      let id: unknown = fkRaw
      if (typeof fkRaw === 'string' && fkRaw.trim() !== '') {
        const numeric = Number(fkRaw)
        id = Number.isFinite(numeric) ? numeric : fkRaw
      }

      return { __typename: typename, id }
    }
  }

  for (const name of associationNames) {
    const assoc = hubInstance[name]
    if (assoc) return assoc
  }

  return hubInstance
}

/** Whether `value` is an object whose `constructor.name` matches the concrete Sequelize model name. */
function isConcreteModelInstance(value: unknown, concreteModelName: string): boolean {
  if (!value || typeof value !== 'object') return false
  const ctor = (value as { constructor?: { name?: string } }).constructor
  return typeof ctor?.name === 'string' && ctor.name === concreteModelName
}

/**
 * Sequelize association property convention for polymorphic hubs.
 * @example `getAttributeByModelName('HeroBlock')` → `'heroBlock'`.
 */
export function getAttributeByModelName(modelName: string) {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

/** Builds the hidden inverse `HasMany` property name (scoped by hub + concrete type). */
function buildInversePolymorphicHasManyKey(hubModelName: string, concreteModelName: string) {
  return `_geneInversePolymorphic${hubModelName}_${concreteModelName}`
}

/** Ensures the inverse-association property is omitted from generated GraphQL on the concrete model. */
function ensureAssociationExcludedFromGeneConfig(TargetModel: ModelStaticWithGene, graphqlFieldKey: string) {
  const cfg = TargetModel.geneConfig
  if (!cfg) return

  const exclude = [...(cfg.exclude ?? [])] as (string | RegExp)[]

  if (!exclude.some(e => typeof e === 'string' && e === graphqlFieldKey)) {
    exclude.push(graphqlFieldKey)
    cfg.exclude = exclude as GeneConfig['exclude']
  }
}
