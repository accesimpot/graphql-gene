import { defineType, defineUnion, extendQuery } from 'graphql-gene'

export const Page = defineType({
  title: 'String',
  content: 'PageContent',
})

extendQuery(Page, {
  page: {
    resolver: 'default',
    returnType: 'Page',
  },
})

export const PageContent = defineUnion(['HomepageContent', 'ProductPageContent'] as const)
