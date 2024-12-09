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
import {
  extendTypes,
  defineGraphqlGeneConfig,
  defineField,
  defineType,
  defineEnum,
} from 'graphql-gene'
import { OrderItem } from '../OrderItem/OrderItem.model'
import { Address } from '../Address/Address.model'
import { getQueryIncludeOf } from '@graphql-gene/plugin-sequelize'

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
  declare items: OrderItem[] | null

  @ForeignKey(() => Address)
  @Column(DataType.INTEGER)
  declare addressId: number | null

  @BelongsTo(() => Address)
  declare address: Address | null

  static readonly geneConfig = defineGraphqlGeneConfig(Order, {
    includeTimestamps: ['updatedAt'],
  })
}

export const UpdateOrderStatusOutput = defineType({
  message: 'MessageOutput!',
  order: 'Order',
})

export const OrderStatusEnum = defineEnum(['cart', 'shipping', 'payment', 'paid', 'shipped'])

export const MessageOutput = defineType({
  type: 'MessageTypeEnum!',
  text: 'String!',
})

export const MessageTypeEnum = defineEnum(['info', 'success', 'warning', 'error'])

extendTypes({
  Query: {
    order: {
      resolver: 'default',
      returnType: 'Order',
    },
  },

  Mutation: {
    updateOrderStatus: {
      args: { id: 'String!', status: 'OrderStatusEnum!' },

      async resolver({ info, args }) {
        let messageType: (typeof MessageTypeEnum)[number] = 'success'
        let text = 'Status updated successfully.'
        let order: Order | null = null

        if (Number.isNaN(Number(args.id))) {
          messageType = 'error'
          text = 'Status could not be updated.'
        } else {
          const findOptions = getQueryIncludeOf(info, 'Order')
          order = await Order.findOne({ ...findOptions, where: { id: args.id } })

          // Just pretend to update the status
          order?.setDataValue('status', args.status)
        }
        return {
          message: { type: messageType, text },
          order,
        }
      },
      returnType: 'UpdateOrderStatusOutput!',
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
