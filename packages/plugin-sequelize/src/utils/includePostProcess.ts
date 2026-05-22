import type { Model as SequelizeModel, ModelStatic } from 'sequelize'
import type { DefaultResolverIncludeOptions } from '../types'
import { isGeneAssociationListWrapperAssociation } from './associationListRegistry'
import { isSequelizeModelStatic } from './guards'

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
      isGeneAssociationListWrapperAssociation(parentGraphqlType, associationName)
    ) {
      includes.splice(i, 1)
      continue
    }

    const assoc = associationName ? parentModel.associations?.[associationName] : undefined
    const target =
      assoc && 'target' in assoc && isSequelizeModelStatic(assoc.target) ? assoc.target : undefined

    if (target && inc.include?.length) {
      stripAssociationListWrapperIncludes(target, inc.include, target.name)
    }
  }
}
