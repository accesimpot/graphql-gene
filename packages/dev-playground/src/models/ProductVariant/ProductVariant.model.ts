import type { InferAttributes, InferCreationAttributes } from 'sequelize'
import { BelongsTo, Column, DataType, ForeignKey, HasOne, Model, Table } from 'sequelize-typescript'
import { defineGraphqlGeneConfig } from 'graphql-gene'
import { Product } from '../Product/Product.model'
import { Inventory } from '../Inventory/Inventory.model'
import { filterBySizeDirective } from './filterBySize.directive'

export
@Table
class ProductVariant extends Model<
  InferAttributes<ProductVariant>,
  InferCreationAttributes<ProductVariant>
> {
  @Column(DataType.STRING)
  declare size: string | null

  @HasOne(() => Inventory)
  declare inventory: Inventory | null

  @ForeignKey(() => Product)
  @Column(DataType.INTEGER)
  declare productId: number | null

  @BelongsTo(() => Product)
  declare product: Product | null

  static readonly geneConfig = defineGraphqlGeneConfig(ProductVariant, {
    directives: [filterBySizeDirective()],
  })
}
