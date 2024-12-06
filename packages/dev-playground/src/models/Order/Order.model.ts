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
import { extendTypes, defineGraphqlGeneConfig } from 'graphql-gene'
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
})
