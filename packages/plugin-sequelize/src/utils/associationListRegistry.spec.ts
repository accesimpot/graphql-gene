import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('associationListRegistry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('builds a stable wrapper type name from parent type + association field', async () => {
    const { getGeneAssociationListWrapperTypeName } = await import('./associationListRegistry')

    expect(getGeneAssociationListWrapperTypeName('Order', 'items')).toBe(
      'OrderItemsGeneAssociationListResult'
    )
    expect(getGeneAssociationListWrapperTypeName('Page', 'blocks')).toBe(
      'PageBlocksGeneAssociationListResult'
    )
  })

  it('registers and reads wrapper meta and answers membership', async () => {
    const {
      registerGeneAssociationListWrapper,
      getGeneAssociationListWrapperMeta,
      isGeneAssociationListWrapperGraphqlType,
    } = await import('./associationListRegistry')

    const meta = {
      parentGraphqlType: 'Order',
      associationField: 'items',
      targetGraphqlType: 'OrderItem',
    }
    registerGeneAssociationListWrapper('OrderItemsGeneAssociationListResult', meta)

    expect(getGeneAssociationListWrapperMeta('OrderItemsGeneAssociationListResult')).toEqual(meta)
    expect(isGeneAssociationListWrapperGraphqlType('OrderItemsGeneAssociationListResult')).toBe(
      true
    )
    expect(isGeneAssociationListWrapperGraphqlType('Missing')).toBe(false)
    expect(getGeneAssociationListWrapperMeta('Missing')).toBeUndefined()
  })

  it('allows idempotent registration with identical meta', async () => {
    const { registerGeneAssociationListWrapper, getGeneAssociationListWrapperMeta } = await import(
      './associationListRegistry'
    )

    const meta = {
      parentGraphqlType: 'A',
      associationField: 'lines',
      targetGraphqlType: 'Line',
    }
    registerGeneAssociationListWrapper('WrapperDupTest', meta)
    registerGeneAssociationListWrapper('WrapperDupTest', meta)

    expect(getGeneAssociationListWrapperMeta('WrapperDupTest')).toEqual(meta)
  })

  it('throws when reusing a wrapper type name with conflicting meta', async () => {
    const { registerGeneAssociationListWrapper } = await import('./associationListRegistry')

    registerGeneAssociationListWrapper('WrapperCollision', {
      parentGraphqlType: 'A',
      associationField: 'x',
      targetGraphqlType: 'T',
    })

    expect(() =>
      registerGeneAssociationListWrapper('WrapperCollision', {
        parentGraphqlType: 'B',
        associationField: 'x',
        targetGraphqlType: 'T',
      })
    ).toThrow(/collision/)
  })
})
