# Gene v2

Plan for a major version of GraphQL Gene: goals, breaking changes, and migration notes. The plan ties library design to real usage (CMS-style admin APIs, predictable association reads) and records **why** each change exists, **alternatives considered**, and the **chosen direction**.

#### Abbreviations

- **RBAC** — role-based access control (permissions expressed as roles assigned to users or clients).
- **CRUD** — create, read, update, delete (the basic set of operations to manage records in an API or database).
- **CMS** — content management system (tools and workflows for authoring and maintaining structured content).
- **ORM** — object–relational mapping (library that maps between application objects/classes and relational database tables and queries, e.g. Sequelize, TypeORM).

---

## 1. Goals

| Goal                                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Predictable association APIs**                      | List associations should expose filtering and pagination in a shape that scales (metadata like total count vs. row selection), not only flattened list arguments and child-scalar `where` inputs.                                                                                                                                                                                                                                                                                                                                 |
| **Deep filtering (parent-level predicates)**          | Filters on nested relations should be expressible on the **association field’s `where`** (join-aware / nested input), not only on inner fields—so resolvers match ORM capabilities and **client caches** (e.g. Apollo) get distinct field arguments when queries differ (see §2.7).                                                                                                                                                                                                                                               |
| **Admin CRUD (CMS backend) in the library**           | A production integration already implements an “admin CRUD” pattern (`enableAdminCrud`, `cms` query/mutation namespace, metadata for dynamic forms). Moving **only the backend integration** into `graphql-gene` lets open-source consumers build their own CMS UIs; product-specific frontends stay out of this repo.                                                                                                                                                                                                            |
| **Authorization that matches the rest of the schema** | Today, admin CRUD attaches roles **per model** while the public API often uses **type/field directives** (`@userAuth`, etc.). v2 should unify how roles are declared and applied so metadata and field visibility stay consistent.                                                                                                                                                                                                                                                                                                |
| **Explicit breaking changes**                         | v2 may change generated schema and TypeScript types; document deltas and codemods where feasible.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Readable documentation in-repo**                    | Ship prose as **Markdown** in a **dedicated workspace package** (see §11): a folder layout that **renders well in the GitHub UI** (navigation via `README.md` files and clear paths). Keeps the first release small—**no** full static-site documentation build in scope yet.                                                                                                                                                                                                                                                     |
| **Polymorphic blocks as GraphQL unions**              | CMS **pages composed of heterogeneous blocks** should be expressible as one **list of a `union` type** so clients can fetch **all block data in one round trip** using **`__typename`** and **fragments** (Relay-style colocation in Vue/React—see §2.8 and [gist](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea)). The ORM layer uses a **hub row per block** with edges to concrete block tables; **graphql-gene** emits the union and **graphql-lookahead** maps inline fragments to the right `include`s. |

**Non-goals for the open-source package**

- **No default “global” mutations for arbitrary model types.** Automatic create/update/delete belong to the **optional CMS / admin CRUD module**, not to the core idea that “every model gets default Mutation fields.” That keeps the public API surface intentional and avoids accidental exposure.
- **No reference CMS frontend** in the repo. The library exposes the **GraphQL contract** (queries, mutations, metadata) needed to build a CMS; product-specific UI stays out of scope.
- **No documentation static-site generator** (Docusaurus, VitePress, custom Gatsby, etc.) for the **initial** v2 documentation push. Prefer **Markdown files** and GitHub-native rendering first (§11); a generated docs site can be revisited later.

---

## 2. Association fields: from flat lists to a standard result shape

### 2.1 Current behavior (v1)

- Has-many (and similar) association fields resolve to a **wrapper** `{ count, items }` with **`skip`**, **`limit`**, **`where`**, and **`order`** on the association field itself (see §2.4).
- `where` inputs are generated from the **child type’s fields** (scalars and shallow handling for nested associations via `id`), as in `generateDefaultQueryFilterTypeDefs` in `packages/core/src/defaultResolver.ts`.

### 2.2 Problems

- **Ambiguity**: Clients mix “filter the rows” with “shape of the response” when everything sits on one field.
- **Missing aggregates**: Total count under the same filters without loading all rows is awkward if the field is only `[Child!]`.
- **Ecosystem alignment**: Many schemas use a small wrapper object for list+metadata instead of bare arrays for paginated or filtered lists.

### 2.3 Options compared

| Approach                                             | Shape                                                       | Pros                                                                                      | Cons                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **A. Relay-style connection**                        | `edges { cursor, node }`, `pageInfo`, optional `totalCount` | De facto standard for GraphQL pagination; stable cursors; great for large, evolving lists | Heavier schema; more boilerplate for internal/CMS clients   |
| **B. Simple list result**                            | `{ count: Int!, items: [Child!]! }`                         | Easy to document; matches “count + page of rows”; fits admin tooling                      | Not cursor-based; offset semantics unless extended later    |
| **C. Keep v1 flat list + add a sibling count field** | e.g. `variantsCount(where: …)` next to `variants(…)`        | Minimal change to list field                                                              | Two fields to keep in sync; awkward for nested associations |

**Winner: B** as the **default** generated shape for Gene list associations. **Pattern A** (Relay-style connections: `edges`, `pageInfo`, cursors) is **planned for a future release**—not the v2 default—so integrators who need the GraphQL Cursor Connections model can get first-class support later without changing the offset + simple-result story for everyone else (see also section 3 on cursor pagination).

### 2.4 Target API (breaking, illustrative)

Filtering and pagination arguments (**`where`**, **`order`**, **`skip`**, **`limit`**) live on the **association field** that returns the wrapper. The wrapper’s **`count`** and **`items`** facets are **argument-free**—they share the filter implied by the parent field selection (same operation args), so filters are not duplicated between `count` and `items`.

```graphql
# v1 (conceptual)
variants(where: { size: { in: ["US 10"] } }) { id size }

# v2 (example — pagination args follow section 3: skip + limit)
variants(where: { size: { in: ["US 10"] } }, limit: 10, skip: 0) {
  count
  items {
    id
    size
  }
}
```

### 2.4.1 Naming the aggregate: `count` vs `total`

There is **no single universal name** for “how many rows match this filter” next to a list facet. Common options:

| Name             | Where you see it                                                                                                                                       | Notes                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **`count`**      | Many hand-rolled GraphQL APIs; pairs naturally with **`skip` / `limit`**                                                                               | Aligns with SQL **`COUNT`**, the same way `limit`/`skip` echo **`LIMIT` / `OFFSET`**. Reads as “count of matching rows,” not “page number.” |
| **`total`**      | [Contentful GraphQL Content API](https://www.contentful.com/developers/docs/references/graphql/) collection-style fields (often alongside **`items`**) | Familiar in **CMS / content** APIs; “total” emphasizes the full result set size under the filter, not just the current page.                |
| **`totalCount`** | Relay-style connections, some schemas                                                                                                                  | Most explicit; slightly verbose next to short field names.                                                                                  |

**Winner: `count`** as the **default** name in generated wrappers: it stays **one vocabulary** with **`skip` + `limit`** (SQL-shaped) and avoids overloading “total” in domains where it might mean something else (bytes, price, etc.). Teams coming from **Contentful-style** APIs can still map mentally: **`count` ≈ `total`** for the same semantics (matching rows under the same filter).

### 2.5 List vs single association: wrapper and “one level of metadata”

Gene today distinguishes **list** associations (GraphQL list of objects) from **single** associations (one nullable object, e.g. belongs-to / has-one). The v2 **wrapper** (`count` + `items` + filters) is motivated by **collections**: pagination, total count, and “which rows” are separate concerns.

**Does the same “one level deep” wrapper make sense for a single association?**

|                                        | **List (e.g. has-many)**                                                                                             | **Single (e.g. belongs-to / has-one)**                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Primary job of the field**           | Return **many** rows, often filtered and paginated                                                                   | Return **at most one** related row (or null)                                                |
| **What “metadata” usually means here** | `count` plus row facet **`items`**, with **list/filter args on the association field** (`where`, `skip`, `limit`, …) | Often **nothing extra** at the edge: the FK join picks the row                              |
| **Wrapper adds value?**                | **Yes**: separates aggregate (`count`) from rows (`items`) without duplicating args on each facet                    | **Usually no**: there is no meaningful `count` (only present/absent), and no `skip`/`limit` |

**Recommendation:** Keep the **wrapper + list metadata** pattern for **array-returning** association fields only. For **single** associations, keep the **flat nullable object** as the default GraphQL shape: the field resolves directly to `Child` or `null`. That matches common GraphQL style and avoids noisy nesting (`brand { … }` rather than `brand { node { … } }` or `brand { meta { … } value { … } }`) when there is no second dimension of data to expose at the edge.

**When a single association might still get an extra level** (opt-in or rare types):

- **Polymorphic or ambiguous edges** where the client needs **discriminator / type metadata** next to the object (still unusual; often modeled as a union or explicit `__typename`).
- **Explicit CMS / auth hints** at the edge (e.g. “hidden by policy”)—prefer **field-level authorization** or **trimmed SDL** (section 5) instead of a generic wrapper for every belongs-to.

**Examples**

_List association (wrapper justified):_

```graphql
# Product has many Variants — collection semantics
product {
  variants {
    count
    items(where: { size: { in: ["M"] } }, limit: 20, skip: 0) {
      id
      size
    }
  }
}
```

_Single association (flat default; filters on the association field, same idea as `items(where: …)`):_

```graphql
# Product belongs to Brand — at most one row; filter on the edge like the list case
product {
  brand(where: { active: { eq: true } }) {
    id
    name
  }
}
```

**Relation to CMS `*Meta`:** Form-building metadata (field kinds, targets, nested `attributes`) is already modeled in **separate meta queries** (`*Meta` / JSON), not by wrapping every association resolver. That stays the right place for **rich** structural metadata; the **read** field for a single association should stay **thin** unless a concrete use case requires an edge wrapper.

### 2.6 Work items

- Define generated type names (e.g. `ProductVariantsResult` vs. future `…Connection` when Relay-style lists ship).
- Move `where` / `order` / `skip` / `limit` to the wrapper-owned list field (see section 3 for naming rationale).
- Implement `count` with clearly documented semantics (filtered vs. unfiltered).
- Update Sequelize include / resolver path in `packages/plugin-sequelize` for nested reads.
- Migration: codemod or guide for persisted `.gql` documents.
- **Single associations:** default remains **unwrapped** nullable type; document exceptions (see §2.5).
- **Deep filtering:** parent-level / join-aware `where` inputs; warn on overlapping parent + nested `where` on the same path (see §2.7).
- **Polymorphic unions:** hub model registration, schema `union` + `resolveType`, and **graphql-lookahead** includes for union members (see §2.8).

### 2.7 Deep filtering (parent-level predicates)

**Problem in v1:** Filters are often attached only to **nested** association fields (e.g. `child(where: { … })` under a list). Two different operations can traverse the **same** parent path and field name (e.g. `blog { posts { … } }`) with the **same arguments on `posts`**, while the meaningful difference lives **deeper** in the selection (different nested `where` clauses). GraphQL clients that normalize by **field + arguments** (notably **Apollo Client**) may then treat those operations as the **same** cache entry, causing merge warnings and **wrong data** (e.g. a filtered empty list overwriting an unfiltered full list when navigating between screens).

**Workaround today:** Invent **dummy** or redundant predicates on the **parent** association field so its **GraphQL arguments** differ between operations—otherwise clients that key cache entries by `fieldName + args` (e.g. Apollo) can merge incompatible results. The meaningful filter often stays on a **nested** field (`category(where: …)`), while `posts` carries a **no-op** predicate only to **bump the cache key**. That is fragile, obscure to readers, and easy to get wrong.

```graphql
# v1-style: real intent is “posts whose related category matches $slug”, but that can only
# be expressed on the nested `category` field. `posts` uses a dummy `where` so this query
# is not cached as the same field as a sibling query that also uses `posts { … }` with
# different nested filters (same problem, same workaround pattern).

blog {
  posts(where: { id: { null: false } }) {
    id
    category(where: { slug: { eq: $slug } }) {
      id
      slug
    }
  }
}
```

**v2 target:** Support **deep filtering**—expressing constraints on the **parent** association’s `where` input using a **structured filter** that can reference **nested / joined** relations (same expressive power you need for Sequelize `include` + `where` on associations). The **real** predicate moves onto `posts`; no dummy argument is required for cache safety. Typical shape (illustrative):

```graphql
# Illustrative — exact input shape TBD; goal is one predicate tree on `posts`, not only on nested fields
blog {
  posts(where: { category: { slug: { eq: $slug } } }) {
    id
    category {
      id
      slug
    }
  }
}
```

**Why it matters:** Predicates live where clients and caches already key them—on the **association field’s arguments**—so different queries are **first-class** different operations without hacks. Resolver work should translate these trees into correct SQL/ORM includes.

**Overlapping filters (warning):** Once **parent-level** `where` can express nested predicates (e.g. `posts(where: { category: { … } })`), a query might still pass **`where` on the nested field** (e.g. `category(where: { … })`) for the same relation. The implementation should **detect** that situation (same association constrained in both places) and emit a **clear warning** (e.g. dev-only log or documented GraphQL extension)—not fail silently with ambiguous merge semantics. Exact merge rules can be “nested wins” or “combine with AND,” but callers should be nudged toward **one** expression of the filter.

**Scope:** Applies to **list** and **single** association fields that accept `where` (aligned with §2.5: single associations stay **unwrapped**, but can still take `where` on the field).

### 2.8 Polymorphic associations and GraphQL unions (page blocks)

**Use case:** A **page** in the CMS has an ordered list of **blocks**. Each block is one of several concrete types (e.g. hero, rich text, gallery). In GraphQL this is naturally a **`union`** (or equivalent) so the client can request **different fields per member** in **one operation**, using **`__typename`** and **inline fragments** (or colocated codegen fragments)—the pattern described in [this gist](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea) for Vue. That avoids a waterfall of per-block requests while keeping **each UI component responsible for its own selection set**.

**Relational shape:** Model a **hub** row per block (e.g. `PageBlock`) that stores ordering and ownership (`pageId`, `sortOrder`, …) and points to **exactly one** concrete block row via the ORM—typically one optional **foreign key per concrete type** (or another discriminator strategy the plugin documents). The **page** only **`HasMany`** hub rows; it does not need to know every block table up front beyond what the schema generator registers.

**Declarative registration (v2 target):** Prefer a **single hub-level declaration** (working name **`@UnionContent`**) that lists the concrete block models and the GraphQL field name for the union (e.g. `content`). The decorator (or equivalent generator hook) **injects** the per-type **`belongsTo` associations and foreign key columns** on the hub so authors do not hand-wire three (or _N_) optional FKs and aliases for every new block class. The same registration records a **stable map** from each **GraphQL object type name** (union member) to the **Sequelize association alias** on the hub—**graphql-lookahead** uses that map to turn `... on HeroBlock { … }` into the correct `include` without resolver hard-coding. A **`geneConfig`-only** path can remain for projects that do not use sequelize-typescript decorators; behavior should match.

**Library split:**

- **`graphql-gene`**: Generate the **`union`** type and the hub field; wire **`resolveType`** (or equivalent) from a documented discriminator rule; keep **member types** and field definitions consistent with the rest of the schema (including auth and CMS metadata if those blocks are admin-managed).
- **`graphql-lookahead` / `plugin-sequelize`**: When the selection set asks for a given union member, add the mapped association to **`getQueryInclude`** so unused block tables are not joined.

**Illustrative models:**

`models/Page.ts`:

```typescript
import { Table, Column, Model, HasMany, DataType } from 'sequelize-typescript'
import { PageBlock } from './PageBlock'

@Table
export class Page extends Model {
  @Column(DataType.STRING)
  path: string

  // The Page simply knows it has many blocks
  @HasMany(() => PageBlock)
  blocks: PageBlock[]
}
```

`models/PageBlock.ts`:

```typescript
import { Table, Column, Model, DataType, ForeignKey } from 'sequelize-typescript'
import { Page } from './Page'
import { HeroBlock } from './HeroBlock'
import { TextBlock } from './TextBlock'
import { GalleryBlock } from './GalleryBlock'

/**
 * We define the "Container" here.
 * The @UnionContent decorator will dynamically inject
 * foreign keys and associations for each model passed to it.
 * It could also accept only the "types" arrow function instead of a config object.
 */
@UnionContent({
  field: 'content', // default
  types: () => [HeroBlock, TextBlock, GalleryBlock], // lazy: avoids circular deps
})
@Table
export class PageBlock extends Model {
  @Column(DataType.INTEGER)
  order: number

  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  pageId: number
}
```

**Limits and future work:** Sites with **very many** block types can produce **large** single operations; servers that support **`@defer` / incremental delivery** remain an optional optimization **outside** the core Gene contract (see the gist’s note). Relay-style **connections** for block lists are orthogonal—default is a simple **list of union elements** unless a product opts into connection wrapping for blocks.

---

## 3. Pagination and argument naming (cross-cutting)

This applies both to **core association fields** (section 2) and to **admin CRUD list queries** (section 4) so naming stays consistent.

**Audience:** v2 is the first version we intend to promote widely. Argument names should read naturally to **any** GraphQL or CMS integrator, not only to one consumer. Prior internal or experimental usage of `page` / `perPage` in Gene v1 is **not** a reason to keep those names in the public API.

### 3.1 Current patterns

- **Gene v1**: plain `[Child!]` lists with `page`, `perPage`, `where`, `order` on the field — **offset-style** pagination (**deprecated** in favor of wrappers + `skip`/`limit` on the association field).
- **Early adopters**: only a small set of schemas used these names in production; v2 is the right moment to align with common ecosystem patterns before the library is marketed broadly.

### 3.2 Options compared (strategy, not naming)

| Strategy                                                                                                    | When it shines                                   | Caveats                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| **Offset (`skip` + `limit`, or `offset` + `limit`)**                                                        | CMS grids, “jump to page”, SQL `LIMIT/OFFSET`    | Inconsistent rows if data shifts between requests; deep offsets can be slow |
| **Cursor ([Relay-style](https://relay.dev/graphql/connections.htm) `first` / `after` / `last` / `before`)** | Infinite scroll, large live lists, stable paging | Harder “go to page N”; cursor encoding and indexes matter                   |
| **Keyset / seek**                                                                                           | Stable ordering + “after this key”               | Needs explicit sort key; great when you control the API                     |

**Winner for v2 defaults**

- Ship **offset pagination** as the **default** for generated list APIs (associations + admin lists): it matches Sequelize patterns and most admin UIs.
- **Design extension points** so **cursor-based** results (Relay connections or a slimmer cursor + `pageInfo` shape) can be added **later** without inventing a second, conflicting vocabulary on the same arguments.

### 3.3 Naming: ecosystem precedents and v2 recommendation

**What other GraphQL / CMS APIs use**

| Source                                                                                               | Offset-style args                    | Cursor-style args                                                                                                                 | Notes                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **[Contentful GraphQL Content API](https://www.contentful.com/developers/docs/references/graphql/)** | `skip`, `limit` on collection fields | Separate **cursor** collection types use `pageNext` / `pagePrev` / `pages` with `limit`; **`skip` is not used** alongside cursors | Documents both modes; cursor path is optimized for large catalogs |
| **[GraphQL Cursor Connections](https://relay.dev/graphql/connections.htm)** (Relay)                  | —                                    | `first`, `after`, `last`, `before`                                                                                                | De facto standard for cursor pagination in GraphQL                |
| **Prisma (client API)**                                                                              | `skip`, `take`                       | —                                                                                                                                 | Familiar to Node developers; `take` ≈ `limit`                     |

Contentful does **not** use `page` / `perPage` on collections; it uses **`skip` + `limit`** for offset pagination. That lines up with SQL mental models (`OFFSET` / `LIMIT`) and with how many REST and CMS APIs are documented.

**Avoid overloading `first`**

- In Relay connections, **`first` means “return up to N edges after `after`”** — it is tied to **cursor** semantics.
- Using **`first` together with `skip` as an offset-style pair** (as some APIs have tried) blurs two different models. Prefer **`limit`** (or `take`) for “how many rows” in **offset** mode, and reserve **`first` / `after` / `last` / `before`** for a future **cursor** mode so names never mean two different things.

**Recommendation for graphql-gene v2 (public schema)**

1. **Standardize offset pagination on `limit` + `skip`** (both `Int`, with clear defaults and max caps in docs).

   - Matches Contentful’s offset collections and maps directly to Sequelize `limit` / `offset`.
   - **`page` / `perPage` are removed** from generated SDL in favor of **`skip` + `limit`** on list-shaped reads (top-level queries and association parents). Optional documented sugar that expands to `skip`/`limit` remains possible outside the schema if needed.

2. **When cursor support is added**, expose it either:

   - as a **separate field or type** (e.g. `…Connection` with `first` / `after`, like Relay), or
   - as **mutually exclusive** argument groups on one field (offset args **or** cursor args, never both — same idea Contentful uses by separating cursor collection types from offset collections).

   That way **`limit` stays “page size” for offset** and **`first` stays “forward page size” for cursors** without a naming collision.

3. **“Page number” UX** (e.g. page 3 of 10): clients compute `skip = (page - 1) * limit`, or the library may offer **optional** `page` + `pageSize` **only** as documented sugar that lowers to `skip` / `limit` internally — not as a second parallel vocabulary in the primary schema unless we explicitly support both with one canonical normalization.

### 3.4 Relationship to cursor pagination (long term)

- **v2 core**: offset with **`skip` + `limit`**; document that **cursor pagination is not the default**.
- **Later**: optional `*Connection` generator or plugin using **`first` / `after` / `last` / `before`** per Relay, or a Contentful-like `pageNext` / `pagePrev` style if we target embedded CMS patterns — but **keep argument sets disjoint** from offset pagination so integrators can reason about one model at a time.
- **Docs**: spell out semantics for `count` + `items` when both total count and offset lists are requested (performance vs. accuracy), especially for large tables.

---

## 4. Admin CRUD (CMS backend module)

This is the **port** of a **reference CMS backend** pattern (validated in a private app, not part of this public repository): register models, generate CRUD + metadata under a **`cms`** namespace, optional re-exposure of `geneConfig.exclude` fields for admins.

### 4.1 Reference behavior (prior art)

- **`enableAdminCrud(Model, options?)`**: can run before Sequelize init; pending registrations flush after init. When it runs, it **walks the model’s attribute definitions** (for inputs, meta, excluded-field handling, etc.) in the **same spirit as graphql-gene during schema init**—respecting `geneConfig`, `isFieldIncluded`, and related rules. Today that is a **separate code path** from Gene’s own iteration.
- **Schema**: `Query.cms` → `CmsQuery`, `Mutation.cms` → `CmsMutation`; per-model list, by-id, `*Meta`, create/update/delete.
- **Global**: `cms.modelNames` (flat list) filtered by roles—**v2 should supersede this** for primary UX with **hierarchy-based discovery** (§4.6).
- **Metadata**: `*Meta { attributes: JSON! }` for form building (attributes + admin-enabled associations).
- **Mutations**: explicit `create*`, `update*(id, input)`, `delete*` — **not** “default mutation” on the root for every model.

### 4.2 What moves into `graphql-gene` (backend only)

- **Unified attribute iteration**: When porting CMS, **merge** the admin CRUD attribute walk with graphql-gene’s existing model/schema initialization so there is **one** canonical pass over attributes (and the same application of `geneConfig`, inclusion rules, virtual handling, etc.). CMS inputs, `*Meta`, and re-exposed excluded fields must not live in a second, divergent loop long term.
- Registration API (most likely renaming `enableAdminCrud` to `registerCmsModel` for clarity). **Call `registerCmsModel` only for models that should appear as top-level navigation roots**. Nested targets (e.g. child rows reached only through `User → orders → …`) stay **off** the flat menu; they appear in the tree under their parent path—see §4.6.
- Lazy/pending registration until models are ready (same idea as today).
- Appending/merging generated input types and meta types into the schema.
- `extendTypes` wiring for `CmsQuery` / `CmsMutation` / `Query.cms` / `Mutation.cms`.
- Resolvers for list, get-by-id, meta, CRUD mutations, and **discovery** shaped for hierarchy + nav (replacing a noisy flat `modelNames` as the main entry—§4.6).
- Hooks for validation error formatting (optional callback, as today).
- **Documentation** of the public GraphQL operations so any frontend can implement a CMS.

### 4.3 What stays outside the library

- **Vue (or React) CMS UI**, routing, and design system components.
- **Product copy, UI strings, and locale bundles** for a specific admin app (wording, branding, `vue-i18n` / JSON catalogs, etc.). Schema-level conventions for **translation data** (below) are part of the library contract so any consumer can build a locale-aware CMS.

### 4.4 Mutations: explicit CMS operations only

Core Gene **must not** ship “default mutations for every model” on the root `Mutation` type. **Create / update / delete** for CMS are **only** the operations generated under **`cms`** (or the configured namespace) for models that are explicitly registered. That matches the reference CMS design and avoids surprising public write APIs.

### 4.5 Translation models and the `translations` field (library convention)

To keep CMS metadata and UIs consistent across consumers, v2 should **document and implement** a single pattern for localized row models:

| Convention                                | Purpose                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Model name ends with `I18n`**           | Translation row models follow **Parent + `I18n`** (e.g. `Article` → `ArticleI18n`). See context below.                                                                                                                                                                                                                                                |
| **Association field name `translations`** | The parent model’s has-many to its `*I18n` model should use the GraphQL field name **`translations`** for that association. The CMS module can then **reserve** this name and treat it as the **translation facet** (e.g. nested locale forms, linking parent create/update to translation rows) without guessing from arbitrary association aliases. |

**Where those model names show up (the “meta” surface):** The Sequelize **class name** drives several CMS-facing strings: GraphQL **object type names**, `cms.modelNames`, generated operation names (e.g. `…List`, `create…`, `…Meta`), and inside **`{Model}Meta.attributes`**—association entries include a **`target`** (and nested shape) keyed off the related model’s name. So translation models are not an implementation detail; they appear everywhere the CMS lists models or describes associations. A **stable, recognizable suffix** keeps that metadata self-explanatory without extra registries.

**Why `*I18n` is still the right default when migrating admin CRUD into graphql-gene**

- **Heuristic without configuration:** Tools and docs can treat `FooI18n` as the translation table for `Foo` (strip suffix → parent), which helps codegen, sidebar grouping, and future “open translations for this entity” flows without maintaining a separate mapping table.
- **Distinct from generic types:** Names like `Translation` or `LocaleString` collide across domains; `ArticleI18n` is unambiguous in `modelNames` and in meta `target` fields.
- **Matches common Sequelize/TypeScript practice** in real apps, so the port can **document and enforce** an existing pattern rather than inventing a parallel naming scheme that would force renames or dual naming (DB vs. GraphQL).
- **Scales in `*Meta`:** When the meta JSON lists associations, editors can spot **which** children are locale rows (`…I18n`) vs. business relations (`OrderLine`, etc.) without app-specific conventions in every model.

**Why reserve `translations`:** Other has-manys keep arbitrary names (`moduleItems`, etc.). Giving translation edges a **standard field name** lets generic CMS clients detect i18n without app-specific config. If a codebase today uses a different property key (e.g. a symbol or internal alias), the GraphQL exposure should still use **`translations`** for the CMS-facing schema, or the plan should allow an explicit `geneConfig` override with `translations` as the recommended default.

### 4.6 Navigation & discovery (association hierarchy, not flat model list)

- **Problem:** A flat **`modelNames`** side menu is noisy (nested models without context) and weak for RBAC (e.g. a generic **“Case”** vs **“My Cases”**—rows tied to the current user).
- **Direction:** Primary discovery should expose **association paths from the logged-in user** (or other explicit entry types): labeled edges (e.g. **tickets assigned to me**, **workspaces I own**) instead of dumping every registered model. Add **opt-in** “show in root nav” for models that are legitimately top-level.
- **UI pattern:** **Nested, expandable nav** (similar to the VS Code docs site)—tree follows **parent → child** associations, not an alphabetical type list.
- **URL:** Encode the **association chain** (path from user entry to current resource). The server uses that path to verify **reachability** (can we walk parents back to the current user?) as the **first** access gate; **`roles`** on types/fields remains the **second** gate (read vs write vs delete—§5.6).
- **API:** Replace or supplement `modelNames` with a **hierarchy-aware discovery query** (exact name TBD) that returns tree nodes + labels + operations allowed for the caller.

---

## 5. Authorization: `roles` in field config + auth directive factory on `generateSchema`

### 5.1 Problem

Today, admin CRUD stores **roles per model** (`enableAdminCrud(Model, { roles })`) while field-level security elsewhere uses **directives** on types/fields. That split makes it harder to:

- Derive **one** consistent “what can this role see/edit” story.
- Drive a **first query** that returns which attributes and operations are valid before building the second query for the CMS screen.

### 5.2 Options compared

| Approach                                                  | Idea                                                                                                                      | Pros                                                                                                      | Cons                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A. Status quo**                                         | Roles only on `enableAdminCrud`                                                                                           | Already implemented                                                                                       | Duplicates concepts; meta vs. mutations can drift from directives |
| **B. Roles only in directives**                           | Every CMS field gets `directives: [auth(...)]`                                                                            | Single mechanism                                                                                          | Verbose; repetition without helpers                               |
| **C. `roles` (and optional `auth`) in field/type config** | Same ergonomics as `directives` in Gene config, but **first-class** for RBAC: e.g. `roles: ['editor']` on a field or type | Central place for codegen (meta, schema introspection helpers); can still **emit** directives for runtime | Requires defining how roles merge (type vs. field vs. operation)  |
| **D. Schema directives only in SDL**                      | No TS-level `roles`                                                                                                       | Pure GraphQL                                                                                              | Harder for Gene to generate meta and filtered schemas             |

**Winner: C**, with two distinct knobs:

_Note: RBAC stands for role-based access control_

1. **`roles`** — a **dedicated** option on **type and field** definitions in Gene config (alongside existing fields like `directives`, `returnType`, `resolver`, …). Values are **either** a string array **or** an object with **`read` / `write` / `delete` / `all`** keys, each holding the same string array (§5.5). Strings can be **role names** (`super-admin`) or **action identifiers** / scopes (`promo-code.create`, `users.manage`)—same mechanism (§5.5). Drives **metadata, discovery, and policy** without overloading generic `directives`.
2. **`directives`** — unchanged as the **general** hook for **any** GraphQL directive (`@deprecated`, custom composition directives, etc.). Gene must **not** infer authorization semantics by scanning arbitrary directive factories.

**Why not only `directives`?** Today you could attach an auth directive via `directives: () => [myAuthDirective({ roles: [...] })]`, but Gene has **no typed, uniform signal** that this field is **authorization-gated** vs any other directive. A first-class **`roles`** property marks **exactly** “this surface participates in RBAC,” which is what **discovery and policy** (including hierarchy-aware nav—§4.6) need without heuristics.

### 5.3 Auth directive factory on `generateSchema`

**Where it is configured:** Extend **`generateSchema`** (the same entry point used today, e.g. `packages/dev-playground/src/server/schema.ts`) with a **single optional parameter**—name TBD, e.g. **`authDirective`** or **`createAuthDirective`**—whose value is a **factory function**.

**What the factory is:** A function that Gene invokes whenever it **emits** a type or field that declares **`roles`** in config. Its **return type / contract** matches Gene’s existing directive model—**`GeneDirective` / `GeneDirectiveConfig`** in `packages/core/src/defineConfig.ts` (`name`, `args`, `handler` per `GeneDirectiveConfig`). In other words: the factory produces the **same kind of object** you would return from a **`GeneDirective`** today, but driven by **`roles`** so apps wire their real auth directive once at schema build time.

**Flow:** `roles` on a field or type → Gene calls the factory with the resolved role list (and any agreed context) → the returned **`GeneDirectiveConfig`** is attached for **runtime** authorization, consistent with how other directives are integrated.

**Directive order (field / type resolution):** The **auth directive** from **`roles`** (via the auth factory) runs **before** other `directives` on the same field or type. **CMS mutations (§5.7)** are a special case: auth derived from **`roles`** and **type-level** directives must run **before** the mutation persists changes, so a failing check never leaves a committed write.

### 5.4 Global roles / actions in TypeScript (module augmentation)

- **Optional but recommended:** Same **declaration merging** idea as **`GeneSchema`** / **`GeneContext`** in the README (**Typing** → `declare module 'graphql-gene/schema'` / `'graphql-gene/context'`): v2 can expose an **augmentable** slot (e.g. `GeneRole` under a `graphql-gene` module) that apps extend in **`*.d.ts`** so **`roles`**, auth factories, and context share **one type-checked** vocabulary of role names and action strings. **Recommended** for any non-trivial app so role/action strings stay consistent and refactors stay safe; **not** required to run.
- **Fallback:** If the module is **not** augmented, **`roles`** (and related APIs) use plain **`string`** type.
- Document the pattern **next to** the existing `graphql-gene.d.ts` example as **optional (recommended)**. (A **GraphQL enum** for roles in SDL, if ever added, is unrelated to this TS mechanism.)

### 5.5 `roles` shape, actions, and when to use custom directives

- **Shape:** `roles` accepts **`string[]`** (applies to all operations unless refined) **or** `{ read?: string[], write?: string[], delete?: string[], all?: string[] }` with the same string arrays per operation class.
- **Actions / scopes:** Strings may denote **coarse roles** or **fine-grained actions** (e.g. `user.delete`, `promo-code.create`)—Gmail-style scopes. Implementation treats them uniformly at runtime; **§5.4** augmentation (**recommended**) gives a shared literal union (fallback to **`string`**).
- **Dynamic rules** (e.g. “may change status only if …”): **do not** encode in `roles` alone—use a normal **`directives`** (or field resolver) that throws **unauthorized** / **forbidden**.

### 5.6 Two-phase access for CMS (path, then `roles`)

- **Phase 1 — reachability:** For read/write CMS operations, verify the resource is reachable through the **declared association path** from the **current user** (path reflected in the URL / client context—§4.6). No path to user ⇒ deny regardless of `roles`.
- **Phase 2 — `roles`:** If the path is valid, apply **`roles`** for **read vs write vs delete** (or `all`) and **action** strings.
- Keeps **tenant / ownership** logic structurally separate from **role** logic.

### 5.7 CMS mutations vs type-level directives

- **Issue:** Type-level directives run when resolving the **mutation return type**; the **mutation may already have committed** side effects, so a late “unauthorized” on the type is too late.
- **Requirement:** For **`cms` mutations**, run **type-level** directives and **`roles`-derived auth** **before** executing the mutation body (create/update/delete). Aligns with §5.3 directive order for fields, but explicitly covers the **mutation-first** trap.

**Docs:** Describe the **auth directive factory** on **`generateSchema`** as used **whenever `roles` is set**—not only legacy per-model registration.

**Open design detail (how `roles` affect what clients _see_):** `roles` will always drive **runtime authorization** (directives, resolvers). A related design question is **how clients with limited roles learn which parts of the schema they may use** when full introspection is off or undesirable. That **discovery** story should be specified up front—not left as an informal afterthought.

**Security requirement:** Users with **narrow roles** must not depend on **full GraphQL introspection** (`__schema`, etc.) to learn the API—introspection is often **disabled in production** precisely because it exposes the **entire** surface area. For CMS-style flows, the **first** requests that describe “what exists and what to select” should therefore return **only the subset** of types, fields, and operations that role is allowed to use, so the **effective** API is small even if someone could otherwise guess field names.

**Design fork (to document in v2):** (1) **Minimum:** **`roles`** (typed or `string`) + auth directive from **`generateSchema`** + **hierarchy discovery** (§4.6) + **`*Meta`**; **optional (recommended)** TS augmentation (§5.4) for role/action literals. (2) **Stricter:** **omit** forbidden operations from published SDL for some audiences. Align discovery with **path + `roles`** (§5.6), not a flat dump of every model.

### 5.8 CMS discovery flow (for consumers building their own UI)

1. **Query** the **nav / discovery** API (association tree from user + explicit roots—§4.6); treat flat `modelNames` as **legacy** if kept.
2. **Drive routing** with the **encoded path** so the server can enforce **reachability** (§5.6).
3. **Fetch `*Meta`** for the current resource to build forms.
4. **Run list/detail/mutations**; **`roles`** + custom directives enforce **read/write/delete** and conditional rules.

**Contract:** Type/field **`roles`** (array or per-operation object; **`string`** or literals if §5.4 is augmented), **`generateSchema`** auth factory (**`GeneDirectiveConfig`**), **optional (recommended)** §5.4 **module augmentation** for typing, **mutation auth before persistence** (§5.7), **path-then-roles** for CMS, and **register only top-level nav models** unless explicitly flagged (§4.2).

---

## 6. Cross-cutting concerns

- **Naming collisions**: Wrapper types and new inputs need deterministic naming (`generateGraphqlTypeName` style) and escape hatches when user-defined types clash.
- **`count` + `items` and database work:** This is **not** an automatic “double query” problem. GraphQL runs a field’s resolver **only if that field appears in the operation**—so the `count` resolver executes **only when `count` is selected**, and the resolver that loads rows runs **only when `items` is selected** (or whatever the list field is named). A client that asks for `items` alone never pays for `count`, and vice versa. When **both** are requested, the implementation may still use one SQL statement or two, depending on the ORM and indexes; document the chosen approach in the Sequelize plugin. For nested includes and association loading, Gene already relies on **[graphql-lookahead](https://www.npmjs.com/package/graphql-lookahead)** (see `getQueryInclude` in `plugin-sequelize`) to walk the selection set and avoid work that was not asked for—apply the same idea to list wrappers so lookahead / `GraphQLResolveInfo` informs whether to issue aggregate `COUNT` vs. row `SELECT` paths.
- **Plugins**: Non-Sequelize plugins need extension points for association wrappers and the CMS module.
- **Polymorphic unions (§2.8):** Union `resolveType`, discriminator vs. nullable-FK rules, and **lookahead** mapping must stay in sync; document behavior when **multiple** FKs are set (validation) or **none** are set (null union member).
- **Docs & playground**: Refresh READMEs with v2 examples; extend dev playground with association wrappers and **CMS namespace** demo (backend schema only). Long-form docs live in **`packages/docs`** (or similar)—see §11.

---

## 7. Suggested rollout phases

1. **Design lock**: List wrapper + **deep filtering** (§2.7); **polymorphic unions / page blocks** (§2.8); pagination (§3); CMS + **§4.6 nav/discovery** + **`registerCmsModel` scope** + translations (§4); **§5.4–§5.8** (`roles` grammar, actions, path gate, mutation ordering, **optional (recommended) TS role augmentation**); **Markdown docs** (§11).
2. **Schema generation**: New types (including **union** types and hub fields per §2.8); optional deprecation flag for v1-shaped lists if needed on v1.x.
3. **Resolvers**: Sequelize paths for nested reads; port admin CRUD from the reference implementation into a `graphql-gene` submodule or package.
4. **Migration tooling**: Query codemods, changelog, semver-major release.
5. **Documentation**: Add and grow **`.md` files** under the dedicated docs package; keep using GitHub for rendering until a static site is explicitly in scope.

---

## 8. Open decisions

- Edge cases where a **single** association might need an **opt-in** wrapper (see §2.5 — default is **no** wrapper).
- **Resolved:** The row facet is named **`items`** (alongside **`count`**). Nested `items { items { … } }` is expected when the association field is also `items`.
- Exact GraphQL names for **role-aware meta** (extend `*Meta` vs. new root fields).
- Exact **nested `where` input** grammar for deep filters (relation paths, depth limits, alignment with Sequelize `include`/`where`).
- Whether **`translations`** must always be the GraphQL alias or a **`geneConfig`** key (e.g. `cmsTranslationField: 'translations'`) is allowed when legacy schemas cannot rename the association.
- **`generateSchema` option name** for the auth factory (`authDirective` vs `createAuthDirective`, etc.) and **exact factory signature** (e.g. `{ roles }` only vs extra context) aligned with **`GeneDirective` / `GeneDirectiveConfig`** (`packages/core/src/defineConfig.ts`).
- **Vocabulary:** keep the config key **`roles`** (RBAC-flavored) vs rename to **`scopes`** (closer to Gmail API / OAuth scope language) when values are often fine-grained actions (`resource.operation`).
- **Discovery query shape** and **URL encoding** for association paths (§4.6 / §5.6).
- **Polymorphic unions (§2.8):** Discriminator strategy (**explicit `type` column** vs **which optional FK is non-null**); GraphQL naming when the **Sequelize hub model** name would collide with the **union** name; whether **admin CRUD** generates **separate create/update** inputs per member or a **single tagged input**.

---

## 9. Reference implementation (private)

The **admin CRUD / CMS backend** described in this plan was first exercised in a **private application** (outside this repository). That code is not linked here.

**Public anchors in this repo** (paths refer to **`graphql-gene` only**):

- Sequelize plugin: `packages/plugin-sequelize/` (includes `getQueryInclude` and **`graphql-lookahead`** usage).
- Core defaults: `packages/core/src/defaultResolver.ts` (`generateDefaultQueryFilterTypeDefs`, etc.).
- Schema build: `packages/core/src/schema.ts` (`generateSchema`); directive types: `packages/core/src/defineConfig.ts` (`GeneDirective`, `GeneDirectiveConfig`).

When porting, maintainers may diff against the internal CMS utility **inside the private repo** (entry points such as `enableAdminCrud`, `generateAdminCrudSchema`, model registration) without publishing those paths in docs or PRs.

This section should be updated if a **minimal, redacted example** or fixture lands in the public repo (e.g. under `packages/dev-playground` or examples/).

---

## 10. Contributing and PRs

This file is safe to commit and discuss in **public pull requests**: it contains **no** private repository URLs, internal package names, or proprietary paths. If you extend the plan, keep **organization-specific** integration details in private notes or in code that stays outside the public `graphql-gene` tree.

---

## 11. Documentation (Markdown-first)

**Direction:** Start **documenting v2 with Markdown** (`.md`) as the **source of truth** for guides, migration notes, and API overviews. Keep the **first wave** of public documentation **small in scope**: prioritize clarity and discoverability over tooling.

**Where it lives:** Add a **separate package** in the **pnpm workspace**—for example `packages/docs`—so documentation is not buried inside `packages/core` or a single root `README`. The workspace already uses `packages/*`; this package can be **content-only** (no build step, or a minimal `package.json` if needed for workspace consistency). **Boundary on purpose:** keeping prose in its **own package** means that later, if you adopt a **documentation site or app** (Docusaurus, VitePress, a thin Next wrapper, etc.), you can **point that tool at this package** as the Markdown root or depend on it as a workspace package—without reshuffling the repo or mixing build tooling into `packages/core`.

**Rendering:** Rely on the **GitHub UI** (repository file browser, Markdown preview, and folder-level `README.md` files as section landing pages). A **nested folder structure** with sensible names reads well online without a custom site.

**Out of scope (initially):** A **full static documentation website** (generated HTML, search, versioned microsites) is **not** required for the first v2 documentation milestone. Revisit **Docusaurus, VitePress, Nextra**, or similar **after** the Markdown corpus stabilizes.

**In scope:** Root `README` links into `packages/docs/`, migration guides next to `PLAN_V2.md` or under `packages/docs/migration/`, and ongoing PRs that extend `.md` files like any other source.
