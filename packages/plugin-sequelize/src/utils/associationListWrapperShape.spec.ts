import { describe, expect, it, vi } from 'vitest'
import {
  GraphQLBoolean,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
  Kind,
  type SelectionSetNode,
} from 'graphql'

vi.mock('graphql-lookahead', () => ({
  lookDeeper: vi.fn(({ next }: { next?: (d: { field: string }) => Record<string, unknown> }) => {
    next?.({ field: 'items' })
    next?.({ field: 'count' })
  }),
}))

import {
  isAssociationListWrapperOutputType,
  scanAssociationWrapperFacets,
} from './associationListWrapperShape'

describe('associationListWrapperShape', () => {
  it('isAssociationListWrapperOutputType duck-types count + list items (including NonNull-wrapped lists)', () => {
    const item = new GraphQLObjectType({
      name: 'ShapeItem',
      fields: { id: { type: GraphQLInt } },
    })

    const wrapper = new GraphQLObjectType({
      name: 'ShapeWrapper',
      fields: {
        count: { type: new GraphQLNonNull(GraphQLInt) },
        items: { type: new GraphQLList(new GraphQLNonNull(item)) },
      },
    })

    expect(isAssociationListWrapperOutputType(wrapper)).toBe(true)
    expect(isAssociationListWrapperOutputType(GraphQLString)).toBe(false)

    const missingCount = new GraphQLObjectType({
      name: 'NoCount',
      fields: {
        items: { type: new GraphQLList(new GraphQLNonNull(item)) },
      },
    })
    expect(isAssociationListWrapperOutputType(missingCount)).toBe(false)

    const badItems = new GraphQLObjectType({
      name: 'ItemsNotList',
      fields: {
        count: { type: GraphQLInt },
        items: { type: GraphQLBoolean },
      },
    })
    expect(isAssociationListWrapperOutputType(badItems)).toBe(false)
  })

  it('scanAssociationWrapperFacets delegates to lookDeeper', async () => {
    const { lookDeeper } = await import('graphql-lookahead')

    const selectionSet: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: [],
    }

    const flags = scanAssociationWrapperFacets({} as never, 'SomeWrapper', selectionSet)

    expect(lookDeeper).toHaveBeenCalled()
    expect(flags).toEqual({ hasItems: true, hasCount: true })
  })
})
