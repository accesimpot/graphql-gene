import 'reflect-metadata'
import { Column, DataType, Model, Sequelize, Table } from 'sequelize-typescript'

/** Memory SQLite models shared by association-list resolver unit tests. */
export async function createUnitAssocSqlite() {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  })

  @Table
  class UnitParent extends Model {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number
  }

  @Table
  class UnitChild extends Model {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number

    @Column(DataType.INTEGER)
    declare parentId: number
  }

  sequelize.addModels([UnitParent, UnitChild])

  UnitParent.hasMany(UnitChild, { foreignKey: 'parentId', sourceKey: 'id', as: 'items' })
  UnitChild.belongsTo(UnitParent, { foreignKey: 'parentId' })

  await sequelize.sync()

  return { sequelize, UnitParent, UnitChild }
}
