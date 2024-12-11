import type { ExecutionResult } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { buildHTTPExecutor, type HTTPExecutorOptions } from '@graphql-tools/executor-http'
import { sequelize } from '../models/sequelize'
import { useMetaPlugin } from '../plugins/useMetaPlugin'
import { schema } from '../server/schema'
import { getFixtureQuery } from './utils'
import { Order } from '../models'

await sequelize.authenticate()

describe('integration', () => {
  const yoga = createYoga({ schema, plugins: [useMetaPlugin()] })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execute = async <T = any>(
    opts: Parameters<ReturnType<typeof buildHTTPExecutor>>[0],
    executorOptions?: HTTPExecutorOptions
  ) => {
    const executor = buildHTTPExecutor({ fetch: yoga.fetch, ...executorOptions })
    return (await executor(opts)) as ExecutionResult<T, { meta?: Record<string, T> }>
  }

  // const consoleErrorSpy =
  vi.spyOn(console, 'error').mockImplementation(() => undefined) // Prevent logging errors

  describe('when sending query with filters for default resolver returning single entry', async () => {
    const result = await execute({
      document: getFixtureQuery('queries/mostRecentOrderByStatus.gql'),
      variables: { status: 'paid' },
    })

    it('returns the expected data', () => {
      expect(result.data.order).toEqual({
        id: 397,
        status: 'paid',
        updatedAt: '2024-11-03T21:20:43.000Z',
        fieldAddedWithExtendTypes: 'status: paid',
        items: [
          {
            id: 976,
            price: 145.85,
            quantity: 3,
            product: {
              name: 'StreetStyle - Slate Thunder',
              color: 'Slate Thunder',
              group: {
                products: [
                  { id: 116 },
                  { id: 117 },
                  { id: 118 },
                  { id: 119 },
                  { id: 120 },
                  { id: 121 },
                ],
                categories: ['shoes', 'urban'],
              },
            },
          },
        ],
      })
    })
  })

  describe('when sending query including field with authorization directive', async () => {
    describe('when the directive throws an error', async () => {
      const result = await execute<{ order: Order }>({
        document: getFixtureQuery('queries/orderWithPublished.gql'),
      })

      it('returns null for each field having the directive', () => {
        expect(result.data?.order.items?.length).toBeTruthy()
        expect(result.data?.order.items?.every(item => item.product?.isPublished === null)).toBe(
          true
        )
      })
    })

    describe('when the directive does not throw an error', async () => {
      const result = await execute<{ order: Order }>(
        { document: getFixtureQuery('queries/orderWithPublished.gql') },
        { headers: { authorization: '5Jx4SHbtvaxFmAHMxIlCvf9V66YdCy' } }
      )

      it('returns the real value of each field having the directive', () => {
        expect(result.data?.order.items?.length).toBeTruthy()
        expect(
          result.data?.order.items?.every(item => typeof item.product?.isPublished === 'boolean')
        ).toBe(true)
      })
    })
  })

  describe('when sending mutation returning mutated object using "getQueryIncludeOf"', async () => {
    describe('when providing valid "id"', async () => {
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
            items: [{ product: { name: 'SpeedTech - Arctic Mint' } }],
          },
        })
      })
    })

    describe('when providing invalid "id"', async () => {
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
