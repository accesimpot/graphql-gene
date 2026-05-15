import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { BelongsTo, Column, DataType, ForeignKey, HasOne, Model, Table } from 'sequelize-typescript'
import { defineGraphqlGeneConfig } from 'graphql-gene'
import { Product } from '../Product/Product.model'
import { Inventory } from '../Inventory/Inventory.model'
import { filterBySizeDirective } from './filterBySize.directive'

export enum SHOE_SIZES {
  us7 = 'US 7',
  us7_5 = 'US 7.5',
  us8 = 'US 8',
  us8_5 = 'US 8.5',
  us9 = 'US 9',
  us9_5 = 'US 9.5',
  us10 = 'US 10',
  us10_5 = 'US 10.5',
  us11 = 'US 11',
  us11_5 = 'US 11.5',
  us12 = 'US 12',
  us13 = 'US 13',
}

export enum APPAREL_SIZES {
  XS = 'XS',
  S = 'S',
  M = 'M',
  L = 'L',
  XL = 'XL',
  XXL = 'XXL',
}

export
@Table
class ProductVariant extends Model<
  InferAttributes<ProductVariant>,
  InferCreationAttributes<ProductVariant>
> {
  declare id: CreationOptional<number>

  @Column(DataType.STRING)
  declare size: `${SHOE_SIZES}` | `${APPAREL_SIZES}` | null

  @HasOne(() => Inventory)
  declare inventory: Inventory | null

  @ForeignKey(() => Product)
  @Column(DataType.INTEGER)
  declare productId: number | null

  @BelongsTo(() => Product)
  declare product: Product | null

  static readonly geneConfig = defineGraphqlGeneConfig(ProductVariant, {
    // Test case: ensure that directives can be provided as a function to avoid potential issues
    // with circular dependencies
    directives: () => [filterBySizeDirective({ exclude: ['XS', 'XXL'] })],
  })
}
