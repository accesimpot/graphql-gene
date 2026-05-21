import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'
import { defineGraphqlGeneConfig } from 'graphql-gene'
import { Order } from '../Order/Order.model'
import { Product } from '../Product/Product.model'

const PRODUCT_ASSOCIATION = 'product'

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

  static readonly geneConfig = defineGraphqlGeneConfig(OrderItem, {
    findOptions({ findOptions }) {
      findOptions.include = findOptions.include || []

      const possibleProductOptions = findOptions.include.find(
        opt => opt.association === PRODUCT_ASSOCIATION
      )
      const productOptions = possibleProductOptions || { association: PRODUCT_ASSOCIATION }
      if (!possibleProductOptions) findOptions.include.push(productOptions)

      productOptions.where = { ...productOptions.where, isPublished: true }

      // SQLite: required INNER JOINs on this association can generate invalid nested subqueries.
      productOptions.required = OrderItem.sequelize?.getDialect?.() !== 'sqlite'
    },
  })
}
