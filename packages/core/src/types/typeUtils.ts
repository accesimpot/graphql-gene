import type { GenePluginSettings } from './extendable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObject = Record<string, any>

export type NestedObject = { [k: string]: NestedObject }

/** Transform immutable objects to mutable */
export type Mutable<Immutable> = {
  -readonly [K in keyof Immutable]: Immutable[K]
}
export function getMutable<T>(immutable: T) {
  return immutable as Mutable<T>
}

export type ValueOf<T> = T[keyof T]

export type SomeRequired<T, K extends keyof T> = T & { [k in K]-?: T[k] }

type NotPossiblyUndefinedKeys<T> = Exclude<
  { [k in keyof T]: T[k] extends Exclude<T[k], undefined> ? k : never }[keyof T],
  undefined
>

export type PossiblyUndefinedToPartial<T> =
  NotPossiblyUndefinedKeys<T> extends never
    ? Partial<T>
    : SomeRequired<Partial<T>, NotPossiblyUndefinedKeys<T>>

type Hyphenize<T extends string, A extends string = ''> = T extends `${infer F}${infer R}`
  ? Kebab<R, `${A}${F extends Lowercase<F> ? '' : '-'}${Lowercase<F>}`>
  : A

type TrimHyphen<T extends string> = T extends `-${infer R}` ? R : T

export type Kebab<T extends string, A extends string = ''> = TrimHyphen<Hyphenize<T, A>>

type InferFieldKeys<M> = {
  [k in keyof GenePluginSettings<M>]: GenePluginSettings<M>[k]['isMatching'] extends true
    ? GenePluginSettings<M>[k]['fieldName']
    : never
}[keyof GenePluginSettings<M>]

export type InferFields<M> = InferFieldKeys<M> extends never ? unknown : InferFieldKeys<M>
