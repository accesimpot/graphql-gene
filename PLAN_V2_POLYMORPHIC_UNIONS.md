# Plan: Polymorphic blocks as GraphQL unions (Gene v2)

This document scopes the work described in [`PLAN_V2.md`](PLAN_V2.md) **§2.8** and goal **row 24** (*polymorphic blocks as GraphQL unions*). It is the integration plan for **hub-row + union** CMS page blocks, split so the repo can ship a **first `2.0.0` beta** with a reviewable merge sequence.

**Parent references (do not duplicate here):** rationale, ORM shape, illustrative `Page` / `PageBlock` models, `@UnionContent` sketch, library split (`graphql-gene` vs `graphql-lookahead` / `plugin-sequelize`), and limits — see [`PLAN_V2.md`](PLAN_V2.md) §2.8 and §6 (polymorphic unions bullet).

### Code examples: intended models & registration

For **copy-paste-shaped TypeScript** showing how the **relational hub + concrete blocks** and **`@UnionContent`** registration should look, use the parent plan’s §2.8 **Illustrative models** — the `Page` model with `@HasMany` `blocks`, and the `PageBlock` hub with `@UnionContent({ field: 'content', types: () => […] })`, plus the surrounding prose on union fields and `resolveType`.

- **[`PLAN_V2.md` §2.8 — *Polymorphic associations and GraphQL unions (page blocks)*](PLAN_V2.md#28-polymorphic-associations-and-graphql-unions-page-blocks)** (starts at [line 192](PLAN_V2.md#L192) in the repo file)

That same section also states the **GraphQL goal** (one list of a union, `__typename`, inline fragments) and links the [colocated-fragments gist](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea) for client-side shape.

---

## 1. Objective

Deliver a **single GraphQL list of a `union` type** for ordered page blocks so clients fetch **all concrete block shapes in one round trip** using **`__typename`** and **inline fragments**, while the Sequelize layer uses a **hub model** (`PageBlock`-style) with **edges to concrete tables**. **graphql-gene** emits the union and resolver wiring; **graphql-lookahead** (via `plugin-sequelize`) maps each inline fragment to the **correct `include`**, avoiding blind joins to every block table.

**Success criteria for the first beta**

- A documented registration path (see §3) produces valid SDL: `union`, member object types, hub list field, and **`resolveType`** behavior aligned with the chosen discriminator strategy.
- Reading a page’s blocks with **only some** fragment members does not require loading **all** concrete associations when the Sequelize plugin is used with lookahead.
- Behavior when **no** or **multiple** discriminators are set is defined (validation or explicit error), per [`PLAN_V2.md`](PLAN_V2.md) §6.
- **Dev playground** (or equivalent fixture) exercises the pattern end-to-end for integrators.

---

## 2. Workstreams (by package)

| Workstream | Package(s) | Responsibility |
| ---------- | ---------- | ---------------- |
| **A. Schema & types** | `graphql-gene` (core) | Register hub + member models; emit `union` and hub field; **`resolveType`**; keep naming and `geneConfig` consistent with the rest of v2 (auth/CMS metadata hooks as they exist for other models). |
| **B. Selection → ORM includes** | `graphql-lookahead`, `plugin-sequelize` | Stable map **GraphQL object type name → Sequelize association alias** on the hub; extend **`getQueryInclude`** (or equivalent) so inline fragments add **only** the needed `include`s. |
| **C. Declarative hub setup (optional path)** | Core +/or Sequelize plugin | Working name **`@UnionContent`**: single hub-level declaration listing concrete models and union field name (`content`); inject **`belongsTo`** + FK columns **or** document manual wiring — see §4. |
| **D. Examples & docs** | `dev-playground`, `packages/docs` (when present) | Minimal **Page → PageBlock → union `content`** demo; Markdown: registration, discriminator rules, fragment query examples, and lookahead expectations. |

---

## 3. Registration API (design target)

Two equivalent surfaces (mirror [`PLAN_V2.md`](PLAN_V2.md) §2.8):

1. **Decorator-first (`@UnionContent`)** — ergonomics for **sequelize-typescript**; lazy `types: () => […]` to avoid circular imports.
2. **`geneConfig`-only** — same semantics for codebases without decorators.

Both must record:

- Union **GraphQL name** and hub **field name** (default `content` on the hub type).
- **Ordered list of member models** and a **stable map** `GraphQL type name → hub association property** for lookahead.

---

## 4. Discriminator and validation

Resolve **open decisions** from [`PLAN_V2.md`](PLAN_V2.md) §8 for this feature **before** calling the beta “done”:

- **Discriminator:** explicit **`type` enum/string column** vs **exactly one non-null optional FK** among members — pick one **default** for the public docs; support the other if needed behind a flag.
- **Invalid hub rows:** none set or multiple set — **fail fast** with a clear error or documented sentinel; align with §6 “stay in sync” note.
- **Naming collisions:** hub model class name vs generated **union** name — define deterministic naming (`generateGraphqlTypeName` style) and escape hatches.

---

## 5. Relationship to other v2 themes

- **List shape (§2):** Blocks are typically a **plain list of union elements** unless a product opts into a connection later ([`PLAN_V2.md`](PLAN_V2.md) §2.8 *Limits and future work*). Do not block this project on Relay-style block connections.
- **Admin CRUD (§4):** If CMS mutations touch block creation, decide whether **one tagged input** vs **per-member inputs** is in scope for the **first beta** ([`PLAN_V2.md`](PLAN_V2.md) §8). Minimum beta can be **read path + documented mutation story** if writes are still evolving.
- **Authorization (§5):** Union members should honor the same **`roles` / directives** patterns as other generated types when those land; if RBAC lands later, this plan only needs **extension points** (e.g. config on union members).

---

## 6. Multiple PRs: yes — recommended split

Splitting keeps schema generation reviewable, avoids a monolithic Sequelize diff, and lets **`2.0.0-beta.1`** tag a coherent “union read path + lookahead” slice.

### PR 1 — Core: union SDL, `resolveType`, hub field resolvers

**Scope**

- Registration types / config for hub + union members (may ship **`geneConfig`-only** first if faster).
- Generated **`union`** definition, member object types unchanged from normal model generation.
- Hub model: GraphQL field for the polymorphic payload (e.g. `content: …Union`) with resolver that delegates to the correct association or loaded row.
- **`resolveType`** implementation matching the chosen discriminator (§4).
- Unit tests focused on **schema shape** and **resolveType** / discriminator edge cases.

**Explicitly out of PR 1**

- Optimized per-fragment `include`s (PR 2).
- Optional `@UnionContent` FK injection (PR 3), unless you intentionally merge 1+3 for a single vertical slice — see §7.

**Risk if merged alone:** Resolvers may **over-include** concrete tables until PR 2 lands — acceptable behind a beta flag or documented temporary cost.

---

### PR 2 — `graphql-lookahead` + `plugin-sequelize`: fragment-aware `include`s

**Scope**

- Consume the **type → association alias** map from PR 1’s registration.
- When the selection set includes `... on HeroBlock { … }`, add **only** the **`HeroBlock`** include path for that hub row; same for other members.
- Integration tests: query with **one** vs **multiple** fragments vs **full** fragment set; assert generated Sequelize options (or SQL snapshot strategy the repo already uses).
- Documentation note: unused block tables are not joined when fragments omit them.

**Depends on:** PR 1 (types and map must exist).

---

### PR 3 (optional separate PR) — `@UnionContent` / FK & association injection

**Scope**

- Implement the decorator (or generator hook) that injects **optional FKs per concrete type** and **`belongsTo`** associations on the hub model per [`PLAN_V2.md`](PLAN_V2.md) §2.8.
- Migration guide: from **manual FKs** to **decorator-managed** setup.
- If this is large, ship **beta** with PR 1–2 + manual hub definition, and add PR 3 in **`2.0.0-beta.2`**.

**Depends on:** PR 1 semantics locked (same member list and naming as `geneConfig` path).

---

### PR 4 — Dev playground + fixtures

**Scope**

- Minimal **Page**, **PageBlock**, 2–3 **concrete block** models, seed data.
- Example GraphQL document showing **inline fragments** (link or mirror the [gist](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea) pattern for Vue/Relay-style clients).
- Optional: simple assertion in CI that the playground schema **builds** and a **read** query succeeds.

**Can ship:** After PR 1; **fully representative** after PR 2 (demonstrate lookahead benefit in logs or test).

---

### PR 5 — Documentation & changelog entry

**Scope**

- Section in docs package (or sibling to [`PLAN_V2.md`](PLAN_V2.md)) dedicated to **polymorphic unions**.
- **`CHANGELOG`** / release notes for `2.0.0-beta.x`: breaking vs additive, registration examples, known limitations (`@defer` out of scope, etc.).

**Timing:** Same release as the **first beta** that claims union support, or immediately after PR 4 so the docs link to runnable code.

---

## 7. Alternative: fewer PRs

| Strategy | When to use |
| -------- | ----------- |
| **PR 1 + 2 only** (4 files worth: core + lookahead + plugin + tests) | Small team wants **one** “feature complete” merge before beta. Combine PR 3 into PR 1 if `@UnionContent` is thin. |
| **PR 1–4 as listed** | Default: clearer review, parallelizable **docs/playground** after core API stabilizes. |
| **PR 3 before 2** | **Not recommended** — lookahead needs stable type ↔ alias map from core; injection is orthogonal. |

---

## 8. First `2.0.0` beta scope (release targeting)

**Minimum for tagging `2.0.0-beta.1` with union support**

1. PR **1** merged: unions + `resolveType` + hub field **read** path usable by consumers.
2. PR **2** merged: lookahead **`include`** mapping **shipped** so the beta does not encourage N+1 or full-table joins for every block type.
3. PR **4** merged or in progress: at least **one** runnable example in-repo; if docs lag, README pointer is enough for an **early** beta.

**Nice for `beta.1`, acceptable for `beta.2`**

- PR **3** (`@UnionContent` / auto-FK).
- CMS **mutation** story for creating/updating blocks (if admin CRUD module lands in the same timeframe).
- Full **packages/docs** narrative (§11 of main plan).

**Versioning**

- Follow semver: **`2.0.0-beta.1`**, **`2.0.0-beta.2`**, … until stable **`2.0.0`**.
- Call out in release notes if **discriminator** or **registration API** changes between betas.

---

## 9. Checklist before declaring beta “ready”

- [ ] Discriminator strategy chosen and documented (§4).
- [ ] Invalid hub row behavior defined and tested.
- [ ] `resolveType` covered by tests (including `__typename` in responses).
- [ ] Lookahead tests prove **fragment-dependent** includes.
- [ ] Naming rules for union vs hub type documented; escape hatch if collision.
- [ ] Playground or fixture query runs in CI or local `pnpm` script.
- [ ] Changelog and “known gaps” (mutations, `@UnionContent`, connections) listed for integrators.

---

## 10. References

- [`PLAN_V2.md`](PLAN_V2.md) — §2.6 (work items); **§2.8 ([`PLAN_V2.md:192`](PLAN_V2.md#L192))** — narrative, **Illustrative models** code (`Page`, `PageBlock`, `@UnionContent`), library split, limits; §6 (cross-cutting); §7 phase 1–2; §8 open decisions.
- [Colocated fragments / Vue gist](https://gist.github.com/pmrotule/45bd636e2f2f1abdf2cd4a2d2dc3d7ea) — client-side motivation.
- Repo anchors: `packages/plugin-sequelize/` (`getQueryInclude`), `packages/core/src/schema.ts` (`generateSchema`), [`PLAN_V2.md`](PLAN_V2.md) §9.
