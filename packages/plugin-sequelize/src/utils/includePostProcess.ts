import type { Model as SequelizeModel, ModelStatic } from 'sequelize'
import type { DefaultResolverIncludeOptions } from '../types'
import { isGeneAssociationListWrapperAssociation } from './associationListRegistry'
import { isModelStatic } from './guards'

/**
 * Symbol-like property on a Sequelize `include` row marking it as a **hydration include**.
 *
 * ## What is a hydration include?
 *
 * GraphQL list associations (`{ count, items }` wrappers) are normally resolved by facet
 * resolvers with their own queries. Resolver `source` is still a Sequelize instance, but
 * {@link hydrateGqlSource} can expose preloaded multi-associations as
 * {@link GeneAssociationList} values (e.g. `source.items?.items`) when the parent
 * `findOne` / `findAll` already eager-loaded the raw rows.
 *
 * A hydration include is the Sequelize `include: [{ association: 'items' }]` row added
 * *only* for that parent preload — typically because lookahead saw a sibling field that
 * reads the association (e.g. `itemTotalQuantity`), or because `findOptions` on a field/type
 * declared the dependency explicitly.
 *
 * ## Why mark it?
 *
 * {@link stripAssociationListWrapperIncludes} removes wrapper associations from parent
 * fetches so facet resolvers stay authoritative when the client selects `items { … }`.
 * Without this marker, hydration includes would be stripped too and `source` would see
 * no preloaded data. Marked rows are kept; {@link shallowGeneHydrationIncludes} then
 * drops their nested `include` trees so the parent fetch stays shallow (facet resolvers
 * still own nested loading when the wrapper field is selected).
 */
export const GENE_HYDRATION_INCLUDE_KEY = '__geneHydrationInclude'

/** Whether `include` was tagged with {@link GENE_HYDRATION_INCLUDE_KEY}. */
export function isGeneHydrationInclude(
  include: DefaultResolverIncludeOptions | undefined
): boolean {
  return !!include && Reflect.get(include, GENE_HYDRATION_INCLUDE_KEY) === true
}

/**
 * Tags `include` as a hydration include so parent fetches keep the association while
 * {@link stripAssociationListWrapperIncludes} runs. Returns the same object for chaining.
 */
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
