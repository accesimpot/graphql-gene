import { describe, expect, it, afterEach } from 'vitest'
import {
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { getQueryInclude, getQueryIncludeOf } from './utils/public'
import { markFieldAsAssociation } from './utils/associationMap'

const ORDER_TYPE = 'ContextOrder'
const PRODUCT_TYPE = 'ContextProduct'

async function captureInfo(source: string) {
  let capturedInfo: GraphQLResolveInfo | undefined

  const productType = new GraphQLObjectType({
    name: PRODUCT_TYPE,
    fields: { id: { type: GraphQLInt } },
  })

  const orderType = new GraphQLObjectType({
    name: ORDER_TYPE,
    fields: {
      id: { type: GraphQLInt },
      itemTotalQuantity: { type: new GraphQLNonNull(GraphQLInt) },
      product: { type: productType },
    },
  })

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

  await graphql({ schema, source })
  expect(capturedInfo).toBeDefined()
  return capturedInfo!
}

describe('getQueryInclude context for findOptions', () => {
  afterEach(() => {
    const globalTypes = getGloballyExtendedTypes()
    delete globalTypes.config[ORDER_TYPE]
    delete globalTypes.geneConfig[PRODUCT_TYPE]
  })

  it('forwards context to field-level findOptions', async () => {
    const received: unknown[] = []
    const context = { request: { headers: { 'x-tenant-id': 'acme' } } }

    getGloballyExtendedTypes().config[ORDER_TYPE] = {
      itemTotalQuantity: {
        returnType: 'Int!',
        findOptions({ context: findOptionsContext }) {
          received.push(findOptionsContext)
        },
        resolver: () => 0,
      },
    }

    const info = await captureInfo(`query { order(id: "1") { itemTotalQuantity } }`)
    getQueryInclude(info, { context })

    expect(received).toEqual([context])
  })

  it('forwards context to type-level findOptions', async () => {
    const received: unknown[] = []
    const context = { request: { headers: { authorization: 'Bearer tok' } } }

    markFieldAsAssociation(ORDER_TYPE, 'product')
    getGloballyExtendedTypes().geneConfig[PRODUCT_TYPE] = {
      findOptions({ context: findOptionsContext }) {
        received.push(findOptionsContext)
      },
    }

    const info = await captureInfo(`query { order(id: "1") { product { id } } }`)
    getQueryInclude(info, { context })

    expect(received).toEqual([context])
  })

  it('defaults context to an empty object when omitted', async () => {
    const received: unknown[] = []

    getGloballyExtendedTypes().config[ORDER_TYPE] = {
      itemTotalQuantity: {
        returnType: 'Int!',
        findOptions({ context: findOptionsContext }) {
          received.push(findOptionsContext)
        },
        resolver: () => 0,
      },
    }

    const info = await captureInfo(`query { order(id: "1") { itemTotalQuantity } }`)
    getQueryInclude(info)

    expect(received).toEqual([{}])
  })

  it('forwards context through getQueryIncludeOf', async () => {
    const received: unknown[] = []
    const context = { locale: 'fr-CA' }

    getGloballyExtendedTypes().config[ORDER_TYPE] = {
      itemTotalQuantity: {
        returnType: 'Int!',
        findOptions({ context: findOptionsContext }) {
          received.push(findOptionsContext)
        },
        resolver: () => 0,
      },
    }

    const info = await captureInfo(`query { order(id: "1") { itemTotalQuantity } }`)
    getQueryIncludeOf(info, ORDER_TYPE, { lookFromOperationRoot: true, context })

    expect(received).toEqual([context])
  })
})
