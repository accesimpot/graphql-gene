import type {
  CreationOptional,
  HasManyAddAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize'
import { BelongsToMany, Column, DataType, HasMany, Model, Table } from 'sequelize-typescript'
import { defineGraphqlGeneConfig, extendTypes } from 'graphql-gene'
import { Product } from '../Product/Product.model'
import { ProductCategory } from '../ProductCategory/ProductCategory.model'
import { ProductGroupCategory } from '../ProductGroupCategory/ProductGroupCategory.model'

export
@Table
class ProductGroup extends Model<
  InferAttributes<ProductGroup>,
  InferCreationAttributes<ProductGroup>
> {
  declare id: CreationOptional<number>

  @Column(DataType.STRING)
  declare name: string | null

  @BelongsToMany(() => ProductCategory, { through: { model: () => ProductGroupCategory } })
  declare categories: CreationOptional<ProductCategory[]>
  declare addCategory: HasManyAddAssociationMixin<ProductCategory, number>

  @HasMany(() => ProductGroupCategory, { onDelete: 'CASCADE' })
  declare groupCategories: CreationOptional<ProductGroupCategory[]>

  @HasMany(() => Product)
  declare products: CreationOptional<Product[]>

  static readonly geneConfig = defineGraphqlGeneConfig(ProductGroup, {
    exclude: ['categories', 'groupCategories'],
  })
}

extendTypes({
  ProductGroup: {
    categories: {
      resolver: ({ source }) => {
        return source.groupCategories.map(({ category }) => category?.name || '').filter(v => v)
      },
      returnType: '[String!]',

      /**
       * Using `findOptions`, we make sure that the `groupCategories` is included in the
       * query for `ProductGroup` whenever this field is requested so we can access it within
       * the resolver.
       */
      findOptions({ state }) {
        state.include = state.include || []
        state.include.push({
          association: 'groupCategories',
          include: [{ association: 'category' }],
        })
      },
    },
  },
})
