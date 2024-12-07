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
import { extendTypes, defineGraphqlGeneConfig, defineField } from 'graphql-gene'
import { OrderItem } from '../OrderItem/OrderItem.model'
import { Address } from '../Address/Address.model'

export
@Table
class Order extends Model {
  @AllowNull(false)
  @Column(DataType.STRING)
  declare status: string

  @AllowNull(false)
  @Column(DataType.DECIMAL)
  declare tax: number

  @AllowNull(false)
  @Column(DataType.DECIMAL)
  declare subtotal: number

  @AllowNull(false)
  @Column(DataType.DECIMAL)
  declare total: number

  @HasMany(() => OrderItem)
  declare items: OrderItem[]

  @ForeignKey(() => Address)
  @Column(DataType.INTEGER)
  declare addressId: number | null

  @BelongsTo(() => Address)
  declare address: Address | null

  static readonly geneConfig = defineGraphqlGeneConfig(Order, {
    includeTimestamps: ['updatedAt'],
  })
}

extendTypes({
  Query: {
    order: {
      resolver: 'default',
      returnType: 'Order',
    },
  },

  Order: {
    fieldAddedWithExtendTypes: {
      args: { prefix: 'String!', separator: 'String!' },
      /**
       * Make sure that we can use data from the `source` and `args` options. This is tested
       * in the integration tests, but will also go through the type checks.
       */
      resolver: ({ source, args }) => `${args.prefix}${args.separator}${source.status}`,
      returnType: 'String!',
    },

    /**
     * This is to ensure that using the deprecated method `defineField` is still valid. It will
     * be raised by the "types:check" script in the CI if it starts throwing Typescript errors.
     */
    hasUsedDeprecatedDefineField: defineField({
      args: { input: 'String!' },
      resolver: ({ source, args }) => !!(source?.status && args.input),
      returnType: 'Boolean!',
    }),
  },
})
