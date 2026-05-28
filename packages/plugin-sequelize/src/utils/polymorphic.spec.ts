import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelStatic } from 'sequelize-typescript'
import { getAttributeByModelName, hasHubColumn } from './polymorphic'

const SEQUELIZE_ATTRIBUTES_METADATA_KEY = 'sequelize:attributes'

function stubModelCtor(rawAttributes?: Record<string, unknown>): ModelStatic {
  function HubModel() {}
  HubModel.prototype = Object.create(null)
  if (rawAttributes) {
    Object.assign(HubModel, { rawAttributes })
  }
  return HubModel as unknown as ModelStatic
}

describe('getAttributeByModelName', () => {
  it('lowercases the first character for Sequelize attribute naming', () => {
    expect(getAttributeByModelName('HeroBlock')).toBe('heroBlock')
    expect(getAttributeByModelName('A')).toBe('a')
  })
})

describe('hasHubColumn', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads column keys from Sequelize rawAttributes on the model constructor', () => {
    const modelCtor = stubModelCtor({
      targetId: { type: 'INTEGER' },
      targetType: { type: 'STRING' },
    })

    vi.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined)

    expect(hasHubColumn(modelCtor, 'targetId')).toBe(true)
    expect(hasHubColumn(modelCtor, 'targetType')).toBe(true)
    expect(hasHubColumn(modelCtor, 'otherColumn')).toBe(false)
  })

  it('returns false when the constructor has no rawAttributes bag', () => {
    const modelCtor = stubModelCtor()

    vi.spyOn(Reflect, 'getMetadata').mockReturnValue(undefined)

    expect(hasHubColumn(modelCtor, 'targetId')).toBe(false)
  })

  it('reads column keys from sequelize-typescript reflect metadata on the prototype', () => {
    const modelCtor = stubModelCtor()

    vi.spyOn(Reflect, 'getMetadata').mockImplementation((key, target) => {
      if (key === SEQUELIZE_ATTRIBUTES_METADATA_KEY && target === modelCtor.prototype) {
        return { targetType: {} }
      }
      return undefined
    })

    expect(hasHubColumn(modelCtor, 'targetType')).toBe(true)
    expect(hasHubColumn(modelCtor, 'targetId')).toBe(false)
  })
})
