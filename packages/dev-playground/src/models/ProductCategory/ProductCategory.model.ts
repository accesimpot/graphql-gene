import { BelongsToMany, Column, DataType, HasMany, Model, Table } from 'sequelize-typescript'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductGroupCategory } from '../ProductGroupCategory/ProductGroupCategory.model'
import type { CreationOptional } from 'sequelize'

export
@Table
class ProductCategory extends Model {
  @Column(DataType.STRING)
  declare name: string | null

  @BelongsToMany(() => ProductGroup, { through: { model: () => ProductGroupCategory } })
  declare groups: ProductGroup[]

  @HasMany(() => ProductGroupCategory, { onDelete: 'CASCADE' })
  declare groupCategories: CreationOptional<ProductGroupCategory[]>
}
