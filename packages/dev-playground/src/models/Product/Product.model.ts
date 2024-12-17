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
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { defineType, extendTypes } from 'graphql-gene'
import { authorizationDirective } from '../../directives/authorization.directive'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductVariant } from '../ProductVariant/ProductVariant.model'
import { sanitizeColorDirective } from './sanitizeColor.directive'

const MIN_PRODUCT_RATING = 3.5
const MAX_PRODUCT_RATING = 5

export
@Table
class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<number>

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

export const ProductReviewAverage = defineType({
  rating: 'Float',
  total: 'Int',
})

extendTypes({
  Product: {
    isPublished: {
      directives: [authorizationDirective()],
    },

    color: {
      // Test case: ensure that generating the schema won't fail when providing an empty array
      directives: [sanitizeColorDirective({ exclude: [] })],
    },

    /**
     * Test case: With this `reviewAverage` field, we ensure that using a custom type with subfields
     * won't be treated as an association when calling `getQueryInclude`. This was previously
     * an issue because the custom type was adding `include: [{ association: 'reviewAverage' }]` making
     * the query fail.
     */
    reviewAverage: {
      returnType: 'ProductReviewAverage',

      /**
       * Mock product review average by calculating both the total and rating values based on the
       * `source.id`. It doesn't use `Math.random` because we want it to return the same
       * value every time it is requested.
       */
      resolver({ source }) {
        const total = (Math.abs(Number(source.id) - 200) % 100) * 3
        const rating =
          (MAX_PRODUCT_RATING - MIN_PRODUCT_RATING) * easeOutQuart((total % 10) / 10) +
          MIN_PRODUCT_RATING

        const round = (n: number) => Math.round(n * 100) / 100

        return { rating: round(rating), total }
      },
    },
  },
})

function easeOutQuart(pos: number) {
  return -(Math.pow(pos - 1, 4) - 1)
}
