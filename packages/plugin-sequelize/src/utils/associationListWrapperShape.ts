import {
  type GraphQLOutputType,
  type GraphQLResolveInfo,
  GraphQLObjectType,
  type SelectionSetNode,
  getNamedType,
  isListType,
} from 'graphql'
import { lookDeeper } from 'graphql-lookahead'
import { GENE_ASSOCIATION_LIST_ITEMS_FIELD } from './associationListRegistry'

/** Duck-type Gene wrappers: `{ count, items: [T!]! }`. */
export function isAssociationListWrapperOutputType(type: GraphQLOutputType): boolean {
  const named = getNamedType(type)
  if (!(named instanceof GraphQLObjectType)) return false

  const fields = named.getFields()
  return !!(fields.count && fields.items && isListType(fields.items.type))
}

export function scanAssociationWrapperFacets(
  info: GraphQLResolveInfo,
  wrapperGraphqlTypeName: string,
  selectionSet: SelectionSetNode
): { hasItems: boolean; hasCount: boolean } {
  const flags = { hasItems: false, hasCount: false }
  lookDeeper({
    info,
    depth: 1,
    selectionSet,
    state: {},
    type: wrapperGraphqlTypeName,
    next: details => {
      if (details.field === GENE_ASSOCIATION_LIST_ITEMS_FIELD) flags.hasItems = true
      if (details.field === 'count') flags.hasCount = true
      return {}
    },
  })
  return flags
}
