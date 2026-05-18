import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript'
import { Polymorphic } from '@graphql-gene/plugin-sequelize'
import { Page } from '../Page/Page.model'
import { HeroBlock } from '../HeroBlock/HeroBlock.model'
import { TextBlock } from '../TextBlock/TextBlock.model'

/**
 * Pivot row linking a page to heterogeneous blocks (`HeroBlock`, `TextBlock`).
 *
 * Columns `blockId` + `blockType` implement Sequelize’s polymorphic junction pivot ([Sequelize polymorphic junction](https://sequelize.org/docs/v6/advanced-association-concepts/polymorphic-associations/#configuring-a-many-to-many-polymorphic-association)).
 * `@Polymorphic` wires inverse scoped `HasMany`s on each concrete model plus hub `BelongsTo` accessors (`heroBlock`, `textBlock`, …).
 */
export
@Polymorphic(() => [HeroBlock, TextBlock], {
  foreignKey: 'blockId',
  discriminatorKey: 'blockType',
})
@Table
class PageBlock extends Model<InferAttributes<PageBlock>, InferCreationAttributes<PageBlock>> {
  declare id: CreationOptional<number>

  @Column(DataType.INTEGER)
  declare blockId: number | null

  @Column(DataType.STRING)
  declare blockType: string | null

  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null
}
