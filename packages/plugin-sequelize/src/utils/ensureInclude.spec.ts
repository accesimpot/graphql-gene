import { describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getGloballyExtendedTypes } from 'graphql-gene'
import { ensureInclude, ensureIncludePath } from './ensureInclude'
import { isGeneEnsuredInclude, isGeneHydrationInclude } from './includePostProcess'
import { getQueryInclude } from './public'
import { markFieldAsAssociation } from './associationMap'
import type { DefaultResolverIncludeOptions } from '../types'

describe('ensureIncludePath', () => {
  it('creates nested segments and returns the leaf', () => {
    const root: DefaultResolverIncludeOptions = {}
    const leaf = ensureIncludePath(root, 'permissions.roles', {}, 'Query.test')
    expect(root.include).toEqual([
      expect.objectContaining({
        association: 'permissions',
        include: [expect.objectContaining({ association: 'roles' })],
      }),
    ])
    expect(leaf).toBe(root.include![0].include![0])
  })

  it('is idempotent', () => {
    const root: DefaultResolverIncludeOptions = {}
    const first = ensureIncludePath(root, 'permissions.roles', {}, 'Query.test')
    const second = ensureIncludePath(root, 'permissions.roles', {}, 'Query.test')
    expect(second).toBe(first)
    expect(root.include).toHaveLength(1)
    expect(root.include![0].include).toHaveLength(1)
  })

  it('marks created segments as hydration and ensured; hydrate:false skips hydration only', () => {
    const root: DefaultResolverIncludeOptions = {}
    ensureIncludePath(root, 'permissions.roles', {}, 'Query.test')
    ensureIncludePath(root, 'auditEntries', { hydrate: false }, 'Query.test')
    const [permissions, auditEntries] = root.include!
    expect(isGeneHydrationInclude(permissions)).toBe(true)
    expect(isGeneHydrationInclude(permissions.include![0])).toBe(true)
    expect(isGeneEnsuredInclude(permissions.include![0])).toBe(true)
    expect(isGeneHydrationInclude(auditEntries)).toBe(false)
    expect(isGeneEnsuredInclude(auditEntries)).toBe(true)
  })

  it('marks reused segments as ensured without making them hydration includes', () => {
    const root: DefaultResolverIncludeOptions = {
      include: [{ association: 'owner', include: [{ association: 'profile' }] }],
    }
    const leaf = ensureIncludePath(root, 'owner.profile', {}, 'Query.test')
    expect(isGeneEnsuredInclude(root.include![0])).toBe(true)
    expect(isGeneEnsuredInclude(leaf)).toBe(true)
    expect(isGeneHydrationInclude(root.include![0])).toBe(false)
    expect(isGeneHydrationInclude(leaf)).toBe(false)
  })

  it('applies required to the leaf only and never resets it', () => {
    const root: DefaultResolverIncludeOptions = {}
    ensureIncludePath(root, 'permissions.roles', { required: true }, 'Query.test')
    ensureIncludePath(root, 'permissions.roles', { required: false }, 'Query.test')
    expect(root.include![0].required).toBeUndefined()
    expect(root.include![0].include![0].required).toBe(true)
  })

  it.each([{ where: { id: 1 } }, { limit: 1 }, { offset: 1 }])(
    'throws on an include with %j for the same association',
    rowFilter => {
      const root: DefaultResolverIncludeOptions = {
        include: [{ association: 'items', ...rowFilter }],
      }
      expect(() => ensureIncludePath(root, 'items', {}, 'Order.itemTotalQuantity')).toThrow(
        /\[graphql-gene\].*"items".*Order\.itemTotalQuantity/
      )
    }
  )

  it('throws on empty path segments', () => {
    expect(() => ensureIncludePath({}, 'permissions..roles', {}, 'Query.test')).toThrow(
      /Invalid include path/
    )
  })
})

describe('ensureInclude', () => {
  const PARENT = 'EnsureParent'
  const CHILD = 'EnsureChild'
  markFieldAsAssociation(PARENT, 'items')

  const childType = new GraphQLObjectType({ name: CHILD, fields: { id: { type: GraphQLInt } } })
  const parentType = new GraphQLObjectType({
    name: PARENT,
    fields: { id: { type: GraphQLInt }, total: { type: GraphQLInt }, items: { type: childType } },
  })
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: { ensureOrder: { type: parentType, resolve: () => ({}) } },
    }),
  })

  async function captureInfo(source: string) {
    let info: GraphQLResolveInfo | undefined
    schema.getQueryType()!.getFields().ensureOrder.resolve = (
      _parent,
      _args,
      _ctx,
      resolverInfo
    ) => {
      info = info ?? resolverInfo
      return {}
    }
    const result = await graphql({ schema, source })
    expect(result.errors).toBeUndefined()
    return info!
  }

  it('throws outside a findOptions hook', () => {
    expect(() => ensureInclude({}, 'items')).toThrow(/must be called from a findOptions hook/)
  })

  it('adds a hydration include from a field hook during collection', async () => {
    const extended = getGloballyExtendedTypes()
    const previous = extended.config[PARENT as never]
    extended.config[PARENT as never] = {
      total: {
        returnType: 'Int',
        resolver: () => 0,
        findOptions(details: object) {
          ensureInclude(details, 'items')
        },
      },
    } as never

    try {
      const include = getQueryInclude(await captureInfo(`query { ensureOrder { total } }`))?.include
      expect(include).toEqual([expect.objectContaining({ association: 'items' })])
      expect(isGeneHydrationInclude(include?.[0])).toBe(true)
    } finally {
      extended.config[PARENT as never] = previous
    }
  })
})
