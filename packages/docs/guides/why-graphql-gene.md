# Why GraphQL Gene?

GraphQL Gene is an open-source library built by [Elio Tax](https://www.elio-tax.com)'s engineering team—originally to power our own production API while filing sensitive Canadian tax returns online. We needed a **GraphQL-first**, **self-hosted** stack where the schema stays honest with our **Sequelize** models, **TypeScript** catches breaking changes before deploy, and **access control** can go far beyond a single `isAdmin` flag: gating fields by nested data loaded on `Query.me` (for example, only cases assigned to the current user).

This guide explains the problems we kept hitting elsewhere, how graphql-gene addresses them, and how it fits next to other tools you may already know.

---

## What we needed

| Requirement | Why it mattered at Elio Tax |
| ----------- | --------------------------- |
| **GraphQL-first API** | Clients (web, mobile, internal tools) share one graph; operations and variables are the contract, not ad hoc REST shapes. |
| **One source of truth** | ORM models should drive both the database and the GraphQL schema so renames and new fields do not drift silently. |
| **Deep TypeScript safety** | Resolver `args`, return values, and context should be inferred—not maintained in parallel with hand-written types. |
| **Association-aware filtering** | `where`-style filters on nested associations (Sequelize operators), not only top-level list fields. |
| **Field-level authorization** | Sensitive tax data requires rules on **fields and types**, including scopes derived from **`me`** and nested associations (e.g. assigned cases), not only global roles. |
| **Performance by default** | Load nested relations only when the client selects them (lookahead), without boilerplate in every resolver. |
| **Library, not a platform** | Fit existing Node services and deployment pipelines—no CMS admin DB that must be synced before a new route goes live. |

GraphQL Gene is the combination of those requirements: a small core plus plugins (today [`@graphql-gene/plugin-sequelize`](https://github.com/accesimpot/graphql-gene/tree/main/packages/plugin-sequelize)) that generate an executable schema from your models.

---

## How graphql-gene delivers (in practice)

### Define models once; types follow

You export ORM models and optional `defineType` / `defineEnum` helpers from a single `graphqlTypes` module, call `generateSchema`, and wire the result into any GraphQL server (Yoga, Apollo, etc.). The [main README](../../../README.md) walks through setup, `GeneSchema` / `GeneContext` augmentation with `GeneTypesToTypescript`, and inspecting `schemaString` / `schemaHtml` locally.

`geneConfig` on each model controls which columns appear on the GraphQL type, aliases (e.g. public `User` vs `AuthenticatedUser`), and directives—see [Schema design](./schema-design.md) for `me`, aliases, and cache-friendly mutations.

### TypeScript without the usual pain

Mutation resolvers in the README show the intended experience: `args` and return shapes are **inferred** from the GraphQL definition you colocate on the model (`extendTypes`, `defineType`), so invalid enum literals or wrong payload shapes fail at compile time. There is no second schema layer to keep in sync.

### Directives as first-class, typed middleware

Authorization, polymorphic rewriting, and other cross-cutting behavior use **`defineDirective`** factories attached in `geneConfig`. Handlers run around resolvers; at the type level, failed auth yields `null` on the field rather than a half-resolved object. See [Gene directives](./directives.md) and the [@userAuth example](../../../README.md#example-user-authentication-directive) in the README.

That design is what makes **granular access control** workable in production:

- **`@userAuth`** on `AuthenticatedUser` loads the session user once, with includes driven by the operation (`getQueryIncludeOf`).
- **Aliases** expose different field sets for the same Sequelize model (`User` vs `AuthenticatedUser` vs admin-only types).
- **Additional directives** can enforce rules that depend on nested data already on `context` from `me`—for example, allowing a field only when the parent case id is in the user's assigned cases—without hiding policy in unrelated top-level resolvers. [Schema design](./schema-design.md) documents keeping scope visible on types and fields instead of custom headers or implicit modes.

### GraphQL-first operations

Default Query resolvers, nested `where` / `order` / `skip` / `limit`, and association-level filters are generated from the graph. Clients declare what they need; the Sequelize plugin uses lookahead so you do not manually `include` every association. For advanced shapes (polymorphic CMS blocks, computed fields), see [Polymorphic page blocks](./polymorphic-blocks.md) and the `findOptions` pattern in [Schema design](./schema-design.md).

### Extensible without forking

New ORMs or data sources can plug in via the plugin API—see [Writing a plugin](./writing-a-plugin.md). The core stays server- and ORM-agnostic.

---

## Comparison with other approaches

The table below is opinionated and based on real production experience (especially Strapi and Contentful). It is meant to highlight **fit for a custom product API on your own database**, not to claim graphql-gene replaces every CMS or BaaS.

| Capability / concern | GraphQL Gene | Strapi | Contentful | Storyblok | Plain GraphQL server |
| -------------------- | ------------ | ------ | ---------- | --------- | ---------------------- |
| **Self-hosted; you own the database** | Yes — your Postgres (or other DB) and models | Yes | No — SaaS | No — SaaS | Yes |
| **Schema generated from your app models** | Yes — Sequelize (via plugin) | Yes — content-types | Their content model in their cloud | Their component model | No — you write SDL/resolvers |
| **End-to-end TypeScript inference from schema** | Strong — `GeneTypesToTypescript`, inferred resolver types | Weak — easy to break types across admin UI, controllers, and plugins | Client SDK types; API schema is external | SDK / generated types; not your DB schema | You choose (Pothos, codegen, etc.) |
| **`where`-style filters on associations** | Yes — nested filters on association fields | Yes — similar ergonomics | Geared to entry/collection queries, not your relational graph | Filtered relations in GraphQL, content-centric | Manual in each resolver |
| **Field-level auth declared on the graph** | Yes — directives + aliases on types/fields | Role policies; public routes must be **enabled explicitly** | Space/environment roles | Space / token roles | Manual per field |
| **Auth scoped via nested `me` / user associations** | First-class — directives + context + lookahead includes | Possible but not the default product model | Not applicable to your DB | Not applicable to your DB | You implement entirely |
| **GraphQL as the primary API** | Yes | GraphQL plugin exists; much ecosystem is REST/admin-centric | Yes — mature GraphQL API | Yes — GraphQL (+ Management API) | Yes |
| **Fetch only what the operation selects** | Built-in lookahead (Sequelize plugin) | Varies by version/config | CDN-oriented delivery | Field selection helps; not your ORM | Manual `graphql-parse` / includes |
| **Schema/content changes and production safety** | DB migrations + TypeScript; GraphQL follows models | Misconfiguration can expose routes; upgrades across many packages | **Runtime** content model changes (renames) can break live clients without a strict sync workflow | Similar SaaS model versioning concerns | Full control; all discipline is yours |
| **Deploying new public endpoints** | Ship code — schema reflects repo | Often **DB-synced** “public route” flags; easy to miss in deploy pipelines | N/A (hosted API) | N/A | Ship code |
| **Operational surface** | Library + your app | Full CMS (cron, overrides, admin UI, many deps) | Hosted platform + rate limits | Hosted platform | Minimal dependencies |
| **Open source** | Yes | Yes | No | Partial / proprietary hosting | N/A |

### Strapi

Strapi was the closest “auto GraphQL from models” alternative we evaluated. It delivers admin UI, filters on relations, and generated APIs—but as a **full framework** with a large dependency tree, many extension points, and patterns that are easy to misuse (overwriting core files, cron in the same repo, weak typing across boundaries). The pain that pushed us away was **operational**: making a route publicly available is tied to configuration that lives in the **database**, not only in git. New routes often need a pre-deploy step or a careful post-deploy ritual so production matches what the code expects. We hit incidents when that step was missed. GraphQL Gene keeps “what is public and how it resolves” in **version-controlled** `geneConfig`, directives, and SDL.

### Contentful

Contentful’s GraphQL API is polished and pleasant to query. The blockers for us were **ownership and change management**: data and schema live in their platform, rate limits apply, and content model edits are effectively **runtime** changes—renaming a field or type can break production clients unless you maintain a rigorous, often complex, sync workflow between spaces and repositories. That mismatch is risky for a regulated product API backed by our own relational data.

### Storyblok

Storyblok fits the same broad category as Contentful: excellent **headless CMS** GraphQL for marketing and editorial content, not for replacing a transactional Sequelize domain model. Useful for pages and components; not a substitute when the graph must mirror tax cases, filings, and assignments in **your** database with custom authorization.

### Plain GraphQL server (Yoga, Apollo, etc.)

Maximum control and minimal magic—and maximum **boilerplate**: every Query field, filter input, include strategy, and auth check must be written and kept consistent with TypeScript types. Teams that outgrow hand-rolled resolvers often adopt codegen or schema builders (Pothos, TypeGraphQL); graphql-gene targets the case where the **ORM is already the source of truth** and you want generated filters and default resolvers with escape hatches (`extendTypes`, custom resolvers, plugins).

### Other tools worth a look

| Tool | Relevance |
| ---- | --------- |
| **Hasura / PostGraphile** | Strong auto GraphQL over SQL with row-level permissions in their metadata layer—great for Postgres-centric greenfield APIs, different from colocating auth on Sequelize models and `me`-driven directives. |
| **Directus** | Another self-hosted headless CMS with GraphQL; similar Strapi-like tradeoffs (platform vs library). |
| **Prisma + Pothos / GraphQL Code Generator** | Code-first or schema-first TypeScript with manual or generated types—more assembly required, no Sequelize-native default resolvers and nested `where` generation out of the box. |

---

## Design principles we document elsewhere

These guides spell out conventions we use in production and in the dev playground:

| Topic | Guide |
| ----- | ----- |
| `me`, aliases, mutations returning entities, security | [Schema design](./schema-design.md) |
| Directive handlers and SDL printing | [Directives](./directives.md) |
| Polymorphic lists (CMS-style blocks) | [Polymorphic page blocks](./polymorphic-blocks.md) |
| Custom ORM or data backends | [Writing a plugin](./writing-a-plugin.md) |

---

## Summary

We built GraphQL Gene because no existing option combined **GraphQL-first** ergonomics, **Sequelize-aligned** schema generation, **deep TypeScript inference**, and **field-level authorization** tied to real user context—without a CMS platform's deploy surprises or a SaaS content model we do not own. It is the API layer Elio Tax runs in production; we open-sourced it so teams with similar constraints can adopt the same patterns without reimplementing filters, lookahead, and directive middleware from scratch.

If you are evaluating graphql-gene for your own product, start with the [main README](../../../README.md) quick setup, then read [Schema design](./schema-design.md) for how we structure `me`, types, and safe operations around sensitive data.
