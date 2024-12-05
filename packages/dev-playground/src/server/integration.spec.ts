import { vi, describe, it, expect } from 'vitest'
import type { ExecutionResult } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { buildHTTPExecutor } from '@graphql-tools/executor-http'
import { sequelize } from '../models/sequelize'
import { useMetaPlugin } from '../plugins/useMetaPlugin'
import { getFixtureQuery } from '../utils/graphql'
import { schema } from './schema'

await sequelize.authenticate()

describe('integration', () => {
  const yoga = createYoga({ schema, plugins: [useMetaPlugin()] })
  const executor = buildHTTPExecutor({ fetch: yoga.fetch })

  const execute = async (opts: Parameters<typeof executor>[0]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await executor(opts)) as ExecutionResult<any, { meta?: Record<string, any> }>
  }

  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  describe('when sending query with filters for default resolver returning single entry', async () => {
    consoleErrorSpy.mockClear()
    const result = await execute({
      document: getFixtureQuery('queries/mostRecentOrderWithStatus.gql'),
      variables: { status: 'paid' },
    })

    it('returns the expected data', () => {
      expect(result.data.order).toEqual({
        id: 160,
        status: 'paid',
        updatedAt: '2024-11-27T07:43:13.000Z',
        items: [
          {
            id: 402,
            price: 275.74,
            quantity: 1,
            product: {
              name: 'TrailMaster - Storm Gray',
              color: 'Storm Gray',
              group: {
                product: { id: 74 },
                groupCategories: [
                  { category: { name: 'shoes' } },
                  { category: { name: 'trail' } },
                  { category: { name: 'competition' } },
                  { category: { name: 'support' } },
                ],
              },
            },
          },
          {
            id: 403,
            price: 159.4,
            quantity: 1,
            product: {
              name: 'Impulse - Thunder Gray',
              color: 'Thunder Gray',
              group: {
                product: { id: 225 },
                groupCategories: [
                  { category: { name: 'trail' } },
                  { category: { name: 'apparel' } },
                  { category: { name: 'top' } },
                  { category: { name: 'light' } },
                ],
              },
            },
          },
        ],
      })
    })
  })
})
