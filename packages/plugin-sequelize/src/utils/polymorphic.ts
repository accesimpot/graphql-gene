import {
  defineGraphqlGeneConfig,
  isObject,
  registerPolymorphicAbstractType,
  type GeneConfig,
  type GraphqlTypeName,
  type InferFields,
} from 'graphql-gene'
import { BelongsTo, Column, DataType, HasMany, type ModelStatic } from 'sequelize-typescript'

type ModelStaticWithGene = ModelStatic & { geneConfig?: GeneConfig }

/** sequelize-typescript column metadata key (see `attribute-service.ts`). */
const SEQUELIZE_ATTRIBUTES_METADATA_KEY = 'sequelize:attributes'

/** Default junction columns when the second `@Polymorphic` argument is omitted. */
export const DEFAULT_POLYMORPHIC_JUNCTION: PolymorphicJunctionOptions = {
  foreignKey: 'targetId',
  discriminatorKey: 'targetType',
}

/** Column naming for Sequelize’s polymorphic junction (`BelongsTo` + inverse scoped `HasMany`). */
export type PolymorphicJunctionOptions = {
  /** Attribute storing the FK to the concrete row (same column on every polymorphic association). */
  foreignKey: string
  /** Stored value equals `TargetModel.name` for each row (`HeroBlock`, `TextBlock`, …). */
  discriminatorKey: string
}

/**
 * Sequelize-typescript stores `@Column` definitions in Reflect metadata (`sequelize:attributes`) when `reflect-metadata`
 * is loaded (standard for sequelize-typescript apps). Otherwise we rely on Sequelize `Model.rawAttributes` after init.
 */
function hasHubColumn(modelCtor: ModelStatic, attributeKey: string): boolean {
  const proto = modelCtor.prototype
  if (typeof Reflect.getMetadata === 'function') {
    const meta = Reflect.getMetadata(SEQUELIZE_ATTRIBUTES_METADATA_KEY, proto) as
      | Record<string, unknown>
      | undefined
    if (meta && attributeKey in meta) return true
  }

  const raw = (modelCtor as unknown as { rawAttributes?: Record<string, unknown> }).rawAttributes
  if (raw && attributeKey in raw) return true

  return false
}

/** Registers `@Column` metadata for junction FK + discriminator when the model does not define them (e.g. no `declare` / `@Column`). */
function ensurePolymorphicJunctionColumns(
  modelCtor: ModelStatic,
  junction: PolymorphicJunctionOptions
): void {
  const proto = modelCtor.prototype

  if (!hasHubColumn(modelCtor, junction.foreignKey)) {
    Column({ type: DataType.INTEGER, allowNull: true })(proto, junction.foreignKey)
  }

  if (!hasHubColumn(modelCtor, junction.discriminatorKey)) {
    Column({ type: DataType.STRING, allowNull: true })(proto, junction.discriminatorKey)
  }
}

/** Reads a column from a Sequelize `Model` instance (`get(key)` when available, else property access). */
function getModelAttributeValue(record: unknown, key: string): unknown {
  if (!isObject(record)) return undefined

  if ('get' in record) {
    const getter = record.get
    if (typeof getter === 'function') return getter.call(record, key)
  }
  return record[key as keyof typeof record]
}

/**
 * Declares a polymorphic **hub / junction** row: exactly one concrete model is referenced via one shared FK +
 * discriminator on the pivot.
 *
 * Sequelize expects the discriminator to be enforced by an **inverse, scoped `HasMany` from each concrete model
 * back to this hub**, while the hub declares plain `BelongsTo` accessors without `scope` (see Sequelize polymorphic /
 * association-scopes docs).
 *
 * Usage (`@Polymorphic` immediately before `@Table`):
 *
 * ```ts
 * @Polymorphic(() => [HeroBlock, TextBlock])
 * @Table
 * export class PageBlock extends Model {}
 * ```
 *
 * By default the junction uses columns **`targetId`** (FK to the concrete row) and **`targetType`**
 * (discriminator string = concrete `Model.name`). Pass a second argument to override names, or declare/`@Column`
 * those attributes yourself—existing columns are left as-is.
 * Missing columns are registered with `@Column` automatically when absent from the class.
 *
 * See [Sequelize polymorphic junction](https://sequelize.org/docs/v6/advanced-association-concepts/polymorphic-associations/#configuring-a-many-to-many-polymorphic-association).
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
 * @param junction — Optional FK + discriminator attribute names (`DEFAULT_POLYMORPHIC_JUNCTION` when omitted).
 */
export function Polymorphic<M extends ModelStatic = ModelStatic>(
  possibleTypes: () => ModelStatic[],
  junction?: PolymorphicJunctionOptions
) {
  return (constructor: M & { geneConfig?: GeneConfig<M> }) => {
    const resolvedJunction: PolymorphicJunctionOptions = {
      ...DEFAULT_POLYMORPHIC_JUNCTION,
      ...junction,
    }

    const BaseModel = constructor
    const BaseModelName = BaseModel.name as GraphqlTypeName

    ensurePolymorphicJunctionColumns(BaseModel, resolvedJunction)

    const rawTargetTypes = possibleTypes()
    const targetTypes = rawTargetTypes as ModelStatic[]
    const associationNames = targetTypes.map(t => getAttributeByModelName(t.name))

    targetTypes.forEach(_TargetModel => {
      const TargetModel = _TargetModel as ModelStaticWithGene
      const typeName = TargetModel.name as string
      const attributeName = getAttributeByModelName(typeName)
      const inverseKey = buildInversePolymorphicHasManyKey(BaseModel.name, typeName)

      HasMany(() => BaseModel as ModelStatic, {
        foreignKey: resolvedJunction.foreignKey,
        constraints: false,
        scope: { [resolvedJunction.discriminatorKey]: typeName },
      })(TargetModel.prototype, inverseKey)

      if (!TargetModel.geneConfig) {
        TargetModel.geneConfig = defineGraphqlGeneConfig(TargetModel, {}) as GeneConfig
      }

      ensureAssociationExcludedFromGeneConfig(TargetModel, inverseKey)

      BelongsTo(() => TargetModel, {
        foreignKey: resolvedJunction.foreignKey,
        constraints: false,
      })(BaseModel.prototype, attributeName)

      const concreteGeneConfig = TargetModel.geneConfig
      concreteGeneConfig.__implementedInterfaces = concreteGeneConfig.__implementedInterfaces || []

      concreteGeneConfig.__implementedInterfaces.push(BaseModelName)
    })

    registerPolymorphicAbstractType(BaseModelName)

    BaseModel.geneConfig = defineGraphqlGeneConfig(BaseModel, {
      varType: 'interface',
      include: ['id' as InferFields<M>],

      __polymorphicJunction: {
        foreignKey: resolvedJunction.foreignKey,
        discriminatorKey: resolvedJunction.discriminatorKey,
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

/**
 * Maps preloaded polymorphic hub rows for consumers that hold a bare array (association list
 * `items` facet, etc.). Uses the same logic as the hub model’s type-level directive.
 */
export function resolvePolymorphicHubLoadedRows(rows: ReadonlyArray<unknown>): unknown[] {
  return rows.map(row => resolvePolymorphicHubRow(row as PolymorphicHubInstance))
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
function ensureAssociationExcludedFromGeneConfig(
  TargetModel: ModelStaticWithGene,
  graphqlFieldKey: string
) {
  const cfg = TargetModel.geneConfig
  if (!cfg) return

  const exclude = [...(cfg.exclude ?? [])] as (string | RegExp)[]

  if (!exclude.some(e => typeof e === 'string' && e === graphqlFieldKey)) {
    exclude.push(graphqlFieldKey)
    cfg.exclude = exclude as GeneConfig['exclude']
  }
}
