import type { GenePluginSettings } from 'graphql-gene/plugin-settings'
import type { GraphqlTypes } from './graphql'
import type { NeverToUnknown, PossiblyUndefinedToPartial, ValueOf } from './typeUtils'

export type GraphqlReturnTypes<TModels extends string> =
  | TModels
  | `${TModels}!`
  | `[${TModels}]`
  | `[${TModels}!]`
  | `[${TModels}]!`
  | `[${TModels}!]!`

export type TrimGqlType<T extends string> = T extends `${infer R}!`
  ? TrimGqlType<R>
  : T extends `[${infer R}`
    ? TrimGqlType<R>
    : T extends `${infer R}]`
      ? TrimGqlType<R>
      : T

export type GqlTypeToTs<T extends string, A> = T extends `${infer R}!`
  ? GqlArrayTypeToTs<R, A>
  : GqlArrayTypeToTs<T, A> | undefined | null

type GqlArrayTypeToTs<T extends string, A> = T extends `${infer R}]`
  ? GqlArrayTypeToTs<R, A>
  : T extends `[${infer R}`
    ? GqlArrayTypeToTs<R, (R extends `${string}!` ? A : A | undefined | null)[]>
    : A

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrototypeOrNot<T> = T extends { prototype: any } ? T['prototype'] : T

type IsUnionGeneType<T> = 'geneConfig' extends keyof T
  ? 'varType' extends keyof T['geneConfig']
    ? NonNullable<T['geneConfig']['varType']> extends 'union'
      ? true
      : false
    : false
  : false

export type GeneTypesToTypescript<T> = {
  [k in keyof T]: HasPluginMatching<T[k]> extends true
    ? PrototypeOrNot<T[k]>
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T[k] extends { prototype: any }
      ? Omit<PrototypeOrNot<T[k]>, 'geneConfig'>
      : T[k] extends string[] | readonly string[]
        ? GraphqlEnumToTypescript<T[k]>
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          T[k] extends Record<string, any>
          ? IsUnionGeneType<T[k]> extends true
            ? GraphqlUnionToTypescript<Omit<T[k], 'geneConfig'>>
            : GraphqlObjToTypescript<Omit<T[k], 'geneConfig'>>
          : never
}

export type GraphqlToTypescript<GqlReturnType extends string> = GraphqlToTypescriptMap<
  GqlReturnType,
  TrimGqlType<GqlReturnType>
>

type GraphqlToTypescriptMap<
  GqlReturnType extends string,
  TrimmedGqlType extends string,
> = TrimmedGqlType extends 'ID' | 'String'
  ? GqlTypeToTs<GqlReturnType, string>
  : TrimmedGqlType extends 'Int' | 'Float'
    ? GqlTypeToTs<GqlReturnType, number>
    : TrimmedGqlType extends 'Boolean'
      ? GqlTypeToTs<GqlReturnType, boolean>
      : TrimmedGqlType extends 'DateTime' | 'Date'
        ? GqlTypeToTs<GqlReturnType, Date>
        : TrimmedGqlType extends 'JSON'
          ? GqlTypeToTs<GqlReturnType, object>
          : TrimmedGqlType extends keyof GraphqlTypes
            ? GqlTypeToTs<GqlReturnType, GraphqlTypes[TrimmedGqlType]>
            : unknown

export type GraphqlObjToTypescript<T extends Record<string, string>> = PossiblyUndefinedToPartial<{
  [k in keyof T]: GraphqlToTypescript<T[k]>
}>

export type GraphqlEnumToTypescript<T extends string[] | readonly string[]> = {
  readonly [k in keyof T]: T[k]
}[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GraphqlUnionToTypescript<T extends Record<string, any>> = ValueOf<{
  [k in keyof T]: k extends keyof GraphqlTypes ? GraphqlTypes[k] : unknown
}>

type InferFieldKeys<M> = {
  [k in keyof GenePluginSettings<M>]: GenePluginSettings<M>[k]['isMatching'] extends true
    ? GenePluginSettings<M>[k]['fieldName']
    : never
}[keyof GenePluginSettings<M>]

export type InferFields<M> =
  HasPluginMatching<M> extends true ? NeverToUnknown<InferFieldKeys<M>> : keyof M

type HasPluginMatchingOrNever<M> = {
  [k in keyof GenePluginSettings<M>]: GenePluginSettings<M>[k]['isMatching'] extends true
    ? true
    : never
}[keyof GenePluginSettings<M>]

export type HasPluginMatching<M> = HasPluginMatchingOrNever<M> extends never ? false : true
