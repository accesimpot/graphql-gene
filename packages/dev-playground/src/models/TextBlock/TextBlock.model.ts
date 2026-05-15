import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import { AllowNull, Column, DataType, Model, Table } from 'sequelize-typescript'
import { defineGraphqlGeneConfig } from 'graphql-gene'

export
@Table
class TextBlock extends Model<InferAttributes<TextBlock>, InferCreationAttributes<TextBlock>> {
  declare id: CreationOptional<number>

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare body: string

  static readonly geneConfig = defineGraphqlGeneConfig(TextBlock, {})
}
