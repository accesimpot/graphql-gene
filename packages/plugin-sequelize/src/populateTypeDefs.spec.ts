import { Column, DataType, Model, Sequelize, Table } from 'sequelize-typescript'
import { getDefaultTypeDefLinesObject } from 'graphql-gene'
import { populateTypeDefs } from './populateTypeDefs'
import { getGeneAssociationListWrapperTypeName } from './utils/associationListRegistry'

describe('populateTypeDefs BelongsToMany associations', () => {
  let sequelize: Sequelize

  beforeAll(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })

    @Table
    class B2MParent extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number
    }

    @Table
    class B2MTag extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number
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
    await sequelize.sync()
  })

  afterAll(async () => {
    await sequelize.close()
  })

  it('registers list wrapper GraphQL types for BelongsToMany association fields', () => {
    const typeDefLines = {
      B2MParent: {
        ...getDefaultTypeDefLinesObject(),
        lines: {},
      },
    }

    const B2MParent = sequelize.models.B2MParent

    populateTypeDefs({
      typeDefLines,
      model: B2MParent,
      typeName: 'B2MParent',
      isFieldIncluded: () => true,
      schemaOptions: { types: {} },
    })

    const wrapperName = getGeneAssociationListWrapperTypeName('B2MParent', 'tags')
    expect(typeDefLines.B2MParent.lines.tags?.typeDef).toBe(wrapperName)
    expect(typeDefLines[wrapperName]?.lines.count?.typeDef).toBe('Int!')
    expect(typeDefLines[wrapperName]?.lines.items?.typeDef).toBe('[B2MTag!]!')
  })
})
