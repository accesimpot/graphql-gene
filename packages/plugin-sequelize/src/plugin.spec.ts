import { Column, DataType, Model, Sequelize, Table } from 'sequelize-typescript'
import { plugin } from './plugin'

describe('pluginSequelize', () => {
  it('throws when the given Sequelize instance has no registered model', () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })

    expect(() => plugin({ sequelize })).toThrow(/no registered model/)
  })

  it('accepts a Sequelize instance with registered models', () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })

    @Table
    class RegisteredModel extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number
    }
    sequelize.addModels([RegisteredModel])

    expect(plugin({ sequelize }).isMatching(RegisteredModel)).toBe(true)
  })

  it('can be created without options', () => {
    expect(plugin().isMatching({})).toBe(false)
  })
})
