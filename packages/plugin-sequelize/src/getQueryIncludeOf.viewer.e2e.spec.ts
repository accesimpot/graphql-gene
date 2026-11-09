import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GraphQLInt,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { ensureIncludeBehind, getQueryIncludeOf } from './utils'

const VIEWER = 'E2eViewer'
const PROJECT = 'E2eProject'

const requiresViewerIncludes = (path: string) => ({
  name: 'requiresViewerIncludes',
  args: { path },
  handler: () => {},
  findOptions: (details: object) => {
    ensureIncludeBehind(details, path, VIEWER, { at: 'root' })
  },
})

const loadViewer = vi.fn((findOptions: unknown) => ({ findOptions }))
let viewerCache: ReturnType<typeof loadViewer> | undefined

function getViewer(info: GraphQLResolveInfo) {
  viewerCache =
    viewerCache ?? loadViewer(getQueryIncludeOf(info, VIEWER, { lookFromOperationRoot: true }))
  return viewerCache
}

const projectType = new GraphQLObjectType({ name: PROJECT, fields: { id: { type: GraphQLInt } } })
const viewerType = new GraphQLObjectType({ name: VIEWER, fields: { id: { type: GraphQLInt } } })
const protectedField = {
  type: projectType,
  resolve: (_parent: unknown, _args: unknown, _ctx: unknown, info: GraphQLResolveInfo) => {
    getViewer(info)
    return { id: 1 }
  },
}
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      viewer: {
        type: viewerType,
        resolve: (_parent, _args, _ctx, info) => getViewer(info) && { id: 1 },
      },
      firstProtectedField: protectedField,
      secondProtectedField: protectedField,
    },
  }),
})

const extended = getGloballyExtendedTypes()
const previousQueryConfig = extended.config['Query' as never]

beforeAll(() => {
  extended.config['Query' as never] = {
    ...(previousQueryConfig as object),
    firstProtectedField: {
      returnType: PROJECT,
      resolver: () => ({}),
      directives: [requiresViewerIncludes('permissions.roles')],
    },
    secondProtectedField: {
      returnType: PROJECT,
      resolver: () => ({}),
      directives: [requiresViewerIncludes('auditEntries.actor')],
    },
  } as never
})
afterAll(() => {
  extended.config['Query' as never] = previousQueryConfig
})
beforeEach(() => {
  loadViewer.mockClear()
  viewerCache = undefined
})

const bothTrees = [
  expect.objectContaining({
    association: 'permissions',
    include: [expect.objectContaining({ association: 'roles' })],
  }),
  expect.objectContaining({
    association: 'auditEntries',
    include: [expect.objectContaining({ association: 'actor' })],
  }),
]

const operations = {
  'two protected fields': `query { firstProtectedField { id } secondProtectedField { id } }`,
  'reversed order': `query { secondProtectedField { id } firstProtectedField { id } }`,
  aliases: `query { a: firstProtectedField { id } b: secondProtectedField { id } }`,
  fragments: `query { ...P } fragment P on Query { firstProtectedField { id } secondProtectedField { id } }`,
  'viewer selected first': `query { viewer { id } firstProtectedField { id } secondProtectedField { id } }`,
}

describe('single cached viewer load', () => {
  for (const [label, source] of Object.entries(operations)) {
    it(`collects every protected dependency before the first load (${label})`, async () => {
      const result = await graphql({ schema, source })
      expect(result.errors).toBeUndefined()
      expect(loadViewer).toHaveBeenCalledTimes(1)

      const { include } = loadViewer.mock.calls[0][0] as { include: unknown[] }
      expect(include).toHaveLength(2)
      expect(include).toEqual(expect.arrayContaining(bothTrees))
    })
  }
})
