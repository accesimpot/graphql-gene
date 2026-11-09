import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getNamedType,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { ensureInclude, ensureIncludeBehind, getQueryInclude, getQueryIncludeOf } from './utils'
import { markFieldAsAssociation } from './utils/associationMap'

// Type-level only. The GraphQL schema built below does not register `BehindViewr`.
declare module 'graphql-gene/schema' {
  export interface GeneSchema {
    BehindViewer: object
    BehindViewr: object
  }
}

const VIEWER = 'BehindViewer'
const PROJECT = 'BehindProject'
const PERMISSION = 'BehindPermission'

markFieldAsAssociation(VIEWER, 'permissions')
markFieldAsAssociation(VIEWER, 'friends')
markFieldAsAssociation(PROJECT, 'owner')

const needsViewer = (path: string, at: 'nearest' | 'root') => ({
  name: 'needsViewer',
  args: { path },
  handler: () => {},
  findOptions: (details: object) => {
    ensureIncludeBehind(details, path, VIEWER, { at })
  },
})

const permissionType = new GraphQLObjectType({
  name: PERMISSION,
  fields: { id: { type: GraphQLInt } },
})
const viewerType: GraphQLObjectType = new GraphQLObjectType({
  name: VIEWER,
  fields: () => ({
    id: { type: GraphQLInt },
    permissions: {
      type: new GraphQLList(permissionType),
      args: { limit: { type: GraphQLInt } },
    },
    friends: { type: new GraphQLList(viewerType) },
  }),
})
const projectType = new GraphQLObjectType({
  name: PROJECT,
  fields: { id: { type: GraphQLInt }, owner: { type: viewerType } },
})
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      viewer: { type: viewerType, resolve: () => ({}) },
      project: { type: projectType, resolve: () => ({}) },
      flatProtected: { type: GraphQLInt, resolve: () => 1 },
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: { updateProject: { type: projectType, resolve: () => ({}) } },
  }),
})

const extended = getGloballyExtendedTypes()
const snapshot = {
  config: { ...extended.config },
  geneConfig: { ...extended.geneConfig },
}

beforeAll(() => {
  extended.config['Query' as never] = {
    ...(snapshot.config['Query' as never] as object),
    flatProtected: {
      returnType: 'Int',
      resolver: () => 1,
      directives: [needsViewer('permissions.roles', 'root')],
    },
  } as never
  extended.config[PROJECT as never] = {
    id: {
      returnType: 'Int',
      resolver: () => 1,
      directives: [needsViewer('permissions.roles', 'root')],
    },
  } as never
  extended.config[VIEWER as never] = {
    id: {
      returnType: 'Int',
      resolver: () => 1,
      directives: [needsViewer('settings', 'nearest')],
    },
  } as never
})

afterAll(() => {
  extended.config = snapshot.config as typeof extended.config
  extended.geneConfig = snapshot.geneConfig as typeof extended.geneConfig
})

async function captureInfo(
  source: string,
  fieldName: string,
  operation: 'query' | 'mutation' = 'query'
) {
  let info: GraphQLResolveInfo | undefined
  const root = operation === 'query' ? schema.getQueryType()! : schema.getMutationType()!
  const field = root.getFields()[fieldName]
  field.resolve = (_parent, _args, _ctx, resolverInfo) => {
    info = info ?? resolverInfo
    return getNamedType(field.type) === GraphQLInt ? 1 : {}
  }
  const result = await graphql({ schema, source })
  expect(result.errors).toBeUndefined()
  expect(info).toBeDefined()
  return info!
}

const ofViewer = (info: GraphQLResolveInfo, options: { mergeOccurrences?: boolean } = {}) =>
  getQueryIncludeOf(info, VIEWER, { lookFromOperationRoot: true, ...options })
const mergeOccurrences = { mergeOccurrences: true }

describe('ensureIncludeBehind and getQueryIncludeOf', () => {
  it('creates a virtual root when the target is not selected', async () => {
    const info = await captureInfo(`query { flatProtected }`, 'flatProtected')
    expect(ofViewer(info)?.include).toEqual([
      expect.objectContaining({
        association: 'permissions',
        include: [expect.objectContaining({ association: 'roles' })],
      }),
    ])
  })

  it('merges root-anchored dependencies into the selected target', async () => {
    const previous = extended.geneConfig[VIEWER as never]
    extended.geneConfig[VIEWER as never] = {
      findOptions(details: object) {
        ensureInclude(details, 'profile')
      },
    } as never
    try {
      const info = await captureInfo(
        `query { viewer { id permissions { id } } project { id } }`,
        'viewer'
      )
      const include = ofViewer(info)!.include!
      const permissions = include.filter(row => row.association === 'permissions')
      expect(permissions).toHaveLength(1)
      expect(permissions[0].include).toEqual(
        expect.arrayContaining([expect.objectContaining({ association: 'roles' })])
      )
      expect(include).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ association: 'settings' }),
          expect.objectContaining({ association: 'profile' }),
        ])
      )
    } finally {
      extended.geneConfig[VIEWER as never] = previous
    }
  })

  it('reuses a dependency ensured before the same association is selected', async () => {
    const info = await captureInfo(
      `query { project { id } viewer { permissions { id } } }`,
      'viewer'
    )
    const permissions = ofViewer(info)!.include!.filter(row => row.association === 'permissions')
    expect(permissions).toEqual([
      expect.objectContaining({ include: [expect.objectContaining({ association: 'roles' })] }),
    ])
  })

  it("attaches 'nearest' to a nested same-type ancestor", async () => {
    const info = await captureInfo(`query { viewer { friends { id } } }`, 'viewer')
    const include = ofViewer(info)!.include!
    const friends = include.find(row => row.association === 'friends')!
    expect(friends.include).toEqual([expect.objectContaining({ association: 'settings' })])
    expect(include.some(row => row.association === 'settings')).toBe(false)
  })

  it('ignores root-anchored dependencies when the collector targets another type', async () => {
    const info = await captureInfo(`query { project { id owner { id } } }`, 'project')
    expect(getQueryInclude(info)!.include).toEqual([
      expect.objectContaining({
        association: 'owner',
        include: [expect.objectContaining({ association: 'settings' })],
      }),
    ])
  })

  it('loads only the first selection of the target by default', async () => {
    const info = await captureInfo(
      `query { a: viewer { permissions { id } } b: viewer { friends { id } } }`,
      'viewer'
    )
    expect(ofViewer(info)!.include!.map(row => row.association)).toEqual(['permissions'])
  })

  it('merges every selection of the target with mergeOccurrences', async () => {
    const info = await captureInfo(
      `query { a: viewer { permissions { id } } b: viewer { friends { id } } }`,
      'viewer'
    )
    const include = ofViewer(info, mergeOccurrences)!.include!
    expect(include.map(row => row.association).sort()).toEqual(['friends', 'permissions'])
  })

  it('merges equal selections of one association instead of repeating them', async () => {
    const info = await captureInfo(
      `query { a: viewer { permissions(limit: 1) { id } } b: viewer { permissions(limit: 1) { id } } }`,
      'viewer'
    )
    const permissions = ofViewer(info, mergeOccurrences)!.include!.filter(
      row => row.association === 'permissions'
    )
    expect(permissions).toEqual([expect.objectContaining({ limit: 1 })])
  })

  it('throws when selections of the target ask for different rows of one association', async () => {
    const info = await captureInfo(
      `query { a: viewer { permissions(limit: 1) { id } } b: viewer { permissions(limit: 2) { id } } }`,
      'viewer'
    )
    expect(() => ofViewer(info, mergeOccurrences)).toThrow(
      /"permissions" is selected with different arguments/
    )
  })

  it('does not merge a target selected inside another target selection', async () => {
    const info = await captureInfo(`query { viewer { friends { id } } }`, 'viewer')
    const friends = ofViewer(info, mergeOccurrences)!.include!.find(
      row => row.association === 'friends'
    )!
    expect(friends.include).toEqual([expect.objectContaining({ association: 'settings' })])
  })

  it('collects the same includes through aliases and fragments', async () => {
    const plain = await captureInfo(`query { flatProtected viewer { id } }`, 'viewer')
    const aliased = await captureInfo(
      `query { x: flatProtected ...V } fragment V on Query { me: viewer { id } }`,
      'viewer'
    )
    const expected = [
      expect.objectContaining({
        association: 'permissions',
        include: [expect.objectContaining({ association: 'roles' })],
      }),
      expect.objectContaining({ association: 'settings' }),
    ]
    expect(ofViewer(plain)?.include).toEqual(expect.arrayContaining(expected))
    expect(ofViewer(aliased)?.include).toEqual(expect.arrayContaining(expected))
  })

  it.each([
    [
      'dependency collected first',
      `query { project { id } viewer { permissions(limit: 1) { id } } }`,
    ],
    [
      'filtered selection collected first',
      `query { viewer { permissions(limit: 1) { id } } project { id } }`,
    ],
  ])(
    'throws when a filtered selection shares an association with a dependency (%s)',
    async (_label, source) => {
      const info = await captureInfo(source, 'viewer')
      expect(() => ofViewer(info)).toThrow(/"permissions" is already included/)
    }
  )

  it('only binds a target selected within the requested depth', async () => {
    const info = await captureInfo(`query { project { owner { id } } }`, 'project')
    const ofViewerAtDepth = (depth: number) =>
      getQueryIncludeOf(info, VIEWER, { lookFromOperationRoot: true, depth })

    expect(ofViewerAtDepth(1)).toBeUndefined()
    expect(ofViewerAtDepth(2)?.include).toEqual([
      expect.objectContaining({ association: 'settings' }),
    ])
  })

  it('collects dependencies from mutations', async () => {
    const info = await captureInfo(`mutation { updateProject { id } }`, 'updateProject', 'mutation')
    expect(ofViewer(info)?.include).toEqual([
      expect.objectContaining({
        association: 'permissions',
        include: [expect.objectContaining({ association: 'roles' })],
      }),
    ])
  })

  it('keeps a root dependency when a function target is selected after the hook', async () => {
    const info = await captureInfo(`query { project { id } viewer { id } }`, 'viewer')
    const include = getQueryIncludeOf(info, details => details.type === VIEWER, {
      lookFromOperationRoot: true,
    })?.include

    expect(include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          association: 'permissions',
          include: [expect.objectContaining({ association: 'roles' })],
        }),
        expect.objectContaining({ association: 'settings' }),
      ])
    )
  })

  it('throws when the ancestor type is not in the schema', async () => {
    const previous = extended.config[PROJECT as never]
    extended.config[PROJECT as never] = {
      id: {
        returnType: 'Int',
        resolver: () => 1,
        findOptions: (details: object) => {
          ensureIncludeBehind(details, 'permissions', 'BehindViewr', { at: 'root' })
        },
      },
    } as never
    try {
      const info = await captureInfo(`query { project { id } }`, 'project')
      expect(() => ofViewer(info)).toThrow(/BehindProject\.id.*"BehindViewr"/s)
    } finally {
      extended.config[PROJECT as never] = previous
    }
  })

  it('throws outside a findOptions hook', () => {
    expect(() => ensureIncludeBehind({}, 'permissions', VIEWER)).toThrow(
      /must be called from a findOptions hook/
    )
  })
})
