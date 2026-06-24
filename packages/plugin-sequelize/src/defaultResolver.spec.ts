import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'
import type { GraphQLResolveInfo } from 'graphql'
import type { DefaultResolverIncludeOptions } from './types'

const { getFieldFindOptions, getQueryInclude, stripAssociationListWrapperIncludes } = vi.hoisted(
  () => ({
    getFieldFindOptions: vi.fn(),
    getQueryInclude: vi.fn(),
    stripAssociationListWrapperIncludes: vi.fn(),
  })
)

vi.mock('./utils', () => ({
  getFieldFindOptions,
  getQueryInclude,
}))

vi.mock('./utils/includePostProcess', () => ({
  stripAssociationListWrapperIncludes,
}))

describe('defaultResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges deep-filter includes with lookahead includes for root list queries', async () => {
    const { defaultResolver } = await import('./defaultResolver')

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
    expect(stripAssociationListWrapperIncludes).toHaveBeenCalledWith(model, findOptions.include)
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
})
