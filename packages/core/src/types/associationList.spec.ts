import type { GeneAssociationList, GeneAssociationListFacet } from './associationList'

type Assert<T extends true> = T

type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

type _listShape = Assert<
  Equal<GeneAssociationList<{ id: number }>, { count: number; items: { id: number }[] }>
>
type _facetShape = Assert<
  Equal<GeneAssociationListFacet<{ id: number }>, { count?: number; items?: { id: number }[] }>
>

describe('GeneAssociationList types', () => {
  it('accepts wrapper payloads at runtime', () => {
    const list: GeneAssociationList<{ id: number }> = { count: 1, items: [{ id: 1 }] }
    const facet: GeneAssociationListFacet<{ id: number }> = { count: 1 }

    expect(list.items).toHaveLength(1)
    expect(facet.count).toBe(1)
  })
})
