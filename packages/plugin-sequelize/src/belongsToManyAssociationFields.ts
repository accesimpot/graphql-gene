/**
 * Augment per GraphQL parent type to list Sequelize `BelongsToMany` association fields.
 *
 * Those fields keep their ORM array shape in {@link ToGqlSource}; only HasMany associations
 * registered as `*GeneAssociationListResult` wrappers are rewritten to
 * {@link GeneAssociationList}.
 *
 * @example
 * declare module '@graphql-gene/plugin-sequelize' {
 *   interface GeneBelongsToManyAssociationFields {
 *     ProductGroup: 'categories'
 *   }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GeneBelongsToManyAssociationFields {}
