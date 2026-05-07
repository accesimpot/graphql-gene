import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'
import { defineGraphqlGeneConfig, defineUnion, extendTypes } from 'graphql-gene'
import type { GraphqlToTypescript } from 'graphql-gene'
import { Page } from '../Page/Page.model'
import { HeroBlock } from '../HeroBlock/HeroBlock.model'
import { TextBlock } from '../TextBlock/TextBlock.model'

/** GraphQL union for polymorphic hub rows (see PLAN_V2 §2.8). */
export const PageBlockContent = defineUnion(['HeroBlock', 'TextBlock'])

export
@Table
class PageBlock extends Model<
  InferAttributes<PageBlock>,
  InferCreationAttributes<PageBlock>
> {
  declare id: CreationOptional<number>

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare sortOrder: number

  /**
   * Discriminator: which concrete FK is authoritative. Matches PLAN_V2 polymorphic hub pattern.
   */
  @AllowNull(false)
  @Column(DataType.STRING)
  declare blockKind: 'HERO' | 'TEXT'

  @ForeignKey(() => Page)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null

  @ForeignKey(() => HeroBlock)
  @Column(DataType.INTEGER)
  declare heroBlockId: number | null

  @BelongsTo(() => HeroBlock)
  declare heroBlock: HeroBlock | null

  @ForeignKey(() => TextBlock)
  @Column(DataType.INTEGER)
  declare textBlockId: number | null

  @BelongsTo(() => TextBlock)
  declare textBlock: TextBlock | null

  static readonly geneConfig = defineGraphqlGeneConfig(PageBlock, {
    /** Hide raw belongsTo edges; consumers use `content` union + fragments. */
    include: ['id', 'sortOrder', 'blockKind', 'pageId', 'page'],
  })
}

function withHeroBlockTypename(row: Record<string, unknown>) {
  return { ...row, __typename: 'HeroBlock' as const }
}

function withTextBlockTypename(row: Record<string, unknown>) {
  return { ...row, __typename: 'TextBlock' as const }
}

extendTypes({
  Query: {
    pageByPath: {
      args: { path: 'String!' },
      async resolver({ args }) {
        return Page.findOne({
          where: { path: args.path },
          include: [
            {
              model: PageBlock,
              as: 'blocks',
              separate: true,
              order: [['sortOrder', 'ASC']],
              include: [{ model: HeroBlock }, { model: TextBlock }],
            },
          ],
        })
      },
      returnType: 'Page',
    },
  },
  PageBlock: {
    content: {
      // Plain objects carrying `__typename` match GraphQL execution; graphql-gene union types still map to Sequelize instances.
      // @ts-expect-error Resolver result typing does not yet model union members as POJOs
      async resolver(context) {
        const { source } = context
        const hub = source as PageBlock
        if (hub.blockKind === 'HERO') {
          const row =
            hub.heroBlock ?? (hub.heroBlockId ? await HeroBlock.findByPk(hub.heroBlockId) : null)
          if (!row) throw new Error('PageBlock: blockKind HERO but no HeroBlock row loaded')
          return withHeroBlockTypename(
            row.get({ plain: true })
          ) as unknown as GraphqlToTypescript<'PageBlockContent'>
        }
        if (hub.blockKind === 'TEXT') {
          const row =
            hub.textBlock ?? (hub.textBlockId ? await TextBlock.findByPk(hub.textBlockId) : null)
          if (!row) throw new Error('PageBlock: blockKind TEXT but no TextBlock row loaded')
          return withTextBlockTypename(
            row.get({ plain: true })
          ) as unknown as GraphqlToTypescript<'PageBlockContent'>
        }
        throw new Error(`PageBlock: unknown blockKind ${String(hub.blockKind)}`)
      },
      returnType: 'PageBlockContent!',
    },
  },
})
