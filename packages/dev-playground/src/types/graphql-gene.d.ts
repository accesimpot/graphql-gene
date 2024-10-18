import type { YogaInitialContext } from 'graphql-yoga'
import type { GeneTypesToTypescript } from '../../../core/src'
import * as graphqlTypes from '../models/graphqlTypes'
import type { FastifyContext } from '../server/types'

declare module 'graphql-gene/context' {
  export interface GeneContext extends FastifyContext, YogaInitialContext {}
}

declare module 'graphql-gene/schema' {
  export interface GeneSchema extends GeneTypesToTypescript<typeof graphqlTypes> {
    Query: object
    Mutation: object
  }
}
