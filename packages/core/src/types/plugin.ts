import type { GraphQLSchema, GraphQLResolveInfo } from 'graphql'
import type { GeneContext } from 'graphql-gene/context'
import type { GeneDefaultResolverArgs, GeneTypeConfig } from '../defineConfig'
import type { AnyObject } from './typeUtils'
import type { GraphQLVarType, ResolversOrScalars } from './graphql'
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
  schema?: GraphQLSchema
  resolvers?: ResolversOrScalars
  plugins?: GenePlugin[]
  types: SchemaTypes
  dataTypeMap?: DataTypes
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GenePlugin<M = any> = {
  /**
   * Function receiving the model and returning true if the plugin should run.
   */
  isMatching: (model: M) => boolean

  /**
   * @deprecated In favor of "populateTypeDefs"
   */
  getTypeDef(options: {
    model: M
    typeName: string
    isFieldIncluded: (fieldKey: string) => boolean
    schemaOptions: GenerateSchemaOptions
  }): TypeDefLines[0]

  /**
   * Populate the typeDefLines object with one or multiple type definitions. It might need to
   * define multiple types if one field has arguments with inputs specific to this types
   * (i.e. associations using the default resolver).
   *
   * It returns { afterTypeDefHooks } which are hooks called after all model types are added
   * to the typeDefLines object.
   */
  populateTypeDefs(options: {
    typeDefLines: TypeDefLines
    model: M
    typeName: string
    isFieldIncluded: (fieldKey: string) => boolean
    schemaOptions: GenerateSchemaOptions
  }): { afterTypeDefHooks: (() => void)[] }

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
