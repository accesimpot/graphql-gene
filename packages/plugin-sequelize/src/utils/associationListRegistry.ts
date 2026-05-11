/** Row facet field name on Gene association list wrappers (`count` + `items`). */
export const GENE_ASSOCIATION_LIST_ITEMS_FIELD = 'items'

export type GeneAssociationListWrapperMeta = {
  parentGraphqlType: string
  associationField: string
  targetGraphqlType: string
}

const wrapperMetas = new Map<string, GeneAssociationListWrapperMeta>()

export function getGeneAssociationListWrapperTypeName(parentGraphqlType: string, associationField: string) {
  const cap = (s: string) => (s.length ? `${s[0].toUpperCase()}${s.slice(1)}` : s)
  return `${parentGraphqlType}${cap(associationField)}GeneAssociationListResult`
}

export function registerGeneAssociationListWrapper(typeName: string, meta: GeneAssociationListWrapperMeta) {
  wrapperMetas.set(typeName, meta)
}

export function getGeneAssociationListWrapperMeta(typeName: string) {
  return wrapperMetas.get(typeName)
}

export function isGeneAssociationListWrapperGraphqlType(typeName: string) {
  return wrapperMetas.has(typeName)
}
