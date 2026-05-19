import type { Model as SequelizeModel, ModelStatic } from 'sequelize'
import type { DefaultResolverIncludeOptions } from '../types'

/**
 * Sequelize + SQLite fails on some deep eager loads (`SQLITE_ERROR: no such column: items.productId`).
 * - Drop root `Order.items` so line items load via association-list facet queries.
 * - Drop eager `ProductGroup.products` (wrapper; facet resolvers load it).
 */
export function applySqliteNestedHasManySeparate(
  parentModel: ModelStatic<SequelizeModel>,
  includes: DefaultResolverIncludeOptions[] | undefined,
  depth = 0
): void {
  const dialect = parentModel.sequelize?.getDialect?.()
  if (dialect && dialect !== 'sqlite') return
  if (!includes?.length) return

  if (depth === 0 && parentModel.name === 'Order') {
    for (let i = includes.length - 1; i >= 0; i--) {
      if (includes[i]?.association === 'items') {
        includes.splice(i, 1)
      }
    }
    if (!includes.length) return
  }

  for (let i = includes.length - 1; i >= 0; i--) {
    const inc = includes[i]!
    const name = inc.association as string | undefined
    const assoc = name ? parentModel.associations?.[name] : undefined

    const target =
      assoc && 'target' in assoc
        ? (assoc as { target?: ModelStatic<SequelizeModel> }).target
        : undefined

    if (
      parentModel.name === 'ProductGroup' &&
      name === 'products' &&
      assoc?.associationType === 'HasMany'
    ) {
      includes.splice(i, 1)
      continue
    }

    if (target && inc.include?.length) {
      applySqliteNestedHasManySeparate(target, inc.include, depth + 1)
    }
  }
}
