import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { getQueryInclude } from './utils/public'
import { markFieldAsAssociation } from './utils/associationMap'

const PROFILE = 'CollectorProfile'
const USER = 'CollectorUser'
const SETTINGS = 'CollectorSettings'

markFieldAsAssociation(USER, 'profile')

const profileType = new GraphQLObjectType({ name: PROFILE, fields: { id: { type: GraphQLInt } } })
const settingsType = new GraphQLObjectType({ name: SETTINGS, fields: { id: { type: GraphQLInt } } })
const userType = new GraphQLObjectType({
  name: USER,
  fields: {
    id: { type: GraphQLInt },
    profile: { type: profileType },
    settings: { type: settingsType },
  },
})
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: { collectorMe: { type: userType, resolve: () => ({}) } },
  }),
})

async function captureInfo(source: string) {
  let capturedInfo: GraphQLResolveInfo | undefined
  const queryType = schema.getQueryType()!
  const field = queryType.getFields().collectorMe
  const originalResolve = field.resolve
  field.resolve = (parent, args, ctx, info) => {
    capturedInfo = capturedInfo ?? info
    return originalResolve ? originalResolve(parent, args, ctx, info) : {}
  }
  const result = await graphql({ schema, source })
  expect(result.errors).toBeUndefined()
  expect(capturedInfo).toBeDefined()
  return capturedInfo!
}

const extended = getGloballyExtendedTypes()
const snapshot = {
  config: { ...extended.config },
  geneConfig: { ...extended.geneConfig },
}

const seen: { state: unknown; findOptions: unknown }[] = []

beforeAll(() => {
  extended.geneConfig[PROFILE as never] = {
    findOptions(details: { findOptions: { include?: unknown[] } }) {
      details.findOptions.include = details.findOptions.include || []
      details.findOptions.include.push({ association: 'avatar' })
    },
  } as never
  extended.geneConfig[SETTINGS as never] = {
    findOptions(details: { findOptions: { include?: unknown[] } }) {
      details.findOptions.include = details.findOptions.include || []
      details.findOptions.include.push({ association: 'leaked' })
    },
  } as never
  extended.config[USER as never] = {
    id: {
      returnType: 'Int',
      resolver: () => 1,
      findOptions(details: { state: unknown; findOptions: unknown }) {
        seen.push({ state: details.state, findOptions: details.findOptions })
      },
    },
  } as never
})

afterAll(() => {
  extended.config = snapshot.config as typeof extended.config
  extended.geneConfig = snapshot.geneConfig as typeof extended.geneConfig
})

describe('collector frames', () => {
  it('runs type hooks on each aliased occurrence of the same association', async () => {
    const info = await captureInfo(`query { collectorMe { a: profile { id } b: profile { id } } }`)
    expect(getQueryInclude(info)?.include).toEqual([
      expect.objectContaining({ association: 'profile', include: [{ association: 'avatar' }] }),
      expect.objectContaining({ association: 'profile', include: [{ association: 'avatar' }] }),
    ])
  })

  it('does not invent an include for a non-association object field', async () => {
    const info = await captureInfo(`query { collectorMe { settings { id } } }`)
    expect(getQueryInclude(info)).toBeUndefined()
  })

  it('passes the plain include as both state and findOptions to field hooks', async () => {
    seen.length = 0
    const info = await captureInfo(`query { collectorMe { id profile { id } } }`)
    const includeOptions = getQueryInclude(info)
    expect(seen).toHaveLength(1)
    expect(seen[0].state).toBe(seen[0].findOptions)
    expect(seen[0].findOptions).toBe(includeOptions)
  })

  it('propagates hook errors instead of swallowing them', async () => {
    const previous = extended.geneConfig[PROFILE as never]
    extended.geneConfig[PROFILE as never] = {
      findOptions() {
        throw new Error('boom')
      },
    } as never
    try {
      const info = await captureInfo(`query { collectorMe { profile { id } } }`)
      expect(() => getQueryInclude(info)).toThrow('boom')
    } finally {
      extended.geneConfig[PROFILE as never] = previous
    }
  })
})
