# GraphQL Gene

[![TypeScript][typescript-src]][typescript-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Use `graphql-gene` to generate automatically an executable schema out of your ORM models. Everything is fully typed and define once for both GraphQL and Typescript types. See [Highlights](#highlights) section for more.

<br>

❤️ Provided by [Accès Impôt](https://www.acces-impot.com)'s engineering team

| <a href="https://www.acces-impot.com" target="_blank"><img width="338" alt="Accès Impôt" src="https://github.com/user-attachments/assets/79aa6364-51d1-4482-b31e-680568d647f0"></a> |
| :---: |
| 🇨🇦 _Online tax declaration service_ 🇨🇦 |

<br>

## Table of contents

- [Highlights](#highlights)
- [Quick Setup](#quick-setup)
  - [Export all models from one file](#export-all-models-from-one-file)
  - [Typing](#typing)
  - [Generate the schema](#generate-the-schema)
  - [Allow inspecting the generated schema](#allow-inspecting-the-generated-schema)
- [Query filtering](#query-filtering)
  - [Default resolver](#default-resolver)
  - [Filter arguments](#filter-arguments)
  - [Operators](#operators)
- [Gene config](#gene-config)
  - [Options](#options)
  - [Define queries/mutations inside your model](#define-queriesmutations-inside-your-model)
  - [Define directives](#define-directives)
    - [Example: User authentication directive](#example-user-authentication-directive)
- [Available plugins](#available-plugins)
- [Contribution](#contribution)

<br>

## Highlights

- ⚡️ Performant - Automatically avoid querying nested database relationships if they are not requested.
- 🔒 Secure - Easily create and share directives at the type or field level (i.e. `@userAuth`).
- ⏰ Time-to-delivery - No time wasted writing similar resolvers.
- 🧩 Resolver template - [Generates the resolver](#default-resolver) for you with deep [`where`](https://sequelize.org/docs/v6/core-concepts/model-querying-basics/#operators) argument and more.
- <img src="https://github.com/user-attachments/assets/bd2f6032-5346-478f-ac0c-2c28703a8e12" width="18"> Type safe - Resolver arguments and return value are deeply typed.
- 🎯 One source of truth - Types are defined once and shared between GraphQL and Typescript.
- 💥 Works with anything - New or existing projects. Works with any GraphQL servers, ORM, or external sources.
- 🔌 Plugins - Simple plugin system to potentially support any Node.js ORM. See [Writing a Plugin](docs/plugins/writing-a-plugin.md).

<br>

## Quick Setup

Install `graphql-gene` with the plugin you need for your ORM:

```bash
# pnpm
pnpm add graphql-gene @graphql-gene/plugin-sequelize

# yarn
yarn add graphql-gene @graphql-gene/plugin-sequelize

# npm
npm i graphql-gene @graphql-gene/plugin-sequelize
```

<br>

### Export all models from one file

Create a file where you export all your GraphQL types including your database models, but also basic GraphQL types, inputs, enums.

#### *src/models/graphqlTypes.ts*

```ts
import { defineEnum, defineType } from 'graphql-gene'

// All your ORM models
export * from './models'

// i.e. some basic GraphQL types
export const MessageOutput = defineType({
  type: 'MessageTypeEnum!',
  text: 'String!',
})
export const MessageTypeEnum = defineEnum(['info', 'success', 'warning', 'error'])

// i.e. assuming AuthenticatedUser is defined as alias in User.geneConfig
export { User as AuthenticatedUser, MutationLoginOutput } from '../models/User/User.model'
```

<br>

### Typing

You can now create a declaration file to define the `GeneContext` and `GeneSchema` types used by `graphql-gene`. You need to use the `GeneTypesToTypescript` utility to type every GraphQL types in `GeneSchema`.

You can also extend the context based on the GraphQL server you're using (optional).

#### *src/types/graphql-gene.d.ts*

```ts
import type { GeneTypesToTypescript } from 'graphql-gene'
import type { YogaInitialContext } from 'graphql-yoga'
import * as graphqlTypes from '../models/graphqlTypes'

declare module 'graphql-gene/schema' {
  export interface GeneSchema extends GeneTypesToTypescript<typeof graphqlTypes> {
    Query: object
    Mutation: object
  }
}

declare module 'graphql-gene/context' {
  export interface GeneContext extends YogaInitialContext {}
}
```

<br>

### Generate the schema

The last step is to call `generateSchema` and pass the returned `schema` to your GraphQL server. You simply have to pass all types imported from _graphqlTypes.ts_ as shown in the example below.

Please note that `graphql-gene` is using `Date`, `DateTime`, or `JSON` for certain data types. If you don't provide scalars for them, they will fallback to the `String` type.

You can use the `resolvers` option to provide the scalars as it accepts both resolvers and scalar objects (`resolvers?: { [field: string]: GraphQLFieldResolver } | GraphQLScalarType`).

If you follow the example below, you will also need to install `graphql-scalars`.

#### *src/server/schema.ts*

```ts
import { DateResolver, DateTimeResolver, JSONResolver } from 'graphql-scalars'
import { generateSchema } from 'graphql-gene'
import { pluginSequelize } from '@graphql-gene/plugin-sequelize'
import * as graphqlTypes from '../models/graphqlTypes'

const {
  typeDefs,
  resolvers,
  schema,
  schemaString,
  schemaHtml,
} = generateSchema({
  resolvers: {
    Date: DateResolver,
    DateTime: DateTimeResolver,
    JSON: JSONResolver,
  },
  plugins: [pluginSequelize()],
  types: graphqlTypes,
})

export { typeDefs, resolvers, schema, schemaString, schemaHtml }
```

<br>

The `schema` returned is an executable schema so you can simply pass it to your GraphQL server:

#### *src/server/index.ts*

```ts
import { createServer } from 'node:http'
import { createYoga } from 'graphql-yoga'
import { schema } from './schema'

const yoga = createYoga({ schema })
const server = createServer(yoga)

server.listen(4000, () => {
  console.info('Server is running on http://localhost:4000/graphql')
})
```

You can also pass `typeDefs` and `resolvers` to a function provided by your GraphQL server to create the schema:

```ts
import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import { typeDefs, resolvers } from './schema'

const schema = createSchema({ typeDefs, resolvers })
const yoga = createYoga({ schema })
const server = createServer(yoga)

server.listen(4000, () => {
  console.info('Server is running on http://localhost:4000/graphql')
})
```

<br>

### Allow inspecting the generated schema

You can look at the schema in graphql language using `schemaString` and `schemaHtml` returned by `generateSchema`.

- `schemaString`: you can generate a file like _schema.gql_ that you add to `.gitignore` then use it to inspect the schema in your code editor.
- `schemaHtml`: you can add a HTML endpoint like `/schema` and respond with `schemaHtml`. The HTML comes with syntax highlighting provided by [unpkg.com](https://unpkg.com/) and [highlight.js](https://highlightjs.org/).

Here's an example using [Fastify](https://fastify.dev/):

#### *src/server/index.ts*

```ts
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fastify from 'fastify'
import { schema, schemaString, schemaHtml } from './schema'

//
// Your GraphQL server code
//

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = fastify({ logger: true })

if (process.env.NODE_ENV !== 'production') {
  // Expose schema as HTML page with graphql syntax highlighting
  app.get('/schema', (_, reply) => reply.type('text/html').send(schemaHtml))

  // Generate a .gql file locally (no need to await)
  fs.promises.writeFile(
    path.resolve(__dirname, '../../schema.gql'),
    schemaString
  )
}
```

<img width="600" alt="375269573-093fa556-9b80-4ad2-9cea-a8f312999293" src="https://github.com/user-attachments/assets/190eb4ac-d46d-44bc-886a-110fdf4ad05c">

<br>
<br>

## Query filtering

No need to write Query resolvers anymore! You can simply use the filter arguments that are automatically defined when using the default resolver at the Query level. The same filter arguments are also defined on all association fields so you can also query with nested filters.

### Default resolver

```ts
import { Model } from 'sequelize'
import { extendTypes } from 'graphql-gene'

export class Product extends Model {
  // ...
}

extendTypes({
  Query: {
    products: {
      resolver: 'default',
      returnType: '[Product!]',
    },
  },
})
```

```gql
query productsByColor($color: String) {
  products(where: { color: { eq: $color } }, order: [name_ASC]) {
    id
    name
    color

    # Association fields also have filters
    variants(where: { size: { in: ["US 10", "US 11"] } }) {
      id
      size
    }
  }
}
```

<br>

### Filter arguments

| Argument | Description |
| :--- | :---------- |
| `id` | `String` - Entry id (only available for fields returning a single entry). |
| `page` | `Int` - Page number for query pagination. Default: `1`. |
| `perPage` | `Int` - Amount of results per page. Default: `10`. |
| `where` | `Record<Attribute, Record<Operator, T>>` - Where options generated based on the fields of the return type (i.e. `where: { name: { eq: "Foo" } }`). |
| `where` | `Record<Attribute, Record<Operator, T>>` - Where options generated based on the fields of the return type (i.e. `where: { name: { eq: "Foo" } }`). |
| `order` | `[foo_ASC]` - Array of enum values representing the order in which the results should be sorted. The enum values are defined based on the attribute name + `_ASC` or `_DESC` (i.e. `order: [name_ASC, foo_DESC]`). |

<br>

### Operators

#### Generic operators

| Operator | Description |
| :--- | :---------- |
| `eq` | `T` - The value equals to... |
| `ne` | `T` - The value does not equals to... |
| `in` | `[T]` - The value is in... |
| `notIn` | `[T]` - The value is not in... |
| `null` | `Boolean` - The value is null if `true`. The value is not null if `false`. |
| `and` | `[CurrentWhereOptionsInput!]` - Array of object including the same operators. It represents a set of `and` conditions. |
| `or` | `[CurrentWhereOptionsInput!]` - Array of object including the same operators. It represents a set of `or` conditions. |

#### String operators

| Operator | Description |
| :--- | :---------- |
| `lt` | `String` - The value is like... (i.e. `{ like: "%foo%" }`) |
| `lte` | `String` - The value is not like... (i.e. `{ notLike: "%foo%" }`) |

#### Date and number operators

| Operator | Description |
| :--- | :---------- |
| `lt` | `T` - The value is less than... |
| `lte` | `T` - The value is less than or equal to... |
| `gt` | `T` - The value is greater than... |
| `gte` | `T` - The value is greater than or equal to... |

<br>
<br>

## Gene config

By default, if a model is part of the `types` provided to `generateSchema`, it will be added to your schema.

Nevertheless, you might need to exclude some fields like `password`, define queries or mutations. You can set GraphQL-specific configuration by adding a `static readonly geneConfig` object to your model (more examples below) or use `extendTypes` to add fields to Query/Mutation.

```ts
import { Model } from 'sequelize'
import { defineGraphqlGeneConfig, defineField, extendTypes } from 'graphql-gene'

export class User extends Model {
  // ...

  static readonly geneConfig = defineGraphqlGeneConfig(User, {
    // Your config
  })
}

extendTypes({
  Query: {
    foo: defineField({
      // ...
    }),
  },
})
```

### Options

| Name | Description |
| :--- | :---------- |
| `include`❔ | `(InferFields<M> \| RegExp)[]` - Array of fields to include in the GraphQL type. Default: all included. |
| `exclude`❔ | `(InferFields<M> \| RegExp)[]` - Array of fields to exclude in the GraphQL type. Default: `['createdAt', updatedAt']`. |
| `includeTimestamps`❔ | `boolean \| ('createdAt' \| 'updatedAt')[]` - Include the timestamp attributes or not. Default: `false`. |
| `varType`❔ | `GraphQLVarType` - The GraphQL variable type to use. Default: `'type'`. |
| `directives`❔ | `GeneDirectiveConfig[]` - Directives to apply at the type level (also possible at the field level). |
| `aliases`❔ | `Record<GraphqlTypeName], GeneConfig>` - The values of "aliases" would be nested GeneConfig properties that overwrites the ones set at a higher level. This is useful for instances with a specific scope include more fields that the parent model (i.e. `AuthenticatedUser` being an alias of `User`). Note that the alias needs to be exported from _graphqlTypes.ts_ as well (i.e. `export { User as AuthenticatedUser } from '../models/User/User.model'`). |

<br>

### Define queries/mutations inside your model

#### *src/models/Prospect/Prospect.model.ts*

```ts
import type { InferAttributes, InferCreationAttributes } from 'sequelize'
import { Model, Table, Column, Unique, AllowNull, DataType } from 'sequelize-typescript'
import { defineEnum, defineField, defineType, extendTypes } from 'graphql-gene'
import { isEmail } from '../someUtils.ts'

export
@Table
class Prospect extends Model<InferAttributes<Prospect>, InferCreationAttributes<Prospect>> {
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING)
  declare email: string

  @Column(DataType.STRING)
  declare language: string | null
}

extendTypes({
  Mutation: {
    registerProspect: defineField({
      args: { email: 'String!', locale: 'String' },
      returnType: 'MessageOutput!',

      resolver: async ({ args }) => {
        // `args` type is inferred from the GraphQL definition above
        // { email: string; locale: string | null | undefined }
        const { email, locale } = args

        if (!isEmail(email)) {
          // The return type is deeply inferred from the `MessageOutput`
          // definition. For instance, the `type` value must be:
          // 'info' | 'success' | 'warning' | 'error'
          return { type: 'error' as const, text: 'Invalid email' }
        }
        // No need to await
        Prospect.create({ email, language: locale })
        return { type: 'success' as const }
      },
    }),
  },
})

export const MessageOutput = defineType({
  type: 'MessageTypeEnum!',
  text: 'String',
})

export const MessageTypeEnum = defineEnum(['info', 'success', 'warning', 'error'])
```

<br>

### Define directives

`geneConfig.directives` accepts an array of `GeneDirectiveConfig` which will add the directive at the type level (current model). It is recommended to create directives as factory function using `defineDirective` for better typing (see example below).

Directives are simply wrappers around resolvers following a middleware pattern. At the type level, it looks across your whole schema and wrap the resolver of fields returning the given type. This way, the field itself returns `null` on error instead of returning an object with all its fields being `null`.

```ts
type GeneDirectiveConfig<
  TDirectiveArgs = Record<string, string | number | boolean | null> | undefined,
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
  resolve: () => Promise<TResult> | TResult
}) => Promise<void> | void
```

<br>

#### Example: User authentication directive

#### *src/models/User/userAuthDirective.ts*

```ts
import { GraphQLError } from 'graphql'
import { defineDirective } from 'graphql-gene'
import { getQueryIncludeOf } from '@graphql-gene/plugin-sequelize'
import type { WhereAttributeHash } from 'sequelize'
import { User } from './User.model'
import { getJwtTokenPayload } from './someUtils'

export enum ADMIN_ROLES {
  developer = 'developer',
  manager = 'manager',
  superAdmin = 'superAdmin',
}

declare module 'graphql-gene/context' {
  export interface GeneContext {
    authenticatedUser?: User | null
  }
}

function throwUnauthorized(): never {
  throw new GraphQLError('Unauthorized')
}

/**
 * Factory function returning the directive object
 */
export const userAuthDirective = defineDirective<{
  // Convert ADMIN_ROLES enum to a union type
  role: `${ADMIN_ROLES}` | null
}>(args => ({
  name: 'userAuth', // only used to add `@userAuth` to the schema in graphql language
  args,

  async handler({ context, info }) {
    // If it was previously set to `null`
    if (context.authenticatedUser === null) return throwUnauthorized()

    // i.e. `context.request` coming from Fastify
    const authHeader = context.request.headers.get('authorization')
    const [, token] =
      authHeader?.match(/^Bearer\s+(\S+)$/) || ([] as (string | undefined)[])
    if (!token) return throwUnauthorized()

    // For performance: avoid querying nested associations if they are not requested.
    // `getQueryIncludeOf` look deeply inside the operation (query or mutation) for
    // the `AuthenticatedUser` type in order to know which associations are requested.
    const includeOptions = getQueryIncludeOf(info, 'AuthenticatedUser', {
      // Set to true if the directive is added to a field that is not of type "AuthenticatedUser"
      lookFromOperationRoot: true,
    })

    const { id, email } = getJwtTokenPayload(token) || {}
    if (!id && !email) return throwUnauthorized()

    const where: WhereAttributeHash = { id, email }
    if (args.role) where.adminRole = args.role

    const user = await User.findOne({ where, ...includeOptions })
    context.authenticatedUser = user

    if (!user) throwUnauthorized()
  },
}))
```

<br>

The `args` option allow you to use it in different contexts:

#### *src/models/User/User.model.ts*

```ts
import { defineField, extendTypes } from 'graphql-gene'
import { userAuthDirective } from '.userAuthDirective.ts'

export
@Table
class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {

  // ...

  static readonly geneConfig = defineGraphqlGeneConfig(User, {
    include: ['id', 'username'],

    aliases: {
      // Use an alias since `AuthenticatedUser` as a quite
      // different scope than a public `User`.
      AuthenticatedUser: {
        include: ['id', 'email', 'username', 'role', 'address', 'orders'],
        // `role: null` means no specific admin `role` needed
        // it just needs to be authenticated.
        directives: [userAuthDirective({ role: null })],
      },
    },
  })
}

extendTypes({
  Query: {
    me: defineField({
      returnType: 'AuthenticatedUser',
      // `context.authenticatedUser` is defined in `userAuthDirective`
      resolver: ({ context }) => context.authenticatedUser,
    }),
  },
})
```

<br>

The alias needs to be exported as well from _graphqlTypes.ts_:

#### *src/models/graphqlTypes.ts*

```ts
export * from './models'

// Export the alias for typing
export { User as AuthenticatedUser } from '../models/User/User.model'
```

<br>

Another example for `superAdmin` role:

#### *src/models/AdminAccount/AdminAccount.model.ts*

```ts
static readonly geneConfig = defineGraphqlGeneConfig(AdminAccount, {
  // i.e. Only allow super admin users to access the `AdminAccount` data
  directives: [userAuthDirective({ role: 'superAdmin' })],
})
```

<br>

#### Sending the request

This is how the response would look like for `Query.me` if the token is missing or invalid:

```gql
type Query {
  me: AuthenticatedUser
}
```

<img width="804" alt="image" src="https://github.com/user-attachments/assets/3862b733-24b0-4e09-bf79-92645d097e73">

<br>
<br>


## Available plugins

- [`@graphql-gene/plugin-sequelize`](https://github.com/accesimpot/graphql-gene/tree/main/packages/plugin-sequelize#readme) for [Sequelize](https://sequelize.org)

<br>
<br>

## Contribution

<details>
  <summary>Local development</summary>
  
  ```bash
  # Install dependencies
  pnpm install

  # Develop
  pnpm dev

  # Run ESLint
  pnpm lint

  # Run Vitest
  pnpm test

  # Run Vitest in watch mode
  pnpm test:watch
  ```
</details>

<!-- Badges -->

[typescript-src]: https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg
[typescript-href]: http://www.typescriptlang.org/
[npm-version-src]: https://img.shields.io/npm/v/graphql-gene/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/graphql-gene
[npm-downloads-src]: https://img.shields.io/npm/dm/graphql-gene.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npmjs.com/package/graphql-gene
[license-src]: https://img.shields.io/npm/l/graphql-gene.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/graphql-gene
