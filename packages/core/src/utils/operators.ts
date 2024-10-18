type Entries<T> = {
  [K in keyof T]-?: Exclude<T[K], null | undefined> extends never ? never : [K, T[K]]
}[keyof T][]

type Nullable<T> = T | null | undefined

export function getEntries<T extends object>(obj: T) {
  return Object.entries(obj) as Entries<T>
}

export function getOperatorMap<T>(type: T) {
  // Generic operators
  const isEq = (value: Nullable<T>, input: T) => value === input
  const isIn = (value: Nullable<T>, input: T[]) => !!(value && input.includes(value))
  const isNull = (value: Nullable<T>, input: boolean) =>
    (input && value === null) || (!input && value !== null)

  // String operators
  const isLike = (value: Nullable<string>, input: string) => {
    if (!value) return false

    const regexString = [
      input.replace(/(^%)?([^%]+)(%$)?/, '$2'),
      input.endsWith('%') ? '' : '$',
    ].join('')

    return new RegExp(regexString, 'i').test(value)
  }

  let operatorMap = (<T extends object>(map: T) =>
    map as T & { like?: typeof isLike; notLike?: typeof isLike })({
    eq: isEq,
    ne: (...args: Parameters<typeof isEq>) => !isEq(...args),
    in: isIn,
    notIn: (...args: Parameters<typeof isIn>) => !isIn(...args),
    null: isNull,
  })

  if (typeof type === 'string') {
    operatorMap = {
      ...operatorMap,
      like: isLike,
      notLike: (...args: Parameters<typeof isLike>) => !isLike(...args),
    }
  }
  return operatorMap
}
