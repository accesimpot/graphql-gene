import type { BASIC_GRAPHQL_TYPES } from '@/constants'
import type { GraphQLFieldResolver, GraphQLScalarType } from 'graphql'
import type { GeneSchema } from 'graphql-gene/schema'
import type { GeneContext } from 'graphql-gene/context'

export type GraphQLVarType = 'type' | 'enum' | 'interface' | 'input' | 'scalar' | 'union'

export type GraphqlTypes = GeneSchema
export type GraphqlTypeName = keyof GraphqlTypes

export type BasicGraphqlType = `${BASIC_GRAPHQL_TYPES}`
export type ValidGraphqlType = GraphqlTypeName | BasicGraphqlType

export type FieldResolver = GraphQLFieldResolver<Record<string, unknown> | undefined, GeneContext>
export type Resolvers = { [type: string]: { [field: string]: FieldResolver } }

export type ResolversOrScalars = {
  [type: string]: { [field: string]: FieldResolver } | GraphQLScalarType
}
