/** Row facet field name on Gene association list wrappers (`count` + `items`). */
export const GENE_ASSOCIATION_LIST_ITEMS_FIELD = 'items'

export type GeneAssociationListWrapperMeta = {
  parentGraphqlType: string
  associationField: string
  targetGraphqlType: string
}

/**
 * Wrapper GraphQL object type name → associations metadata.
 *
 * Keys are **wrapper type names** from {@link getGeneAssociationListWrapperTypeName}, not parent
 * types. One parent GraphQL type may therefore register **many** wrappers (one per multi
 * association field name).
 */
const wrapperMetas = new Map<string, GeneAssociationListWrapperMeta>()

export function getGeneAssociationListWrapperTypeName(
  parentGraphqlType: string,
  associationField: string
) {
  const cap = (s: string) => (s.length ? `${s[0].toUpperCase()}${s.slice(1)}` : s)
  return `${parentGraphqlType}${cap(associationField)}GeneAssociationListResult`
}

function metaKeysEqual(a: GeneAssociationListWrapperMeta, b: GeneAssociationListWrapperMeta) {
  return (
    a.parentGraphqlType === b.parentGraphqlType &&
    a.associationField === b.associationField &&
    a.targetGraphqlType === b.targetGraphqlType
  )
}

export function registerGeneAssociationListWrapper(
  typeName: string,
  meta: GeneAssociationListWrapperMeta
) {
  const existing = wrapperMetas.get(typeName)
  if (existing && !metaKeysEqual(existing, meta)) {
    throw new Error(
      `Gene association list wrapper name collision on "${typeName}": already registered as ${JSON.stringify(existing)}, attempted ${JSON.stringify(meta)}.`
    )
  }
  wrapperMetas.set(typeName, meta)
}

export function getGeneAssociationListWrapperMeta(typeName: string) {
  return wrapperMetas.get(typeName)
}

export function isGeneAssociationListWrapperGraphqlType(typeName: string) {
  return wrapperMetas.has(typeName)
}
