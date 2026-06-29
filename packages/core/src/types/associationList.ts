/** GraphQL HasMany association-list wrapper shape exposed on resolver `source`. */
export type GeneAssociationList<T> = {
  count: number
  items: T[]
}

/** Partial wrapper payload while association-list facets resolve independently. */
export type GeneAssociationListFacet<T> = {
  count?: number
  items?: T[]
}
