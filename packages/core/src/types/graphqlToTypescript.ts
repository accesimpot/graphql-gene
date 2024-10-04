import type { GraphqlTypes } from "./graphql"
import type { PossiblyUndefinedToPartial } from "./typeUtils"

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

export type GeneTypesToTypescript<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k in keyof T]: PrototypeOrNot<T[k]> extends { sequelize: any }
    ? PrototypeOrNot<T[k]>
    : T[k] extends string[] | readonly string[]
      ? GraphqlEnumToTypescript<T[k]>
      : T[k] extends Record<string, string>
        ? GraphqlObjToTypescript<T[k]>
        : unknown
}

export type GraphqlToTypescript<
  GqlReturnType extends string,
> = GraphqlToTypescriptMap<GqlReturnType, TrimGqlType<GqlReturnType>>

type GraphqlToTypescriptMap<
  GqlReturnType extends string,
  TrimedGqlType extends string,
> = TrimedGqlType extends 'ID' | 'String'
  ? GqlTypeToTs<GqlReturnType, string>
  : TrimedGqlType extends 'Int' | 'Float'
    ? GqlTypeToTs<GqlReturnType, number>
    : TrimedGqlType extends 'Boolean'
      ? GqlTypeToTs<GqlReturnType, boolean>
      : TrimedGqlType extends 'DateTime' | 'Date'
        ? GqlTypeToTs<GqlReturnType, Date>
        : TrimedGqlType extends 'JSON'
          ? GqlTypeToTs<GqlReturnType, object>
          : TrimedGqlType extends keyof GraphqlTypes
            ? GqlTypeToTs<GqlReturnType, GraphqlTypes[TrimedGqlType]>
            : unknown

export type GraphqlObjToTypescript<
  T extends Record<string, string>
> = PossiblyUndefinedToPartial<{
  [k in keyof T]: GraphqlToTypescript<T[k]>
}>

export type GraphqlEnumToTypescript<T extends string[] | readonly string[]> = {
  readonly [k in keyof T]: T[k]
}[number]
