export const Order = {
  status: 'String!',
  items: '[OrderItem!]!',
  tax: 'Int!',
  subtotal: 'Int!',
  total: 'Int!',
  invalidField: 'String',
} as const
