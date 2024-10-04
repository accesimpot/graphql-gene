# GraphQL Gene

[![TypeScript][typescript-src]][typescript-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Use `graphql-gene` to generate automatically an executable schema out of your ORM models.

<br>

❤️ Provided by [Accès Impôt](https://www.acces-impot.com)'s engineering team

| <a href="https://www.acces-impot.com" target="_blank"><img width="338" alt="Accès Impôt" src="https://github.com/user-attachments/assets/79aa6364-51d1-4482-b31e-680568d647f0"></a> |
| :---: |
| 🇨🇦 _Online tax declaration service_ 🇨🇦 |

<br>

## Table of contents

- [Highlights](#highlights)
- [Quick Setup](#quick-setup)
- [Basic usage](#basic-usage)
  - [Types](#types)
  - [Options](#options)
- [Advanced usage](#advanced-usage)
  - [Example: Sequelize with nested query filters](#example-sequelize-with-nested-query-filters)
  - [More examples in integration tests](#more-examples-in-integration-tests)
- [Playground](#playground)
- [Contribution](#contribution)

<br>

## Highlights

- ⚡️ Performant - Avoid querying nested database relationships if they are not requested.
- ...

<br>

## Quick Setup

Install the module:

```bash
# pnpm
pnpm add graphql-gene

# yarn
yarn add graphql-gene

# npm
npm i graphql-gene
```

<br>

## Basic usage

WORK IN PROGRESS

## Contribution

<details>
  <summary>Local development</summary>
  
  ```bash
  # Install dependencies
  pnpm install

  # Develop using the playground
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
