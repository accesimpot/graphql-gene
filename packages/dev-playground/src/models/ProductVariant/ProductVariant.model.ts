import { BelongsTo, Column, DataType, ForeignKey, HasOne, Model, Table } from 'sequelize-typescript'
import { Product } from '../Product/Product.model'
import { Inventory } from '../Inventory/Inventory.model'

export
@Table
class ProductVariant extends Model {
  @Column(DataType.STRING)
  declare size: string | null

  @HasOne(() => Inventory)
  declare inventory: Inventory | null

  @ForeignKey(() => Product)
  @Column(DataType.INTEGER)
  declare productId: number | null

  @BelongsTo(() => Product)
  declare product: Product | null
}
