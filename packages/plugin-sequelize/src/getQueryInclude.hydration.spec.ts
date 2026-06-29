import { describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { createUnitAssocSqlite } from './associationListResolvers.fixtures'
import { getQueryInclude } from './utils/public'
import {
  getGeneAssociationListWrapperTypeName,
  registerGeneAssociationListWrapper,
} from './utils/associationListRegistry'
import { markFieldAsAssociation } from './utils/associationMap'
import { isGeneHydrationInclude } from './utils/includePostProcess'

describe('getQueryInclude hydration includes', () => {
  it('adds hydration-marked includes when wrapper items facet is selected', async () => {
    const { sequelize, UnitParent, UnitChild } = await createUnitAssocSqlite()

    try {
      const wrapperName = getGeneAssociationListWrapperTypeName('Order', 'items')
      registerGeneAssociationListWrapper(wrapperName, {
        parentGraphqlType: 'Order',
        associationField: 'items',
        targetGraphqlType: 'UnitChild',
      })
      markFieldAsAssociation('Order', 'items')

      const childType = new GraphQLObjectType({
        name: 'UnitChild',
        fields: { id: { type: GraphQLInt } },
      })

      const wrapperType = new GraphQLObjectType({
        name: wrapperName,
        fields: {
          count: { type: GraphQLInt },
          items: { type: new GraphQLList(childType) },
        },
      })

      const orderType = new GraphQLObjectType({
        name: 'Order',
        fields: {
          itemCountViaHydratedSource: { type: new GraphQLNonNull(GraphQLInt) },
          items: { type: wrapperType },
        },
      })

      let capturedInfo: GraphQLResolveInfo | undefined

      const schema = new GraphQLSchema({
        query: new GraphQLObjectType({
          name: 'Query',
          fields: {
            order: {
              type: orderType,
              args: { id: { type: GraphQLString } },
              resolve: (_parent, _args, _ctx, info) => {
                capturedInfo = info
                return {}
              },
            },
          },
        }),
      })

      await graphql({
        schema,
        source: `query { order(id: "1") { itemCountViaHydratedSource items { items { id } } } }`,
      })

      expect(capturedInfo).toBeDefined()
      const includeOptions = getQueryInclude(capturedInfo!)
      expect(includeOptions?.include).toEqual([expect.objectContaining({ association: 'items' })])
      expect(isGeneHydrationInclude(includeOptions?.include?.[0])).toBe(true)
    } finally {
      await sequelize.close()
    }
  })
})
