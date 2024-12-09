import type { AnyObject } from 'graphql-gene'
import type { IncludeOptions, WhereAttributeHash } from 'sequelize'

export type GeneSequelizeWhereOptions = {
  [k in keyof WhereAttributeHash<AnyObject> | symbol]: k extends symbol
    ? WhereAttributeHash<AnyObject>[]
    : WhereAttributeHash<AnyObject>[k extends symbol ? never : k]
}

export type DefaultResolverIncludeOptions = Pick<
  IncludeOptions,
  'where' | 'order' | 'association' | 'limit'
> & {
  include?: DefaultResolverIncludeOptions[]
  /**
   * "offset" is missing in IncludeOptions
   * @see https://github.com/sequelize/sequelize/issues/12969
   */
  offset?: number
}
