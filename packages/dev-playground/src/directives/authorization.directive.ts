import { GraphQLError } from 'graphql'
import { defineDirective } from 'graphql-gene'

// For testing purposes
export const VALID_API_KEYS = new Set([
  '5Jx4SHbtvaxFmAHMxIlCvf9V66YdCy',
  'vKKph1A9TsCwvkQTlF4zGUGcDb3cr0',
  'sGU.ixnLFDLy84e6n8rhE94nnwN12i',
  'zage8dJGeAuDWJollMXVy92mC0FRag',
  '2jadFI8NLAt4g5rJ5vJXIDnUC2FJHD',
])

export const authorizationDirective = defineDirective(() => ({
  name: 'authorization',

  async handler({ context }) {
    const authorizationHeader = context.req.headers.authorization

    if (!authorizationHeader || !VALID_API_KEYS.has(authorizationHeader)) {
      throw new GraphQLError('Unauthorized')
    }
  },
}))
