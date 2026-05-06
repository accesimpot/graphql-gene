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
import { CmsPage } from './CmsPage.model'
import { HeroBlock } from './HeroBlock.model'
import { TextBlock } from './TextBlock.model'

/** GraphQL union for polymorphic hub rows (see PLAN_V2 §2.8). */
export const PageBlockContent = defineUnion(['HeroBlock', 'TextBlock'])

export
@Table({ tableName: 'cms_page_blocks' })
class CmsPageBlock extends Model<
  InferAttributes<CmsPageBlock>,
  InferCreationAttributes<CmsPageBlock>
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

  @ForeignKey(() => CmsPage)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => CmsPage)
  declare page: CmsPage | null

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

  static readonly geneConfig = defineGraphqlGeneConfig(CmsPageBlock, {
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
    cmsPageByPath: {
      args: { path: 'String!' },
      async resolver({ args }) {
        return CmsPage.findOne({
          where: { path: args.path },
          include: [
            {
              model: CmsPageBlock,
              as: 'blocks',
              separate: true,
              order: [['sortOrder', 'ASC']],
              include: [{ model: HeroBlock }, { model: TextBlock }],
            },
          ],
        })
      },
      returnType: 'CmsPage',
    },
  },
  CmsPageBlock: {
    content: {
      // Plain objects carrying `__typename` match GraphQL execution; graphql-gene union types still map to Sequelize instances.
      // @ts-expect-error Resolver result typing does not yet model union members as POJOs
      async resolver(context) {
        const { source } = context
        const hub = source as CmsPageBlock
        if (hub.blockKind === 'HERO') {
          const row =
            hub.heroBlock ?? (hub.heroBlockId ? await HeroBlock.findByPk(hub.heroBlockId) : null)
          if (!row) throw new Error('CmsPageBlock: blockKind HERO but no HeroBlock row loaded')
          return withHeroBlockTypename(
            row.get({ plain: true })
          ) as unknown as GraphqlToTypescript<'PageBlockContent'>
        }
        if (hub.blockKind === 'TEXT') {
          const row =
            hub.textBlock ?? (hub.textBlockId ? await TextBlock.findByPk(hub.textBlockId) : null)
          if (!row) throw new Error('CmsPageBlock: blockKind TEXT but no TextBlock row loaded')
          return withTextBlockTypename(
            row.get({ plain: true })
          ) as unknown as GraphqlToTypescript<'PageBlockContent'>
        }
        throw new Error(`CmsPageBlock: unknown blockKind ${String(hub.blockKind)}`)
      },
      returnType: 'PageBlockContent!',
    },
  },
})
