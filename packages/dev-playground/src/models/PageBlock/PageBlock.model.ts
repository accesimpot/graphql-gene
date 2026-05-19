import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript'
import { Polymorphic } from '@graphql-gene/plugin-sequelize'
import { Page } from '../Page/Page.model'
import { HeroBlock } from '../HeroBlock/HeroBlock.model'
import { TextBlock } from '../TextBlock/TextBlock.model'

/**
 * The @Polymorphic decorator will dynamically inject foreign keys and associations
 * for each model passed to it.
 */
export
@Polymorphic(() => [HeroBlock, TextBlock])
@Table
class PageBlock extends Model<InferAttributes<PageBlock>, InferCreationAttributes<PageBlock>> {
  declare id: CreationOptional<number>

  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null
}
