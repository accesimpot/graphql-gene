# Gene v2

Plan for a major version of GraphQL Gene: goals, breaking changes, and migration notes. The plan ties library design to real usage (CMS-style admin APIs, predictable association reads) and records **why** each change exists, **alternatives considered**, and the **chosen direction**.

---

## 1. Goals

| Goal                                                  | Rationale                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Predictable association APIs**                      | List associations should expose filtering and pagination in a shape that scales (metadata like total count vs. row selection), not only flattened list arguments and child-scalar `where` inputs.                                                                                                                      |
| **Admin CRUD (CMS backend) in the library**           | A production integration already implements an “admin CRUD” pattern (`enableAdminCrud`, `cms` query/mutation namespace, metadata for dynamic forms). Moving **only the backend integration** into `graphql-gene` lets open-source consumers build their own CMS UIs; product-specific frontends stay out of this repo. |
| **Authorization that matches the rest of the schema** | Today, admin CRUD attaches roles **per model** while the public API often uses **type/field directives** (`@userAuth`, etc.). v2 should unify how roles are declared and applied so metadata and field visibility stay consistent.                                                                                     |
| **Explicit breaking changes**                         | v2 may change generated schema and TypeScript types; document deltas and codemods where feasible.                                                                                                                                                                                                                      |

**Non-goals for the open-source package**

- **No default “global” mutations for arbitrary model types.** Automatic create/update/delete belong to the **optional CMS / admin CRUD module**, not to the core idea that “every model gets default Mutation fields.” That keeps the public API surface intentional and avoids accidental exposure.
- **No reference CMS frontend** in the repo. The library exposes the **GraphQL contract** (queries, mutations, metadata) needed to build a CMS; product-specific UI stays out of scope.

---

## 2. Association fields: from flat lists to a standard result shape

### 2.1 Current behavior (v1)

- Has-many (and similar) association fields get `page`, `perPage`, `where`, `order`, and resolve to a plain list type (e.g. `[Child!]`).
- `where` inputs are generated from the **child type’s fields** (scalars and shallow handling for nested associations via `id`), as in `generateDefaultQueryFilterTypeDefs` in `packages/core/src/defaultResolver.ts`.

### 2.2 Problems

- **Ambiguity**: Clients mix “filter the rows” with “shape of the response” when everything sits on one field.
- **Missing aggregates**: Total count under the same filters without loading all rows is awkward if the field is only `[Child!]`.
- **Ecosystem alignment**: Many schemas use a small wrapper object for list+metadata instead of bare arrays for paginated or filtered lists.

### 2.3 Options compared

| Approach                                             | Shape                                                       | Pros                                                                                      | Cons                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **A. Relay-style connection**                        | `edges { cursor, node }`, `pageInfo`, optional `totalCount` | De facto standard for GraphQL pagination; stable cursors; great for large, evolving lists | Heavier schema; more boilerplate for internal/CMS clients   |
| **B. Simple list result**                            | `{ count: Int!, items: [Child!]! }` (or `nodes`)            | Easy to document; matches “count + page of rows”; fits admin tooling                      | Not cursor-based; offset semantics unless extended later    |
| **C. Keep v1 flat list + add a sibling count field** | e.g. `variantsCount(where: …)` next to `variants(…)`        | Minimal change to list field                                                              | Two fields to keep in sync; awkward for nested associations |

**Winner: B** as the **default** generated shape for Gene list associations, with **A** documented as an optional plugin or per-field opt-in for Relay-shaped clients.

### 2.4 Target API (breaking, illustrative)

Filtering and pagination arguments belong to the facet that returns rows (`items` / `nodes`), not scattered ambiguously on the parent.

```graphql
# v1 (conceptual)
variants(where: { size: { in: ["US 10"] } }) { id size }

# v2 (example — pagination args follow section 3: skip + limit)
variants {
  count
  items(where: { size: { in: ["US 10"] } }, limit: 10, skip: 0) {
    id
    size
  }
}
```

### 2.5 List vs single association: wrapper and “one level of metadata”

Gene today distinguishes **list** associations (GraphQL list of objects) from **single** associations (one nullable object, e.g. belongs-to / has-one). The v2 **wrapper** (`count` + `items` + filters) is motivated by **collections**: pagination, total count, and “which rows” are separate concerns.

**Does the same “one level deep” wrapper make sense for a single association?**

| | **List (e.g. has-many)** | **Single (e.g. belongs-to / has-one)** |
|---|--------------------------|----------------------------------------|
| **Primary job of the field** | Return **many** rows, often filtered and paginated | Return **at most one** related row (or null) |
| **What “metadata” usually means here** | `count` under the same filters, plus arguments on `items` (`where`, `skip`, `limit`) | Often **nothing extra** at the edge: the FK join picks the row |
| **Wrapper adds value?** | **Yes**: separates aggregate (`count`) from row selection (`items`) and holds list args | **Usually no**: there is no meaningful `count` (only present/absent), and no `skip`/`limit` |

**Recommendation:** Keep the **wrapper + list metadata** pattern for **array-returning** association fields only. For **single** associations, keep the **flat nullable object** as the default GraphQL shape: the field resolves directly to `Child` or `null`. That matches common GraphQL style and avoids noisy nesting (`brand { … }` rather than `brand { node { … } }` or `brand { meta { … } value { … } }`) when there is no second dimension of data to expose at the edge.

**When a single association might still get an extra level** (opt-in or rare types):

- **Polymorphic or ambiguous edges** where the client needs **discriminator / type metadata** next to the object (still unusual; often modeled as a union or explicit `__typename`).
- **Explicit CMS / auth hints** at the edge (e.g. “hidden by policy”)—prefer **field-level authorization** or **trimmed SDL** (section 5) instead of a generic wrapper for every belongs-to.

**Examples**

*List association (wrapper justified):*

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

*Single association (flat default; no extra wrapper for metadata):*

```graphql
# Product belongs to Brand — at most one row; no pagination
product {
  brand {
    id
    name
  }
}
```

*Single association (hypothetical wrapper — generally **not** the default):*

```graphql
# Only if we had a strong, repeated need for edge-level data alongside the one row
product {
  brandEdge {
    # illustrative — not the default v2 shape
    canView
    brand {
      id
      name
    }
  }
}
```

**Relation to CMS `*Meta`:** Form-building metadata (field kinds, targets, nested `attributes`) is already modeled in **separate meta queries** (`*Meta` / JSON), not by wrapping every association resolver. That stays the right place for **rich** structural metadata; the **read** field for a single association should stay **thin** unless a concrete use case requires an edge wrapper.

### 2.6 Work items

- Define generated type names (e.g. `ProductVariantsResult` vs. `…Connection` for Relay opt-in).
- Move `where` / `order` / `skip` / `limit` to the wrapper-owned list field (see section 3 for naming rationale).
- Implement `count` with clearly documented semantics (filtered vs. unfiltered).
- Update Sequelize include / resolver path in `packages/plugin-sequelize` for nested reads.
- Migration: codemod or guide for persisted `.gql` documents.
- **Single associations:** default remains **unwrapped** nullable type; document exceptions (see §2.5).

---

## 3. Pagination and argument naming (cross-cutting)

This applies both to **core association fields** (section 2) and to **admin CRUD list queries** (section 4) so naming stays consistent.

**Audience:** v2 is the first version we intend to promote widely. Argument names should read naturally to **any** GraphQL or CMS integrator, not only to one consumer. Prior internal or experimental usage of `page` / `perPage` in Gene v1 is **not** a reason to keep those names in the public API.

### 3.1 Current patterns

- **Gene v1**: `page`, `perPage`, `where`, `order` on list fields — **offset-style** pagination.
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
   - **`page` / `perPage` are not the canonical names** in v2 docs or generated SDL; they can remain **optional aliases** via global config for migration or DX if needed, but the **documented, portable contract** should be `skip` + `limit`.

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
- **Global**: `cms.modelNames` filtered by user roles.
- **Metadata**: `*Meta { attributes: JSON! }` for form building (attributes + admin-enabled associations).
- **Mutations**: explicit `create*`, `update*(id, input)`, `delete*` — **not** “default mutation” on the root for every model.

### 4.2 What moves into `graphql-gene` (backend only)

- **Unified attribute iteration**: When porting CMS, **merge** the admin CRUD attribute walk with graphql-gene’s existing model/schema initialization so there is **one** canonical pass over attributes (and the same application of `geneConfig`, inclusion rules, virtual handling, etc.). CMS inputs, `*Meta`, and re-exposed excluded fields must not live in a second, divergent loop long term.
- Registration API (most likely renaming `enableAdminCrud` to `registerCmsModel` for clarity).
- Lazy/pending registration until models are ready (same idea as today).
- Appending/merging generated input types and meta types into the schema.
- `extendTypes` wiring for `CmsQuery` / `CmsMutation` / `Query.cms` / `Mutation.cms`.
- Resolvers for list, get-by-id, meta, CRUD mutations, and `modelNames`.
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

**Registration:** Translation models (`*I18n`) are registered with the CMS the same way as other models (e.g. `registerCmsModel(ArticleI18n)` alongside the parent), so CRUD and meta stay available for per-locale editing.

---

## 5. Authorization: roles at type/field level + global auth directive factory

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

**Winner: C**, with directives still generated where needed: introduce **`roles`** (and related metadata) at **type and field level** in Gene config (alongside `directives`), so admin CRUD and public types use the **same** declaration style.

### 5.3 Global `authDirective` (name TBD)

The library should not hardcode `@userAuth` or app-specific directive names.

- **Option**: `createGenePlugin` / `initGene({ authDirective: (ctx) => [...] })` or **`authDirective: ({ roles }) => Directive`** passed **once** at initialization.
- Resolvers and generated CMS fields call this factory so **roles flow** from config → directive → runtime context consistently.

**Open design detail (how `roles` affect what clients _see_):** `roles` will always drive **runtime authorization** (directives, resolvers). Separately, we need a clear story for **how little-privilege callers discover what they may query** without treating that as “optional hardening.”

**Security requirement:** Users with **narrow roles** must not depend on **full GraphQL introspection** (`__schema`, etc.) to learn the API—introspection is often **disabled in production** precisely because it exposes the **entire** surface area. For CMS-style flows, the **first** requests that describe “what exists and what to select” should therefore return **only the subset** of types, fields, and operations that role is allowed to use, so the **effective** API is small even if someone could otherwise guess field names.

**Design fork (to document in v2):** (1) **Minimum:** directives + **dedicated discovery fields** (e.g. `cms.modelNames`, role-aware `*Meta`, future `accessibleFields`) whose resolvers enforce RBAC and return **trimmed** metadata—not a dump of the whole schema. (2) **Stricter:** additionally **omit** forbidden types or fields from the **published SDL** for certain audiences (separate schema variants, gateway, or codegen), so unauthorized operations **do not appear** in the contract at all. The plan does **not** mean “filter SDL casually”; it means **align discovery and SDL policy** so low-permission users only ever see a **small, intentional** slice of the graph.

### 5.4 CMS discovery flow (for consumers building their own UI)

1. **Query** `cms.modelNames` (and/or future role-scoped helpers such as `cms.accessibleFields` / filtered `*Meta`) using the unified role model—**not** as a substitute for locking down resolvers, but as the **supported** way to get shape information when **introspection is off**.
2. **Fetch `*Meta`** for a model to build forms and nested selections.
3. **Run list/detail/mutations** with selections aligned to allowed fields.

Exact query names can evolve; the **contract** is: **roles are field/type-level in config**, **auth directive is pluggable globally**, and **model registration** for CMS does not use a second, incompatible role system.

---

## 6. Cross-cutting concerns

- **Naming collisions**: Wrapper types and new inputs need deterministic naming (`generateGraphqlTypeName` style) and escape hatches when user-defined types clash.
- **`count` + `items` and database work:** This is **not** an automatic “double query” problem. GraphQL runs a field’s resolver **only if that field appears in the operation**—so the `count` resolver executes **only when `count` is selected**, and the resolver that loads rows runs **only when `items` is selected** (or whatever the list field is named). A client that asks for `items` alone never pays for `count`, and vice versa. When **both** are requested, the implementation may still use one SQL statement or two, depending on the ORM and indexes; document the chosen approach in the Sequelize plugin. For nested includes and association loading, Gene already relies on **[graphql-lookahead](https://www.npmjs.com/package/graphql-lookahead)** (see `getQueryInclude` in `plugin-sequelize`) to walk the selection set and avoid work that was not asked for—apply the same idea to list wrappers so lookahead / `GraphQLResolveInfo` informs whether to issue aggregate `COUNT` vs. row `SELECT` paths.
- **Plugins**: Non-Sequelize plugins need extension points for association wrappers and the CMS module.
- **Docs & playground**: Refresh READMEs with v2 examples; extend dev playground with association wrappers and **CMS namespace** demo (backend schema only).

---

## 7. Suggested rollout phases

1. **Design lock**: List wrapper shape (section 2); pagination naming (section 3); CMS namespace + registration API + **translation model / `translations` field conventions** (section 4); auth config (`roles` + `authDirective`) (section 5).
2. **Schema generation**: New types; optional deprecation flag for v1-shaped lists if needed on v1.x.
3. **Resolvers**: Sequelize paths for nested reads; port admin CRUD from the reference implementation into a `graphql-gene` submodule or package.
4. **Migration tooling**: Query codemods, changelog, semver-major release.

---

## 8. Open decisions

- Whether to expose **optional** `page` / `pageSize` (or legacy `page` / `perPage`) as **aliases** that normalize to `skip` / `limit`, and whether those aliases appear in SDL or only in docs.
- When **both** `count` and `items` are selected, whether to use **one SQL** (e.g. window `COUNT`) vs **two**—orthogonal to “always paying for both,” since each field is optional in the operation (see §6).
- Edge cases where a **single** association might need an **opt-in** wrapper (see §2.5 — default is **no** wrapper).
- Global config vs. per-field overrides for wrapper field names (`items` vs. `nodes`).
- Exact GraphQL names for **role-aware meta** (extend `*Meta` vs. new root fields).
- Whether **`translations`** must always be the GraphQL alias or a **`geneConfig`** key (e.g. `cmsTranslationField: 'translations'`) is allowed when legacy schemas cannot rename the association.

---

## 9. Reference implementation (private)

The **admin CRUD / CMS backend** described in this plan was first exercised in a **private application** (outside this repository). That code is not linked here.

**Public anchors in this repo** (paths refer to **`graphql-gene` only**):

- Sequelize plugin: `packages/plugin-sequelize/` (includes `getQueryInclude` and **`graphql-lookahead`** usage).
- Core defaults: `packages/core/src/defaultResolver.ts` (`generateDefaultQueryFilterTypeDefs`, etc.).

When porting, maintainers may diff against the internal CMS utility **inside the private repo** (entry points such as `enableAdminCrud`, `generateAdminCrudSchema`, model registration) without publishing those paths in docs or PRs.

This section should be updated if a **minimal, redacted example** or fixture lands in the public repo (e.g. under `packages/dev-playground` or examples/).

---

## 10. Contributing and PRs

This file is safe to commit and discuss in **public pull requests**: it contains **no** private repository URLs, internal package names, or proprietary paths. If you extend the plan, keep **organization-specific** integration details in private notes or in code that stays outside the public `graphql-gene` tree.
