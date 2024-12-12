import type { GraphQLFieldResolver } from 'graphql'
import type { GeneContext } from 'graphql-gene/context'
import type {
  FindOptionsHandler,
  FindOptionsHandlerByType,
  FindOptionsStateByModel,
  GraphQLFieldName,
  GraphqlReturnTypes,
  GraphqlToTypescript,
  GraphqlTypeName,
  GraphQLVarType,
  InferFields,
  Narrow,
  OperatorInputs,
  Prop,
  PrototypeOrNot,
  SomeRequired,
  ValidGraphqlType,
} from './types'
import type { GENE_RESOLVER_TEMPLATES, QUERY_ORDER_ENUM } from './constants'

type ArgsDefinition<V = string> = Record<string, V> | `${GENE_RESOLVER_TEMPLATES}` | undefined
export type StrictArgsDefinition = ArgsDefinition<GraphqlReturnTypes<ValidGraphqlType>>

export type GeneConfigTypes<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
> =
  | readonly string[]
  | (GeneObjectTypeConfig<TSource, TContext, TArgDefs, TReturnType> & { geneConfig?: GeneConfig })

export type GeneObjectTypeConfig<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
> = Record<
  GraphQLFieldName,
  | GraphqlReturnTypes<ValidGraphqlType | ''>
  | GeneTypeConfig<TSource, TContext, TArgDefs, TReturnType>
>

type FallbackIfInvalid<T, TFallback> = T extends never ? TFallback : T
type AccurateTypeSource<
  TTypeName,
  TFallbackSource = Record<string, unknown> | undefined,
> = TTypeName extends 'Query' | 'Mutation'
  ? undefined
  : TTypeName extends string
    ? FallbackIfInvalid<NonNullable<GraphqlToTypescript<TTypeName>>, TFallbackSource>
    : TFallbackSource

export type ExtendedTypes<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
> = {
  [typeName in GraphqlTypeName]?: Record<
    GraphQLFieldName,
    FieldConfig<
      AccurateTypeSource<typeName, TSource>,
      TContext,
      undefined extends TArgDefs ? ArgsDefinition : TArgDefs,
      TReturnType extends unknown ? GraphqlReturnTypes<ValidGraphqlType> : TReturnType
    >
  >
}

export type NarrowExtendedTypes<TTypes extends Record<string, Record<string, object>>> = {
  [TypeName in keyof TTypes]?: {
    [FieldName in keyof TTypes[TypeName]]: ExtendedTypeField<TTypes[TypeName][FieldName], TypeName>
  }
}

type ValidReturnTypeOption<T> =
  Narrow<T> extends GraphqlReturnTypes<ValidGraphqlType> ? Narrow<T> : never

export type ExtendedTypeField<T, TypeName> = {
  [K in keyof T]: K extends 'resolver'
    ? GeneResolverOption<
        AccurateTypeSource<TypeName>,
        GeneContext,
        Prop<T, 'args'> extends ArgsDefinition ? Prop<T, 'args'> : never,
        ValidReturnTypeOption<Prop<T, 'returnType'>>
      >
    : K extends 'returnType'
      ? ValidReturnTypeOption<T[K]>
      : K extends 'args'
        ? T[K] extends StrictArgsDefinition
          ? Narrow<T[K]>
          : never
        : K extends 'findOptions'
          ? FindOptionsHandlerByType<TypeName, T[K]>
          : Narrow<T[K]>
}

export type StrictExtendedTypes<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
> = ExtendedTypes<TSource, TContext, TArgDefs, GraphqlReturnTypes<ValidGraphqlType>>

export interface GeneConfig<
  M = unknown,
  TSource = M | Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
  TVarType extends GraphQLVarType = GraphQLVarType,
> {
  /** Array of fields to include in the GraphQL type (default: include all). */
  include?: (InferFields<M> | RegExp)[]
  /** Array of fields to exclude in the GraphQL type (default: ['createdAt', updatedAt']). */
  exclude?: (InferFields<M> | RegExp)[]

  /** To include the timestamp attributes or not (default: false). */
  includeTimestamps?: boolean | ('createdAt' | 'updatedAt')[]

  /** The GraphQL variable type to use (default: "type"). */
  varType?: TVarType

  /** Directives to apply at the type level (also possible at the field level). */
  directives?: GeneDirectiveConfig<
    Record<string, string | number | boolean | null> | undefined,
    TSource extends M ? PrototypeOrNot<M> : TSource
  >[]

  /**
   * The values of "aliases" would be nested GeneConfig properties that overwrites the ones se
   * at a higher level. This is useful for instances with a specific scope include more fields
   * that the parent model (i.e. `AuthenticatedUser` being an alias of `User`). Note that the
   * alias needs to be exported from _graphqlTypes.ts_ as well.
   *
   * @example
   * include: ['id', 'username'],
   *
   * aliases: {
   *   AuthenticatedUser: {
   *     include: ['id', 'email', 'username', 'role', 'address', 'orders'],
   *   },
   * },
   *
   * @example
   * export { User as AuthenticatedUser } from '../models/User/User.model'
   */
  aliases?: {
    [modelKey in GraphqlTypeName]?: GeneConfig<
      M,
      TSource,
      TContext,
      TArgDefs,
      TReturnType,
      TVarType
    >
  }

  /**
   * Extend the Query or Mutation types only.
   * @deprecated You should import and call `extendTypes` instead.
   */
  types?: ExtendedTypes<TSource, TContext, TArgDefs, TReturnType>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findOptions?: FindOptionsHandler<FindOptionsStateByModel<M, any>>
}

export type GeneTypeConfig<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
> = {
  directives?: GeneDirectiveConfig<
    Record<string, string | number | boolean | null> | undefined,
    TSource
  >[]
  args?: TArgDefs extends undefined ? undefined : TArgDefs
  resolver?: GeneResolverOption<TSource, TContext, TArgDefs, TReturnType>
  returnType: TReturnType extends unknown ? GraphqlReturnTypes<ValidGraphqlType> : TReturnType
  findOptions?: FindOptionsHandler<object>
}

export type FieldConfig<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
> =
  | GraphqlReturnTypes<ValidGraphqlType>
  | SomeRequired<GeneTypeConfig<TSource, TContext, TArgDefs, TReturnType>, 'resolver'>

type GeneResolverOption<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
> =
  | GeneResolver<
      TSource,
      TContext,
      FieldConfigArgsOption<TArgDefs, TReturnType>,
      TReturnType extends string ? GraphqlToTypescript<TReturnType> : unknown
    >
  | `${GENE_RESOLVER_TEMPLATES}`

export type GeneResolver<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
  TResult = unknown,
> = (options: {
  source: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs>>[0]
  args: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs>>[1]
  context: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs>>[2]
  info: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs>>[3]
}) => TResult | Promise<TResult>

export type FieldConfigArgsOption<
  TArgDefs extends ArgsDefinition,
  TReturnType extends string | unknown,
> = TArgDefs extends `${GENE_RESOLVER_TEMPLATES.default}`
  ? GeneDefaultResolverArgs<
      TReturnType extends string ? NonNullable<GraphqlToTypescript<TReturnType>> : unknown
    >
  : TArgDefs extends undefined
    ? Record<string, unknown> | undefined
    : {
        [k in keyof Narrow<TArgDefs>]: Narrow<TArgDefs>[k] extends string
          ? GraphqlToTypescript<Narrow<TArgDefs>[k]>
          : unknown
      }

export type ArgsTypeToGraphQL<ArgsType> = {
  [k in keyof Required<ArgsType>]: Required<ArgsType>[k] extends number
    ? 'Int'
    : k extends 'where' | 'order'
      ? string
      : Required<ArgsType>[k] extends string
        ? 'String'
        : Required<ArgsType>[k] extends boolean
          ? 'Boolean'
          : never
}

export type GeneDefaultResolverArgs<M> = {
  page: number
  perPage: number
  locale?: string
  id?: string
  where: {
    [k in keyof M]: Exclude<M[k], null | undefined> extends string | number | bigint | boolean
      ? OperatorInputs<Exclude<M[k], null | undefined>>
      : never
  }
  order?: keyof M extends string ? `${keyof M}_${QUERY_ORDER_ENUM}`[] : never
}

export type GeneDirective<
  TDirectiveArgs,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
> = TDirectiveArgs extends undefined
  ? (args?: TDirectiveArgs) => GeneDirectiveConfig<TDirectiveArgs, TSource, TContext, TArgs>
  : (args: TDirectiveArgs) => GeneDirectiveConfig<TDirectiveArgs, TSource, TContext, TArgs>

export type GeneDirectiveConfig<
  TDirectiveArgs = Record<string, string | number | boolean | null> | undefined,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
> = TDirectiveArgs extends undefined
  ? {
      name: string
      args?: TDirectiveArgs
      handler: GeneDirectiveHandler<TSource, TContext, TArgs>
    }
  : {
      name: string
      args: TDirectiveArgs
      handler: GeneDirectiveHandler<TSource, TContext, TArgs>
    }

export type GeneDirectiveHandler<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
  TResult = unknown,
> = (options: {
  source: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[0]
  args: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[1]
  context: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[2]
  info: Parameters<GraphQLFieldResolver<TSource, TContext, TArgs, TResult>>[3]
  field: string
  filter: <TValue>(callback: (value: TValue) => unknown) => void
  resolve: () => Promise<TResult> | TResult
}) => Promise<void> | void

export class GeneModel {
  declare static geneConfig?: GeneConfig
}

/**
 * Provide typing and default values to GeneConfig. You need to pass the model class as the first
 * argument to ensure accurate types for "include" and "exclude" options (they only accept regular
 * expressions or one of the model field name as string).
 *
 * @default geneConfig.exclude - ['createdAt', 'updatedAt']
 */
export function defineGraphqlGeneConfig<
  M = unknown,
  TSource = M | Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends ArgsDefinition = undefined,
  TReturnType extends string | unknown = unknown,
  TVarType extends GraphQLVarType = 'type',
>(_model: M, options: GeneConfig<M, TSource, TContext, TArgDefs, TReturnType, TVarType>) {
  return options
}

export function defineDirective<
  TDirectiveArgs = undefined,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
>(directive: GeneDirective<TDirectiveArgs, TSource, TContext, TArgs>) {
  return directive as GeneDirective<
    TDirectiveArgs,
    Record<string, unknown> | undefined,
    TContext,
    TArgs
  >
}

/**
 * @deprecated Field config passed to `extendTypes` don't need to be wrapped with `defineField`
 * anymore in order to be accurate (they are now even better typed without it).
 */
export function defineField<
  TSource extends Record<string, unknown> | undefined,
  TArgDefs extends StrictArgsDefinition,
  TReturnType extends GraphqlReturnTypes<ValidGraphqlType>,
  TContext = GeneContext,
>(config: Narrow<FieldConfig<TSource, TContext, TArgDefs, TReturnType>, 'args' | 'returnType'>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return config as FieldConfig<any, TContext, any, TReturnType>
}

export function defineType<
  T extends GeneObjectTypeConfig<TSource, TContext, TArgDefs>,
  TSource,
  TContext,
  TArgDefs extends ArgsDefinition,
  TVarType extends GraphQLVarType,
>(config: T, geneConfig?: GeneConfig<T, TSource, TContext, TArgDefs, string, TVarType>) {
  return {
    ...config,
    ...(typeof geneConfig !== 'undefined' && {
      geneConfig: defineGraphqlGeneConfig({} as T, geneConfig),
    }),
  } as T
}

export function defineInput<
  T extends GeneObjectTypeConfig<TSource, TContext, TArgDefs>,
  TSource,
  TContext,
  TArgDefs extends ArgsDefinition,
>(config: T) {
  return {
    ...config,
    geneConfig: defineGraphqlGeneConfig({}, { varType: 'input' }),
  }
}

export function defineEnum<TValue extends string>(values: TValue[]) {
  return values
}

export function defineUnion<TUnion extends string>(unions: TUnion[]) {
  type UnionDef = Record<TUnion, ''>
  const unionDef: Partial<UnionDef> = {}

  unions.forEach(type => (unionDef[type] = ''))

  const completeUnionDef = unionDef as Required<typeof unionDef>

  return {
    ...completeUnionDef,
    geneConfig: defineGraphqlGeneConfig({}, { varType: 'union' }),
  }
}
