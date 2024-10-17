import { GraphQLError } from 'graphql'
import { defineField, defineType, defineUnion, extendTypes } from 'graphql-gene'
import { mockPages, FILTER_MAP, getEntries } from './utils'

export const Page = defineType({
  title: 'String',
  content: 'PageContent',
})

export const PageContent = defineUnion(['HomepageContent', 'ProductPageContent'])

extendTypes({
  Query: {
    page: defineField({
      args: 'default',

      resolver({ args }) {
        try {
          return mockPages.find(pageEntry => {
            return getEntries(args.where)
              .filter(([, operators]) => !!operators)
              .every(([field, operators]) => {
                const operatorEntries = getEntries(operators as NonNullable<typeof operators>)

                return operatorEntries.every(([operator, input]) =>
                  FILTER_MAP[operator](pageEntry[field], input as never)
                )
              })
          })
        } catch {
          new GraphQLError('Invalid where input value.')
        }
      },
      returnType: 'Page',
    }),
  },
})
