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
import type { InferAttributes, InferCreationAttributes } from 'sequelize'
import { extendTypes } from 'graphql-gene'
import { authorizationDirective } from '../../directives/authorization.directive'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductVariant } from '../ProductVariant/ProductVariant.model'
import { sanitizeColorDirective } from './sanitizeColor.directive'

export
@Table
class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  @AllowNull(false)
  @Column(DataType.STRING)
  declare name: string

  @Column(DataType.STRING)
  declare color: string | null

  @Column(DataType.BOOLEAN)
  declare isPublished: boolean | null

  @ForeignKey(() => ProductGroup)
  @Column(DataType.INTEGER)
  declare groupId: number | null

  @BelongsTo(() => ProductGroup)
  declare group: ProductGroup | null

  @HasMany(() => ProductVariant)
  declare variants: ProductVariant[] | null
}

extendTypes({
  Product: {
    isPublished: {
      directives: [authorizationDirective()],
    },

    color: {
      // Test case: ensure that generating the schema won't fail when providing an empty array
      directives: [sanitizeColorDirective({ exclude: [] })],
    },
  },
})
