import type { BASIC_GRAPHQL_TYPES } from '@/constants'
import type { GeneSchema } from './extendable'

export type GraphQLVarType = 'type' | 'enum' | 'interface' | 'input' | 'scalar' | 'union'

export type GraphqlTypes = GeneSchema
export type GraphqlTypeName = keyof GraphqlTypes

export type BasicGraphqlType = `${BASIC_GRAPHQL_TYPES}`
export type ValidGraphqlType = GraphqlTypeName | BasicGraphqlType
