# GraphQL schema design (graphql-gene)

Guidelines for designing a GraphQL API that plays well with **graphql-gene**, **Sequelize** (via `@graphql-gene/plugin-sequelize`), and common normalized client caches (Apollo Client, Urql, Relay, etc.).

---

## Example: `me`, aliases, and auth scope

graphql-gene often models different access scopes for the same underlying model with a **GraphQL alias** and **directives**. A typical pattern (see the [main README](../../../README.md#example-user-authentication-directive)):

- A public-facing `User` type exposes a safe field set.
- An `AuthenticatedUser` alias (same Sequelize model, stricter `include` list) carries account-specific fields.
- An `@userAuth` directive runs before resolving fields that return `AuthenticatedUser` (or before `Query.me`), loads the user with only the associations requested in the operation, and stores the result on `context`.

Rough shape in GraphQL SDL:

```graphql
type Query {
  """
  Current session user; null when unauthenticated or invalid token.
  """
  me: AuthenticatedUser
}

type User {
  id: ID!
  username: String
  # … public profile fields only
}

type AuthenticatedUser {
  id: ID!
  email: String!
  username: String
  role: String
  address: Address
  orders: [Order!]
  # … same model as User, narrower / broader field set is configured in geneConfig + directives
}
```

**Example operations** showing how scope lives in the type graph, not in ad hoc flags:

Public lookup:

```graphql
query PublicUser($id: ID!) {
  user(id: $id) {
    id
    username
  }
}
```

Authenticated session with nested data—selection set drives what the ORM loads:

```graphql
query MeForAccount {
  me {
    id
    email
    username
    orders {
      id
      status
    }
  }
}
```

Stricter admin-only types reuse the same directive pattern with different arguments (for example `roles: ['superAdmin']` on another model’s `geneConfig`), so **who may see what** stays visible on the types and fields that declare the directive, instead of being hidden inside random top-level fields.

For more on directive handlers and empty `name` vs printed SDL, see [Gene directives](./directives.md).

---

## Stay close to default resolution (includes and performance)

graphql-gene’s Sequelize plugin integrates **lookahead**: default resolvers use helpers such as **`getQueryInclude`** so nested associations are only loaded when the client actually selects those fields.

**Prefer:**

- Letting the **default resolver** load associations implied by the schema.
- Declaring associations and `include` / `geneConfig` in a way that matches how clients traverse the graph.

**Avoid:**

- Custom resolvers that duplicate what the default layer already does.
- **N+1** patterns or unconditional deep `include`s “just in case” when the field is not selected.

When you must implement custom logic (see below), align loads with the selection set using `getQueryInclude` or `getQueryIncludeOf` from `@graphql-gene/plugin-sequelize`—the same helpers the default path uses—so you never fetch large subtrees that the operation did not ask for.

---

## Mutations should return the modified objects

If a mutation changes an entity of type `Foo`, the payload should include `Foo` (or a clear field that holds it) with enough `id` and `__typename` for normalized caches to merge updates.

**Why:** Clients can update in-memory cache by `id` without issuing a second query. This matches common GraphQL client guidance and prevents “fire a mutation, then refetch everything” workflows.

In custom mutation resolvers, reuse the selection set when reloading the model: use `getQueryInclude` from the current field’s `info`, or `getQueryIncludeOf(info, 'Order', { … })` when the modified instance appears under a different GraphQL type in the response tree. The [README example](../../../README.md#example-user-authentication-directive) shows `getQueryIncludeOf` for `AuthenticatedUser` with `lookFromOperationRoot: true` when the directive runs on a field that is not itself that type. The dev playground includes mutation examples that return the updated entity with nested selections respected.

---

## Computed and virtual fields: declare dependencies with `findOptions`

If a field does not map 1:1 to a column but is computed from **sibling associations** (or nested data on the same model instance), use the field’s `findOptions` hook to add the necessary `include`s whenever that field is requested.

For example, a `categories` field might resolve from `groupCategories → category`, so `findOptions` pushes `groupCategories` and `category` into `state.include`. That way the resolver always has the rows it needs, and you do not rely on eager-loading elsewhere.

See `ProductGroup` in `packages/dev-playground/src/models/ProductGroup/ProductGroup.model.ts`.

---

## Prefer stable `id` on object types

Expose a stable, unique `id` on types that represent persisted entities (typically the database primary key or another global id). Normalized caches use `__typename` + `id` (or configured type policies) to merge records across queries and mutations.

---

## Lookahead / fetch only what the operation asks for

Treat GraphQL’s selection set as the contract for how much to load from the database:

- Prefer includes driven by `getQueryInclude` / `getQueryIncludeOf` (or the default resolver that already does this).
- Avoid loading heavy graphs when the client only asked for a scalar leaf.

---

## Paginate list fields that can grow

For fields that return unbounded collections, use offset-style pagination with `skip` and `limit` arguments—the GraphQL Gene convention for lists, equivalent to SQL `OFFSET` / `LIMIT`. This protects the database and keeps list fields predictable for clients.

Choose one consistent pagination shape per list field and document it; graphql-gene does not force a single SDL everywhere, but **unbounded arrays** on hot fields are a common performance footgun.

---

## Schema hygiene

- **Reuse and discover** existing fields before adding near-duplicates. Conflicting names for the same concept confuse clients and break cache expectations.
- **Document fields** (descriptions in SDL or `geneConfig`) so consumers know intent and safe usage.
- **`@deprecated`** with a reason (and replacement) instead of silently removing fields. Remove only after usage has dropped according to your analytics or schema lifecycle policy.

---

## Security

- **Do not expose sensitive profile data** on types or fields meant for anonymous flows. If you need `userExists(email)` semantics, return a boolean or a minimal type—not a full `User` that can be expanded in another operation.
- **Do not leak raw server errors** to clients. Return safe, generic user-facing messages; log details server-side.
- **Fence off secrets.** For models that must never appear as GraphQL objects (for example OAuth token rows behind something like `AuthToken`), use `geneConfig` so no fields are emitted. Even “internal-only” tables can slip onto the schema later—make absence from the API an explicit choice, not an oversight.

```ts
@Table
class AuthToken extends Model {
  // ...

  static readonly geneConfig = defineGraphqlGeneConfig(AuthToken, {
    include: [], // don't include any field
  })
}
```

---

## Declarative operations: avoid header-driven GraphQL semantics

Prefer designs where the **GraphQL document and variables** (and, if you use them, persisted operation names) spell out what is being fetched and what legitimately varies between requests. Do not make field behavior, filtering, or response shape depend on custom HTTP headers (feature flags, implicit “modes”, tenant switches, and so on) that never appear in the operation—those hide real inputs from reviewers, tools, and caching layers.

**Exception — `Authorization`:** using a standard Bearer token (or similar) on the `Authorization` header to establish **who is calling** is normal and does not contradict a declarative schema, as long as **what that identity may see** is expressed in GraphQL: for example a `me` field and distinct types such as `AuthenticatedUser` vs public `User`. Normalized client caches already treat viewer-specific data as something you evict or reset on logout; there is a single current user per client session, so the cache does not need a second, header-driven notion of “which variant of this query” the way feature-flag headers would.

**Why avoid other headers:**

- **Predictability:** reviewers and tools can understand an operation without reading deployment-specific header rules.
- **Caching:** normalized caches (and persisted queries / CDN strategies) assume the same named operation with the same variables maps to the same conceptual result shape. Extra out-of-band inputs that change field resolution defeat that model and make client cache bugs harder to reason about.

When something should change business resolution (not just “which user”), model it with **GraphQL variables**, **distinct fields or types**, or **explicit arguments**—not “same operation, different `X-*` header.”

---

## Structure the graph around data ownership

Fields should **hang under the object they belong to** (orders under `Customer` / `AuthenticatedUser`, settings under the resource they configure, etc.) instead of sprouting unrelated top-level queries that hide implicit coupling.

That keeps **dependencies visible in the schema**, helps resolvers stay cohesive, and lines up includes with natural Sequelize associations.

---

## See also

- [Gene directives](./directives.md)
- [Polymorphic page blocks](./polymorphic-blocks.md)
- [Writing a plugin](./writing-a-plugin.md) (extending graphql-gene beyond Sequelize)
