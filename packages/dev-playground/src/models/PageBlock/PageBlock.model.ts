import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript'
import { Polymorphic } from '@graphql-gene/plugin-sequelize'
import { Page } from '../Page/Page.model'
import { HeroBlock } from '../HeroBlock/HeroBlock.model'
import { TextBlock } from '../TextBlock/TextBlock.model'

/**
 * Pivot row linking a page to heterogeneous blocks (`HeroBlock`, `TextBlock`).
 *
 * Polymorphic junction uses default columns `targetId` + `targetType`
 * (see `@graphql-gene/plugin-sequelize` `DEFAULT_POLYMORPHIC_JUNCTION`).
 *
 * `@Polymorphic` wires inverse scoped `HasMany`s on each concrete model plus hub `BelongsTo`
 * accessors (`heroBlock`, `textBlock`, …).
 */
export
@Polymorphic(() => [HeroBlock, TextBlock])
@Table
class PageBlock extends Model<InferAttributes<PageBlock>, InferCreationAttributes<PageBlock>> {
  declare id: CreationOptional<number>

  /**
   * Junction columns default to `targetId` + `targetType` via `@Polymorphic`;
   * declared for Sequelize typings.
   */
  declare targetId: CreationOptional<number | null>
  declare targetType: CreationOptional<string | null>

  @ForeignKey(() => Page)
  @Column(DataType.INTEGER)
  declare pageId: number

  @BelongsTo(() => Page)
  declare page: Page | null
}
