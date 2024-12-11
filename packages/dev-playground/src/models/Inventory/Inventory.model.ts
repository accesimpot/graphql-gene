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
import { authorizationDirective } from '../../directives/authorization.directive'
import { ProductVariant } from '../ProductVariant/ProductVariant.model'
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'

export
@Table
class Inventory extends Model<InferAttributes<Inventory>, InferCreationAttributes<Inventory>> {
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare stock: number

  @ForeignKey(() => ProductVariant)
  @Column(DataType.INTEGER)
  declare variantId: CreationOptional<number | null>

  @BelongsTo(() => ProductVariant)
  declare variant: CreationOptional<ProductVariant | null>

  static readonly geneConfig = defineGraphqlGeneConfig(Inventory, {
    directives: [authorizationDirective()],
  })
}
