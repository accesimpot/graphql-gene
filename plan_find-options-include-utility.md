# Plan: `findOptions` include utility (+ typing)

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
2. **Ancestor / auth-path dependency (app)** — a mutation (or other field) depends on data that must be loaded when an **ancestor** model is fetched (e.g. `createOrganizationRole` depends on `me.adminAccount`), so that `User.findOne({ ...getQueryIncludeOf(...) })` in an auth directive already has the right includes — without a bespoke `include` option on the directive.

`findOptions` already runs during `getQueryInclude` / `getQueryIncludeOf` (including under mutation operations). What’s missing is a small, typed API for registering those includes — and, for (2), a clear story that uses **lookbehind** once graphql-lookahead ships it.

---

## Goals

| Goal | Notes |
|------|--------|
| Utility to ensure an association is present on `findOptions.include` | Idempotent; optional hydration marking |
| Cover sibling + ancestor/auth dependency patterns | Document limits vs GraphQL selection injection |
| Better TS for `findOptions` / include association names | Align with `ResolveGqlSource` / association-key inference |
| Bump `graphql-lookahead` after #158 release | No vendoring of lookbehind |

**Non-goals (this PR):** nested `__mutation` schema patterns; changing auth directive APIs in consumer apps; auto-mirroring Query fields onto Mutation.

---

## Use case 1 — sibling association (playground `itemTotalQuantity`)

### Desired API (sketch)

```ts
findOptions(details) {
  ensureInclude(details, 'items', { hydrate: true })
}
```

Equivalent to today’s manual push + `markGeneHydrationInclude`, but:

- Initializes `include` if missing
- Skips if the association is already present
- Returns the existing or newly created include row so callers can still set `where` / `required` (see `OrderItem.geneConfig.findOptions`)

### Options to support (v1)

| Option | Purpose |
|--------|---------|
| `hydrate?: boolean` | Wrap with `markGeneHydrationInclude` (list-wrapper sibling reads) |
| `required?: boolean` | Sequelize INNER JOIN (optional sugar) |
| Nested path? | Defer deep trees to use case 2 / follow-up unless cheap |

### Suggested implementation location

`packages/plugin-sequelize/src/utils/ensureInclude.ts` (name TBD: `ensureInclude` / `ensureFindOptionsInclude`), exported from the package entrypoint next to `markGeneHydrationInclude` / `getQueryInclude`.

Accept either:

- `(details, association, options?)` where `details` has `{ findOptions }` (current hook shape), or
- `(findOptions, association, options?)` for low-level use

Prefer the **details** form as primary so typing can key off parent model / `sourceType` later.

### Tests / playground

- Unit: idempotent add; hydrate marker; return existing row; nested `where` mutation on returned row
- Refactor `Order.itemTotalQuantity` and optionally `OrderItem` / `ProductGroup` examples to the helper
- Keep existing integration coverage for `itemTotalQuantity`

---

## Use case 2 — ancestor / auth include dependency (`me.adminAccount`)

### Intent (from app draft)

Drop directive-specific `include` options. Prefer `findOptions` so dependencies are declared next to the field that needs them. Example narrative:

> `createOrganizationRole` depends on `adminAccount` → register that dependency so `User.findOne` + `getQueryIncludeOf` loads `adminAccount`.

### Important constraint

`findOptions` mutates the **Sequelize include state** built by lookahead — it does **not** rewrite the GraphQL document. Phrases like “add `me { adminAccount { id } }`” mean: ensure the corresponding **include frames** exist on the find that will load that ancestor model, not that the client selection set changes.

### Approaches (evaluate in this order)

#### A. Same-frame ensure (enough when includes target the model being loaded)

If auth always does `User.findOne({ ...getQueryIncludeOf(...) })` and the include bag is already the **User** root include state when the mutation field’s `findOptions` runs, then:

```ts
// on Mutation.createOrganizationRole
findOptions(details) {
  ensureInclude(details, 'adminAccount') // association of User / AuthenticatedUser
}
```

**Gap today:** `getQueryIncludeOf(info, 'AuthenticatedUser', { lookFromOperationRoot: true })` only runs `handleUntilFindOptions` **after** matching `AuthenticatedUser` in the selection set. A flat mutation that does not select `me` / `AuthenticatedUser` never visits that type, so the mutation field’s `findOptions` may **never run** during that call.

So A alone needs a small companion change (B or C).

#### B. Root walk that always applies field `findOptions` (recommended companion)

Extend `getQueryIncludeOf` / a new helper (e.g. `getQueryIncludeOf` option or `collectFindOptionDependencies(info)`) so that when looking from the operation root, **every visited field’s** `findOptions` runs (via existing `handleUntilFindOptions`), not only fields under the matched target type.

Then a mutation field can push User-level associations onto the root include state before/while auth loads the user.

**Pros:** Fits current mental model; no lookbehind required for the flat-mutation case.  
**Cons:** Root include state must be interpreted as associations of the **model being loaded** (User); document that clearly. Fields that push wrong association names fail at runtime (Sequelize).

#### C. Lookbehind-assisted ancestor targeting (uses graphql-lookahead#158)

Once `lookbehind` / `lookHigher` are available:

```ts
findOptions(details) {
  // Walk info.path upward until sourceType/field matches me / AuthenticatedUser owner
  lookbehind({
    info: details.info,
    until({ field, sourceType }) {
      return field === 'me' || sourceType === 'AuthenticatedUser'
    },
  })
  // Then ensureInclude on the include frame that corresponds to that ancestor
}
```

**When this shines:** the dependent field is **nested under** `me` / `adminAccount` in the operation (query or mutation entry that still goes through `me`), and the current `findOptions` state is a **nested** frame — lookbehind finds the ancestor, and the utility merges into that ancestor’s include object (not only `details.findOptions`).

**API sketch:**

```ts
ensureAncestorInclude(details, {
  until: ({ field, type, sourceType }) => field === 'me' || type === 'AuthenticatedUser',
  association: 'adminAccount',
  hydrate?: boolean,
})
```

Implementation notes:

- `lookbehind` starts at `info.path.prev` (parents only). During **lookahead**-driven `findOptions`, `info` is still the active resolver/directive `GraphQLResolveInfo` — path is valid for the field currently being resolved / directed, which may differ from the lookahead cursor. **Validate this carefully** in tests: hooks run inside `getQueryInclude*` while `info` often belongs to the outer resolver (e.g. auth on the mutation field). That mismatch is acceptable for “mutation field declares User includes” (path is the mutation field; lookbehind reaches operation root). It is **not** a substitute for knowing which include **state object** is the User frame inside a deep lookahead tree.
- For deep trees, prefer threading / finding the include node by association chain over relying on path alone: e.g. `ensureIncludePath(details.findOptions, ['adminAccount', 'roles'])`.

#### D. Hybrid (likely landing shape)

1. Ship **`ensureInclude`** for siblings (use case 1) immediately.  
2. Bump **graphql-lookahead** and add **`ensureAncestorInclude`** (or `ensureInclude` + `ancestor: …`) for nested cases.  
3. Adjust **`getQueryIncludeOf`** (or add `includeFindOptionDependencies: true`) so flat mutation fields’ `findOptions` participate when auth loads User without selecting `me`.  
4. Document the auth pattern: directive calls the updated helper; fields declare dependencies via `findOptions`; no directive `include` option.

### Recommendation

- Implement **A + B** for the app’s flat-mutation auth story (primary).  
- Add **C** as a typed helper once lookbehind is on npm, aimed at nested-under-`me` operations and future patterns — but do not require nesting mutations under models (already rejected).  
- Prefer **include path helpers** (`['adminAccount']`) over pretending to inject GraphQL selections.

---

## Typing improvements for `findOptions`

### Current gaps

| Location | Issue |
|----------|--------|
| `GeneTypeConfig.findOptions` | `FindOptionsHandler<object>` — no model awareness |
| `ExtendedTypeField` → `FindOptionsHandlerByType<TypeName>` | Parent `TypeName` is used (good for siblings on `Order`), but `findOptions.include[].association` is still loose Sequelize `string` |
| `GeneConfig.findOptions` | `FindOptionsStateByModel<M, any>` — state is `DefaultResolverIncludeOptions` with untyped `association` |
| Plugin `findOptionsState` | Single flat `DefaultResolverIncludeOptions`; no association-key generic |

Resolver `source` already resolves via `AccurateTypeSource` → `ResolveGqlSource<ModelClass, TypeName>` (as in the `Order.itemTotalQuantity` hover). `findOptions` should feel similarly parent-aware.

### Suggested typing approach

1. **Association keys from the Sequelize model** (reuse `AssociationKeys`-style logic from `toGqlSource.ts`, ideally shared):

   ```ts
   type SequelizeAssociationName<M> = /* keyof associations on model class M */
   ```

2. **Tighten include options** in the plugin:

   ```ts
   type TypedIncludeOptions<M> = Omit<DefaultResolverIncludeOptions, 'association' | 'include'> & {
     association?: SequelizeAssociationName<M> & string
     include?: TypedIncludeOptions<any>[] // or recursive via association target if feasible
   }
   ```

   Wire `GenePluginSettings.sequelize.findOptionsState` to `TypedIncludeOptions<PrototypeOrNot<M>>` (or a compatible structural type so existing handlers still assign).

3. **`ensureInclude` generics:**

   ```ts
   function ensureInclude<M>(
     details: { findOptions: TypedIncludeOptions<M> },
     association: SequelizeAssociationName<M> & string,
     options?: EnsureIncludeOptions
   ): TypedIncludeOptions</* target model if known */ any>
   ```

4. **`GeneTypeConfig.findOptions`:** stop using bare `object`. For `extendTypes`, keep/fix `FindOptionsHandlerByType<TypeName>` so the parent GraphQL type drives state (same parent as `source`). For `defineGraphqlGeneConfig(Model, { findOptions })`, state should be `FindOptionsStateByModel<M>`.

5. **Ancestor helper typing:** `association` typed against the **ancestor** model when `until` is a string type name (`'AuthenticatedUser'`) that maps through `GraphqlTypes`; if `until` is a custom predicate, fall back to `string` (document the escape hatch).

### Typing risks

- Sequelize `IncludeOptions.association` also allows association **objects**; keep an escape hatch (`string` or overload) so advanced callers aren’t blocked.
- Recursive typed includes by association target are valuable but can explode compile time — start with **association name literals** on the current frame only.
- Avoid breaking existing `findOptions` handlers: prefer assignability from old shapes to new (widening in the plugin settings carefully).

### Verification

- `pnpm types:check` in core, plugin-sequelize, and project-playground  
- Hover/`Expect` tests: `ensureInclude(details, 'items')` OK on Order; `'notAnAssoc'` errors  
- Confirm `itemTotalQuantity` `findOptions` callback still infers parent Order state like resolver `source`

---

## Dependency: graphql-lookahead release

1. Merge/publish [PR #158](https://github.com/accesimpot/graphql-lookahead/pull/158) (`lookbehind`, `lookHigher`, `PrevHandlerDetails`, …).  
2. In `@graphql-gene/plugin-sequelize`, bump `graphql-lookahead` peer/dependency to that version.  
3. Re-export nothing from gene unless useful — call `lookbehind` only inside the new utility (or advanced docs examples).

If #158 is not on npm yet when implementation starts: land **use case 1 + typing + getQueryIncludeOf findOptions walk (B)** first; add lookbehind-based ancestor helper in a fast follow-up on the same branch or a stacked PR.

---

## Implementation phases

### Phase 0 — plan / branch (this doc)

- [x] Branch `feat/find-options-include-utility` from `beta`  
- [x] This plan file  

### Phase 1 — `ensureInclude` (sibling)

- [ ] Implement helper + unit tests  
- [ ] Export from plugin public API  
- [ ] Migrate playground `Order.itemTotalQuantity` (and similar if low-cost)  
- [ ] Docs snippet in plugin README or `packages/docs/guides/schema-design.md` (`findOptions` section)

### Phase 2 — typing

- [ ] Shared association-key type (extract from `toGqlSource` if needed)  
- [ ] Typed `findOptionsState` / `GeneTypeConfig.findOptions`  
- [ ] Type tests (`Equal` / assignability)  

### Phase 3 — auth / root dependency walk

- [ ] Teach `getQueryIncludeOf` (or sibling API) to apply field `findOptions` when walking from operation root even before the target type match — **or** document a dedicated `collectIncludeDependencies(info)` used by auth  
- [ ] Playground or unit fixture: mutation field `findOptions` adds association; `getQueryIncludeOf` / User load sees it  
- [ ] Document migration off directive `include` options (consumer-facing note)

### Phase 4 — lookbehind ancestor helper (after npm release)

- [ ] Bump `graphql-lookahead`  
- [ ] `ensureAncestorInclude` / path-based ensure  
- [ ] Tests with nested `me → … → field` paths and list indices  
- [ ] Document when to use sibling vs ancestor helper  

---

## Open questions

1. **Should root-level mutation `findOptions` push onto a User include bag by convention**, or require an explicit `target: 'AuthenticatedUser'` argument to the helper so the include isn’t ambiguous when multiple models could be loaded?  
2. **Hydration default:** for HasMany/BelongsToMany names, should `ensureInclude` auto-set `hydrate: true`, or keep it opt-in (safer, current playground is explicit)? Prefer **opt-in** for v1.  
3. **Naming:** `ensureInclude` vs `ensureAssociationInclude` vs `addFindOptionsInclude` — pick one and use it in docs/examples only.  
4. **Core vs plugin:** association-name typing needs the Sequelize plugin model; keep runtime helper in plugin-sequelize; only loosen/tighten `FindOptionsHandler` generics in core as required.

---

## Success criteria

- Playground sibling case is one call with typed association name.  
- App can declare mutation→`adminAccount` dependency via `findOptions` without a custom directive `include` list, using the updated include-collection path (+ lookbehind helper where nesting requires it).  
- `findOptions` callbacks get parent-aware state typing closer to resolver `source`.  
- Depends only on a released `graphql-lookahead` that includes lookbehind — no copied lookbehind implementation in gene.
