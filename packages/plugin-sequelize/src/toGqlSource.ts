import type { GeneAssociationList, PrototypeOrNot } from 'graphql-gene'
import type { Model } from 'sequelize'

type ModelProto<M> = PrototypeOrNot<M>

type IsSequelizeModel<T> = T extends Model ? true : false

type IsAssociationMixinKey<K extends string> = K extends
  | `add${string}`
  | `set${string}`
  | `get${string}`
  | `create${string}`
  | `count${string}`
  | `has${string}`
  | `remove${string}`
  | `$${string}`
  ? true
  : false

type IsSequelizeInternalKey<K extends string> = K extends
  | 'sequelize'
  | 'constructor'
  | 'geneConfig'
  | 'isNewRecord'
  | '_changed'
  | '_options'
  | '_previousDataValues'
  | 'dataValues'
  | '_model'
  | 'where'
  ? true
  : false

/** Model keys exposed on GraphQL-shaped resolver parents (attributes + associations). */
type GqlSourceModelKey<M> = {
  [K in keyof ModelProto<M>]: IsSequelizeInternalKey<K & string> extends true
    ? never
    : IsAssociationMixinKey<K & string> extends true
      ? never
      : K
}[keyof ModelProto<M>]

type ToGqlSourceValueCore<V> = [V] extends [readonly (infer E)[]]
  ? IsSequelizeModel<E> extends true
    ? GeneAssociationList<ToGqlSource<E>>
    : V
  : IsSequelizeModel<V> extends true
    ? ToGqlSource<V>
    : V

type ToGqlSourceValue<V> = null extends V
  ? undefined extends V
    ? ToGqlSourceValueCore<NonNullable<V>> | null | undefined
    : ToGqlSourceValueCore<NonNullable<V>> | null
  : undefined extends V
    ? ToGqlSourceValueCore<NonNullable<V>> | undefined
    : ToGqlSourceValueCore<NonNullable<V>>

type ToGqlSourceField<M, K extends GqlSourceModelKey<M>> = ToGqlSourceValue<ModelProto<M>[K]>

/**
 * Maps a Sequelize model type to the GraphQL object shape passed as resolver `source`.
 *
 * - Column attributes keep their ORM types.
 * - HasMany associations become {@link GeneAssociationList}.
 * - BelongsTo / HasOne associations become nested `ToGqlSource` of the related model.
 * - BelongsToMany associations keep their array shape until wrappers exist.
 * - GraphQL-only `extendTypes` fields are omitted (they are resolver outputs, not parent inputs).
 */
export type ToGqlSource<M, TTypeName extends string = string> = {
  [K in GqlSourceModelKey<M>]: ToGqlSourceField<M, K>
}
