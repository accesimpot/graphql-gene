// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObject = Record<string, any>

export type NestedObject = { [k: string]: NestedObject }

/** Transform immutable objects to mutable */
export type Mutable<Immutable> = {
  -readonly [K in keyof Immutable]: Immutable[K]
}

export function getMutable<T extends string>(immutable: T[]) {
  return immutable as Mutable<T[]>
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
export type NeverToUnknown<T> = T extends never ? unknown : T

type Try<A1, A2, Catch = never> = A1 extends A2 ? A1 : Catch

type Narrowable = string | number | bigint | boolean

type NarrowRaw<A> =
  | (A extends [] ? [] : never)
  | (A extends Narrowable ? A : never)
  | {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      [K in keyof A]: A[K] extends Function ? A[K] : NarrowRaw<A[K]>
    }

/**
 * Allow you to infer the values of an object inside another object without using `as const`.
 *
 * @example
 * type Example = Narrow<{ args: { page: 'Int' } }>
 *
 * // Example['args'] will be of type `{ email: 'Int' }` instead of `{ email: string }`
 */
export type Narrow<A> = Try<A, [], NarrowRaw<A>>
