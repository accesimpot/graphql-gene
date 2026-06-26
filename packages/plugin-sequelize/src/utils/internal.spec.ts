import { describe, expect, it } from 'vitest'
import { Op } from 'sequelize'
import type { GeneSequelizeWhereOptions } from '../types'
import { markFieldAsAssociation } from './associationMap'
import { populateWhereOptions } from './internal'

describe('populateWhereOptions', () => {
  it('expands AND with nested attribute filters', () => {
    const state: GeneSequelizeWhereOptions = {}
    populateWhereOptions(
      {
        and: [{ quantity: { eq: 3 } }, { quantity: { eq: 1 } }],
      } as never,
      state
    )

    expect(Array.isArray(state[Op.and])).toBe(true)
    expect((state[Op.and] as GeneSequelizeWhereOptions[]).length).toBe(2)
    expect((state[Op.and] as GeneSequelizeWhereOptions[])[0]?.quantity).toEqual({ [Op.eq]: 3 })
  })

  it('maps attribute operators to Sequelize symbols', () => {
    const state: GeneSequelizeWhereOptions = {}
    populateWhereOptions(
      {
        name: { like: '%foo%' },
        qty: { lt: 10 },
        removed: { null: true },
      } as never,
      state
    )

    expect(state.name).toEqual({ [Op.like]: '%foo%' })
    expect(state.qty).toEqual({ [Op.lt]: 10 })
    expect(state.removed).toEqual({ [Op.is]: null })
  })

  it('turns one-level association predicates into required includes', () => {
    markFieldAsAssociation('DeepParent', 'child')

    const state: GeneSequelizeWhereOptions = {}
    const includes = []

    populateWhereOptions(
      {
        child: { label: { eq: 'match' } },
      } as never,
      state,
      {
        ownerGraphqlType: 'DeepParent',
        includes,
      }
    )

    expect(state).toEqual({})
    expect(includes).toEqual([
      {
        association: 'child',
        where: { label: { [Op.eq]: 'match' } },
        required: true,
      },
    ])
  })
})
