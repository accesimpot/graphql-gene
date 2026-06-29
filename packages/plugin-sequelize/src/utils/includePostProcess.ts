import type { Model as SequelizeModel, ModelStatic } from 'sequelize'
import type { DefaultResolverIncludeOptions } from '../types'
import { isGeneAssociationListWrapperAssociation } from './associationListRegistry'
import { isModelStatic } from './guards'

/** Sequelize include rows added for parent hydration (lookahead / findOptions); do not strip. */
export const GENE_HYDRATION_INCLUDE_KEY = '__geneHydrationInclude'

export function isGeneHydrationInclude(
  include: DefaultResolverIncludeOptions | undefined
): boolean {
  return !!include && Reflect.get(include, GENE_HYDRATION_INCLUDE_KEY) === true
}

export function markGeneHydrationInclude(
  include: DefaultResolverIncludeOptions
): DefaultResolverIncludeOptions {
  Reflect.set(include, GENE_HYDRATION_INCLUDE_KEY, true)
  return include
}

/** Parent-fetch hydration only needs the association rows; facet resolvers own nested includes. */
export function shallowGeneHydrationIncludes(
  includes: DefaultResolverIncludeOptions[] | undefined
): void {
  if (!includes?.length) return

  for (const inc of includes) {
    if (isGeneHydrationInclude(inc)) {
      delete inc.include
      continue
    }

    if (inc.include?.length) {
      shallowGeneHydrationIncludes(inc.include)
    }
  }
}

/**
 * Removes Sequelize eager includes for Gene association-list wrapper fields (`{ count, items }`).
 * Those associations are resolved by facet queries, not parent `findOne` / `findAll` includes.
 *
 * GraphQL type names match Sequelize model names (the plugin convention).
 */
export function stripAssociationListWrapperIncludes(
  parentModel: ModelStatic<SequelizeModel>,
  includes: DefaultResolverIncludeOptions[] | undefined,
  parentGraphqlType = parentModel.name
): void {
  if (!includes?.length) return

  for (let i = includes.length - 1; i >= 0; i--) {
    const inc = includes[i]
    const associationName = typeof inc?.association === 'string' ? inc?.association : undefined

    if (
      associationName &&
      isGeneAssociationListWrapperAssociation(parentGraphqlType, associationName) &&
      !isGeneHydrationInclude(inc)
    ) {
      includes.splice(i, 1)
      continue
    }

    const assoc = associationName ? parentModel.associations?.[associationName] : undefined
    const target =
      assoc && 'target' in assoc && isModelStatic(assoc.target) ? assoc.target : undefined

    if (target && inc.include?.length) {
      stripAssociationListWrapperIncludes(target, inc.include, target.name)
    }
  }
}
