import type { GeneAssociationList } from 'graphql-gene'
import type { Model, ModelStatic } from 'sequelize'
import { isModel, isSafeArray } from './utils/guards'
import { resolvePolymorphicHubLoadedRows } from './utils/polymorphic'

export type HydratedGqlSource<T extends Model = Model> = T & {
  [field: string]: unknown
}

function isMultiAssociationField(parent: Model, associationField: string): boolean {
  const ctor = parent.constructor as ModelStatic<Model>
  const assoc = ctor.associations?.[associationField]
  return !!assoc?.isMultiAssociation
}

function associationListFromPreload(
  parent: Model,
  associationField: string
): GeneAssociationList<Model> | null {
  const raw = Reflect.get(parent, associationField)
  if (!isSafeArray(raw)) return null

  const items = resolvePolymorphicHubLoadedRows(raw.slice()) as Model[]
  return { count: items.length, items }
}

/**
 * Presents a Sequelize row as the GraphQL-shaped resolver `source`: multi associations become
 * {@link GeneAssociationList} values when preloaded on the parent, otherwise `null`.
 */
export function hydrateGqlSource<T extends Model>(parent: T): HydratedGqlSource<T> {
  return new Proxy(parent, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && isMultiAssociationField(target, prop)) {
        return associationListFromPreload(target, prop)
      }

      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as HydratedGqlSource<T>
}

export function toResolverSource(parent: unknown) {
  return isModel(parent) ? hydrateGqlSource(parent) : parent
}
