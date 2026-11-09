import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { ensureInclude, getQueryInclude } from './utils'
import { markFieldAsAssociation } from './utils/associationMap'

const USER = 'DirUser'
const PROJECT = 'DirProject'

markFieldAsAssociation(PROJECT, 'owner')

const userType = new GraphQLObjectType({ name: USER, fields: { id: { type: GraphQLInt } } })
const projectType = new GraphQLObjectType({
  name: PROJECT,
  fields: { id: { type: GraphQLInt }, owner: { type: userType } },
})
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: { dirProject: { type: projectType, resolve: () => ({}) } },
  }),
})

const calls: { label: string; findOptions: unknown }[] = []
const record = (label: string) => (details: { findOptions: unknown }) => {
  calls.push({ label, findOptions: details.findOptions })
}
const dir = (name: string) => ({
  name,
  args: { name },
  handler: () => {},
  findOptions: record(name),
})

const extended = getGloballyExtendedTypes()
const snapshot = {
  config: { ...extended.config },
  geneConfig: { ...extended.geneConfig },
}

beforeAll(() => {
  extended.geneConfig[USER as never] = {
    findOptions: record('type'),
    directives: [dir('typeDir1'), dir('typeDir2')],
  } as never
  extended.config[PROJECT as never] = {
    owner: {
      returnType: USER,
      resolver: () => ({}),
      findOptions: record('field'),
      directives: [dir('fieldDir')],
    },
  } as never
})

afterAll(() => {
  extended.config = snapshot.config as typeof extended.config
  extended.geneConfig = snapshot.geneConfig as typeof extended.geneConfig
})

async function captureInfo(source: string) {
  let info: GraphQLResolveInfo | undefined
  const field = schema.getQueryType()!.getFields().dirProject
  field.resolve = (_parent, _args, _ctx, resolverInfo) => {
    info = resolverInfo
    return {}
  }
  const result = await graphql({ schema, source })
  expect(result.errors).toBeUndefined()
  return info!
}

describe('directive findOptions during include collection', () => {
  it('runs hooks in type, type directive, field, field directive order on the right frames', async () => {
    calls.length = 0
    const info = await captureInfo(`query { dirProject { owner { id } } }`)
    const includeOptions = getQueryInclude(info)!
    const ownerInclude = includeOptions.include!.find(include => include.association === 'owner')

    expect(calls.map(call => call.label)).toEqual([
      'type',
      'typeDir1',
      'typeDir2',
      'field',
      'fieldDir',
    ])
    calls.slice(0, 3).forEach(call => expect(call.findOptions).toBe(ownerInclude))
    calls.slice(3).forEach(call => expect(call.findOptions).toBe(includeOptions))
  })

  it('runs once per selected occurrence, including fragments and aliases', async () => {
    calls.length = 0
    const info = await captureInfo(
      `query { dirProject { a: owner { id } ...F } } fragment F on ${PROJECT} { b: owner { id } }`
    )
    getQueryInclude(info)
    expect(calls.filter(call => call.label === 'fieldDir')).toHaveLength(2)
  })

  it('deduplicates ensured includes across occurrences without deduplicating hook calls', async () => {
    const fieldDirectives = (
      extended.config[PROJECT as never] as { owner: { directives: { findOptions: unknown }[] } }
    ).owner.directives
    const previous = fieldDirectives[0].findOptions
    fieldDirectives[0].findOptions = (details: object) => {
      calls.push({ label: 'fieldDir', findOptions: details })
      ensureInclude(details, 'owner.profile')
    }
    calls.length = 0
    try {
      const info = await captureInfo(
        `query { dirProject { a: owner { id } ...F } } fragment F on ${PROJECT} { b: owner { id } }`
      )
      const include = getQueryInclude(info)!.include!.filter(row => row.association === 'owner')
      expect(calls.filter(call => call.label === 'fieldDir')).toHaveLength(2)
      expect(include).toHaveLength(2)
      expect(include.map(row => row.include)).toEqual([
        [expect.objectContaining({ association: 'profile' })],
        [expect.objectContaining({ association: 'profile' })],
      ])
    } finally {
      fieldDirectives[0].findOptions = previous
    }
  })
})
