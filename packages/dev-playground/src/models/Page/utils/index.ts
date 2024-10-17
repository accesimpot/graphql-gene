export * from './mockPages'

type Entries<T> = {
  [K in keyof T]-?: Exclude<T[K], null | undefined> extends never ? never : [K, T[K]]
}[keyof T][]

type NullableString = string | null | undefined

export function getEntries<T extends object>(obj: T) {
  return Object.entries(obj) as Entries<T>
}

export const FILTER_MAP = (() => {
  // To improve: should not always be `string` but rather the inferred type of the field
  const isEq = (value: NullableString, input: string) => value === input
  const isIn = (value: NullableString, input: string[]) => !!(value && input.includes(value))
  const isNull = (value: NullableString, input: boolean) =>
    (input && value === null) || (!input && value !== null)
  const isLike = (value: NullableString, input: string) => {
    if (!value) return false

    const regexString = [
      input.startsWith('%') ? '' : '^',
      input.replace(/(^%)?([^%]+)(%$)?/, '$2'),
      input.endsWith('%') ? '' : '$',
    ].join('')

    return new RegExp(regexString, 'i').test(value)
  }

  return {
    eq: isEq,
    ne: (...args: Parameters<typeof isEq>) => !isEq(...args),
    in: isIn,
    notIn: (...args: Parameters<typeof isIn>) => !isIn(...args),
    null: isNull,
    like: isLike,
    notLike: (...args: Parameters<typeof isLike>) => !isLike(...args),
  }
})()
