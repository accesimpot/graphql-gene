import { describe, expect, it } from 'vitest'
import {
  GENE_HYDRATION_INCLUDE_KEY,
  isGeneHydrationInclude,
  markGeneHydrationInclude,
  shallowGeneHydrationIncludes,
  stripAssociationListWrapperIncludes,
} from './includePostProcess'
import { ensureIncludePath } from './ensureInclude'
import type { DefaultResolverIncludeOptions } from '../types'
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

  it('keeps ensured nested includes and drops GraphQL-derived ones', () => {
    const items = markGeneHydrationInclude({
      association: 'items',
      include: [{ association: 'fromClient' }],
    })
    const root = { include: [items] }
    ensureIncludePath(root, 'items.product', {}, 'Order.itemTotalQuantity')

    shallowGeneHydrationIncludes(root.include)

    expect(items.include).toEqual([expect.objectContaining({ association: 'product' })])
  })

  it('keeps the whole ensured path through an include selected by the client', () => {
    const items = markGeneHydrationInclude({
      association: 'items',
      include: [{ association: 'product' }],
    })
    const root = { include: [items] }
    ensureIncludePath(root, 'items.product.group', {}, 'Order.itemTotalQuantity')

    shallowGeneHydrationIncludes(root.include)

    expect(items.include).toEqual([
      expect.objectContaining({
        association: 'product',
        include: [expect.objectContaining({ association: 'group' })],
      }),
    ])
  })
})

describe('ensured includes through wrapper post-processing', () => {
  const orderModel = {
    name: 'Order',
    associations: { items: { target: { name: 'OrderItem' } } },
  } as never

  const postProcess = (root: { include?: DefaultResolverIncludeOptions[] }) => {
    stripAssociationListWrapperIncludes(orderModel, root.include)
    shallowGeneHydrationIncludes(root.include)
  }

  it('keeps a manually pushed wrapper include that a later hook ensures', () => {
    registerGeneAssociationListWrapper('OrderItemsGeneAssociationListResult', {
      parentGraphqlType: 'Order',
      associationField: 'items',
      targetGraphqlType: 'OrderItem',
    })
    const root: { include?: DefaultResolverIncludeOptions[] } = {
      include: [{ association: 'items', include: [{ association: 'fromClient' }] }],
    }
    ensureIncludePath(root, 'items.product', {}, 'Order.itemTotalQuantity')

    postProcess(root)

    expect(root.include).toEqual([
      expect.objectContaining({
        association: 'items',
        include: [expect.objectContaining({ association: 'product' })],
      }),
    ])
  })

  it('keeps a wrapper include created by ensureInclude with its ensured children', () => {
    const root: { include?: DefaultResolverIncludeOptions[] } = {}
    ensureIncludePath(root, 'items.product', {}, 'Order.itemTotalQuantity')

    postProcess(root)

    expect(root.include).toEqual([
      expect.objectContaining({
        association: 'items',
        include: [expect.objectContaining({ association: 'product' })],
      }),
    ])
  })

  it('still drops a wrapper include that was ensured with hydrate: false', () => {
    const root: { include?: DefaultResolverIncludeOptions[] } = {
      include: [{ association: 'items' }],
    }
    ensureIncludePath(root, 'items', { hydrate: false }, 'Order.itemTotalQuantity')

    postProcess(root)

    expect(root.include).toEqual([])
  })
})
