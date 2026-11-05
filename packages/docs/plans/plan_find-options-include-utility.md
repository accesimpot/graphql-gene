# Plan: `ensureInclude` / `ensureIncludeBehind` (+ typing)

**Branch:** `feat/find-options-include-utility` (from `beta`)  
**Scope:** `@graphql-gene/plugin-sequelize` (+ small core typing tweaks if needed)  
**Depends on:** [graphql-lookahead#158](https://github.com/accesimpot/graphql-lookahead/pull/158) (`lookbehind` / `lookHigher`) merged and published on npm — bump `graphql-lookahead` in this repo once released.

---

## Problem

Declaring Sequelize include dependencies from `findOptions` is repetitive and easy to get wrong:

```ts
findOptions({ findOptions }) {
  findOptions.include = findOptions.include || []
  if (!findOptions.include.some(opt => opt.association === 'items')) {
    findOptions.include.push(markGeneHydrationInclude({ association: 'items' }))
  }
}
```

Two real use cases show up in practice:

1. **Sibling association (common)** — a computed field needs a sibling association on the same parent (e.g. `Order.itemTotalQuantity` → `items`), often as a **hydration** include so list wrappers are kept by `stripAssociationListWrapperIncludes`.
2. **Ancestor dependency (auth / nested path)** — a field depends on data that must be loaded on an **ancestor** model (e.g. `createOrganizationRole` depends on `adminAccount` under `AuthenticatedUser`), so `User.findOne({ ...getQueryIncludeOf(...) })` already has the right includes — without a bespoke `include` option on the auth directive.

`findOptions` already runs during `getQueryInclude` / `getQueryIncludeOf` (including under mutation operations). What’s missing is a small, typed API — including a **lookbehind** variant once graphql-lookahead ships it.

---

## Goals

| Goal                                                                    | Notes                                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ensureInclude` for same-frame / sibling (and nested path) associations | Idempotent; hydration on by default                                     |
| `ensureIncludeBehind` for ancestor frames via `lookbehind`              | Mirrors graphql-lookahead’s stateful `lookahead` README pattern         |
| Dot-separated association paths (`'adminAccount.roles'`)                | Same nesting direction for both helpers                                 |
| `findOptions` on `GeneDirectiveConfig`                                  | Same as field-level `findOptions` whenever that directive is on a field |
| Better TS for association names vs GraphQL / model type                 | 3rd arg type (or current type) drives allowed associations              |
| Bump `graphql-lookahead` after #158 release                             | No vendored lookbehind                                                  |

**Non-goals (this PR):** nested `__mutation` schema patterns; rewriting consumer auth directive APIs beyond adopting directive-level `findOptions`; auto-mirroring Query fields onto Mutation.

---

## Public API (target shape)

```ts
import { ensureInclude, ensureIncludeBehind } from '@graphql-gene/plugin-sequelize'

// Sibling (current findOptions frame — e.g. Order.itemTotalQuantity)
findOptions(details) {
  ensureInclude(details, 'items')
}

// Ancestor: walk behind until AuthenticatedUser, then ensure association(s) there
findOptions(details) {
  ensureIncludeBehind(details, 'adminAccount', 'AuthenticatedUser')
}

// Nested path from the attachment point (works for both helpers)
ensureInclude(details, 'adminAccount.roles')
ensureIncludeBehind(details, 'adminAccount.roles', 'AuthenticatedUser')
```

| Helper                | Walk                                                        | Attachment frame                                         |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| `ensureInclude`       | None (current `details.findOptions`)                        | Current lookahead include state                          |
| `ensureIncludeBehind` | `lookbehind` up `info.path` until the ancestor GraphQL type | That ancestor’s include frame in the shared include tree |

Both then apply the same **forward** nested-include logic for the path string (split on `.`, ensure each segment under `include`).

### Shared options (both helpers)

| Option               | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `hydrate?: boolean`  | Default **`true`**. Pass `false` to skip `markGeneHydrationInclude`                 |
| `required?: boolean` | Optional Sequelize INNER JOIN sugar on the **leaf** (or document per-segment later) |

### Dot-separated paths

- `'adminAccount'` → ensure one include row `{ association: 'adminAccount' }`
- `'adminAccount.roles'` → ensure `adminAccount`, then under it ensure `roles`
- Idempotent at each level (reuse existing row if `association` already present)
- Direction is always **deeper includes** from the attachment frame — whether that frame was reached by staying put (`ensureInclude`) or by walking parents (`ensureIncludeBehind`)

### Return value

Return the **leaf** include row so callers can still set `where` / `required` (see `OrderItem.geneConfig.findOptions`).

### Implementation location

`packages/plugin-sequelize/src/utils/ensureInclude.ts` (shared path logic + both exports), next to `markGeneHydrationInclude` / `getQueryInclude` on the package entrypoint.

---

## Use case 1 — `ensureInclude` (sibling)

```ts
findOptions(details) {
  ensureInclude(details, 'items')
}
```

Equivalent to today’s manual push + `markGeneHydrationInclude`.

### Tests / playground

- Unit: idempotent add; default hydrate marker; `{ hydrate: false }`; leaf return; `'a.b'` nesting
- Refactor `Order.itemTotalQuantity` (and similar if low-cost)
- Keep existing integration coverage for `itemTotalQuantity`

---

## Use case 2 — `ensureIncludeBehind` (ancestor via lookbehind)

### Intent (from app draft)

Drop directive-specific `include` options. Prefer `findOptions` so dependencies sit next to the field that needs them:

> `createOrganizationRole` depends on `adminAccount` → register that on the `AuthenticatedUser` include frame used when calling `User.findOne` with `getQueryIncludeOf`.

### Important constraint

These helpers mutate the **Sequelize include state** built during include collection — they do **not** rewrite the GraphQL document. “Add `me { adminAccount { id } }`” means: ensure the corresponding include frames exist on the find that loads that ancestor.

### Lookbehind + state (mirror graphql-lookahead README)

graphql-lookahead’s README shows threading a mutable `state` through `lookahead`’s `next` so each level pushes an include and returns the child state. **`ensureIncludeBehind` should do the inverse with `lookbehind`:** start from a known include-tree root (see below), walk **up** the resolve path, and at each ancestor reconcile / locate the matching include frame until the target GraphQL type is reached — then run the same path-ensure logic as `ensureInclude`.

Conceptual shape (utility internals, not call-site boilerplate):

```ts
function ensureIncludeBehind(details, associationPath, ancestorType) {
  const rootState = getActiveIncludeRoot(details.info) // see “Shared include state”

  lookbehind({
    info: details.info,
    state: rootState,

    next({ state, type, field /* … */ }) {
      // Map this ancestor step onto the include tree (find or create frame).
      // Return the include frame for this ancestor so the next (higher) step receives it —
      // same “return nextState” idea as the lookahead README, but walking parents.
      return resolveIncludeFrameForAncestor(state, { type, field })
    },

    until({ type, state }) {
      if (type !== ancestorType) return false

      ensureAssociationPath(state, associationPath, { hydrate: true })
      return true
    },
  })
}
```

Call site stays thin:

```ts
findOptions(details) {
  ensureIncludeBehind(details, 'adminAccount', 'AuthenticatedUser')
}
```

If the third argument is omitted, treat the “current” GraphQL type as the stop target (see typing — prefer documenting `details.type` vs `sourceType` carefully in implementation).

For auth, prefer declaring that handler on the **directive** (next section) so every `@userAuth`-protected field gets the include dependency without repeating `findOptions` on each mutation/query field.

### Shared include state (how `getQueryInclude` connects)

`lookbehind` alone only knows `info.path`. The Sequelize include **tree** lives in the object built by `getQueryInclude` / `getQueryIncludeOf`. `ensureIncludeBehind` needs that root (or the correct ancestor frame) while `findOptions` runs inside that walk.

**Preferred approach (plan assumption — confirm in implementation):**

1. While `getQueryInclude` / `getQueryIncludeOf` runs, register the root include state in an **async context** (e.g. `AsyncLocalStorage`) or an **`info`-keyed weak map** for the duration of the walk.
2. `ensureInclude` / `ensureIncludeBehind` read that active root (or current frame) instead of inventing a parallel tree.
3. Clear the registration when the walk finishes (including on error).

Alternatives if ALS/`info` keys prove awkward: pass the root on an augmented `details` bag from `handleUntilFindOptions` (e.g. `details.includeRoot`). Prefer not to require consumers to pass the root manually.

**Gap today:** `getQueryIncludeOf(info, 'AuthenticatedUser', { lookFromOperationRoot: true })` only runs `handleUntilFindOptions` **after** matching `AuthenticatedUser` in the selection set. A flat mutation that does not select `me` / `AuthenticatedUser` may never run the mutation field’s `findOptions` during that call. Companion work (phase 3): when collecting includes for auth, also visit / apply `findOptions` on operation fields so `ensureIncludeBehind` can run, **or** document that auth should call a dedicated collector that does.

### Approaches summary

| Approach                                        | Role                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **A. `ensureInclude`**                          | Sibling / current-frame paths (ship first)                                                       |
| **B. Root / auth walk**                         | Ensure `findOptions` on mutation (and other) fields actually runs when auth builds User includes |
| **C. `ensureIncludeBehind` + lookbehind state** | **Primary** API for ancestor dependencies (after graphql-lookahead#158)                          |

### Recommendation

1. Ship **`ensureInclude`** (+ dot paths, hydrate default) first.
2. Bump **graphql-lookahead**; ship **`ensureIncludeBehind`** with shared include-root registration and README-style `state` / `next` / `until`.
3. Add **`GeneDirectiveConfig.findOptions`** so auth (and similar) directives bundle include dependencies with the directive itself.
4. Adjust include collection for auth (**B**) so those handlers run when building User includes.
5. Do **not** require nested mutations under models.

---

## `findOptions` on `GeneDirectiveConfig`

Today `GeneDirectiveConfig` (`packages/core/src/defineConfig.ts`) only has `name`, `args`, and `handler`. Field/type config already supports `findOptions?: FindOptionsHandler<…>`, which `handleUntilFindOptions` invokes during `getQueryInclude*`.

**Add optional `findOptions` on `GeneDirectiveConfig`**, typed as a `FindOptionsHandler` (same contract as field/type `findOptions`). Semantics:

> Applying a directive that declares `findOptions` is equivalent to also attaching that `FindOptionsHandler` on every GraphQL field (or type) that uses the directive.

That is ideal for authentication: the directive already decides who the viewer is and typically loads `AuthenticatedUser` via `getQueryIncludeOf`. Bundling `ensureIncludeBehind(…, 'adminAccount', 'AuthenticatedUser')` (or similar) on the directive means every protected field contributes those include deps without duplicating field-level `findOptions`.

### Sketch

```ts
export const userAuthDirective = defineDirective<{ roles: string[] }>(args => ({
  name: 'userAuth',
  args,
  findOptions(details) {
    ensureIncludeBehind(details, 'adminAccount', 'AuthenticatedUser')
  },
  async handler({ context, info /* … */ }) {
    const includeOptions = getQueryIncludeOf(info, 'AuthenticatedUser', {
      lookFromOperationRoot: true,
    })
    // User.findOne({ …includeOptions })
  },
}))
```

### Runtime wiring

During `handleUntilFindOptions` (or a shared helper it calls), when visiting a field:

1. Resolve field-level `findOptions` as today (`getFieldConfig` / type `geneConfig`).
2. Also resolve directives attached to that field (and type-level directives if we decide they apply the same way — **default: field-level directives for v1**; type-level can follow if cheap).
3. Invoke each directive’s `findOptions` with the same `details` / `findOptions` state bag as a field handler would receive.

Order: document a stable order (e.g. type `findOptions` → field `findOptions` → directive `findOptions` in schema attachment order, or the reverse). Prefer **field then directives** or **directives then field** explicitly in tests so apps can reason about merges.

### Typing

- Extend both branches of `GeneDirectiveConfig` (`args` optional vs required) with `findOptions?: FindOptionsHandler<…>`.
- Improve generics over time with the same association-aware state as field handlers; v1 may start with the same looseness as `GeneTypeConfig.findOptions` then tighten in the typing phase.

### Docs

- Update `packages/docs/guides/directives.md` and the README auth example: prefer directive `findOptions` + `ensureIncludeBehind` over a custom `include` option on the directive factory.

---

## Typing improvements for `findOptions`

### Current gaps

| Location                                                   | Issue                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GeneTypeConfig.findOptions`                               | `FindOptionsHandler<object>` — no model awareness                                           |
| `GeneDirectiveConfig`                                      | No `findOptions` today — auth must invent parallel `include` options or repeat field hooks  |
| `ExtendedTypeField` → `FindOptionsHandlerByType<TypeName>` | Parent `TypeName` is good for siblings, but `include[].association` is still loose `string` |
| `GeneConfig.findOptions`                                   | `FindOptionsStateByModel<M, any>` — untyped `association`                                   |
| Plugin `findOptionsState`                                  | Flat `DefaultResolverIncludeOptions`; no association-key generic                            |

Resolver `source` already resolves via `AccurateTypeSource` → `ResolveGqlSource<…>` (e.g. `Order.itemTotalQuantity`). Association arguments on the new helpers should feel similarly precise.

### Suggested typing approach

1. **Association keys from the Sequelize model** (reuse / share `AssociationKeys`-style logic from `toGqlSource.ts`).

2. **Path strings:** support a single segment or dot-separated path with typed first segment (and best-effort deeper segments). Pragmatic v1: type the full path as a template-literal union of association names and `Assoc.Nested` where nested targets are known; if that explodes, type the **first** segment strictly and allow `string` for the rest with a documented escape hatch.

3. **`ensureInclude(details, path)`** — `path` associations typed against the **current frame’s model**:

   - Prefer the owner of the current include frame (`sourceType` in `UntilHandlerDetails` / parent GraphQL type), not the field’s return type (`details.type` is often a scalar for computed fields).
   - Optional overload: `ensureInclude(details, path, typeName)` if we want the same 3-arg form as behind for rare cases.

4. **`ensureIncludeBehind(details, path, ancestorType)`** — `path` associations typed against **`ancestorType`** via `GraphqlTypes` / plugin model mapping (e.g. `'AuthenticatedUser'` → that model’s association keys). If `ancestorType` is omitted, fall back to typing against `details.type` (document when that matches the ancestor you intend).

5. **`GeneTypeConfig.findOptions`:** stop using bare `object`; align with `FindOptionsHandlerByType` / `FindOptionsStateByModel` as for resolvers.

### Typing risks

- Sequelize allows association **objects** as well as names — keep an escape hatch.
- Deep template-literal path unions can hurt compile times — start strict on first segment + tested nested strings.
- Avoid breaking existing `findOptions` handlers (assignability).

### Verification

- `pnpm types:check` in core, plugin-sequelize, and project-playground
- Expect-type tests: `ensureInclude(details, 'items')` OK on Order; invalid association errors; `ensureIncludeBehind(details, 'adminAccount', 'AuthenticatedUser')` OK; bad association on that type errors
- Confirm `itemTotalQuantity` still infers parent Order context like resolver `source`

---

## Dependency: graphql-lookahead release

1. Merge/publish [PR #158](https://github.com/accesimpot/graphql-lookahead/pull/158) (`lookbehind`, `lookHigher`, `PrevHandlerDetails`, …).
2. Bump `graphql-lookahead` in `@graphql-gene/plugin-sequelize`.
3. Call `lookbehind` only inside `ensureIncludeBehind` (no re-export required unless useful).

If #158 is not on npm yet: land **`ensureInclude` + typing + shared-state hooks for getQueryInclude\*** first; add **`ensureIncludeBehind`** in a fast follow-up on the same branch or a stacked PR.

---

## Implementation phases

### Phase 0 — plan / branch (this doc)

- [x] Branch `feat/find-options-include-utility` from `beta`
- [x] This plan file (`packages/docs/plans/plan_find-options-include-utility.md`)

### Phase 1 — `ensureInclude`

- [ ] Shared association-path ensure (incl. dot paths) + unit tests
- [ ] Export `ensureInclude`
- [ ] Migrate playground `Order.itemTotalQuantity`
- [ ] Docs snippet (`schema-design.md` / plugin README)

### Phase 2 — typing + directive `findOptions`

- [ ] Shared association-key type
- [ ] Typed `findOptionsState` / `GeneTypeConfig.findOptions`
- [ ] Add `findOptions?: FindOptionsHandler<…>` to `GeneDirectiveConfig` (core)
- [ ] Invoke directive `findOptions` from include collection (`handleUntilFindOptions` / equivalent)
- [ ] Typed overloads for `ensureInclude` / (later) `ensureIncludeBehind`
- [ ] Type + unit tests (field vs directive handler equivalence)

### Phase 3 — shared include root + auth walk

- [ ] Register active include root during `getQueryInclude` / `getQueryIncludeOf`
- [ ] Ensure mutation (and other) field / directive `findOptions` can run when auth collects includes without selecting `me`
- [ ] Document migration off directive factory `include` options → directive `findOptions` + `ensureIncludeBehind`

### Phase 4 — `ensureIncludeBehind` (after npm release)

- [ ] Bump `graphql-lookahead`
- [ ] Implement `ensureIncludeBehind` with lookbehind `state` / `next` / `until`
- [ ] Tests: nested `me → … → field` paths, list indices, dot paths from ancestor
- [ ] Docs: `ensureInclude` vs `ensureIncludeBehind`; auth directive example with `findOptions`

---

## Decisions

1. **Explicit ancestor type** — `ensureIncludeBehind(details, path, 'AuthenticatedUser')` (or omit 3rd arg and use current type). No silent “always User” convention; matches consumer-defined auth types.
2. **Hydration default `true`** — both helpers auto-apply `markGeneHydrationInclude`; opt out with `{ hydrate: false }`.
3. **Two names** — `ensureInclude` (current frame) and `ensureIncludeBehind` (lookbehind); the “Behind” suffix reflects graphql-lookahead’s `lookbehind`.
4. **Dot paths** — supported on both; nesting is always forward from the attachment frame.
5. **Core vs plugin** — runtime helpers and association-key typing live in `@graphql-gene/plugin-sequelize`; core owns `GeneDirectiveConfig.findOptions` and `FindOptionsHandler` / `GeneTypeConfig` generics.
6. **State** — reuse the include tree from `getQueryInclude*` via a short-lived active root (ALS / `info` map / details augmentation), not a second ad hoc tree at the call site.
7. **Directive `findOptions`** — equivalent to attaching the same handler on every field that uses the directive; primary place for auth include deps (e.g. `adminAccount` on `AuthenticatedUser`).

---

## Success criteria

- Playground sibling case is one `ensureInclude` call with a typed association (or path).
- App can declare ancestor deps with `ensureIncludeBehind` (on a field or, preferably, on the auth **directive**’s `findOptions`) without a custom directive `include` list.
- Dot paths work the same for both helpers.
- `GeneDirectiveConfig` supports `findOptions` and include collection invokes it like field-level handlers.
- `findOptions` / helper args are parent- or target-type aware, closer to resolver `source` typing.
- Depends only on a released `graphql-lookahead` that includes lookbehind — no copied lookbehind implementation in gene.
