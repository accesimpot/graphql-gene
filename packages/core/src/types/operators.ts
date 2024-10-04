export type OperatorInputs<T extends string | number | bigint | boolean | null | undefined> =
  OperatorInputsBase<T> &
    (T extends string ? OperatorInputsString<T> : object) &
    (T extends number | bigint
      ? OperatorInputsNumber<T>
      : T extends Date
        ? OperatorInputsNumber<T>
        : object)

export type OperatorInputsBase<T extends string | number | bigint | boolean | null | undefined> = {
  eq?: T
  ne?: T
  in?: T[]
  notIn?: T[]
  null?: boolean
}

type OperatorInputsString<T> = {
  like?: T
  notLike?: T
}

type OperatorInputsNumber<T> = {
  lt?: T
  lte?: T
  gt?: T
  gte?: T
}
