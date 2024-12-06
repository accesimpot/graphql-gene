import type { GeneConfig, ValueOf } from 'graphql-gene'
import { Op } from 'sequelize'
import { DataType, Model } from 'sequelize-typescript'

export class GeneModel extends Model {
  static geneConfig?: GeneConfig
}

export const GENERIC_OPERATORS = {
  and: 'and',
  or: 'or',
  eq: 'eq',
  ne: 'ne',
  in: 'in',
  notIn: 'notIn',
  null: 'null',
} as const

export const DATE_AND_NUMBER_OPERATORS = {
  lt: 'lt',
  lte: 'lte',
  gt: 'gt',
  gte: 'gte',
} as const

export const STRING_OPERATORS = {
  like: 'like',
  notLike: 'notLike',
} as const

export const ALL_OPERATORS = {
  ...GENERIC_OPERATORS,
  ...DATE_AND_NUMBER_OPERATORS,
  ...STRING_OPERATORS,
}

export const GENE_TO_SEQUELIZE_OPERATORS: {
  [k in ValueOf<typeof ALL_OPERATORS>]: (
    value:
      | string
      | boolean
      | number
      | { [k in ValueOf<typeof ALL_OPERATORS>]: string | boolean | number }[]
  ) => [
    symbol,
    (
      | string
      | boolean
      | number
      | null
      | { [k in ValueOf<typeof ALL_OPERATORS>]: string | boolean | number | null }[]
    ),
  ]
} = {
  [GENERIC_OPERATORS.and]: value => [Op.and, value],
  [GENERIC_OPERATORS.or]: value => [Op.or, value],
  [GENERIC_OPERATORS.eq]: value => [Op.eq, value],
  [GENERIC_OPERATORS.ne]: value => [Op.ne, value],
  [GENERIC_OPERATORS.in]: value => [Op.in, value],
  [GENERIC_OPERATORS.notIn]: value => [Op.notIn, value],
  [GENERIC_OPERATORS.null]: value => (value ? [Op.is, null] : [Op.not, null]),
  [DATE_AND_NUMBER_OPERATORS.lt]: value => [Op.lt, value],
  [DATE_AND_NUMBER_OPERATORS.lte]: value => [Op.lte, value],
  [DATE_AND_NUMBER_OPERATORS.gt]: value => [Op.gt, value],
  [DATE_AND_NUMBER_OPERATORS.gte]: value => [Op.gte, value],
  [STRING_OPERATORS.like]: value => [Op.like, value],
  [STRING_OPERATORS.notLike]: value => [Op.notLike, value],
}

export const DATE_SCALAR = 'Date' as const
export const DATE_TIME_SCALAR = 'DateTime' as const
export const JSON_SCALAR = 'JSON' as const

export const SEQUELIZE_TYPE_TO_GRAPHQL = {
  ABSTRACT: '',
  STRING: 'String',
  CHAR: 'String',
  TEXT: 'String',
  NUMBER: 'Int',
  TINYINT: 'Int',
  SMALLINT: 'Int',
  MEDIUMINT: 'Int',
  INTEGER: 'Int',
  BIGINT: 'Int',
  FLOAT: 'Float',
  REAL: 'Float',
  DOUBLE: 'Float',
  DECIMAL: 'Float',
  BOOLEAN: 'Boolean',
  TIME: 'DateTime',
  DATE: 'DateTime',
  DATEONLY: 'Date',
  HSTORE: 'String',
  JSON: 'JSON',
  JSONB: 'JSON',
  NOW: 'Date',
  BLOB: '',
  RANGE: '',
  UUID: 'ID',
  UUIDV1: 'ID',
  UUIDV4: 'ID',
  VIRTUAL: '',
  ENUM: '',
  ARRAY: '',
  GEOMETRY: '',
  GEOGRAPHY: '',
  CIDR: '',
  INET: '',
  MACADDR: '',
  CITEXT: '',
  TSVECTOR: '',
} satisfies {
  [k in keyof typeof DataType]:
    | 'ID'
    | 'String'
    | 'Int'
    | 'Float'
    | 'Boolean'
    | 'DateTime'
    | 'Date'
    | 'JSON'
    | ''
}

enum DATE_TYPES {
  TIME = 'TIME',
  DATE = 'DATE',
  DATEONLY = 'DATEONLY',
  NOW = 'NOW',
}

const DATE_TYPE_KEYS = new Set(Object.keys(DATE_TYPES))

export const SEQUELIZE_TYPE_TO_GRAPHQL_WITH_DATE_AS_STRING = (() => {
  const dataTypeMap = {} as Omit<typeof SEQUELIZE_TYPE_TO_GRAPHQL, `${DATE_TYPES}`> & {
    [dataType in `${DATE_TYPES}`]: 'String'
  }

  Object.entries(SEQUELIZE_TYPE_TO_GRAPHQL).forEach(([dataType, graphqlType]) => {
    ;(dataTypeMap as unknown as Record<string, ValueOf<typeof SEQUELIZE_TYPE_TO_GRAPHQL>>)[
      dataType
    ] = DATE_TYPE_KEYS.has(dataType as 'TIME') ? 'String' : graphqlType
  })
  return dataTypeMap
})()
