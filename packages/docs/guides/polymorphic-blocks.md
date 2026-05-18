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
| [Equivalent without `@Polymorphic`](#equivalent-without-polymorphic) | Sequelize junction FK + discriminator, inverse scoped `HasMany`, hub `BelongsTo` |
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

**Hub** ([Sequelize polymorphic junction](https://sequelize.org/docs/v6/advanced-association-concepts/polymorphic-associations/#configuring-a-many-to-many-polymorphic-association)) — declare **`blockId` + `blockType`** on the pivot (`blockType` equals each concrete Sequelize `modelName`, e.g. `HeroBlock`). `@Polymorphic` wires scoped inverse `HasMany` relations on concrete models so Sequelize merges the discriminator, adds hub `BelongsTo` accessors (`heroBlock`, `textBlock`, …), hides the inverse accessors from Gene’s GraphQL types, and registers the hub `interface` + rewriting directive.

```ts
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript'
import { Polymorphic } from '@graphql-gene/plugin-sequelize'
import { Page } from '../Page/Page.model'
import { HeroBlock } from '../HeroBlock/HeroBlock.model'
import { TextBlock } from '../TextBlock/TextBlock.model'

@Polymorphic(() => [HeroBlock, TextBlock], {
  foreignKey: 'blockId',
  discriminatorKey: 'blockType',
})
@Table
export class PageBlock extends Model {
  @Column(DataType.INTEGER)
  declare blockId: number | null

  @Column(DataType.STRING)
  declare blockType: string | null

  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null
}
```

After `sequelize.sync`, expect the pivot table to carry **`blockId`** and **`blockType`** (two columns total for all concrete kinds), alongside any non-polymorphic columns such as **`pageId`**. One pivot row ⇒ one semantic block ⇒ one authoritative `(blockType, blockId)`.

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

## Equivalent without Polymorphic

Plain Sequelize follows the polymorphic junction pattern: **`HeroBlock.hasMany(PageBlock)`** with **`foreignKey: 'blockId'`**, **`constraints: false`**, **`scope: { blockType: 'HeroBlock' }`**, mirrored for **`TextBlock`**. The pivot declares **`BelongsTo(HeroBlock)`** / **`BelongsTo(TextBlock)`** without `scope`.

`@Polymorphic` creates those scoped inverse accessors under **`_geneInversePolymorphic…`** names and adds them to each concrete model’s **`geneConfig.exclude`** so they never become GraphQL fields. It still registers **`PageBlock`** as an `interface`, wires concrete implementations, attaches the rewriter (`id` + `__typename` without fragment-shaped includes when appropriate), and matches inline fragments → nested includes.

Trace **`packages/plugin-sequelize` → `Polymorphic`** when duplicating decorators manually.

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

`@Polymorphic` mirrors Sequelize’s polymorphic junction recipe: scoped inverse **`HasMany`** relations live on concrete models (**`constraints: false`**, **`foreignKey` + discriminator scope**) while the hub exposes plain **`BelongsTo`** accessors (`heroBlock`, `textBlock`, …) keyed by the same FK. Sequelize therefore merges discriminators onto **`PageBlocks`** when expanding nested includes underneath **`Page.blocks`**, keeping **`limit` / `skip`** aligned with pivot rows—not with each nullable FK column alternative.

Gene’s rewriting directive runs before nested resolvers hydrate: prefer Sequelize instances whose **`constructor.name`** matches **`blockType`**, otherwise synthesize **`{ id: blockId, __typename: blockType }`** so callers can retrieve **`__typename`** (and FK-backed **id** fields) without emitting includes for unrelated concrete branches.

GraphQL still exposes a **`PageBlock`-named `interface` constrained to **`id`**; discriminator / FK columns and editorial pivot metadata stay Sequelize-only unless you opt them back into **`geneConfig.include`**.

The page retains a canonical **`HasMany` → pivot** association; **`PageBlock`** joins concrete tables polymorphically underneath.

## Frontend and component trees

Because each list element is typed in GraphQL by concrete `__typename`, UIs can map typename → component (or use generated fragment masks) without an extra fetch per block: one query drives a tree of block components that matches your CMS block structure. That lines up with the Relay-like colocation ideas in the [gist linked above](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea).

## Reference implementation

See `packages/dev-playground` models (`Page`, `PageBlock`, `HeroBlock`, `TextBlock`) and the `polymorphic page blocks` integration tests together with `src/test/queries/pagePolymorphicBlocks.gql` and `pagePolymorphicBlocksTypenamesOnly.gql`.
