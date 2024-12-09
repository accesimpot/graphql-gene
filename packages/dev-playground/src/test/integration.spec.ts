import type { ExecutionResult } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { buildHTTPExecutor } from '@graphql-tools/executor-http'
import { sequelize } from '../models/sequelize'
import { useMetaPlugin } from '../plugins/useMetaPlugin'
import { schema } from '../server/schema'
import { getFixtureQuery } from './utils'

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
      document: getFixtureQuery('queries/mostRecentOrderByStatus.gql'),
      variables: { status: 'paid' },
    })

    it('returns the expected data', () => {
      expect(result.data.order).toEqual({
        id: 160,
        status: 'paid',
        updatedAt: '2024-11-27T07:43:13.000Z',
        fieldAddedWithExtendTypes: 'status: paid',

        items: [
          {
            id: 402,
            price: 275.74,
            quantity: 1,
            product: {
              name: 'TrailMaster - Storm Gray',
              color: 'Storm Gray',
              group: {
                products: [{ id: 70 }, { id: 71 }, { id: 72 }, { id: 73 }, { id: 74 }],
                categories: ['shoes', 'trail', 'competition', 'support'],
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
                products: [{ id: 224 }, { id: 225 }, { id: 226 }, { id: 227 }, { id: 228 }],
                categories: ['trail', 'apparel', 'top', 'light'],
              },
            },
          },
        ],
      })
    })
  })

  describe('when sending mutation returning mutated object using "getQueryIncludeOf"', async () => {
    describe('when providing valid "id"', async () => {
      consoleErrorSpy.mockClear()
      const result = await execute({
        document: getFixtureQuery('mutations/updateOrderStatus.gql'),
        variables: { id: '26', status: 'payment' },
      })

      it('returns the expected data', () => {
        expect(result.data.updateOrderStatus).toEqual({
          message: { type: 'success', text: 'Status updated successfully.' },
          order: {
            id: 26,
            status: 'payment',
            items: [
              { product: { name: 'Nexus - Uranium Gray' } },
              { product: { name: 'NatureTrek - Deep Indigo' } },
              { product: { name: 'NatureTrek - Moss Green' } },
            ],
          },
        })
      })
    })

    describe('when providing invalid "id"', async () => {
      consoleErrorSpy.mockClear()
      const result = await execute({
        document: getFixtureQuery('mutations/updateOrderStatus.gql'),
        variables: { id: 'invalid', status: 'paid' },
      })

      it('returns the expected data', () => {
        expect(result.data.updateOrderStatus).toEqual({
          message: { type: 'error', text: 'Status could not be updated.' },
          order: null,
        })
      })
    })
  })
})
