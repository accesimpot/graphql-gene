import { defineType } from 'graphql-gene'

export const ProductPageContent = defineType({
  title: 'String',
  // products: '[Product!]',
  products: '[String!]',
})
