import {
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Sequelize,
  Table,
} from 'sequelize-typescript'
import {
  getDefaultTypeDefLinesObject,
  getWhereOptionsInputName,
  type TypeDefLines,
} from 'graphql-gene'
import { populateTypeDefs } from './populateTypeDefs'
import { getGeneAssociationListWrapperTypeName } from './utils/associationListRegistry'

describe('populateTypeDefs initialization', () => {
  it('throws when the model is not registered with a Sequelize instance', () => {
    @Table
    class UninitializedModel extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number
    }

    const typeDefLines: TypeDefLines = {
      UninitializedModel: {
        ...getDefaultTypeDefLinesObject(),
        lines: {},
      },
    }

    expect(() =>
      populateTypeDefs({
        typeDefLines,
        model: UninitializedModel,
        typeName: 'UninitializedModel',
        isFieldIncluded: () => true,
        schemaOptions: { types: {} },
      })
    ).toThrow(/not initialized/)
  })
})

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

describe('populateTypeDefs nested multi-association where inputs', () => {
  let sequelize: Sequelize

  beforeAll(async () => {
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })

    @Table
    class NestLeaf extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number

      @Column(DataType.STRING)
      declare label: string

      @ForeignKey(() => NestBranch)
      @Column(DataType.INTEGER)
      declare branchId: number
    }

    @Table
    class NestBranch extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number

      @Column(DataType.STRING)
      declare name: string

      @ForeignKey(() => NestRoot)
      @Column(DataType.INTEGER)
      declare rootId: number

      @HasMany(() => NestLeaf)
      declare leaves: NestLeaf[]
    }

    @Table
    class NestRoot extends Model {
      @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
      declare id: number

      @HasMany(() => NestBranch)
      declare branches: NestBranch[]
    }

    sequelize.addModels([NestLeaf, NestBranch, NestRoot])
    await sequelize.sync()
  })

  afterAll(async () => {
    await sequelize.close()
  })

  it('derives nested multi-association where inputs from the target type, not the wrapper', () => {
    const typeDefLines: TypeDefLines = {}
    const hooks: (() => void)[] = []

    // Populate all three models (order matters for the bug: the parent that *nests* the
    // `branches.leaves` association is populated before the branch that owns it).
    for (const typeName of ['NestRoot', 'NestBranch', 'NestLeaf']) {
      const { afterTypeDefHooks } = populateTypeDefs({
        typeDefLines,
        model: sequelize.models[typeName],
        typeName,
        isFieldIncluded: () => true,
        schemaOptions: { types: {} },
      })
      hooks.push(...afterTypeDefHooks)
    }
    hooks.forEach(hook => hook())

    // `NestBranch.leaves` is a multi association reached both directly and nested under
    // `NestRoot.branches`. Its where input must reflect `NestLeaf` scalars.
    const leavesWhereInput = getWhereOptionsInputName('NestBranch', 'leaves')
    const lines = typeDefLines[leavesWhereInput].lines

    expect(lines.label?.typeDef).toBe('GeneOperatorStringInput')
    // Wrapper facets must never leak into a filter input.
    expect('count' in lines).toBe(false)
    expect('items' in lines).toBe(false)

    // The nesting parent references the canonical where input instead of a wrapper-derived one.
    const branchesWhereInput = getWhereOptionsInputName('NestRoot', 'branches')
    expect(typeDefLines[branchesWhereInput].lines.leaves?.typeDef).toBe(leavesWhereInput)
  })
})
