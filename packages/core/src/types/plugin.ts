import type { GraphQLSchema, DocumentNode, GraphQLResolveInfo } from 'graphql'
import type { GeneContext } from 'graphql-gene/context'
import type { GeneDefaultResolverArgs, GeneTypeConfig } from '../defineConfig'
import type { AnyObject } from './typeUtils'
import type { GraphQLVarType } from './graphql'
import type { GraphqlToTypescript } from './graphqlToTypescript'

export type PluginSettings<
  T extends { isMatching: boolean; fieldName: TField extends string ? string : never },
  TField extends string | number | symbol = string,
> = T

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GenePlugin<M = any> = {
  /**
   * Function receiving the model and returning true if the plugin should run.
   */
  isMatching: (model: M) => boolean

  getTypeDef(options: {
    model: M
    typeName: string
    isFieldIncluded: (fieldKey: string) => boolean
    schemaOptions: GenerateSchemaOptions
  }): TypeDefLines[0]

  defaultResolver?<
    M,
    ModelKey extends string,
    TSource = Record<string, unknown> | undefined,
    TContext = GeneContext,
    TArgDefs extends Record<string, string> = Record<string, string>,
  >(options: {
    model: M
    modelKey: ModelKey
    config: GeneTypeConfig<TSource, TContext, TArgDefs>
    args: GeneDefaultResolverArgs<M>
    info: GraphQLResolveInfo
  }): Promise<GraphqlToTypescript<ModelKey>>
}
