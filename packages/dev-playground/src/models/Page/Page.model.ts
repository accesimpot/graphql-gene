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
import { PageBlock } from '../PageBlock/PageBlock.model'

export
@Table
class Page extends Model<InferAttributes<Page>, InferCreationAttributes<Page>> {
  declare id: CreationOptional<number>

  @AllowNull(false)
  @Column(DataType.STRING)
  declare path: string

  @HasMany(() => PageBlock)
  declare blocks: PageBlock[] | null

  static readonly geneConfig = defineGraphqlGeneConfig(Page, {
    include: ['id', 'path', 'blocks'],
  })
}
