import { defineType, defineUnion, extendTypes } from 'graphql-gene'

export const Page = defineType({
  title: 'String',
  content: 'PageContent',
})

export const PageContent = defineUnion(['HomepageContent', 'ProductPageContent'])

extendTypes({
  Query: {
    page: {
      resolver: 'default',
      returnType: 'Page',
    },
  },
})
