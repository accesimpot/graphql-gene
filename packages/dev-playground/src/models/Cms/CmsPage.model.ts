import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import {
  AllowNull,
  Column,
  DataType,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript'
import { defineGraphqlGeneConfig } from 'graphql-gene'
import { CmsPageBlock } from './CmsPageBlock.model'

export
@Table({ tableName: 'cms_pages' })
class CmsPage extends Model<InferAttributes<CmsPage>, InferCreationAttributes<CmsPage>> {
  declare id: CreationOptional<number>

  @AllowNull(false)
  @Column(DataType.STRING)
  declare path: string

  @HasMany(() => CmsPageBlock)
  declare blocks: CmsPageBlock[] | null

  static readonly geneConfig = defineGraphqlGeneConfig(CmsPage, {
    include: ['id', 'path', 'blocks'],
  })
}
