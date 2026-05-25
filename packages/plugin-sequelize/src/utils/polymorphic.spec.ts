import { describe, expect, it } from 'vitest'
import { getAttributeByModelName } from './polymorphic'

describe('getAttributeByModelName', () => {
  it('lowercases the first character for Sequelize attribute naming', () => {
    expect(getAttributeByModelName('HeroBlock')).toBe('heroBlock')
    expect(getAttributeByModelName('A')).toBe('a')
  })
})
