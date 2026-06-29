import { describe, expect, it } from 'vitest'
import {
  GENE_HYDRATION_INCLUDE_KEY,
  isGeneHydrationInclude,
  markGeneHydrationInclude,
  shallowGeneHydrationIncludes,
  stripAssociationListWrapperIncludes,
} from './includePostProcess'
import { registerGeneAssociationListWrapper } from './associationListRegistry'
import { markFieldAsAssociation } from './associationMap'

describe('stripAssociationListWrapperIncludes', () => {
  it('removes wrapper association includes unless marked for hydration', () => {
    registerGeneAssociationListWrapper('OrderItemsGeneAssociationListResult', {
      parentGraphqlType: 'Order',
      associationField: 'items',
      targetGraphqlType: 'OrderItem',
    })
    markFieldAsAssociation('Order', 'items')

    const includes = [
      { association: 'items' },
      markGeneHydrationInclude({ association: 'items' }),
      { association: 'address' },
    ]

    stripAssociationListWrapperIncludes(
      {
        name: 'Order',
        associations: {
          items: { target: { name: 'OrderItem' } },
          address: { target: { name: 'Address' } },
        },
      } as never,
      includes
    )

    expect(includes).toHaveLength(2)
    expect(includes[0]).toEqual({ association: 'items', [GENE_HYDRATION_INCLUDE_KEY]: true })
    expect(includes[1]).toEqual({ association: 'address' })
    expect(isGeneHydrationInclude(includes[0])).toBe(true)
  })
})

describe('shallowGeneHydrationIncludes', () => {
  it('drops nested includes from hydration-marked wrapper rows only', () => {
    const includes = [
      markGeneHydrationInclude({
        association: 'items',
        include: [{ association: 'product' }],
      }),
      {
        association: 'address',
        include: [{ association: 'country' }],
      },
    ]

    shallowGeneHydrationIncludes(includes)

    expect(includes[0]).toEqual({ association: 'items', [GENE_HYDRATION_INCLUDE_KEY]: true })
    expect(includes[1]?.include).toEqual([{ association: 'country' }])
  })
})
