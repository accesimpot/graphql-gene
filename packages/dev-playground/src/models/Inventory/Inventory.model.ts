import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'
import { ProductVariant } from '../ProductVariant/ProductVariant.model'

export
@Table
class Inventory extends Model {
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare stock: number

  @ForeignKey(() => ProductVariant)
  @Column(DataType.INTEGER)
  declare variantId: number | null

  @BelongsTo(() => ProductVariant)
  declare variant: ProductVariant | null
}
