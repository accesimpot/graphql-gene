import { describe, expect, it } from 'vitest'
import {
  GraphQLInt,
  GraphQLObjectType,
  GraphQLSchema,
  graphql,
  type GraphQLResolveInfo,
} from 'graphql'
import { getQueryInclude, getQueryIncludeOf } from './utils/public'
import { markFieldAsAssociation } from './utils/associationMap'

// An association selected through a fragment has to be eagerly loaded just like one selected
// inline. The fragment is spread on a concrete type here, so it adds no nesting of its own.

const PROFILE_TYPE = 'FragmentProfile'
const USER_TYPE = 'FragmentUser'

markFieldAsAssociation(USER_TYPE, 'profile')

const profileType = new GraphQLObjectType({
  name: PROFILE_TYPE,
  fields: { id: { type: GraphQLInt } },
})

const userType = new GraphQLObjectType({
  name: USER_TYPE,
  fields: {
    id: { type: GraphQLInt },
    profile: { type: profileType },
  },
})

async function captureInfo(source: string) {
  let capturedInfo: GraphQLResolveInfo | undefined

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        me: {
          type: userType,
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

const expectedInclude = [expect.objectContaining({ association: 'profile' })]

const selections = {
  inline: `query { me { id profile { id } } }`,
  'named fragment': `query { me { ...userFields } } fragment userFields on ${USER_TYPE} { id profile { id } }`,
  'inline fragment': `query { me { ... on ${USER_TYPE} { id profile { id } } } }`,
  'named fragment after a field': `query { me { id ...userFields } } fragment userFields on ${USER_TYPE} { profile { id } }`,
}

describe('getQueryInclude with fragments', () => {
  for (const [label, source] of Object.entries(selections)) {
    it(`includes an association selected through ${label}`, async () => {
      const info = await captureInfo(source)

      expect(getQueryInclude(info)?.include).toEqual(expectedInclude)
    })
  }
})

describe('getQueryIncludeOf with fragments', () => {
  for (const [label, source] of Object.entries(selections)) {
    it(`includes an association selected through ${label}`, async () => {
      const info = await captureInfo(source)

      const includeOptions = getQueryIncludeOf(info, USER_TYPE, {
        depth: 1,
        lookFromOperationRoot: true,
      })

      expect(includeOptions?.include).toEqual(expectedInclude)
    })
  }
})
