import { defineType, defineUnion, extendTypes } from 'graphql-gene'

export const Page = defineType({
  title: 'String',
  content: 'PageContent',
})

extendTypes({
  Query: {
    page: {
      resolver: 'default',
      returnType: 'Page',
    },
  },
})

export const PageContent = defineUnion(['HomepageContent', 'ProductPageContent'] as const)
