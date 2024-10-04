import type { GraphQLSchema, DocumentNode } from 'graphql'
import type { AnyObject } from './typeUtils'
import type { GraphQLVarType } from './graphql'

export type GraphQLTypeName = string
export type GraphQLFieldName = string
export type ArgsDef = Record<string, Set<string | null>>

export type FieldLines = Record<
  GraphQLFieldName,
  { directives: Set<string>; argsDef: ArgsDef; typeDef: string }
>

export type TypeDefLines = Record<
  GraphQLTypeName,
  {
    varType: GraphQLVarType
    directives: Set<string>
    lines: FieldLines
  }
>
export type DirectiveDefs = Record<GraphQLTypeName, { argsDef: ArgsDef }>

export type GenerateSchemaOptions<
  SchemaTypes extends AnyObject = AnyObject,
  DataTypes extends AnyObject = AnyObject,
> = {
  schema?: GraphQLSchema | DocumentNode | string
  plugins?: GenePlugin[]
  types: SchemaTypes
  hasDateScalars?: boolean
  dataTypeMap?: DataTypes
}

export type GenePlugin<M = object> = {
  /**
   * Function receiving the model and returning true if the plugin should run.
   */
  include: (model: M) => boolean

  /**
   * Return an object with the field name as key and the GraphQL type definition as value
   * @example
   * {
   *   getTypeDef: () => ({ fields: { name: 'String!', role: 'RoleEnum' } }),
   * }
   */
  getTypeDef(details: {
    model: M
    typeName: string
    exclude: string[]
    schemaOptions: GenerateSchemaOptions
  }): TypeDefLines[0]
}
