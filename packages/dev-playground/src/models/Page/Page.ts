import { GraphQLError } from 'graphql'
import {
  defineField,
  defineType,
  defineUnion,
  extendTypes,
  getEntries,
  getOperatorMap,
} from 'graphql-gene'
import { mockPages } from './utils/mockPages'

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

                return operatorEntries.every(([operator, input]) => {
                  const operatorMap = getOperatorMap(input)

                  const testMethod = operatorMap[operator]
                  const fieldValue = pageEntry[field]
                  const inputValue = input as never

                  return testMethod?.(fieldValue, inputValue)
                })
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
