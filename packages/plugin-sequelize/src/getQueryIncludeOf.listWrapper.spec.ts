import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { ensureInclude, getQueryIncludeOf } from './utils'
import { markFieldAsAssociation } from './utils/associationMap'
import {
  getGeneAssociationListWrapperTypeName,
  registerGeneAssociationListWrapper,
} from './utils/associationListRegistry'

const ORDER = 'WrapperTargetOrder'
const ITEM = 'WrapperTargetItem'
const WRAPPER = getGeneAssociationListWrapperTypeName(ORDER, 'items')

markFieldAsAssociation(ORDER, 'items')
markFieldAsAssociation(ITEM, 'product')
registerGeneAssociationListWrapper(WRAPPER, {
  parentGraphqlType: ORDER,
  associationField: 'items',
  targetGraphqlType: ITEM,
})

const productType = new GraphQLObjectType({
  name: 'WrapperTargetProduct',
  fields: { id: { type: GraphQLInt } },
})
const itemType = new GraphQLObjectType({
  name: ITEM,
  fields: { id: { type: GraphQLInt }, product: { type: productType } },
})
const wrapperType = new GraphQLObjectType({
  name: WRAPPER,
  fields: { count: { type: GraphQLInt }, items: { type: new GraphQLList(itemType) } },
})
const orderType = new GraphQLObjectType({
  name: ORDER,
  fields: { id: { type: GraphQLInt }, items: { type: wrapperType } },
})
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: { order: { type: orderType, resolve: () => ({}) } },
  }),
})

const extended = getGloballyExtendedTypes()
const snapshot = { geneConfig: { ...extended.geneConfig } }

beforeAll(() => {
  extended.geneConfig[ITEM as never] = {
    findOptions(details: object) {
      ensureInclude(details, 'product')
    },
  } as never
})

afterAll(() => {
  extended.geneConfig = snapshot.geneConfig as typeof extended.geneConfig
})

async function captureInfo(source: string) {
  let info: GraphQLResolveInfo | undefined
  schema.getQueryType()!.getFields().order.resolve = (_parent, _args, _ctx, resolverInfo) => {
    info = info ?? resolverInfo
    return {}
  }
  const result = await graphql({ schema, source })
  expect(result.errors).toBeUndefined()
  return info!
}

describe('getQueryIncludeOf with a target inside a list wrapper', () => {
  it("applies the target type's findOptions to the returned include", async () => {
    const info = await captureInfo(`query { order { items { items { id } } } }`)
    expect(getQueryIncludeOf(info, ITEM, { lookFromOperationRoot: true })?.include).toEqual([
      expect.objectContaining({ association: 'product' }),
    ])
  })
})
