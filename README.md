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
- [Gene config](#gene-config)
  - [Options](#options)
  - [Define Query/Mutation inside your model](#define-querymutation-inside-your-model)
  - [Define alias for specific scope](#define-alias-for-specific-scope)
- [Available plugins](#available-plugins)
- [Contribution](#contribution)

<br>

## Highlights

- ⏰ Time-to-delivery - No time wasted writing similar resolvers.
- ⚡️ Performant - Automatically avoid querying nested database relationships if they are not requested.
- 🔒 Secure - Easily create and share directives at the type or field level (i.e. `@userAuth`).
- 🧩 Resolver template - Generates the resolver for you with deep [`where`](https://sequelize.org/docs/v6/core-concepts/model-querying-basics/#operators) argument and more.
- <img src="https://github.com/user-attachments/assets/bd2f6032-5346-478f-ac0c-2c28703a8e12" width="18"> Type safe - Resolver arguments and return value are deeply typed.
- 🎯 One source of truth - Types are defined once and shared between GraphQL and Typescript.
- 💥 Works with anything - New or existing projects. Works with any GraphQL servers, ORM, or external sources.
- 🔌 Plugins - Simple plugin system to potentially support any Node.js ORM (it only has `plugin-sequelize` for now).

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

### Export all models from one file

Create a file where you export all your GraphQL types including your database models, but also basic GraphQL types, inputs, enums.

#### *src/models/graphqlTypes.ts*

```ts
// All your ORM models
export * from './models'

// i.e. some basic GraphQL type
export const MessageOutput = {
  type: 'MessageTypeEnum!',
  text: 'String!',
} as const

// i.e. this array will be created as a GraphQL enum
export const MessageTypeEnum = ['info', 'success', 'warning', 'error'] as const

// i.e. assuming AuthenticatedUser is defined as alias in User.geneConfig
export { User as AuthenticatedUser, MutationLoginOutput } from '../models/User/User.model'
```

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

### Generate the schema

The last step is to call `generateSchema` and pass the returned `typeDefs` and `schema` to your GraphQL server. You simply have to pass all types imported from _graphqlTypes.ts_ as shown in the example below.

Moreover, `graphql-gene` excepts you to provide scalars for `Date` and `DateTime` or set the option `hasDateScalars` to `false` (will define the `Date`/`DateTime` fields as `String`). It also excepts you to provide a `JSON` scalar if you have fields mapping to the `JSON` type (i.e. `DataType.JSON` in Sequelize).

You can use the `schema` option to provide the scalars as it accepts any schema to extend (`schema?: GraphQLSchema | DocumentNode | string`).

Note: if you follow the example below, you'll also need to install `graphql-scalars`.

#### *src/server/schema.ts*

```ts
import {
  DateTypeDefinition,
  DateTimeTypeDefinition,
  JSONDefinition,
  DateResolver,
  DateTimeResolver,
  JSONResolver,
} from 'graphql-scalars'
import { generateSchema } from 'graphql-gene'
import { pluginSequelize } from '@graphql-gene/plugin-sequelize'
import * as graphqlTypes from '../models/graphqlTypes'

const {
  typeDefs,
  resolvers: generatedResolvers,
  schema,
  schemaString,
  schemaHtml,
} = generateSchema({
  schema: [String(DateTypeDefinition), String(DateTimeTypeDefinition), String(JSONDefinition)].join(
    '\n'
  ),
  plugins: [pluginSequelize()],
  types: graphqlTypes,
})

const resolvers = {
  Date: DateResolver,
  DateTime: DateTimeResolver,
  JSON: JSONResolver,
  ...generatedResolvers,
}

export { typeDefs, resolvers, schema, schemaString, schemaHtml }
```

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

## Gene config

By default, if a model is part of the `types` provided to `generateSchema`, it will be added to your schema.

Nevertheless, you might need to exclude some fields like `password`, define queries or mutations. You can set GraphQL-specific configuration by adding a `static readonly geneConfig` object to your model (more examples below).

```ts
import { Model } from 'sequelize'
import { defineGraphqlGeneConfig } from 'graphql-gene'

export class User extends Model {
  // ...

  static readonly geneConfig = defineGraphqlGeneConfig(User, {
    // Your config
  }
}
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
| `types`❔ | `Record<'Query' \| 'Mutation', Record<GraphQLFieldName, FieldConfig>>` - Allow extending the Query or Mutation types only. |

### Define Query/Mutation inside your model

#### *src/models/Prospect/Prospect.model.ts*

```ts
import type { InferAttributes, InferCreationAttributes } from 'sequelize'
import { Model, Table, Column, Unique, AllowNull, DataType } from 'sequelize-typescript'
import { defineGraphqlGeneConfig, defineField } from 'graphql-gene'
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

  static readonly geneConfig = defineGraphqlGeneConfig(Prospect, {
    types: {
      Mutation: {
        registerProspect: defineField({
          args: { email: 'String!', locale: 'String' },
          returnType: 'MessageOutput!',

          resolver: async ({ args }) => {
            // `args` type is inferred from the GraphQL definition above
            // { email: string; locale: string | null | undefined }
            const { email, locale } = args

            if (!isEmail(email)) {
              // The return type is deeply inferred from the `MessageOutput` definition.
              // For instance, the `type` value must be `'info' | 'success' | 'warning' | 'error'`.
              return { type: 'error' as const, text: 'Invalid email' }
            }
            // No need to await
            Prospect.create({ email, language: locale })
            return { type: 'success' as const }
          },
        }),
      },
    },
  })
}

export const MessageOutput = {
  type: 'MessageTypeEnum!',
  text: 'String',
} as const

export const MessageTypeEnum = ['info', 'success', 'warning', 'error'] as const
```

### Define alias for specific scope

#### *src/models/graphqlTypes.ts*

```ts
export * from './models'

// Export the alias for typing
export { User as AuthenticatedUser } from '../models/User/User.model'
```

#### *src/models/User/User.model.ts*

```ts
export
@Table
class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {

  // ...

  static readonly geneConfig = defineGraphqlGeneConfig(User, {
    include: ['id', 'username'],

    aliases: {
      AuthenticatedUser: {
        include: ['id', 'email', 'username', 'role', 'address', 'orders'],
        // The directive could throw an `Unauthorized` error if the token
        // from the `Authorization` header is not authorized. It could
        // also be used to return data only to users with specific roles.
        directives: [authenticationDirective({ role: null })],
      },
    },

    types: {
      Query: {
        me: {
          returnType: 'AuthenticatedUser',
          // Assuming `context.authenticatedUser` is defined in `authenticationDirective`
          resolver: ({ context }) => context.authenticatedUser,
        },
      },
    },
  })
}
```

<br>

## Available plugins

- [`@graphql-gene/plugin-sequelize`](https://github.com/accesimpot/graphql-gene/tree/main/packages/plugin-sequelize#readme) for [Sequelize](https://sequelize.org)

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
