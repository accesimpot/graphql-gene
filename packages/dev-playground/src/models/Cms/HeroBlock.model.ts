import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript'
import { defineGraphqlGeneConfig } from 'graphql-gene'

export
@Table({ tableName: 'cms_hero_blocks' })
class HeroBlock extends Model<InferAttributes<HeroBlock>, InferCreationAttributes<HeroBlock>> {
  declare id: CreationOptional<number>

  @AllowNull(false)
  @Column(DataType.STRING)
  declare title: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare subtitle: string

  static readonly geneConfig = defineGraphqlGeneConfig(HeroBlock, {})
}
