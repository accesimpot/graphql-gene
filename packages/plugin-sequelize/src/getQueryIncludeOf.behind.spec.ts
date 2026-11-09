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

const VIEWER = 'BhViewer'
const PROJECT = 'BhProject'
const PERMISSION = 'BhPermission'

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
    permissions: { type: permissionType },
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

async function capture(
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

const ofViewer = (info: GraphQLResolveInfo) =>
  getQueryIncludeOf(info, VIEWER, { lookFromOperationRoot: true })

describe('ensureIncludeBehind', () => {
  it('creates a virtual root when the target is not selected', async () => {
    const info = await capture(`query { flatProtected }`, 'flatProtected')
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
      const info = await capture(
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

  it("attaches 'nearest' to a nested same-type ancestor", async () => {
    const info = await capture(`query { viewer { friends { id } } }`, 'viewer')
    const include = ofViewer(info)!.include!
    const friends = include.find(row => row.association === 'friends')!
    expect(friends.include).toEqual([expect.objectContaining({ association: 'settings' })])
    expect(include.some(row => row.association === 'settings')).toBe(false)
  })

  it('does nothing for collectors of a different type', async () => {
    const info = await capture(`query { project { id owner { id } } }`, 'project')
    expect(getQueryInclude(info)!.include).toEqual([
      expect.objectContaining({
        association: 'owner',
        include: [expect.objectContaining({ association: 'settings' })],
      }),
    ])
  })

  it('keeps the first matching target and does not merge later ones', async () => {
    const info = await capture(
      `query { a: viewer { permissions { id } } b: viewer { friends { id } } }`,
      'viewer'
    )
    const include = ofViewer(info)!.include!
    expect(include.some(row => row.association === 'permissions')).toBe(true)
    expect(include.some(row => row.association === 'friends')).toBe(false)
  })

  it('collects the same includes through aliases and fragments', async () => {
    const plain = await capture(`query { flatProtected viewer { id } }`, 'viewer')
    const aliased = await capture(
      `query { x: flatProtected ...V } fragment V on Query { me: viewer { id } }`,
      'viewer'
    )
    expect(ofViewer(aliased)).toEqual(ofViewer(plain))
  })

  it('collects dependencies from mutations', async () => {
    const info = await capture(`mutation { updateProject { id } }`, 'updateProject', 'mutation')
    expect(ofViewer(info)?.include).toEqual([
      expect.objectContaining({
        association: 'permissions',
        include: [expect.objectContaining({ association: 'roles' })],
      }),
    ])
  })

  it('throws outside a findOptions hook', () => {
    expect(() => ensureIncludeBehind({}, 'permissions', VIEWER)).toThrow(
      /must be called from a findOptions hook/
    )
  })
})
