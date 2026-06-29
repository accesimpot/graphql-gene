import './augmentGqlSource'
import type {
  CreationOptional,
  HasManyAddAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize'
import {
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript'
import type { GeneAssociationList, ResolveGqlSource } from 'graphql-gene'
import type { GeneAssociationListWrapperGqlType, ToGqlSource } from './toGqlSource'

type Assert<T extends true> = T

type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

@Table
class ToGqlSourceParent extends Model<
  InferAttributes<ToGqlSourceParent>,
  InferCreationAttributes<ToGqlSourceParent>
> {
  declare id: CreationOptional<number>

  @Column(DataType.STRING)
  declare title: string | null

  @HasMany(() => ToGqlSourceChild)
  declare questions: ToGqlSourceChild[] | null

  @ForeignKey(() => ToGqlSourceAddress)
  @Column(DataType.INTEGER)
  declare addressId: number | null

  @BelongsTo(() => ToGqlSourceAddress)
  declare address: ToGqlSourceAddress | null
}

@Table
class ToGqlSourceChild extends Model<
  InferAttributes<ToGqlSourceChild>,
  InferCreationAttributes<ToGqlSourceChild>
> {
  declare id: CreationOptional<number>

  @Column(DataType.INTEGER)
  declare allocatedTimeInMin: number | null
}

@Table
class ToGqlSourceAddress extends Model<
  InferAttributes<ToGqlSourceAddress>,
  InferCreationAttributes<ToGqlSourceAddress>
> {
  declare id: CreationOptional<number>

  @Column(DataType.STRING)
  declare city: string | null
}

@Table
class ToGqlSourceTag extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number

  @Column(DataType.STRING)
  declare label: string | null
}

@Table
class ToGqlSourceBelongsToManyParent extends Model {
  @Column({ type: DataType.INTEGER, primaryKey: true, autoIncrement: true })
  declare id: number

  @BelongsToMany(() => ToGqlSourceTag, { through: 'ToGqlSourceParentTags' })
  declare tags: CreationOptional<ToGqlSourceTag[]>
  declare addTag: HasManyAddAssociationMixin<ToGqlSourceTag, number>
}

declare module 'graphql-gene/schema' {
  export interface GeneSchema {
    ToGqlSourceParent: typeof ToGqlSourceParent
    ToGqlSourceChild: typeof ToGqlSourceChild
    ToGqlSourceAddress: typeof ToGqlSourceAddress
    ToGqlSourceBelongsToManyParent: typeof ToGqlSourceBelongsToManyParent
    ToGqlSourceTag: typeof ToGqlSourceTag
  }
}

type ParentSource = ToGqlSource<typeof ToGqlSourceParent, 'ToGqlSourceParent'>
type ChildSource = ToGqlSource<typeof ToGqlSourceChild, 'ToGqlSourceChild'>
type TagSource = ToGqlSource<typeof ToGqlSourceTag, 'ToGqlSourceTag'>
type BelongsToManyParentSource = ToGqlSource<
  typeof ToGqlSourceBelongsToManyParent,
  'ToGqlSourceBelongsToManyParent'
>

type _wrapperGqlTypeName = Assert<
  Equal<
    GeneAssociationListWrapperGqlType<'ToGqlSourceParent', 'questions'>,
    'ToGqlSourceParentQuestionsGeneAssociationListResult'
  >
>
type _scalarFields = Assert<Equal<Pick<ParentSource, 'id' | 'title'>, Pick<ToGqlSourceParent, 'id' | 'title'>>>
type _hasManyField = Assert<
  ParentSource['questions'] extends GeneAssociationList<ChildSource> | null ? true : false
>
type _belongsToField = Assert<
  ParentSource['address'] extends ToGqlSource<typeof ToGqlSourceAddress> | null ? true : false
>
type _belongsToManyField = Assert<
  BelongsToManyParentSource['tags'] extends GeneAssociationList<TagSource> ? true : false
>
type _mixinExcluded = Assert<'addTag' extends keyof ParentSource ? false : true>
type _extendTypesSource = Assert<
  Equal<ResolveGqlSource<typeof ToGqlSourceParent, 'ToGqlSourceParent'>, ParentSource>
>

describe('ToGqlSource', () => {
  it('exports GeneAssociationList-compatible HasMany and BelongsTo shapes', () => {
    const parent: ParentSource = {
      id: 1,
      title: 'Exam',
      questions: {
        count: 2,
        items: [{ id: 1, allocatedTimeInMin: 10 }, { id: 2, allocatedTimeInMin: 20 }],
      },
      addressId: 3,
      address: { id: 3, city: 'Paris' },
    }

    const totalDuration = parent.questions?.items.reduce(
      (sum, question) => sum + (question.allocatedTimeInMin ?? 0),
      0
    )

    expect(totalDuration).toBe(30)
    expect(parent.address?.city).toBe('Paris')
  })

  it('types BelongsToMany associations as GeneAssociationList wrappers', () => {
    const parent: BelongsToManyParentSource = {
      id: 1,
      tags: {
        count: 1,
        items: [{ id: 1, label: 'alpha' }],
      },
    }

    expect(parent.tags.items).toHaveLength(1)
    expect(parent.tags.items[0]?.label).toBe('alpha')
  })
})
