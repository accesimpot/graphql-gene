# Polymorphic page blocks

This pattern models a CMS-style page composed of heterogeneous blocks (hero, rich text, gallery, etc.): one ordered list in GraphQL where each item may be a different concrete type, selected in a single operation using `__typename` and inline fragments—the same ergonomics Relay-style clients use for colocated fragments and conditional UI.

```graphql
query PagePolymorphicBlocks($path: String!) {
  pageByPath(where: { path: { eq: $path } }) {
    id
    path
    blocks {
      id
      __typename

      ... on HeroBlock {
        title
        subtitle
      }

      ... on TextBlock {
        body
      }
    }
  }
}
```

For a longer discussion of that frontend / query shape (including Vue-oriented notes), see this companion write-up: [Relay-like view integration (gist)](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea).

## Contents

| Section                                                              | Description                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Setup](#setup)                                                      | Sequelize models: page, hub with `@Polymorphic`, concrete blocks |
| [Equivalent without `@Polymorphic`](#equivalent-without-polymorphic) | Same hub written out by hand (FKs + `BelongsTo`)                 |
| [Querying](#querying)                                                | Operation, variables, example JSON                               |
| [What graphql-gene does](#what-graphql-gene-does)                    | GraphQL interface, selection-driven includes, `id`-only contract |
| [Frontend and component trees](#frontend-and-component-trees)        | Typename-driven UIs                                              |
| [Reference implementation](#reference-implementation)                | Dev-playground paths                                             |

## Setup

Below is the usual layout: a page with a `HasMany` to a join model, the join model marked `@Polymorphic`, and concrete block models. A typical app also exposes a field such as `pageByPath` via `extendTypes` (see dev-playground).

**Page**

```ts
import { AllowNull, Column, DataType, HasMany, Model, Table } from 'sequelize-typescript'
import { extendTypes } from 'graphql-gene'
import { PageBlock } from '../PageBlock/PageBlock.model'

@Table
export class Page extends Model {
  @AllowNull(false)
  @Column(DataType.STRING)
  declare path: string

  @HasMany(() => PageBlock)
  declare blocks: PageBlock[] | null
}

extendTypes({
  Query: {
    pageByPath: {
      resolver: 'default',
      returnType: 'Page',
    },
  },
})
```

**Hub** — list the concrete block models once; the decorator adds the polymorphic wiring.

```ts
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript'
import { Polymorphic } from '@graphql-gene/plugin-sequelize'
import { Page } from '../Page/Page.model'
import { HeroBlock } from '../HeroBlock/HeroBlock.model'
import { TextBlock } from '../TextBlock/TextBlock.model'

@Polymorphic(() => [HeroBlock, TextBlock])
@Table
export class PageBlock extends Model {
  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null
}
```

**Concrete blocks** — ordinary models with `geneConfig` as needed (only an excerpt shown).

```ts
@Table
export class HeroBlock extends Model {
  @Column(DataType.STRING)
  declare title: string

  @Column(DataType.STRING)
  declare subtitle: string
}
```

After `sequelize.sync`, the hub table will include nullable FK columns such as `heroBlockId` and `textBlockId` (names derived from the associated model names). Only one should be set per row for a given block instance.

## Equivalent without Polymorphic

The decorator saves you declaring each optional FK and `BelongsTo` pair by hand. For `HeroBlock` and `TextBlock`, the hub could be written conceptually like below in plain Sequelize (you would still align `geneConfig` / GraphQL with what the decorator generates).

```ts
@Table
export class PageBlock extends Model {
  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null

  @ForeignKey(() => HeroBlock)
  @Column(DataType.INTEGER)
  declare heroBlockId: number | null

  @BelongsTo(() => HeroBlock)
  declare heroBlock: HeroBlock | null

  @ForeignKey(() => TextBlock)
  @Column(DataType.INTEGER)
  declare textBlockId: number | null

  @BelongsTo(() => TextBlock)
  declare textBlock: TextBlock | null

  /**
   * Example column that exists in SQL/Sequelize
   * but is not on the GraphQL `PageBlock` interface (only `id` is).
   */
  @Column(DataType.INTEGER)
  declare sortOrder: number
}
```

## Querying

Use `__typename` plus inline fragments so each block type requests only its fields. Example (from the dev-playground integration test):

```graphql
query PagePolymorphicBlocks($path: String!) {
  pageByPath(where: { path: { eq: $path } }) {
    id
    path
    blocks {
      id
      __typename

      ... on HeroBlock {
        title
        subtitle
      }

      ... on TextBlock {
        body
      }
    }
  }
}
```

Variables:

```json
{ "path": "/__polymorphic_demo_page__" }
```

### Example JSON response

Shape only; numeric `id`s are illustrative.

```json
{
  "data": {
    "pageByPath": {
      "id": 1,
      "path": "/__polymorphic_demo_page__",
      "blocks": [
        {
          "id": 101,
          "__typename": "HeroBlock",
          "title": "Hello",
          "subtitle": "Polymorphic demo hero"
        },
        {
          "id": 102,
          "__typename": "TextBlock",
          "body": "Plain text body via TEXT block kind."
        }
      ]
    }
  }
}
```

> **Note:** In v2, Gene is planning a wrapper for has-many fields with `count` and `items` (filters and pagination live on `items`), as sketched in [PLAN_V2.md §2.4–§2.5](../../../PLAN_V2.md) (see the `variants { count, items(where: …) { … } }` example). `blocks` and other polymorphic lists will follow the same collection pattern once that lands.

## What graphql-gene does

`@Polymorphic` wires real Sequelize `BelongsTo` relationships (with FK columns) from the join row to each concrete block. If you rely on Gene’s `default` resolver (like in [Setup](#setup)) or use `getQueryInclude(info)`, Sequelize `include` is derived from the incoming GraphQL operation—aligned with fragments such as those in [Querying](#querying)—so only associations for concrete block types you actually queried contribute to nested loading, instead of blindly joining every polymorphic branch.

In GraphQL, the decorator generates a `PageBlock`-shaped `interface` that includes only the `id`. That keeps the shared contract minimal: every concrete GraphQL type that implements it does not have to expose the same hub-only fields—each block type owns its own shape beyond `id`. The hub class may still declare extra `@Column`s (sort order, editor notes, etc.): they live in the database and in Sequelize, but they are _not_ exposed on that interface. Concrete block models (`HeroBlock`, `TextBlock`, …) remain full GraphQL object types with their own fields.

The page keeps a normal `HasMany` to the join model; each concrete block model is a separate table and schema type.

## Frontend and component trees

Because each list element is typed in GraphQL by concrete `__typename`, UIs can map typename → component (or use generated fragment masks) without an extra fetch per block: one query drives a tree of block components that matches your CMS block structure. That lines up with the Relay-like colocation ideas in the [gist linked above](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea).

## Reference implementation

See `packages/dev-playground` models (`Page`, `PageBlock`, `HeroBlock`, `TextBlock`) and the `polymorphic page blocks` integration test together with `src/test/queries/pagePolymorphicBlocks.gql`.
