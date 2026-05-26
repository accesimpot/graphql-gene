import { describe, expect, it } from 'vitest'
import type { Association } from 'sequelize'
import { Model } from 'sequelize-typescript'
import {
  hasAssociationJoinColumns,
  isModel,
  isModelStatic,
  isModelStaticWithAssociations,
  isPlainRecord,
  isSafeArray,
} from './guards'

function withAssociationsBag(ctor: typeof Model, associations: Record<string, Association> = {}) {
  Object.defineProperty(ctor, 'associations', { value: associations, configurable: true })
}

describe('guards', () => {
  describe('isModelStatic', () => {
    it('is true for sequelize-typescript model classes', () => {
      class M extends Model {}
      expect(isModelStatic(M)).toBe(true)
    })

    it('is false for ordinary functions and non-functions', () => {
      function nakedFn() {}
      expect(isModelStatic(nakedFn)).toBe(false)
      expect(isModelStatic(() => {})).toBe(false)
      expect(isModelStatic(null)).toBe(false)
    })
  })

  describe('isModelStaticWithAssociations', () => {
    it('is false when the constructor chain has no associations bag', () => {
      function nakedFn() {}
      expect(isModelStaticWithAssociations(nakedFn)).toBe(false)
    })

    it('is true when the constructor exposes a plain associations record', () => {
      class M extends Model {}
      withAssociationsBag(M)
      expect(isModelStaticWithAssociations(M)).toBe(true)
    })

    it('is false when associations is present but not a plain record', () => {
      class M extends Model {}
      Object.defineProperty(M, 'associations', { value: [], configurable: true })
      expect(isModelStatic(M)).toBe(true)
      expect(isModelStaticWithAssociations(M)).toBe(false)
    })
  })

  describe('isModel', () => {
    it('is false for plain objects and non-model instances', () => {
      expect(isModel({})).toBe(false)
      expect(isModel(new Date())).toBe(false)
    })

    it('is true for instances whose constructor has an associations bag', () => {
      class M extends Model {}
      withAssociationsBag(M)
      const row = Object.create(M.prototype) as Model
      expect(isModel(row)).toBe(true)
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
})
