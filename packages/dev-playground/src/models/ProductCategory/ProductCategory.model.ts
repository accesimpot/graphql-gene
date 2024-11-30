import { BelongsToMany, Column, DataType, Model, Table } from 'sequelize-typescript'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductGroupCategory } from '../ProductGroupCategory/ProductGroupCategory.model'

export
@Table
class ProductCategory extends Model {
  @Column(DataType.STRING)
  declare name: string | null

  @BelongsToMany(() => ProductGroup, { through: { model: () => ProductGroupCategory } })
  declare groups: ProductGroup[]
}
