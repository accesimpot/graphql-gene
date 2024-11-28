import { AND_OR_OPERATORS, type GeneDefaultResolverArgs, type ValueOf } from 'graphql-gene'
import type { GeneSequelizeWhereOptions } from '../types'
import { GENE_TO_SEQUELIZE_OPERATORS } from '../constants'

export function populateWhereOptions<M>(
  whereArgs: GeneDefaultResolverArgs<M>['where'],
  state: GeneSequelizeWhereOptions
) {
  for (const attr in whereArgs) {
    const parseOperators = (
      operator: string,
      value:
        | (typeof whereArgs)[keyof typeof whereArgs]
        | (typeof whereArgs)[keyof typeof whereArgs][]
    ) => {
      if (!(operator in GENE_TO_SEQUELIZE_OPERATORS)) return

      const findOptionsGetter =
        GENE_TO_SEQUELIZE_OPERATORS[operator as keyof typeof GENE_TO_SEQUELIZE_OPERATORS]
      return findOptionsGetter(value as string)
    }

    if (AND_OR_OPERATORS.includes(attr)) {
      const nestedWheres: ValueOf<GeneSequelizeWhereOptions>[] = []
      const parsedOperators = parseOperators(attr, nestedWheres)

      if (parsedOperators) {
        const [op] = parsedOperators
        state[op] = nestedWheres as (typeof state)[symbol]

        if (Array.isArray(state[op]) && Array.isArray(whereArgs[attr])) {
          whereArgs[attr].forEach((nestedWhereArgs: typeof whereArgs) => {
            const nextState = {} as GeneSequelizeWhereOptions
            state[op].push(nextState)
            populateWhereOptions(nestedWhereArgs, nextState)
          })
        }
      }
    } else {
      state[attr] = state[attr] || {}

      Object.entries(whereArgs[attr]).forEach(([operator, value]) => {
        const parsedOperators = parseOperators(operator, value)
        if (!parsedOperators) return

        const [op, opValue] = parsedOperators
        state[attr][op] = opValue
      })
    }
  }
}
