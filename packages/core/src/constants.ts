export enum BASIC_GRAPHQL_TYPES {
  ID = 'ID',
  String = 'String',
  Int = 'Int',
  Float = 'Float',
  Boolean = 'Boolean',
  DateTime = 'DateTime',
  Date = 'Date',
  JSON = 'JSON',
}

export const BASIC_GRAPHQL_TYPE_VALUES: `${BASIC_GRAPHQL_TYPES}`[] =
  Object.values(BASIC_GRAPHQL_TYPES)

/** Offset pagination for list queries and association list parents. */
export const SKIP_ARG_DEFAULT = 0
export const LIMIT_ARG_DEFAULT = 10

export enum QUERY_ORDER_ENUM {
  ASC = 'ASC',
  DESC = 'DESC',
}
export const QUERY_ORDER_VALUES = Object.values(QUERY_ORDER_ENUM)

export const AND_OR_OPERATORS = ['and', 'or']

export enum GENE_RESOLVER_TEMPLATES {
  default = 'default',
}
