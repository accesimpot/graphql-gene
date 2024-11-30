import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'
import { Order } from '../Order/Order.model'
import { Product } from '../Product/Product.model'

export
@Table
class OrderItem extends Model {
  @AllowNull(false)
  @Column(DataType.DECIMAL)
  declare price: number

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare quantity: number

  @ForeignKey(() => Order)
  @Column(DataType.INTEGER)
  declare orderId: number | null

  @BelongsTo(() => Order)
  declare order: Order | null

  @ForeignKey(() => Product)
  @Column(DataType.INTEGER)
  declare productId: number | null

  @BelongsTo(() => Product)
  declare product: Product | null
}
