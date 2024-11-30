import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductVariant } from '../ProductVariant/ProductVariant.model'

export
@Table
class Product extends Model {
  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string

  @Column(DataType.STRING)
  declare color: string | null

  @ForeignKey(() => ProductGroup)
  @Column(DataType.INTEGER)
  declare groupId: number | null

  @BelongsTo(() => ProductGroup)
  declare group: ProductGroup | null

  @HasMany(() => ProductVariant)
  declare variants: ProductVariant[]
}
