import type {
  CreationOptional,
  HasManyAddAssociationMixin,
  InferAttributes,
  InferCreationAttributes,
} from 'sequelize'
import {
  BelongsToMany,
  Column,
  DataType,
  HasMany,
  HasOne,
  Model,
  Table,
} from 'sequelize-typescript'
import { Product } from '../Product/Product.model'
import { ProductCategory } from '../ProductCategory/ProductCategory.model'
import { ProductGroupCategory } from '../ProductGroupCategory/ProductGroupCategory.model'

export
@Table
class ProductGroup extends Model<
  InferAttributes<ProductGroup>,
  InferCreationAttributes<ProductGroup>
> {
  @Column(DataType.STRING)
  declare name: string | null

  @BelongsToMany(() => ProductCategory, { through: { model: () => ProductGroupCategory } })
  declare categories: CreationOptional<ProductCategory[]>
  declare addCategory: HasManyAddAssociationMixin<ProductCategory, number>

  @HasMany(() => ProductGroupCategory, { onDelete: 'CASCADE' })
  declare groupCategories: CreationOptional<ProductGroupCategory[]>

  @HasOne(() => Product)
  declare product: CreationOptional<Product>
}
