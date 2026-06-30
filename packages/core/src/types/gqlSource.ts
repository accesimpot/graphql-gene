import type { GraphqlToTypescript } from './graphqlToTypescript'

/** Brand key used by ORM plugins to override resolver `source` typing via declaration merging. */
export declare const GqlSourceBrand: unique symbol

/**
 * Augmented by ORM plugins (e.g. `@graphql-gene/plugin-sequelize`) to map Sequelize models to
 * GraphQL-shaped resolver parents.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, unused-imports/no-unused-vars -- type params are merged by ORM plugins
export interface GqlSourceForPluginModel<M, TTypeName extends string> {}

export type ResolveGqlSource<M, TTypeName extends string> =
  GqlSourceForPluginModel<M, TTypeName> extends {
    [GqlSourceBrand]: infer S
  }
    ? S
    : GraphqlToTypescript<TTypeName>
