## Implementation prompt: v2 resolver source typing, runtime hydration, default order, and order-enum fix

You are working in the **graphql-gene** monorepo (`packages/core`, `packages/plugin-sequelize`, `packages/dev-playground`). Target: graphql-gene v2 beta. Implement the changes below with tests. Read `PLAN_V2.md` and existing association-list code (`associationListResolvers.ts`, `associationListRegistry.ts`, `populateTypeDefs.ts`, `includePostProcess.ts`, `utils/public.ts`) before starting.

---

### Background / motivation

graphql-gene v2 wraps HasMany associations as `{ count, items }` in GraphQL. Integrators upgrading from v1 reported several issues:

1. **Resolver `source` typing** — `extendTypes` resolvers infer `source` from Sequelize prototypes (`Exam.questions: ExamQuestion[]`), but GraphQL exposes `questions: { count, items }`. Integrators often add local helpers to bridge runtime and types. graphql-gene should own this.

2. **Runtime mismatch** — Custom resolvers receive a raw Sequelize instance while GraphQL shape is a wrapper. Workarounds (`findByPk` reloads, `as any`, clearing association arrays on the model) are unacceptable.

3. **Association loading** — HasMany wrapper fields must not guess from Sequelize preload heuristics (e.g. treating `[]` as “loaded”). Expected behavior:

   - **Lookahead** (`getQueryInclude`) builds deep `include` trees from the current GraphQL operation whenever the client selects an association (including `items` / `count` facets).
   - If the parent row was not fetched with that association in the generated include tree, the association field resolves to **`null`** in GraphQL (not `{ count: 0, items: [] }`). Schema may need nullable wrapper types where appropriate.
   - When the association is selected and included, the hydrated resolver `source` exposes `GeneAssociationList<T>` with real data (see Part 2).
   - Do **not** rely on per-model workarounds (e.g. clearing `source.questions`, custom preload resolvers) or facet lazy-load as a substitute for missing lookahead includes.

4. **Computed fields + `findOptions`** — Fields like `totalDuration` (a sum over sibling association rows) depend on data from other fields on the same parent. Their `findOptions` must merge into the **correct nested include frame** in the lookahead tree (not the query root), and wrapper associations requested via `findOptions` must not be stripped before the parent `findAll` / `findByPk` runs.

5. **In-memory sort workarounds** — Some integrators use custom directives or resolver-side sorting to order association lists after fetch. Sorting should happen in SQL via the default resolver `order` arg, with a **default order** field config (Part 3) so integrators do not need directives for common cases like `order_ASC` on child rows.

6. **Order enum bug** — `generateDefaultQueryFilterTypeDefs` in `packages/core/src/defaultResolver.ts` adds `_ASC`/`_DESC` for **every** field on the target type, including associations and custom `extendTypes` fields. Example of bad output:

```graphql
enum ExamSelectOrderQuestions {
  id_ASC
  id_DESC
  correctAnswer_ASC
  correctAnswer_DESC
  exam_ASC # association — should NOT be here
  exam_DESC
  possibleAnswers_ASC
  possibleAnswers_DESC
  fooBar_ASC # extendTypes-only field — should NOT be here
  fooBar_DESC
}
```

Only **SQL-sortable scalar/column attributes** should appear in order enums (same spirit as `where` input generation, which already skips non-filterable fields).

---

### Part 1 — Shared types and `ToGqlSource` (typing)

#### 1.1 Export from **core**

```typescript
export type GeneAssociationList<T> = {
  count: number
  items: T[]
}

export type GeneAssociationListFacet<T> = {
  count?: number
  items?: T[]
}
```

Integrators should import this type from graphql-gene instead of redefining it locally.

#### 1.2 `ToGqlSource` in **plugin-sequelize**

Introduce a mapped type that starts from the **Sequelize model** and selectively overrides association fields to match GraphQL-shaped resolver parents:

- **Base keys** — `InferAttributes` column keys plus association keys whose declared instance type is `Model` or `Model[]` (Sequelize mixins such as `addTag` are omitted automatically because they are functions, not model-shaped values).
- **Columns / scalars** — keep ORM types from `InferAttributes`.
- **HasMany wrapper associations** — when the parent GraphQL type name is known (`TTypeName`), rewrite `questions: Child[]` to `questions: GeneAssociationList<ToGqlSource<Child>>`. Wrapper detection matches runtime naming: `${Parent}${CapField}GeneAssociationListResult` (see `getGeneAssociationListWrapperTypeName` / `associationListRegistry`).
- **BelongsTo / HasOne** — nested `ToGqlSource<Related>` (not a list wrapper).
- **BelongsToMany** — keep ORM array shape until wrappers exist; declare fields on the augmentable `GeneBelongsToManyAssociationFields` interface (e.g. `ProductGroup: 'categories'`) so they are not mistaken for HasMany wrappers.
- **Exclude GraphQL-only output fields** (`totalDuration`, `fooBar`, etc.) from `source` — they are not Sequelize model fields, so they never appear on `ToGqlSource` keys.

`ToGqlSource` does **not** build its key set from the GraphQL schema or `extendTypes`; it only rewrites existing Sequelize association fields that graphql-gene exposes as list wrappers. Computed fields that return lists but are not model associations are out of scope.

**Compile-time note:** BelongsToMany vs HasMany both appear as `Model[]` on the Sequelize model. Until schema-field codegen exists, apps augment `GeneBelongsToManyAssociationFields` for BelongsToMany keys. HasMany wrappers are inferred from a concrete parent `TTypeName` (always supplied via `extendTypes` / `ResolveGqlSource`).

**Future (optional):** mirror `populateTypeDefs` / `registerGeneAssociationListWrapper` into generated typings so `GeneBelongsToManyAssociationFields` augmentation is unnecessary.

#### 1.3 Wire into `extendTypes` inference

In `packages/core/src/defineConfig.ts`, replace `AccurateTypeSource<TypeName>` (currently `GraphqlToTypescript<TypeName>` → Sequelize prototype) with `ToGqlSource<…>` for plugin-matched Sequelize types.

`GeneResolver` / `extendTypes` field resolvers should see:

```typescript
extendTypes({
  Exam: {
    totalDuration: {
      resolver({ source }) {
        // source: ToGqlSource<Exam, 'Exam'>
        return source.questions.items.reduce((sum, q) => sum + q.allocatedTimeInMin, 0)
      },
    },
  },
})
```

Keep Sequelize model types available internally for the plugin (e.g. `Model.findByPk`), but **public resolver `source` should match the GraphQL object**.

---

### Part 2 — Runtime hydration

Types alone are not enough: without hydration, `source` is a Sequelize instance and `source.questions` is `ExamQuestion[] | undefined`, not `{ count, items }`.

**Implement runtime hydration** so that when resolving fields on a GraphQL object backed by a Sequelize model, the parent passed to custom resolvers (and default resolvers where applicable) exposes association-list fields as `GeneAssociationList<T>`:

- `items` — from data loaded via lookahead-generated includes on the parent fetch
- `count` — consistent with `items` (or a dedicated count query when only `count` is selected)

Requirements:

1. Hydration must align with lookahead-driven includes: when `questions` (or any wrapper association) is in the operation, the parent Sequelize fetch must carry that association; facet resolvers must not contradict that by returning fake empty lists or re-querying unnecessarily.
2. When an association is **not** in the operation’s include tree, the GraphQL field resolves to **`null`**, not an empty wrapper.
3. Sibling resolvers (e.g. `totalDuration` reading `source.questions.items`) must work without integrator-side reload hacks.
4. `findOptions` on computed fields must merge includes into the correct nested frame so sibling associations are present on the hydrated `source`.

Add/update tests in `packages/plugin-sequelize/src/associationListResolvers.spec.ts` and dev-playground integration tests.

---

### Part 3 — Default `order` field config

Add a new field config key on `extendTypes` / `GeneTypeConfig`. Model field config as a **union of object shapes** (not one interface with optional `order?`) so `order` is only typable together with `resolver: 'default'` — see rule 1 below.

```typescript
extendTypes({
  ExamQuestion: {
    possibleAnswers: {
      resolver: 'default',
      order: 'order_ASC', // default SQL order when client omits `order` arg
    },
  },
  Exam: {
    questions: {
      resolver: 'default',
      order: 'allocatedTimeInMin_ASC', // column on ExamQuestion
    },
  },
})
```

**Rules:**

1. `order` is **only allowed** when `resolver: 'default'`. Enforce this at compile time with a discriminated union, e.g. `{ resolver: 'default'; order?: 'id_ASC' | 'id_DESC' } | { resolver: GeneResolverFn; returnType?: … }` — not `order?` on a single catch-all field config type. Schema-build validation may still catch invalid combos at runtime.
2. Type `order` as a **string literal union** of all valid order enum values for that field’s query context — i.e. `${sortableAttribute}_ASC | ${sortableAttribute}_DESC` derived from the same rules as the generated `*SelectOrder*` enum (after Part 4 fix).
3. At runtime, when the default resolver (or association-list `items` facet resolver) runs and the client did not pass `order`, apply this default in `getFieldIncludeOptions` / `defaultResolver` as Sequelize `order`.
4. For v2 association-list wrappers, default `order` on the **parent association field** should apply to the **`items` facet** SQL query (not the wrapper root).

Update `defineConfig.ts` types (`ExtendedTypeField`, `GeneTypeConfig`) and validation. Add tests.

---

### Part 4 — Fix order enum generation

In `packages/core/src/defaultResolver.ts`, function `generateDefaultQueryFilterTypeDefs` currently does:

```typescript
// For EVERY returnFieldKey on fieldType:
QUERY_ORDER_VALUES.forEach(orderValue => {
  const key = `${returnFieldKey}_${orderValue}`
  options.typeDefLines[orderEnumName].lines[key] = getDefaultFieldLinesObject()
})
```

**Change:** only emit order enum values for fields that are **SQL-sortable**:

- **Include:** scalar/column attributes (same set that gets a direct `where` operator input — `VALID_RETURN_TYPES_FOR_WHERE` / `findValidInputType` path)
- **Exclude:**
  - Association fields (marked via `isMarkedAsAssociation`, or whose `typeDef` is another GraphQL object / association-list wrapper)
  - Custom `extendTypes`-only fields (e.g. `fooBar`) — no underlying column
  - Virtual fields without sortable SQL mapping

Reuse the same filtering logic as `where` (lines ~203–207 already `delete` non-filterable where keys). Order enum generation should follow the same inclusion rules — **do not add `_ASC`/`_DESC` when `whereTypeDef` would be deleted**.

Add a unit test: for a type with associations + custom fields, generated `*SelectOrder*` enum contains only column keys (e.g. `id_ASC`, `allocatedTimeInMin_DESC`) and not `exam_ASC`, `possibleAnswers_ASC`, `fooBar_ASC`.

---

### Part 5 — Tests and docs

1. **Unit tests** — association null when not included, lookahead include generation, order enum filtering, default `order` config typing/validation, `ToGqlSource` inference (type tests if needed).
2. **dev-playground** — example model using `order: '…'` on a default association field.
3. **Docs** — short section in `packages/docs` or README:
   - `ToGqlSource` / `GeneAssociationList`
   - resolver `source` is GraphQL-shaped, not raw Sequelize
   - `order` field config
   - which fields appear in order enums

Run `pnpm test`, `pnpm types:check`, and ensure coverage thresholds still pass.

---

### Part 6 — Integrator migration (out of scope for this repo)

After this ships in a new beta, integrators should be able to:

- Remove local helpers that normalize `{ count, items }` vs raw association arrays
- Remove custom sort directives on association fields; declare `order: 'column_ASC'` (etc.) on default resolver fields instead
- Read `source.questions.items` (and similar) directly in `extendTypes` resolvers
- Bump `graphql-gene` and `@graphql-gene/plugin-sequelize` to the new release

---

### Implementation notes

- **Key files:** `defineConfig.ts`, `defaultResolver.ts`, `graphqlToTypescript.ts`, `populateTypeDefs.ts`, `associationListResolvers.ts`, `utils/includePostProcess.ts`, `utils/public.ts`, `associationListRegistry.ts`, `associationMap.ts`, `toGqlSource.ts`, `belongsToManyAssociationFields.ts`, `gqlSource.ts`
- **Explicit non-goals:** Per-model workarounds (custom preload resolvers, clearing association arrays on the Sequelize instance, integrator-side flags). Solve association loading via lookahead includes, `null` when not selected, and hydrated GraphQL-shaped `source`.
- Prefer minimal API surface; match existing code style; no `any` in new code.
- Breaking change is acceptable in v2 beta if documented.

Please implement all parts above, with tests, and summarize what changed and how to migrate.
