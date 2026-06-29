import { describe, expect, it } from 'vitest'
import { createUnitAssocSqlite } from './associationListResolvers.fixtures'
import { hydrateGqlSource } from './hydrateGqlSource'

describe('hydrateGqlSource', () => {
  it('maps preloaded HasMany rows to GeneAssociationList and null when not loaded', async () => {
    const { sequelize, UnitParent, UnitChild } = await createUnitAssocSqlite()

    try {
      const parent = await UnitParent.create({})
      await UnitChild.create({ parentId: parent.id })

      const { markFieldAsAssociation } = await import('./utils/associationMap')
      const { registerGeneAssociationListWrapper, getGeneAssociationListWrapperTypeName } =
        await import('./utils/associationListRegistry')

      const wrapperName = getGeneAssociationListWrapperTypeName('UnitParent', 'items')
      registerGeneAssociationListWrapper(wrapperName, {
        parentGraphqlType: 'UnitParent',
        associationField: 'items',
        targetGraphqlType: 'UnitChild',
      })
      markFieldAsAssociation('UnitParent', 'items')

      const bare = hydrateGqlSource(parent)
      expect(bare.items).toBeNull()

      const loaded = await UnitParent.findByPk(parent.id, { include: [{ association: 'items' }] })
      if (!loaded) throw new Error('missing parent')

      const hydrated = hydrateGqlSource(loaded)
      expect(hydrated.items).toEqual({
        count: 1,
        items: [expect.objectContaining({ id: expect.any(Number), parentId: parent.id })],
      })
      expect(hydrated.id).toBe(parent.id)
    } finally {
      await sequelize.close()
    }
  })
})
