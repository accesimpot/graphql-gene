import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'
import { ProductGroup } from '../ProductGroup/ProductGroup.model'
import { ProductCategory } from '../ProductCategory/ProductCategory.model'

export
@Table({ timestamps: false })
class ProductGroupCategory extends Model {
  @BelongsTo(() => ProductGroup)
  declare group: ProductGroup

  @ForeignKey(() => ProductGroup)
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare groupId: number

  @BelongsTo(() => ProductCategory)
  declare category: ProductCategory

  @ForeignKey(() => ProductCategory)
  @PrimaryKey
  @Column(DataType.INTEGER)
  declare categoryId: number
}
