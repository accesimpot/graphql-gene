import { describe, expect, it } from 'vitest'
import { GraphQLObjectType, getNamedType, isListType } from 'graphql'
import { schema } from '../server/schema'
import { isAssociationListWrapperOutputType } from '../../../plugin-sequelize/src/utils/associationListWrapperShape'

describe('schema association list wrappers', () => {
  it('exposes Order.items as a Gene association list wrapper type', () => {
    const order = schema.getType('Order')
    expect(order).toBeInstanceOf(GraphQLObjectType)

    const items = (order as GraphQLObjectType).getFields().items
    const named = getNamedType(items.type)
    expect(named.name).toContain('GeneAssociationListResult')

    if (named instanceof GraphQLObjectType) {
      const wrapperFields = named.getFields()
      expect(wrapperFields.count).toBeDefined()
      expect(wrapperFields.items?.type.toString()).toBe('[OrderItem!]!')
    }

    expect(isAssociationListWrapperOutputType(items.type)).toBe(true)
  })
})
