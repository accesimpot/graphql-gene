import type { GraphQLFieldResolver } from 'graphql'
import type { GeneContext } from 'graphql-gene/context'
import type {
  GraphQLFieldName,
  GraphqlReturnTypes,
  GraphqlToTypescript,
  GraphqlTypeName,
  GraphQLVarType,
  InferFields,
  OperatorInputs,
  SomeRequired,
  ValidGraphqlType,
} from './types'
import type { GENE_RESOLVER_TEMPLATES, QUERY_ORDER_ENUM } from './constants'

export type GeneConfigTypes<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends Record<string, string> | undefined = undefined,
  TReturnType extends string | unknown = unknown,
> =
  | readonly string[]
  | (Record<
      GraphQLFieldName,
      | GraphqlReturnTypes<ValidGraphqlType | ''>
      | GeneTypeConfig<TSource, TContext, TArgDefs, TReturnType>
    > & { geneConfig?: GeneConfig })

export interface GeneConfig<
  M = unknown,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends Record<string, string> | undefined = undefined,
  TReturnType extends string | unknown = unknown,
  TVarType extends GraphQLVarType = 'type',
> {
  include?: (InferFields<M> | RegExp)[]
  exclude?: (InferFields<M> | RegExp)[]

  includeTimestamps?: boolean | ('createdAt' | 'updatedAt')[]

  varType?: TVarType

  directives?: GeneDirectiveConfig[]

  /**
   * Model aliases added to global.GeneRefs['modelAliases'] will be used to validate the keys of
   * the "aliases" option. The values of "aliases" would be nested GeneConfig properties that
   * overwrites defined to the default model name.
   *
   * @example
   * aliases: {
   *   // AuthenticatedUser might allow more fields in its graphql type than a normal User
   *   AuthenticatedUser: {
   *     includes: [
   *       'id',
   *       'email',
   *       'someSensibleData',
   *       // ...
   *     ],
   *   },
   * },
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

  types?: {
    [k in 'Query' | 'Mutation']?: Record<
      GraphQLFieldName,
      FieldConfig<
        TSource,
        TContext,
        TArgDefs,
        TReturnType extends unknown ? GraphqlReturnTypes<ValidGraphqlType> : TReturnType
      >
    >
  }
}

export type GeneTypeConfig<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends Record<string, string> | undefined = undefined,
  TReturnType extends string | unknown = unknown,
> = {
  directives?: GeneDirectiveConfig[]
  args?: TArgDefs extends undefined ? undefined : TArgDefs
  returnType: TReturnType extends unknown ? GraphqlReturnTypes<ValidGraphqlType> : TReturnType
  resolver?:
    | GeneResolver<
        TSource,
        TContext,
        TArgDefs extends undefined
          ? Record<string, unknown> | undefined
          : {
              [k in keyof TArgDefs]: TArgDefs[k] extends string
                ? GraphqlToTypescript<TArgDefs[k]>
                : unknown
            },
        TReturnType extends string ? GraphqlToTypescript<TReturnType> : unknown
      >
    | `${GENE_RESOLVER_TEMPLATES}`
}

export type FieldConfig<
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends Record<string, string> | undefined = undefined,
  TReturnType extends string | unknown = unknown,
> =
  | GraphqlReturnTypes<ValidGraphqlType>
  | SomeRequired<GeneTypeConfig<TSource, TContext, TArgDefs, TReturnType>, 'resolver'>

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
    [k in keyof M]: M[k] extends string | number | bigint | boolean | null | undefined
      ? OperatorInputs<M[k]>
      : never
  }
  order?: keyof M extends string ? `${keyof M}_${QUERY_ORDER_ENUM}`[] : never
}

export type GeneDirective<
  TDirectiveArgs,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
> = (args: TDirectiveArgs) => GeneDirectiveConfig<TDirectiveArgs, TSource, TContext, TArgs>

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
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgDefs extends Record<string, string> | undefined = undefined,
>(_model: M, options: GeneConfig<M, TSource, TContext, TArgDefs>) {
  return options
}

export function defineDirective<
  TDirectiveArgs,
  TSource = Record<string, unknown> | undefined,
  TContext = GeneContext,
  TArgs = Record<string, unknown> | undefined,
>(
  directive: GeneDirective<TDirectiveArgs, TSource, TContext, TArgs>
): GeneDirective<TDirectiveArgs, TSource, TContext, TArgs> {
  return directive
}

export function defineField<
  TSource extends Record<string, unknown> | undefined,
  TArgDefs extends Record<string, GraphqlReturnTypes<ValidGraphqlType>>,
  TReturnType extends GraphqlReturnTypes<ValidGraphqlType>,
  TContext = GeneContext,
>(config: FieldConfig<TSource, TContext, TArgDefs, TReturnType>) {
  /**
   * We need to infer `TArgDefs` to use accurate types inside the resolver function, but we want
   * "defineField" to return a generic `Record<string, unknown>` as ArgDefs to allow adding the
   * field config to `defineGraphqlGeneConfig` (where `args` doesn't need accurate typing).
   */
  return config as FieldConfig<TSource, TContext, Record<string, string> | undefined, TReturnType>
}
