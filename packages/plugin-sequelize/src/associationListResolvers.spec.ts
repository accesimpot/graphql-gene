import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUnitAssocSqlite } from './associationListResolvers.fixtures'

describe('attachAssociationListWrapperResolvers', () => {
  let sequelize: Awaited<ReturnType<typeof createUnitAssocSqlite>>['sequelize'] | undefined
  let UnitParent: Awaited<ReturnType<typeof createUnitAssocSqlite>>['UnitParent']
  let UnitChild: Awaited<ReturnType<typeof createUnitAssocSqlite>>['UnitChild']

  beforeAll(async () => {
    const ctx = await createUnitAssocSqlite()
    sequelize = ctx.sequelize
    UnitParent = ctx.UnitParent
    UnitChild = ctx.UnitChild
  })

  afterAll(async () => {
    await sequelize?.close()
  })

  it('resolves count and items via Sequelize for a marked association wrapper field', async () => {
    const { GraphQLSchema, GraphQLObjectType, GraphQLInt, GraphQLNonNull, GraphQLList, graphql } =
      await import('graphql')

    const parent = await UnitParent.create({})
    await UnitChild.create({ parentId: parent.id })
    await UnitChild.create({ parentId: parent.id })

    const { markFieldAsAssociation } = await import('./utils/associationMap')
    const { registerGeneAssociationListWrapper, getGeneAssociationListWrapperTypeName } =
      await import('./utils/associationListRegistry')
    const { attachAssociationListWrapperResolvers } = await import('./associationListResolvers')

    const wrapperName = getGeneAssociationListWrapperTypeName('ParentUnit', 'items')
    registerGeneAssociationListWrapper(wrapperName, {
      parentGraphqlType: 'ParentUnit',
      associationField: 'items',
      targetGraphqlType: 'UnitChild',
    })
    markFieldAsAssociation('ParentUnit', 'items')

    const childGraphQLType = new GraphQLObjectType({
      name: 'UnitChild',
      fields: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
        parentId: { type: GraphQLInt },
      },
    })

    const wrapperType = new GraphQLObjectType({
      name: wrapperName,
      fields: {
        count: { type: new GraphQLNonNull(GraphQLInt) },
        items: {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(childGraphQLType))),
        },
      },
    })

    const parentGraphQLType = new GraphQLObjectType({
      name: 'ParentUnit',
      fields: {
        items: {
          type: new GraphQLNonNull(wrapperType),
          args: {
            limit: { type: GraphQLInt },
            skip: { type: GraphQLInt },
          },
        },
      },
    })

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {
          parent: {
            type: parentGraphQLType,
            resolve: () => parent,
          },
        },
      }),
    })

    attachAssociationListWrapperResolvers(schema, { UnitChild })

    const result = await graphql({
      schema,
      source: `{ parent { items { count items { id parentId } } } }`,
    })

    expect(result.errors).toBeUndefined()
    const payload = result.data as {
      parent: { items: { count: number; items: { id: number; parentId: number }[] } }
    }
    expect(payload.parent.items.count).toBe(2)
    expect(payload.parent.items.items).toHaveLength(2)
    expect(payload.parent.items.items.every(row => row.parentId === parent.id)).toBe(true)
  })

  it('uses preloaded arrays without issuing a second find when items are already staged', async () => {
    const { GraphQLSchema, GraphQLObjectType, GraphQLInt, GraphQLNonNull, GraphQLList, graphql } =
      await import('graphql')

    const parent = await UnitParent.create({})
    const child = await UnitChild.create({ parentId: parent.id })
    const parentLoaded = await UnitParent.findByPk(parent.id, {
      include: [{ association: 'items' }],
    })
    if (!parentLoaded) throw new Error('missing parent')

    const findAllSpy = vi.spyOn(UnitChild, 'findAll')

    const { markFieldAsAssociation } = await import('./utils/associationMap')
    const { registerGeneAssociationListWrapper, getGeneAssociationListWrapperTypeName } =
      await import('./utils/associationListRegistry')
    const { attachAssociationListWrapperResolvers } = await import('./associationListResolvers')

    const wrapperName = getGeneAssociationListWrapperTypeName('PreloadParent', 'items')
    registerGeneAssociationListWrapper(wrapperName, {
      parentGraphqlType: 'PreloadParent',
      associationField: 'items',
      targetGraphqlType: 'UnitChild',
    })
    markFieldAsAssociation('PreloadParent', 'items')

    const childGraphQLType = new GraphQLObjectType({
      name: 'UnitChild',
      fields: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
        parentId: { type: GraphQLInt },
      },
    })

    const wrapperType = new GraphQLObjectType({
      name: wrapperName,
      fields: {
        count: { type: new GraphQLNonNull(GraphQLInt) },
        items: {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(childGraphQLType))),
        },
      },
    })

    const parentGraphQLType = new GraphQLObjectType({
      name: 'PreloadParent',
      fields: {
        items: {
          type: new GraphQLNonNull(wrapperType),
        },
      },
    })

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {
          parent: {
            type: parentGraphQLType,
            resolve: () => parentLoaded,
          },
        },
      }),
    })

    attachAssociationListWrapperResolvers(schema, { UnitChild })

    const result = await graphql({
      schema,
      source: `{ parent { items { items { id } count } } }`,
    })

    expect(result.errors).toBeUndefined()
    expect(findAllSpy).not.toHaveBeenCalled()
    const payload = result.data as {
      parent: { items: { count: number; items: { id: number }[] } }
    }
    expect(payload.parent.items.items).toEqual([{ id: child.id }])
    expect(payload.parent.items.count).toBe(1)
    findAllSpy.mockRestore()
  })

  it('re-queries when limit/skip/where/order are set instead of trusting full preload', async () => {
    const { GraphQLSchema, GraphQLObjectType, GraphQLInt, GraphQLNonNull, GraphQLList, graphql } =
      await import('graphql')

    const parent = await UnitParent.create({})
    await UnitChild.create({ parentId: parent.id })
    await UnitChild.create({ parentId: parent.id })
    const parentLoaded = await UnitParent.findByPk(parent.id, {
      include: [{ association: 'items' }],
    })
    if (!parentLoaded) throw new Error('missing parent')

    const findAllSpy = vi.spyOn(UnitChild, 'findAll')

    const { markFieldAsAssociation } = await import('./utils/associationMap')
    const { registerGeneAssociationListWrapper, getGeneAssociationListWrapperTypeName } =
      await import('./utils/associationListRegistry')
    const { attachAssociationListWrapperResolvers } = await import('./associationListResolvers')

    const wrapperName = getGeneAssociationListWrapperTypeName('PagedParent', 'items')
    registerGeneAssociationListWrapper(wrapperName, {
      parentGraphqlType: 'PagedParent',
      associationField: 'items',
      targetGraphqlType: 'UnitChild',
    })
    markFieldAsAssociation('PagedParent', 'items')

    const childGraphQLType = new GraphQLObjectType({
      name: 'UnitChild',
      fields: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
        parentId: { type: GraphQLInt },
      },
    })

    const wrapperType = new GraphQLObjectType({
      name: wrapperName,
      fields: {
        count: { type: new GraphQLNonNull(GraphQLInt) },
        items: {
          type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(childGraphQLType))),
        },
      },
    })

    const parentGraphQLType = new GraphQLObjectType({
      name: 'PagedParent',
      fields: {
        items: {
          type: new GraphQLNonNull(wrapperType),
          args: {
            limit: { type: GraphQLInt },
            skip: { type: GraphQLInt },
          },
        },
      },
    })

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {
          parent: {
            type: parentGraphQLType,
            resolve: () => parentLoaded,
          },
        },
      }),
    })

    attachAssociationListWrapperResolvers(schema, { UnitChild })

    const result = await graphql({
      schema,
      source: `{ parent { items(limit: 1) { items { id parentId } count } } }`,
    })

    expect(result.errors).toBeUndefined()
    expect(findAllSpy).toHaveBeenCalled()
    const payload = result.data as {
      parent: { items: { count: number; items: { id: number }[] } }
    }
    expect(payload.parent.items.items).toHaveLength(1)
    expect(payload.parent.items.count).toBe(2)
    findAllSpy.mockRestore()
  })

  it('throws when the parent is not a Sequelize model instance', async () => {
    const { GraphQLSchema, GraphQLObjectType, GraphQLInt, GraphQLList, graphql } = await import(
      'graphql'
    )

    const { markFieldAsAssociation } = await import('./utils/associationMap')
    const { registerGeneAssociationListWrapper, getGeneAssociationListWrapperTypeName } =
      await import('./utils/associationListRegistry')
    const { attachAssociationListWrapperResolvers } = await import('./associationListResolvers')

    const wrapperName = getGeneAssociationListWrapperTypeName('LonelyParent', 'items')
    registerGeneAssociationListWrapper(wrapperName, {
      parentGraphqlType: 'LonelyParent',
      associationField: 'items',
      targetGraphqlType: 'LonelyChild',
    })
    markFieldAsAssociation('LonelyParent', 'items')

    const childGraphQLType = new GraphQLObjectType({
      name: 'LonelyChild',
      fields: { id: { type: GraphQLInt } },
    })

    const wrapperType = new GraphQLObjectType({
      name: wrapperName,
      fields: {
        count: { type: GraphQLInt },
        items: { type: new GraphQLList(childGraphQLType) },
      },
    })

    const parentGraphQLType = new GraphQLObjectType({
      name: 'LonelyParent',
      fields: {
        items: { type: wrapperType },
      },
    })

    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: {
          parent: {
            type: parentGraphQLType,
            resolve: () => ({ notAModel: true }),
          },
        },
      }),
    })

    attachAssociationListWrapperResolvers(schema, { LonelyChild: {} })

    const result = await graphql({
      schema,
      source: `{ parent { items { count } } }`,
    })

    expect(result.errors?.length).toBeTruthy()
    expect(result.errors?.[0]?.message).toMatch(/Sequelize model/)
  })
})
