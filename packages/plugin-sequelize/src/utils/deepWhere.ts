import { AND_OR_OPERATORS, isObject } from 'graphql-gene'
import { GENE_TO_SEQUELIZE_OPERATORS } from '../constants'

export function isWhereOperatorMap(value: unknown): boolean {
  if (!isObject(value)) return false

  return Object.keys(value).some(
    key => AND_OR_OPERATORS.includes(key) || key in GENE_TO_SEQUELIZE_OPERATORS
  )
}
