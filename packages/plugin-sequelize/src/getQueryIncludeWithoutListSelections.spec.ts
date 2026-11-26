import { describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import {
  getQueryInclude,
  getQueryIncludeWithoutListSelections,
} from './utils/public'
import {
  getGeneAssociationListWrapperTypeName,
  registerGeneAssociationListWrapper,
} from './utils/associationListRegistry'
import { markFieldAsAssociation } from './utils/associationMap'

const USER_TYPE = 'WithoutListUser'
const PROFILE_TYPE = 'WithoutListProfile'
const ROLE_TYPE = 'WithoutListRole'

function registerUserAssociations() {
  const rolesWrapperName = getGeneAssociationListWrapperTypeName(USER_TYPE, 'roles')
  registerGeneAssociationListWrapper(rolesWrapperName, {
    parentGraphqlType: USER_TYPE,
    associationField: 'roles',
    targetGraphqlType: ROLE_TYPE,
  })
  markFieldAsAssociation(USER_TYPE, 'roles')
  markFieldAsAssociation(USER_TYPE, 'profile')
  return rolesWrapperName
}

function buildUserSchema(rolesWrapperName: string, withProfile = true) {
  const roleType = new GraphQLObjectType({
    name: ROLE_TYPE,
    fields: { id: { type: GraphQLInt } },
  })

  const rolesWrapperType = new GraphQLObjectType({
    name: rolesWrapperName,
    fields: {
      count: { type: GraphQLInt },
      items: { type: new GraphQLList(roleType) },
    },
  })

  const profileType = new GraphQLObjectType({
    name: PROFILE_TYPE,
    fields: { id: { type: GraphQLInt } },
  })

  const userType = new GraphQLObjectType({
    name: USER_TYPE,
    fields: {
      id: { type: GraphQLInt },
      ...(withProfile ? { profile: { type: profileType } } : {}),
      roles: { type: rolesWrapperType },
    },
  })

  return userType
}

async function captureInfo(userType: GraphQLObjectType, source: string) {
  let capturedInfo: GraphQLResolveInfo | undefined

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        user: {
          type: userType,
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

describe('getQueryIncludeWithoutListSelections', () => {
  it('omits association-list wrappers while keeping singular associations', async () => {
    const rolesWrapperName = registerUserAssociations()
    const userType = buildUserSchema(rolesWrapperName)

    const info = await captureInfo(
      userType,
      `query {
        user(id: "1") {
          id
          profile { id }
          roles { items { id } }
        }
      }`
    )

    // Baseline: plain getQueryInclude still sees the list wrapper as a hydration include.
    expect(getQueryInclude(info)?.include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ association: 'profile' }),
        expect.objectContaining({ association: 'roles' }),
      ])
    )

    const includeOptions = getQueryIncludeWithoutListSelections(info)
    expect(includeOptions?.include).toEqual([
      expect.objectContaining({ association: 'profile' }),
    ])
    expect(includeOptions?.include?.some(inc => inc.association === 'roles')).toBe(false)
  })

  it('trims list wrappers selected through fragments while keeping singulars', async () => {
    const rolesWrapperName = registerUserAssociations()
    const userType = buildUserSchema(rolesWrapperName)
    const expectedInclude = [expect.objectContaining({ association: 'profile' })]

    const sources = {
      'named fragment': `query { user { ...userFields } } fragment userFields on ${USER_TYPE} { id profile { id } roles { items { id } } }`,
      'inline fragment': `query { user { ... on ${USER_TYPE} { id profile { id } roles { items { id } } } } }`,
      'named fragment after a field': `query { user { id ...userFields } } fragment userFields on ${USER_TYPE} { profile { id } roles { count } }`,
    }

    for (const [label, source] of Object.entries(sources)) {
      const info = await captureInfo(userType, source)
      const includeOptions = getQueryIncludeWithoutListSelections(info)

      expect(includeOptions?.include, label).toEqual(expectedInclude)
      expect(
        includeOptions?.include?.some(inc => inc.association === 'roles'),
        label
      ).toBe(false)
    }
  })

  it('returns undefined when only association-list wrappers are selected', async () => {
    const rolesWrapperName = registerUserAssociations()
    const userType = buildUserSchema(rolesWrapperName, false)

    const info = await captureInfo(
      userType,
      `query { user { id roles { items { id } } } }`
    )

    expect(getQueryInclude(info)?.include).toEqual([
      expect.objectContaining({ association: 'roles' }),
    ])
    expect(getQueryIncludeWithoutListSelections(info)).toBeUndefined()
  })
})
