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

/** Memory SQLite parent ↔ tags BelongsToMany for association-list wrapper tests. */
export async function createUnitBelongsToManySqlite() {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  })

  @Table
  class B2MParent extends Model {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number
  }

  @Table
  class B2MTag extends Model {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number

    @Column(DataType.STRING)
    declare label: string
  }

  @Table
  class B2MParentTag extends Model {
    @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
    declare id: number

    @Column(DataType.INTEGER)
    declare parentId: number

    @Column(DataType.INTEGER)
    declare tagId: number
  }

  sequelize.addModels([B2MParent, B2MTag, B2MParentTag])

  B2MParent.belongsToMany(B2MTag, {
    through: B2MParentTag,
    foreignKey: 'parentId',
    otherKey: 'tagId',
    as: 'tags',
  })
  B2MTag.belongsToMany(B2MParent, {
    through: B2MParentTag,
    foreignKey: 'tagId',
    otherKey: 'parentId',
  })

  await sequelize.sync()

  return { sequelize, B2MParent, B2MTag }
}
