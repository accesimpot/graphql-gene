# Gene directives

Gene can attach **resolver middleware** at the type or field level via `geneConfig.directives` (or field configs). Each entry is a `GeneDirectiveConfig`: a `name`, optional `args`, and a `handler` that runs around the underlying resolver (see the **Define directives** section in the [main README](../../README.md#define-directives)).

Typical uses:

- Enforce auth or load context before resolving fields that return a given GraphQL type.
- Rewrite `source` before the default resolver runs (for example normalizing polymorphic hub rows into concrete model instances).

## Shape

From the README, a directive config looks like:

```ts
type GeneDirectiveConfig<
  TDirectiveArgs =
    | Record<string, string | number | boolean | string[] | number[] | boolean[] | null>
    | undefined,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
> = {
  name: string
  args?: TDirectiveArgs
  handler: GeneDirectiveHandler<TSource, TContext, TArgs>
}

type GeneDirectiveHandler<TSource, TContext, TArgs, TResult = unknown> = (options: {
  source: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[0]
  args: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[1]
  context: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[2]
  info: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[3]
  field: string
  filter: <TValue>(callback: (value: TValue) => unknown) => void
  resolve: () => Promise<TResult> | TResult
}) => Promise<void> | void
```

Use `defineDirective` from `graphql-gene` for stronger typing when building reusable directive factories (see the user-auth example in the README).

## Directive name and the printed schema (`schemaString`)

Gene collects directive definitions and `@name` decorations when generating the GraphQL schema string.

- **`name: 'myDirective'`** — emits a directive definition (when applicable) and applies `@myDirective` in the SDL for types/fields that use it.
- **`name: ''` (empty string)** — skips adding this directive to the SDL: `registerDirectives` treats a falsy name as “handler-only”. The `handler` still runs as middleware; nothing is printed for that entry in the schema string.

This is useful when you need resolver-side behavior only—especially on GraphQL constructs where exposing a custom directive in SDL would be awkward (for example some **`interface`**-only shapes: SDL directives apply to object types and fields, not to interfaces in the same way as `type`, so naming the directive can produce invalid or confusing output while the runtime hook remains valid).

In short: **empty `name` means “run the handler, omit `@DirectiveName` from the generated schema string.”**

## See also

- [Polymorphic page blocks](./polymorphic-blocks.md) — `@Polymorphic` uses a nameless directive to rewrite hub rows for GraphQL.
