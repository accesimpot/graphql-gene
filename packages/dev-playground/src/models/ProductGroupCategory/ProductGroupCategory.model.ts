import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductCategory } from '../ProductCategory/ProductCategory.model'

export
@Table
class ProductGroupCategory extends Model {
  @BelongsTo(() => ProductGroup)
  declare group: ProductGroup

  @ForeignKey(() => ProductGroup)
  @Column(DataType.INTEGER)
  declare groupId: number

  @BelongsTo(() => ProductCategory)
  declare category: ProductCategory

  @ForeignKey(() => ProductCategory)
  @Column(DataType.INTEGER)
  declare categoryId: number
}
