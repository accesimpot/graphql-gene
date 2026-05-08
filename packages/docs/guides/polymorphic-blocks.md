# Polymorphic page blocks (`@Polymorphic`)

This pattern models a **CMS-style page composed of heterogeneous blocks** (hero, rich text, gallery, etc.): one **ordered list** in GraphQL where each item may be a **different concrete type**, selected in **a single operation** using **`__typename`** and **inline fragments**—the same ergonomics Relay-style clients use for colocated fragments and conditional UI.

For a longer discussion of that **frontend / query shape** (including Vue-oriented notes), see this companion write-up: **[Relay-like view integration (gist)](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea)**.

## What graphql-gene does

- You define a **small hub model** (e.g. `PageBlock`) that belongs to the page and holds **one optional foreign key per concrete block type** (the ORM layer for “exactly one concrete row per hub row”).
- You declare the allowed concrete models with the **`@Polymorphic(() => […])`** decorator from **`@graphql-gene/plugin-sequelize`**. The decorator **injects** the extra columns and `BelongsTo` associations so you do not hand-wire each FK.
- The hub is exposed in GraphQL as an **abstract type** (today: a GraphQL **`interface`** named like the hub model, e.g. `PageBlock`). Each concrete block model **`implements`** that interface. At schema build time, **resolveType** is wired so list items resolve to the correct concrete type (using `__typename` when present, otherwise the value’s constructor name where applicable).

Concrete block types stay normal Gene models; the page simply **`HasMany`** the hub.

## Backend setup (Sequelize + plugin)

**Page** — path and a `HasMany` to the hub; a typical app also registers a field such as `pageByPath` via `extendTypes` (see dev-playground).

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

## Querying (single round trip)

Use **`__typename`** plus **inline fragments** so each block type requests only its fields. Example (from the dev-playground integration test):

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

## Example JSON response

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

## Frontend and component trees

Because each list element is typed in GraphQL **by concrete `__typename`**, UIs can **map typename → component** (or use generated fragment masks) without an extra fetch per block: one query drives a **tree of block components** that matches your **CMS block structure**. That lines up with the Relay-like colocation ideas in the **[gist linked above](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea)**.

## Reference implementation

See **`packages/dev-playground`** models (`Page`, `PageBlock`, `HeroBlock`, `TextBlock`) and the **`polymorphic page blocks`** integration test together with **`src/test/queries/pagePolymorphicBlocks.gql`**.
