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

/** Lightweight HasMany on {@link Order} so the playground can cover multiple association-list wrappers per GraphQL type. */
export
@Table
class OrderNote extends Model {
  @ForeignKey(() => Order)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare orderId: number

  @BelongsTo(() => Order)
  declare order: Order | null

  @AllowNull(false)
  @Column(DataType.STRING)
  declare body: string

  static readonly geneConfig = defineGraphqlGeneConfig(OrderNote, {})
}
