import { BelongsToMany, Column, DataType, HasOne, Model, Table } from 'sequelize-typescript'
import { Product } from '../Product/Product.model'
import { ProductCategory } from '../ProductCategory/ProductCategory.model'
import { ProductGroupCategory } from '../ProductGroupCategory/ProductGroupCategory.model'

export
@Table
class ProductGroup extends Model {
  @Column(DataType.STRING)
  declare name: string | null

  @BelongsToMany(() => ProductCategory, { through: { model: () => ProductGroupCategory } })
  declare categories: ProductCategory[]

  @HasOne(() => Product)
  declare product: Product | null
}
