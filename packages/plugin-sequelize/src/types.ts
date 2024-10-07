import type { AnyObject } from 'graphql-gene'
import type { WhereAttributeHash } from 'sequelize'

export type GeneSequelizeWhereOptions = {
  [k in keyof WhereAttributeHash<AnyObject> | symbol]: k extends symbol
    ? WhereAttributeHash<AnyObject>[]
    : WhereAttributeHash<AnyObject>[k extends symbol ? never : k]
}
