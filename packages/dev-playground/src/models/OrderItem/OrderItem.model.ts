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
  declare productId: number | null;

  @BelongsTo(() => Product)
  declare [PRODUCT_ASSOCIATION]: Product | null

  static readonly geneConfig = defineGraphqlGeneConfig(OrderItem, {
    findOptions({ findOptions }) {
      findOptions.include = findOptions.include || []

      const possibleProductOptions = findOptions.include.find(
        opt => opt.association === PRODUCT_ASSOCIATION
      )
      const productOptions = possibleProductOptions || { association: PRODUCT_ASSOCIATION }
      if (!possibleProductOptions) findOptions.include.push(productOptions)

      productOptions.where = { ...productOptions.where, isPublished: true }

      // By making it "required", we tell Sequelize to use an INNER JOIN, therefore exclude
      // order items that don't have product.isPublished equal to `true`.
      productOptions.required = true
    },
  })
}
