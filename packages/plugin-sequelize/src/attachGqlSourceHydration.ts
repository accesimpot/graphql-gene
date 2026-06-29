import { defaultFieldResolver, GraphQLObjectType, type GraphQLSchema } from 'graphql'
import type { AnyObject } from 'graphql-gene'
import { isGeneAssociationListWrapperAssociation } from './utils/associationListRegistry'
import { isModelStatic } from './utils/guards'
import { toResolverSource } from './hydrateGqlSource'

/** Attaches hydration so extendTypes / custom resolvers receive GraphQL-shaped `source`. */
export function attachGqlSourceHydrationResolvers(schema: GraphQLSchema, types: AnyObject) {
  for (const schemaType of Object.values(schema.getTypeMap())) {
    if (!(schemaType instanceof GraphQLObjectType)) continue
    if (schemaType.name.startsWith('__')) continue

    const parentGraphqlType = schemaType.name
    const model = types[parentGraphqlType]
    if (!model || !isModelStatic(model)) continue

    for (const field of Object.values(schemaType.getFields())) {
      if (isGeneAssociationListWrapperAssociation(parentGraphqlType, field.name)) continue

      const previousResolve = field.resolve ?? defaultFieldResolver
      field.resolve = (parent, args, context, info) =>
        previousResolve(toResolverSource(parent, parentGraphqlType), args, context, info)
    }
  }
}
