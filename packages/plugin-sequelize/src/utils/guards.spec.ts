import { describe, expect, it } from 'vitest'
import type { Association } from 'sequelize'
import { Model } from 'sequelize-typescript'
import {
  hasAssociationJoinColumns,
  isAssociationRecord,
  isModel,
  isPlainRecord,
  isSafeArray,
  isSequelizeModelClass,
  isSequelizeModelStatic,
} from './guards'

describe('guards', () => {
  describe('readAssociationsRaw path via isSequelizeModelClass', () => {
    it('returns false when walking the function prototype chain finds no associations descriptor', () => {
      function nakedFn() {}
      expect(isSequelizeModelClass(nakedFn)).toBe(false)
    })
  })

  describe('isAssociationRecord', () => {
    it('accepts plain objects and rejects arrays', () => {
      expect(isAssociationRecord({ a: {} as Association })).toBe(true)
      expect(isAssociationRecord([])).toBe(false)
      expect(isAssociationRecord(null)).toBe(false)
    })
  })

  describe('isModel', () => {
    it('is false for plain objects and non-Model constructors', () => {
      expect(isModel({})).toBe(false)
      expect(isModel(new Date())).toBe(false)
    })
  })

  describe('isPlainRecord', () => {
    it('matches non-null objects excluding arrays', () => {
      expect(isPlainRecord({})).toBe(true)
      expect(isPlainRecord([])).toBe(false)
      expect(isPlainRecord(null)).toBe(false)
    })
  })

  describe('isSafeArray', () => {
    it('is true only for arrays', () => {
      expect(isSafeArray([])).toBe(true)
      expect(isSafeArray({})).toBe(false)
    })
  })

  describe('hasAssociationJoinColumns', () => {
    it('narrows when foreignKey and sourceKey are strings', () => {
      const ok = { foreignKey: 'parentId', sourceKey: 'id' } as unknown as Association
      expect(hasAssociationJoinColumns(ok)).toBe(true)

      const bad = { foreignKey: 1, sourceKey: 'id' } as unknown as Association
      expect(hasAssociationJoinColumns(bad)).toBe(false)
    })
  })

  describe('isSequelizeModelStatic', () => {
    it('requires findAll and count callables', () => {
      class M extends Model {}
      expect(isSequelizeModelStatic(M)).toBe(true)
      expect(isSequelizeModelStatic(() => {})).toBe(false)
      expect(isSequelizeModelStatic(null)).toBe(false)
    })
  })
})
