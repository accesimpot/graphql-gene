import type { GeneAssociationList, PrototypeOrNot } from 'graphql-gene'
import type { InferAttributes, Model } from 'sequelize'

type ModelProto<M> = PrototypeOrNot<M>
type ModelInstance<M> = ModelProto<M> & Model

type IsSequelizeModel<T> = T extends Model ? true : false

/** Matches {@link getGeneAssociationListWrapperTypeName} at type level. */
export type GeneAssociationListWrapperGqlType<
  TParentGraphqlType extends string,
  TAssociationField extends string,
> = `${TParentGraphqlType}${CapitalizeFirst<TAssociationField>}GeneAssociationListResult`

type CapitalizeFirst<S extends string> = S extends `${infer Head}${infer Tail}`
  ? `${Uppercase<Head>}${Tail}`
  : S

/**
 * True when `TField` on parent `TTypeName` is a multi association exposed as a Gene list
 * wrapper (`*GeneAssociationListResult`) — HasMany and BelongsToMany.
 */
type IsGeneAssociationListWrapperField<TTypeName extends string> = string extends TTypeName
  ? false
  : true

type IsModelAssociationValue<V> = [NonNullable<V>] extends [readonly (infer E)[]]
  ? IsSequelizeModel<E> extends true
    ? true
    : false
  : IsSequelizeModel<NonNullable<V>> extends true
    ? true
    : false

type AttributeKeys<M> = keyof InferAttributes<ModelInstance<M>>

type AssociationKeys<M> = {
  [K in keyof ModelProto<M>]: IsModelAssociationValue<ModelProto<M>[K]> extends true ? K : never
}[keyof ModelProto<M>]

/** Column and association keys declared on the Sequelize model (mixins and internals omitted). */
type GqlSourceModelKey<M> = AttributeKeys<M> | AssociationKeys<M>

type ToGqlSourceValueCore<
  V,
  TTypeName extends string,
> = [V] extends [readonly (infer E)[]]
  ? IsSequelizeModel<E> extends true
    ? IsGeneAssociationListWrapperField<TTypeName> extends true
      ? GeneAssociationList<ToGqlSource<E>>
      : ToGqlSource<E>[]
    : V
  : IsSequelizeModel<V> extends true
    ? ToGqlSource<V>
    : V

type ToGqlSourceValue<V, TTypeName extends string> = null extends V
  ? undefined extends V
    ? ToGqlSourceValueCore<NonNullable<V>, TTypeName> | null | undefined
    : ToGqlSourceValueCore<NonNullable<V>, TTypeName> | null
  : undefined extends V
    ? ToGqlSourceValueCore<NonNullable<V>, TTypeName> | undefined
    : ToGqlSourceValueCore<NonNullable<V>, TTypeName>

type ToGqlSourceField<
  M,
  TTypeName extends string,
  K extends GqlSourceModelKey<M> & string,
> = K extends keyof ModelProto<M>
  ? ToGqlSourceValue<ModelProto<M>[K], TTypeName>
  : never

/**
 * Maps a Sequelize model type to the GraphQL object shape passed as resolver `source`.
 *
 * Starts from Sequelize column + association fields (not GraphQL-only `extendTypes` outputs).
 * Multi associations exposed as `*GeneAssociationListResult` in GraphQL (HasMany and
 * BelongsToMany) are rewritten to {@link GeneAssociationList}; BelongsTo / HasOne become nested
 * `ToGqlSource`.
 */
export type ToGqlSource<M, TTypeName extends string = string> = {
  [K in GqlSourceModelKey<M> & string]: ToGqlSourceField<M, TTypeName, K>
}
