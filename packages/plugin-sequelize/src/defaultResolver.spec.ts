import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'
import type { GraphQLResolveInfo } from 'graphql'
import type { DefaultResolverIncludeOptions } from './types'

const { getFieldFindOptions, getQueryInclude } = vi.hoisted(() => ({
  getFieldFindOptions: vi.fn(),
  getQueryInclude: vi.fn(),
}))

vi.mock('./utils', () => ({
  getFieldFindOptions,
  getQueryInclude,
}))

describe('defaultResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges deep-filter includes with lookahead includes for root list queries', async () => {
    const { defaultResolver } = await import('./defaultResolver')
    const stripSpy = vi.spyOn(
      await import('./utils/includePostProcess'),
      'stripAssociationListWrapperIncludes'
    )

    const deepFilterInclude: DefaultResolverIncludeOptions = {
      association: 'product',
      where: { name: { [Op.eq]: 'Fusion - Ocean Mist' } },
      required: true,
    }
    const lookaheadInclude: DefaultResolverIncludeOptions = {
      association: 'product',
    }

    getFieldFindOptions.mockReturnValue({
      where: {},
      include: [deepFilterInclude],
    })
    getQueryInclude.mockReturnValue({
      include: [lookaheadInclude],
    })

    const findAll = vi.fn().mockResolvedValue([])
    const model = {
      name: 'OrderItem',
      associations: {},
      findAll,
    }

    await defaultResolver({
      model,
      modelKey: 'OrderItem',
      config: { returnType: '[OrderItem!]!' },
      args: { where: { product: { name: { eq: 'Fusion - Ocean Mist' } } } },
      info: {} as GraphQLResolveInfo,
    })

    expect(findAll).toHaveBeenCalledOnce()
    const findOptions = findAll.mock.calls[0]?.[0] as { include: DefaultResolverIncludeOptions[] }

    expect(findOptions.include).toEqual([deepFilterInclude, lookaheadInclude])
    expect(stripSpy).toHaveBeenCalledWith(model, findOptions.include)
    stripSpy.mockRestore()
  })

  it('keeps lookahead-only includes when deep filters do not add any', async () => {
    const { defaultResolver } = await import('./defaultResolver')

    const lookaheadInclude: DefaultResolverIncludeOptions = {
      association: 'product',
    }

    getFieldFindOptions.mockReturnValue({ where: { quantity: { [Op.eq]: 3 } } })
    getQueryInclude.mockReturnValue({ include: [lookaheadInclude] })

    const findAll = vi.fn().mockResolvedValue([])
    const model = {
      name: 'OrderItem',
      associations: {},
      findAll,
    }

    await defaultResolver({
      model,
      modelKey: 'OrderItem',
      config: { returnType: '[OrderItem!]!' },
      args: { where: { quantity: { eq: 3 } } },
      info: {} as GraphQLResolveInfo,
    })

    const findOptions = findAll.mock.calls[0]?.[0] as { include: DefaultResolverIncludeOptions[] }
    expect(findOptions.include).toEqual([lookaheadInclude])
  })

  it('drops unstripped wrapper lookahead includes that are not hydration-marked', async () => {
    const { defaultResolver } = await import('./defaultResolver')
    const { registerGeneAssociationListWrapper } = await import('./utils/associationListRegistry')
    const { markFieldAsAssociation } = await import('./utils/associationMap')

    registerGeneAssociationListWrapper('OrderItemsGeneAssociationListResult', {
      parentGraphqlType: 'Order',
      associationField: 'items',
      targetGraphqlType: 'OrderItem',
    })
    markFieldAsAssociation('Order', 'items')

    const wrapperInclude: DefaultResolverIncludeOptions = {
      association: 'items',
      include: [{ association: 'product' }],
    }

    getFieldFindOptions.mockReturnValue({ where: { status: { [Op.eq]: 'paid' } } })
    getQueryInclude.mockReturnValue({ include: [wrapperInclude] })

    const findOne = vi.fn().mockResolvedValue(null)
    const model = {
      name: 'Order',
      associations: { items: { target: { name: 'OrderItem' } } },
      findOne,
    }

    await defaultResolver({
      model,
      modelKey: 'Order',
      config: { returnType: 'Order' },
      args: { where: { status: { eq: 'paid' } } },
      info: {} as GraphQLResolveInfo,
    })

    const findOptions = findOne.mock.calls[0]?.[0] as { include?: DefaultResolverIncludeOptions[] }
    expect(findOptions.include).toBeUndefined()
  })

  it('keeps hydration-marked wrapper includes after stripping', async () => {
    const { defaultResolver } = await import('./defaultResolver')
    const { markGeneHydrationInclude } = await import('./utils/includePostProcess')
    const { registerGeneAssociationListWrapper } = await import('./utils/associationListRegistry')
    const { markFieldAsAssociation } = await import('./utils/associationMap')

    registerGeneAssociationListWrapper('OrderItemsGeneAssociationListResult', {
      parentGraphqlType: 'Order',
      associationField: 'items',
      targetGraphqlType: 'OrderItem',
    })
    markFieldAsAssociation('Order', 'items')

    const hydrationInclude = markGeneHydrationInclude({ association: 'items' })

    getFieldFindOptions.mockReturnValue({ where: { status: { [Op.eq]: 'paid' } } })
    getQueryInclude.mockReturnValue({ include: [hydrationInclude] })

    const findOne = vi.fn().mockResolvedValue(null)
    const model = {
      name: 'Order',
      associations: { items: { target: { name: 'OrderItem' } } },
      findOne,
    }

    await defaultResolver({
      model,
      modelKey: 'Order',
      config: { returnType: 'Order' },
      args: { where: { status: { eq: 'paid' } } },
      info: {} as GraphQLResolveInfo,
    })

    const findOptions = findOne.mock.calls[0]?.[0] as { include: DefaultResolverIncludeOptions[] }
    expect(findOptions.include).toEqual([hydrationInclude])
  })
})
