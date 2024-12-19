import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript'
import { defineGraphqlGeneConfig, extendTypes } from 'graphql-gene'
import { Order } from '../Order/Order.model'
import { Product } from '../Product/Product.model'
import { getFieldFindOptions, getQueryInclude } from '@graphql-gene/plugin-sequelize'

const PRODUCT_ASSOCIATION = 'produit'
const PRODUCT_ASSOCIATION_RENAMED = 'product'

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
    exclude: [PRODUCT_ASSOCIATION],

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

extendTypes({
  OrderItem: {
    /**
     * Test case:
     *   Rename the "produit" association to "product"
     *
     * To improve:
     *   This field configuration has the same result as if we would have used
     *   `resolver: 'default'`, but it doesn't make an additional query. It just feeds include
     *   options to the root query.
     *
     *   We should change the `defaultResolver` to only make the query if the data is not already
     *   available. If that would be the case, we could get rid of the big `findOptions` hook
     *   below and configure the same behavior with only `resolver: 'default'`.
     */
    [PRODUCT_ASSOCIATION_RENAMED]: {
      args: 'default',
      returnType: 'Product',

      resolver: ({ source }) => source[PRODUCT_ASSOCIATION],

      findOptions({ findOptions, info, args, isList }) {
        findOptions.include = findOptions.include || []

        const topLevelFindOptions = getFieldFindOptions({ args, isList })
        const includeOptions = getQueryInclude(info)

        const possibleProductOptions = findOptions.include.find(
          opt => opt.association === PRODUCT_ASSOCIATION
        )
        const productOptions = possibleProductOptions || { association: PRODUCT_ASSOCIATION }
        if (!possibleProductOptions) findOptions.include.push(productOptions)

        Object.assign(productOptions, topLevelFindOptions, includeOptions)
      },
    },
  },
})
