# `@graphql-gene/plugin-sequelize`

[![TypeScript][typescript-src]][typescript-href]
[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Generates automatically an executable schema out of your Sequelize models.

See `graphql-gene` [README](https://github.com/accesimpot/graphql-gene#readme) for details.

## Include dependencies

`findOptions` hooks (on a type, a field, or a directive) can declare Sequelize associations the field needs even when the client did not select them:

```ts
import { ensureInclude, ensureIncludeBehind, getQueryIncludeOf } from '@graphql-gene/plugin-sequelize'

findOptions(details) {
  ensureInclude(details, 'items')
}

findOptions(details) {
  ensureIncludeBehind(details, 'permissions.roles', 'Viewer', { at: 'root' })
}
```

`ensureInclude` adds the dot-separated path under the include passed to that hook. `ensureIncludeBehind` adds it under an ancestor of GraphQL type `Viewer`. `at: 'nearest'` (the default) uses the closest selected ancestor of that type. `at: 'root'` uses the record `getQueryIncludeOf(info, 'Viewer')` is loading, including a virtual root when `Viewer` is not selected. Loaders that cache one record, such as a viewer, should use `at: 'root'`.

Repeated requests for the same association on one include are merged: `required: true` stays on, and a new hydration include is not downgraded. If that association already has `where`, `limit`, or `offset`, the helper throws instead of reusing the filtered row. Hooks must not have side effects outside the include they are editing, because every include collection runs them.

A cached load can collect every dependency in the operation before the first query:

```ts
function getViewer(info: GraphQLResolveInfo) {
  viewerCache ??= Viewer.findOne({
    ...getQueryIncludeOf(info, 'Viewer', { lookFromOperationRoot: true }),
    where: { id: currentViewerId },
  })
  return viewerCache
}
```

<br>

❤️ Provided by [Elio Tax](https://www.elio-tax.com?utm_source=github&utm_medium=referral&utm_campaign=graphql-gene-plugin-sequelize)'s engineering team

| <a href="https://www.elio-tax.com?utm_source=github&utm_medium=referral&utm_campaign=graphql-gene-plugin-sequelize" target="_blank"><img width="265" alt="Elio Tax" src="https://github.com/user-attachments/assets/b3ae1fcb-2242-4e68-a36e-671fe39c1174"></a> |
| :---: |
| 🇨🇦 _Online tax filing service_ 🇨🇦 |

<!-- Badges -->

[typescript-src]: https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg
[typescript-href]: http://www.typescriptlang.org/
[npm-version-src]: https://img.shields.io/npm/v/@graphql-gene/plugin-sequelize/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@graphql-gene/plugin-sequelize
[npm-downloads-src]: https://img.shields.io/npm/dm/@graphql-gene/plugin-sequelize.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npmjs.com/package/@graphql-gene/plugin-sequelize
[license-src]: https://img.shields.io/npm/l/@graphql-gene/plugin-sequelize.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@graphql-gene/plugin-sequelize
