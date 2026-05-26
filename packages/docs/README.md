# graphql-gene documentation

Prose-first documentation for graphql-gene. These files are readable in the GitHub UI and can later be wired to a static docs tool (for example VitePress or Docusaurus) pointed at this package—see **`PLAN_V2.md`** §11.

## Guides

| Guide | Description |
| ----- | ----------- |
| [Schema design](./guides/schema-design.md) | Naming, auth scope, performance, caching-friendly operations, mutations, `findOptions` |
| [Directives](./guides/directives.md) | Type/field middleware, `GeneDirectiveConfig`, empty `name` vs printed `schemaString` |
| [Polymorphic page blocks](./guides/polymorphic-blocks.md) | `@Polymorphic` hub model, GraphQL interface + fragments, example query and response |
| [Writing a plugin](./guides/writing-a-plugin.md) | How to learn from `@graphql-gene/plugin-sequelize` when writing a new plugin |
