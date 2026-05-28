# Why GraphQL Gene?

GraphQL Gene is an open-source library built by [Elio Tax](https://www.elio-tax.com)'s engineering team—originally to power our own production API while filing sensitive Canadian tax returns online. We needed a **GraphQL-first**, **self-hosted** stack where the schema stays honest with our **Sequelize** models, **TypeScript** catches breaking changes before deploy, and **access control** can go far beyond a single `isAdmin` flag: gating fields by nested data loaded on `Query.me` (for example, only cases assigned to the current user).

This guide explains the problems we kept hitting elsewhere, how graphql-gene addresses them today, and how it fits next to other tools you may already know.

**Today:** graphql-gene is a **schema and resolver library**—there is no CMS admin UI yet (coming soon). You define models in code, generate the GraphQL API, and ship your own clients.

**Coming (v2 sneak peek):** we are porting a **CMS backend module** we already run in production into the library—`cms` queries and mutations, `*Meta` for dynamic forms, hierarchy-based discovery—so admin workflows can use the same GraphQL contract as your product API. We also plan a **hosted admin experience**—including a free tier that connects to your GraphQL API (you keep the servers and database; we host the admin app). That UI will not live in this open-source repo. See [PLAN_V2.md](../../../PLAN_V2.md) (especially §4 Admin CRUD and §4.6 navigation) for goals, scope, and boundaries.

---

## What we needed

| Requirement                          | Why it mattered at Elio Tax                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GraphQL-first API**                | Clients (web, mobile, internal tools) share one graph; operations and variables are the contract, not ad hoc REST shapes.                                                                                                                                                                                            |
| **One source of truth**              | ORM models should drive both the database and the GraphQL schema so renames and new fields do not drift silently.                                                                                                                                                                                                    |
| **Deep TypeScript safety**           | Resolver `args`, return values, and context should be inferred—not maintained in parallel with hand-written types.                                                                                                                                                                                                   |
| **Association-aware filtering**      | `where`-style filters on nested associations (Sequelize operators), not only top-level list fields.                                                                                                                                                                                                                  |
| **Field-level authorization**        | Sensitive tax data requires rules on **fields and types**, including scopes derived from **`me`** and nested associations (e.g. assigned cases), not only global roles.                                                                                                                                              |
| **Performance by default**           | Load nested relations only when the client selects them (lookahead), without boilerplate in every resolver.                                                                                                                                                                                                          |
| **Library first, CMS backend later** | Fit existing Node services today—no CMS admin DB that must be synced before a new route goes live. A **typed `cms` GraphQL module** (lists, CRUD, metadata) is on the [v2 roadmap](../../../PLAN_V2.md#4-admin-crud-cms-backend-module) so consumers can plug in their own UI without Strapi-style platform lock-in. |

GraphQL Gene is the combination of those requirements: a small core plus plugins (today [`@graphql-gene/plugin-sequelize`](https://github.com/accesimpot/graphql-gene/tree/main/packages/plugin-sequelize)) that generate an executable schema from your models.

---

## How graphql-gene delivers (in practice)

Below are representative shapes from a Gene + Sequelize app: the **operations** clients send, and the **JSON** they get back. Setup (`generateSchema`, `geneConfig`, typing) is in the [main README](../../../README.md); conventions for `me`, mutations, and security are in [Schema design](./schema-design.md).

### Define models once; types follow

You export ORM models (and optional `defineType` / `defineEnum` helpers) from one module; Gene emits SDL and resolvers from that source. `geneConfig` controls which fields appear on each GraphQL type, **aliases** (e.g. `User` vs `AuthenticatedUser`), and **directives**—no parallel schema to maintain.

### Scoped types: `me`, aliases, and directives

The same Sequelize model can surface as different GraphQL types with different fields and auth. A public lookup stays narrow; `me` can load nested associations only when selected (lookahead).

```graphql
query PublicUser($id: ID!) {
  user(id: $id) {
    id
    username
  }
}

query MeForAccount {
  me {
    id
    email
    orders {
      id
      status
    }
  }
}
```

Invalid or missing auth on `me` resolves to **`null` on the field**, not a hollow object:

```json
{
  "data": {
    "me": null
  }
}
```

Define a directive once with **`defineDirective`** (for example `userAuthDirective({ roles: ['superAdmin'] })`) and reuse it in **`geneConfig`**: attach it on a **type** so every resolver that returns that type runs through the same middleware, or on a **field** when only that surface needs the rule. Role checks, session loading, and lookahead-friendly includes stay in one factory—not copy-pasted per resolver. See [Gene directives](./directives.md) and the [@userAuth example](../../../README.md#example-user-authentication-directive).

### Generated queries, filters, and association lists

Default Query resolvers and association fields get `where`, `order`, `skip`, and `limit` from your models—**including nested associations**. List associations return a **`count` + `items`** wrapper (dev-playground; [PLAN_V2 §2](../../../PLAN_V2.md#2-association-fields-from-flat-lists-to-a-standard-result-shape)).

```graphql
query OrderByStatus($status: String!) {
  order(where: { status: { eq: $status } }, order: [updatedAt_DESC]) {
    id
    status
    items {
      count
      items {
        id
        product {
          name
          color
          group {
            products(where: { color: { eq: "Blue Thunder" } }, limit: 5) {
              count
              items {
                id
                name
              }
            }
          }
        }
      }
    }
  }
}
```

```json
{
  "data": {
    "order": {
      "id": "117",
      "status": "paid",
      "items": {
        "count": 1,
        "items": [
          {
            "id": "976",
            "product": {
              "name": "StreetStyle - Slate Thunder",
              "color": "Slate Thunder",
              "group": {
                "products": {
                  "count": 2,
                  "items": [
                    { "id": "116", "name": "StreetStyle - Blue Thunder" },
                    { "id": "117", "name": "StreetStyle - Slate Thunder" }
                  ]
                }
              }
            }
          }
        ]
      }
    }
  }
}
```

Filters and pagination on the same association field (aliases optional):

```graphql
query OrderLists($id: String!) {
  order(id: $id) {
    filtered: items(where: { quantity: { eq: 3 } }) {
      count
      items {
        id
        quantity
      }
    }
    notesFacet: notes(limit: 1) {
      count
      items {
        id
        body
      }
    }
  }
}
```

```json
{
  "data": {
    "order": {
      "filtered": { "count": 1, "items": [{ "id": "976", "quantity": 3 }] },
      "notesFacet": {
        "count": 2,
        "items": [{ "id": "1", "body": "Called client" }]
      }
    }
  }
}
```

Polymorphic CMS-style blocks (union + fragments) are in [Polymorphic page blocks](./polymorphic-blocks.md)—with a full query/response example there.

### Mutations and TypeScript inference

Mutations colocated on models return typed payloads—`args` and return shapes are inferred from the GraphQL definition (`extendTypes`, `defineType`), so enums and fields fail at compile time if they drift.

```graphql
mutation RegisterProspect($email: String!, $locale: String) {
  registerProspect(email: $email, locale: $locale) {
    type
    text
  }
}
```

```json
{
  "data": {
    "registerProspect": {
      "type": "success",
      "text": null
    }
  }
}
```

### Extensible without forking

New ORMs or data sources plug in via the plugin API—see [Writing a plugin](./writing-a-plugin.md). The core stays server- and ORM-agnostic.

---

## Comparison with other approaches

The table below is opinionated and based on real production experience (especially Strapi and Contentful). It is meant to highlight **fit for a custom product API on your own database**, not to claim graphql-gene replaces every CMS or BaaS.

| Capability / concern                                | GraphQL Gene                                                                                                                                           | Strapi                                                                                                           | Contentful                                                                                        | Storyblok                                                                                       | Plain GraphQL server                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Self-hosted; you own the database**               | Yes — your Postgres (or other DB) and models                                                                                                           | Yes                                                                                                              | No — SaaS                                                                                         | No — SaaS                                                                                       | Yes                                   |
| **Schema generated from your app models**           | Yes — Sequelize (via plugin)                                                                                                                           | Yes — content-types                                                                                              | Their content model in their cloud                                                                | Their component model                                                                           | No — you write SDL/resolvers          |
| **End-to-end TypeScript inference from schema**     | Strong — `GeneTypesToTypescript`, inferred resolver types                                                                                              | Weak — easy to break types across admin UI, controllers, and plugins                                             | Client SDK types; API schema is external                                                          | SDK / generated types; not your DB schema                                                       | You choose (Pothos, codegen, etc.)    |
| **`where`-style filters on associations**           | Yes — nested filters on association fields                                                                                                             | Yes — similar ergonomics                                                                                         | Yes — nested `where` on collections and linked entries; filters follow the content types          | Filtered relations in GraphQL, content-centric                                                  | Manual in each resolver               |
| **Field-level auth declared on the graph**          | Yes — directives + aliases; declare on a **type** and Gene wraps every field that returns it (schema-wide middleware)                                  | Role policies; public routes must be **enabled explicitly**                                                      | Space/environment roles                                                                           | Space / token roles                                                                             | Manual per field                      |
| **Auth scoped via nested `me` / user associations** | First-class — directives + context + lookahead includes                                                                                                | Possible but not the default product model                                                                       | Not supported                                                                                     | Not supported                                                                                   | You implement entirely                |
| **GraphQL as the primary API**                      | Yes                                                                                                                                                    | GraphQL plugin exists; much ecosystem is REST/admin-centric                                                      | Yes — mature GraphQL API                                                                          | Yes — GraphQL (+ Management API)                                                                | Yes                                   |
| **Fetch only what the operation selects**           | Lookahead maps the selection set → Sequelize `include`s (load only the relations the operation asked for)                                              | Varies by version/config                                                                                         | CDN-oriented delivery: field selection trims the response. Not optimized for user-specific data   | CDN-oriented delivery: field selection trims the response. Not optimized for user-specific data | Manual `graphql-parse` / includes     |
| **Schema/content changes and production safety**    | DB migrations + TypeScript; GraphQL follows models                                                                                                     | Hand-written TS types for controllers/clients drifts from the generated schema—breaks at runtime, not build time | **Runtime** content model changes (renames) can break live clients without a strict sync workflow | Similar SaaS model versioning concerns                                                          | Full control; all discipline is yours |
| **Deploying new public endpoints**                  | Ship code — schema reflects repo (rollout can still be gated with **feature flags** in app code)                                                       | Often **DB-synced** “public route” flags; easy to miss in deploy pipelines                                       | N/A (hosted API)                                                                                  | N/A                                                                                             | Ship code                             |
| **Built-in admin / CMS UI**                         | **Not yet** — v2 adds **GraphQL `cms` backend** (CRUD + `*Meta`); you bring the UI ([PLAN_V2 §4](../../../PLAN_V2.md#4-admin-crud-cms-backend-module)) | Yes — admin panel                                                                                                | Yes — Contentful web app                                                                          | Yes — Storyblok UI                                                                              | No                                    |
| **Operational surface**                             | Library + your app (CMS module planned)                                                                                                                | Full CMS (cron, overrides, admin UI, many deps)                                                                  | Hosted platform + rate limits                                                                     | Hosted platform                                                                                 | Minimal dependencies                  |
| **Open source**                                     | Yes                                                                                                                                                    | Yes                                                                                                              | No                                                                                                | Partial / proprietary hosting                                                                   | N/A                                   |

### Strapi

We ran **Strapi in production for roughly four years**—it was our main “auto GraphQL from models” stack before graphql-gene. It delivers a real admin UI, filters on relations, and generated APIs, and we benefited from that for a long time. Over time, though, it behaved less like a library and more like a full framework: a large dependency tree, many extension points, and patterns that are easy to misuse (overwriting core files, cron defined inside Strapi or the Node process—so with multiple app instances the same schedule runs once per server, unlike a single job in GitHub Actions, weak typing across boundaries). What eventually drove us to replace it was operational: making a route publicly available is tied to configuration that lives in the database, not only in git. New routes often need a pre-deploy step or a careful post-deploy ritual so production matches what the code expects. We hit incidents when that step was missed. GraphQL Gene keeps “what is public and how it resolves” in version-controlled `geneConfig`, directives, and SDL—while still letting you toggle exposure in production via normal application feature flags when you need a gradual rollout.

### Contentful

Contentful’s GraphQL API is polished and pleasant to query—including **nested filters** on collections and linked content ([filtering guide](https://www.contentful.com/blog/mastering-graphql-filters/)). The blockers for us were **ownership and change management**: data and schema live in their platform, rate limits apply, and content model edits are effectively **runtime** changes—renaming a field or type can break production clients unless you maintain a rigorous, often complex, sync workflow between spaces and repositories. That mismatch is risky for a regulated product API backed by our own relational data.

### Storyblok

Storyblok fits the same broad category as Contentful: excellent **headless CMS** GraphQL for marketing and editorial content, not for replacing a transactional Sequelize domain model. Useful for pages and components; not a substitute when the graph must mirror tax cases, filings, and assignments in **your** database with custom authorization.

### Plain GraphQL server (Yoga, Apollo, etc.)

Maximum control and minimal magic—and maximum **boilerplate**: every Query field, filter input, include strategy, and auth check must be written and kept consistent with TypeScript types. Teams that outgrow hand-rolled resolvers often adopt codegen or schema builders (Pothos, TypeGraphQL); graphql-gene targets the case where the **ORM is already the source of truth** and you want generated filters and default resolvers with escape hatches (`extendTypes`, custom resolvers, plugins).

### Other tools worth a look

| Tool                                         | Relevance                                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hasura / PostGraphile**                    | Strong auto GraphQL over SQL with row-level permissions in their metadata layer—great for Postgres-centric greenfield APIs, different from colocating auth on Sequelize models and `me`-driven directives. |
| **Directus**                                 | Another self-hosted headless CMS with GraphQL; similar Strapi-like tradeoffs (platform vs library).                                                                                                        |
| **Prisma + Pothos / GraphQL Code Generator** | Code-first or schema-first TypeScript with manual or generated types—more assembly required, no Sequelize-native default resolvers and nested `where` generation out of the box.                           |

---

## Sneak peek: CMS backend (v2)

We already run a **production admin CRUD pattern** in a private Elio Tax app (`enableAdminCrud`, `Query.cms` / `Mutation.cms`, `*Meta` JSON for form builders). **Gene v2** will move **only that backend** into this repository so open-source users get the same GraphQL contract without our product-specific Vue UI.

| In scope in the library                                                                                                                                                         | Stays outside (your product)                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `cms` namespace: list, get-by-id, create/update/delete, `*Meta`                                                                                                                 | Vue/React admin shell, routing, design system |
| `registerCmsModel` (opt-in per model; no default root mutations for every type)                                                                                                 | Copy, branding, locale bundles                |
| Hierarchy-aware **discovery** from `me` and associations—not a flat model dump ([§4.6](../../../PLAN_V2.md#46-navigation--discovery-association-hierarchy-not-flat-model-list)) |                                               |
| Unified **`roles`** + auth directive factory with the public API ([§5](../../../PLAN_V2.md#5-authorization-roles-in-field-config--auth-directive-factory-on-generateschema))    |                                               |

**Not in scope:** a reference CMS **interface** shipped from this repo ([PLAN_V2 §1 non-goals](../../../PLAN_V2.md#1-goals)). Polymorphic page blocks already work in the dev playground today; v2 will push further toward **GraphQL unions** for heterogeneous block lists ([§2.8](../../../PLAN_V2.md#28-polymorphic-associations-and-graphql-unions-page-blocks)).

Typical flow for a CMS UI you build yourself (from [§5.8](../../../PLAN_V2.md#58-cms-discovery-flow-for-consumers-building-their-own-ui)): discovery/nav query → `*Meta` for the screen → data query with only the fields that role may see.

---

## Design principles we document elsewhere

These guides spell out conventions we use in production and in the dev playground:

| Topic                                                 | Guide                                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| `me`, aliases, mutations returning entities, security | [Schema design](./schema-design.md)                |
| Directive handlers and SDL printing                   | [Directives](./directives.md)                      |
| Polymorphic lists (CMS-style blocks)                  | [Polymorphic page blocks](./polymorphic-blocks.md) |
| Custom ORM or data backends                           | [Writing a plugin](./writing-a-plugin.md)          |
| v2 roadmap (CMS module, pagination, RBAC)             | [PLAN_V2.md](../../../PLAN_V2.md)                  |

---

## Summary

We built GraphQL Gene because no existing option combined **GraphQL-first** ergonomics, **Sequelize-aligned** schema generation, **deep TypeScript inference**, and **field-level authorization** tied to real user context—without a CMS platform's deploy surprises or a SaaS content model we do not own. It is the API layer Elio Tax runs in production today; we open-sourced it so teams with similar constraints can adopt the same patterns without reimplementing filters, lookahead, and directive middleware from scratch.

There is **no admin UI in the box yet**—by design. The next major step is exposing the **CMS GraphQL backend** documented in [PLAN_V2.md](../../../PLAN_V2.md) so you can ship your own interface on top. Until then, start with the [main README](../../../README.md) quick setup, then [Schema design](./schema-design.md) for how we structure `me`, types, and safe operations around sensitive data.
