import type { GqlSourceBrand } from 'graphql-gene'
import type { ToGqlSource } from './toGqlSource'

declare module 'graphql-gene' {
  interface GqlSourceForPluginModel<M, TTypeName extends string> {
    [GqlSourceBrand]: ToGqlSource<M, TTypeName>
  }
}
