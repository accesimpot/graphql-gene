// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObject = Record<string, any>

export type NestedObject = { [k: string]: NestedObject }

/** Transform immutable objects to mutable */
export type Mutable<Immutable> = {
  -readonly [K in keyof Immutable]: Immutable[K]
}

export function getMutable<T extends string>(immutable: T[] | readonly T[]) {
  return immutable as Mutable<T[]>
}

export type Prop<T, K> = K extends keyof T ? T[K] : never

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

/**
 * A type that represents either a value of type T or a function that returns T.
 * Useful for avoiding circular dependencies by allowing lazy evaluation.
 */
export type TypeOrFunction<T> = T | (() => T)

/**
 * Allow you to infer the values of an object inside another object without using `as const`.
 *
 * @example
 * function doSomething<T>(obj: Narrow<T>) {
 *   return obj
 * }
 * const something = doSomething({ args: { page: 'Int' } })
 *
 * // `something.args.page` will be of type `'Int'` instead of `string`
 *
 * @see https://stackoverflow.com/a/75881801/1895428
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Narrow<T, SpecificProps = any> =
  | (T extends infer U ? U : never)
  | Extract<T, number | string | boolean | bigint | symbol | null | undefined | []>
  | ([T] extends [[]] ? [] : { [K in keyof T]: K extends SpecificProps ? Narrow<T[K]> : never })
