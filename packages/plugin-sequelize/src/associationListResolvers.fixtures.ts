import type { Model, ModelStatic } from 'sequelize'
import { DataTypes, Sequelize } from 'sequelize'

/** Memory SQLite models shared by association-list resolver unit tests (plain Sequelize, no decorators). */
export async function createUnitAssocSqlite(): Promise<{
  sequelize: Sequelize
  UnitParent: ModelStatic<Model>
  UnitChild: ModelStatic<Model>
}> {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  })

  const UnitParent = sequelize.define(
    'UnitParent',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
    },
    { timestamps: false, tableName: 'UnitParents' }
  )

  const UnitChild = sequelize.define(
    'UnitChild',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      parentId: DataTypes.INTEGER,
    },
    { timestamps: false, tableName: 'UnitChildren' }
  )

  UnitParent.hasMany(UnitChild, {
    foreignKey: 'parentId',
    sourceKey: 'id',
    as: 'items',
  })
  UnitChild.belongsTo(UnitParent, { foreignKey: 'parentId', constraints: false })

  await sequelize.sync()

  return { sequelize, UnitParent, UnitChild }
}
