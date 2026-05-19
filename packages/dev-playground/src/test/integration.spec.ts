import type { ExecutionResult } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { buildHTTPExecutor, type HTTPExecutorOptions } from '@graphql-tools/executor-http'
import { sequelize } from '../models/sequelize'
import { useMetaPlugin } from '../plugins/useMetaPlugin'
import { schema } from '../server/schema'
import { getFixtureQuery } from './utils'
import { Product } from '../models'

/** GraphQL association-list wrapper `{ count, items }` (differs from Sequelize array fields) */
type GqlAssociationList<T> = {
  count: number
  items: T[]
}

type GqlProductNested = {
  id?: number
  name?: string
  color?: string | null
  isPublished?: boolean | null
  variants?: GqlAssociationList<{
    size?: string
    inventory?: { stock?: number } | null
  }>
  group?: { categories?: string[] }
}

type GqlOrderItemRow = {
  id?: number
  price?: number
  quantity?: number
  product?: GqlProductNested
}

/** GraphQL `order { … }` payloads where list associations use wrappers */
type OrderQueryPayload = {
  order?: {
    items?: GqlAssociationList<GqlOrderItemRow>
  }
}

type PageBlockUnion =
  | { __typename: 'HeroBlock'; id: number; title: string; subtitle: string }
  | { __typename: 'TextBlock'; id: number; body: string }

type PageQueryPayload = {
  pageByPath?: {
    id: number
    path: string
    blocks: GqlAssociationList<PageBlockUnion>
  }
}

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

  vi.spyOn(console, 'error').mockImplementation(() => undefined) // Prevent logging errors

  describe('when sending query with filters for default resolver returning single entry', () => {
    let result: ExecutionResult

    beforeAll(async () => {
      result = await execute({
        document: getFixtureQuery('queries/mostRecentOrderByStatus.gql'),
        variables: { status: 'paid' },
      })
    })

    it('returns the expected data', () => {
      expect(result.data?.order).toEqual({
        id: 397,
        status: 'paid',
        updatedAt: '2024-11-03T21:20:43.000Z',
        fieldAddedWithExtendTypes: 'status: paid',
        items: {
          count: expect.any(Number),
          items: [
            {
              id: 976,
              price: 145.85,
              quantity: 3,
              product: {
                name: 'StreetStyle - Slate Thunder',
                color: 'Slate Thunder',
                group: {
                  products: {
                    count: expect.any(Number),
                    items: [
                      { id: 116 },
                      { id: 117 },
                      { id: 118 },
                      { id: 119 },
                      { id: 120 },
                      { id: 121 },
                    ],
                  },
                  categories: ['shoes', 'urban'],
                },
              },
            },
          ],
        },
      })
    })
  })

  describe('when sending query including type with authorization directive', () => {
    const targetedOrderId = 117

    describe('when the directive throws an error', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        result = await execute<OrderQueryPayload>({
          document: getFixtureQuery('queries/orderWithInventory.gql'),
          variables: { id: String(targetedOrderId) },
        })
      })

      it('returns null for each field returning the type with the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every((_item: GqlOrderItemRow) => {
            return (
              _item.product?.variants?.items?.length &&
              _item.product?.variants?.items?.every(variant => {
                return variant.inventory === null
              })
            )
          })
        ).toBe(true)
      })
    })

    describe('when the directive does not throw an error', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        result = await execute<OrderQueryPayload>(
          {
            document: getFixtureQuery('queries/orderWithInventory.gql'),
            variables: { id: String(targetedOrderId) },
          },
          { headers: { authorization: '5Jx4SHbtvaxFmAHMxIlCvf9V66YdCy' } }
        )
      })

      it('returns the real value of each field returning the type with the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every((_item: GqlOrderItemRow) => {
            return (
              _item.product?.variants?.items?.length &&
              _item.product?.variants?.items?.every(variant => {
                return typeof variant.inventory?.stock === 'number'
              })
            )
          })
        ).toBe(true)
      })
    })
  })

  describe('when sending query including field with authorization directive', () => {
    describe('when the directive throws an error', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        result = await execute<OrderQueryPayload>({
          document: getFixtureQuery('queries/orderWithPublished.gql'),
        })
      })

      it('returns null for each field having the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every(
            (item: GqlOrderItemRow) => item.product?.isPublished === null
          )
        ).toBe(true)
      })
    })

    describe('when the directive does not throw an error', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        result = await execute<OrderQueryPayload>(
          { document: getFixtureQuery('queries/orderWithPublished.gql') },
          { headers: { authorization: '5Jx4SHbtvaxFmAHMxIlCvf9V66YdCy' } }
        )
      })

      it('returns the real value of each field having the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every(
            (item: GqlOrderItemRow) => typeof item.product?.isPublished === 'boolean'
          )
        ).toBe(true)
      })
    })
  })

  describe('when sending query including type with filterBySize directive', () => {
    const targetedOrderId = 707

    const apparelSizeRank: Record<string, number> = {
      XS: 0,
      S: 1,
      M: 2,
      L: 3,
      XL: 4,
      XXL: 5,
    }

    const sortApparelSizes = (sizes: (string | undefined)[]) =>
      [...sizes]
        .filter((s): s is string => typeof s === 'string')
        .sort((a, b) => (apparelSizeRank[a] ?? 99) - (apparelSizeRank[b] ?? 99))

    describe('when filtering is set to active by test header', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        result = await execute<OrderQueryPayload>(
          {
            document: getFixtureQuery('queries/orderById.gql'),
            variables: { id: String(targetedOrderId) },
          },
          { headers: { 'x-test-size-filter-active': 'true' } }
        )
      })

      it('filters out the XXL variants', () => {
        const apparelOrderItem = result.data?.order?.items?.items?.find(
          (_item: GqlOrderItemRow) => {
            return (_item.product?.group?.categories as string[] | undefined)?.includes('apparel')
          }
        )
        const apparelProduct = apparelOrderItem?.product

        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(apparelProduct?.variants?.items?.length).toBeTruthy()
        expect(
          sortApparelSizes(apparelProduct?.variants?.items?.map(v => v.size) ?? []).join(',')
        ).toBe('S,M,L,XL')
      })
    })

    describe('when filtering is set to inactive by test header', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        result = await execute<OrderQueryPayload>(
          {
            document: getFixtureQuery('queries/orderById.gql'),
            variables: { id: String(targetedOrderId) },
          },
          { headers: { 'x-test-size-filter-active': 'false' } }
        )
      })

      it('does not filter out the XXL variants', () => {
        const apparelOrderItem = result.data?.order?.items?.items?.find(
          (_item: GqlOrderItemRow) => {
            return (_item.product?.group?.categories as string[] | undefined)?.includes('apparel')
          }
        )
        const apparelProduct = apparelOrderItem?.product

        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(apparelProduct?.variants?.items?.length).toBeTruthy()
        expect(
          sortApparelSizes(apparelProduct?.variants?.items?.map(v => v.size) ?? []).join(',')
        ).toBe('XS,S,M,L,XL,XXL')
      })
    })
  })

  describe('when sending query including type filtering published items using "findOptions"', () => {
    const targetedOrderId = 363
    const firstProductId = 22
    const secondProductId = 246
    const thirdProductId = 248

    const targetedProductId = secondProductId

    const productFindOptions = { where: { id: targetedProductId } }
    let originalIsPublished: boolean | null | undefined

    beforeAll(async () => {
      const targetedProduct = await Product.findOne({ where: { id: targetedProductId } })
      originalIsPublished = targetedProduct?.isPublished
    })

    afterAll(async () => {
      await Product.update({ isPublished: originalIsPublished }, productFindOptions)
    })

    describe('when all items are published', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        await Product.update({ isPublished: true }, productFindOptions)
        result = await execute<OrderQueryPayload>({
          document: getFixtureQuery('queries/orderById.gql'),
          variables: { id: String(targetedOrderId) },
        })
      })

      it('returns all items', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.map((item: GqlOrderItemRow) => item.product?.id)
        ).toEqual([firstProductId, secondProductId, thirdProductId])
      })
    })

    describe('when all items are published except one', () => {
      let result: ExecutionResult<OrderQueryPayload>

      beforeAll(async () => {
        await Product.update({ isPublished: false }, productFindOptions)
        result = await execute<OrderQueryPayload>({
          document: getFixtureQuery('queries/orderById.gql'),
          variables: { id: String(targetedOrderId) },
        })
      })

      it('returns all items except the one unpublished', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        const ids =
          result.data?.order?.items?.items
            ?.map((item: GqlOrderItemRow) => item.product?.id)
            .filter((id): id is number => typeof id === 'number') ?? []
        expect(ids).toEqual([firstProductId, thirdProductId])
      })
    })
  })

  describe('when sending mutation returning mutated object using "getQueryIncludeOf"', () => {
    describe('when providing valid "id"', () => {
      let result: ExecutionResult

      beforeAll(async () => {
        result = await execute({
          document: getFixtureQuery('mutations/updateOrderStatus.gql'),
          variables: { id: '26', status: 'payment' },
        })
      })

      it('returns the expected data', () => {
        expect(result.data?.updateOrderStatus).toEqual({
          message: { type: 'success', text: 'Status updated successfully.' },
          order: {
            id: 26,
            status: 'payment',
            items: {
              count: expect.any(Number),
              items: [{ product: { name: 'SpeedTech - Arctic Mint' } }],
            },
          },
        })
      })
    })

    describe('when providing invalid "id"', () => {
      let result: ExecutionResult

      beforeAll(async () => {
        result = await execute({
          document: getFixtureQuery('mutations/updateOrderStatus.gql'),
          variables: { id: 'invalid', status: 'paid' },
        })
      })

      it('returns the expected data', () => {
        expect(result.data?.updateOrderStatus).toEqual({
          message: { type: 'error', text: 'Status could not be updated.' },
          order: null,
        })
      })
    })
  })

  describe('association list wrapper (multiple lists per GraphQL type)', () => {
    it('keeps filtered count aligned with filtered rows and honors skip/limit on items', async () => {
      const result = await execute({
        document: getFixtureQuery('queries/orderAssociationListWrapper.gql'),
        variables: { id: '397' },
      })

      expect(result.errors).toBeUndefined()

      const orderRow = result.data?.order as unknown as {
        filtered: {
          count: number
          items: { id: number; quantity: number }[]
        }
        limitedRows: { count: number; items: { id: number }[] }
        notesFacet: { count: number; items: { id: number; body: string }[] }
      }

      expect(orderRow.filtered.items.every(row => row.quantity === 3)).toBe(true)
      expect(orderRow.filtered.count).toBe(orderRow.filtered.items.length)
      expect(orderRow.limitedRows.items.length).toBeLessThanOrEqual(2)
      expect(orderRow.limitedRows.count).toBe(1)

      expect(orderRow.notesFacet.count).toBe(2)
      expect(new Set(orderRow.notesFacet.items.map(n => n.body))).toEqual(
        new Set(['integration fixture note A', 'integration fixture note B'])
      )
    })
  })

  describe('polymorphic page blocks (GraphQL interface + @Polymorphic)', () => {
    const demoPath = '/__polymorphic_demo_page__'

    it('resolves interface members via inline fragments and __typename', async () => {
      const result = await execute<PageQueryPayload>({
        document: getFixtureQuery('queries/pagePolymorphicBlocks.gql'),
        variables: { path: demoPath },
      })

      expect(result.errors).toBeUndefined()
      expect(result.data?.pageByPath).toEqual({
        id: expect.any(Number),
        path: demoPath,
        blocks: {
          count: expect.any(Number),
          items: [
            {
              id: expect.any(Number),
              __typename: 'HeroBlock',
              title: 'Hello',
              subtitle: 'Polymorphic demo hero',
            },
            {
              id: expect.any(Number),
              __typename: 'TextBlock',
              body: 'Plain text body via TEXT block kind.',
            },
          ],
        },
      })
    })
  })

  describe('when sending query including field with function-based directive', () => {
    let result: ExecutionResult<OrderQueryPayload>

    beforeAll(async () => {
      result = await execute<OrderQueryPayload>({
        document: getFixtureQuery('queries/orderById.gql'),
        variables: { id: '397' },
      })
    })

    it('returns the field value correctly with directive applied', () => {
      expect(result.data?.order?.items?.items?.length).toBeTruthy()
      expect(
        result.data?.order?.items?.items?.every(
          (item: GqlOrderItemRow) =>
            typeof item.product?.color === 'string' || item.product?.color === null
        )
      ).toBe(true)
    })
  })

  describe('graphql-gene schema build (coverage for schema.ts)', () => {
    it('emits union SDL from defineUnion exports', async () => {
      const { schemaString } = await import('../server/schema')
      expect(schemaString).toMatch(/union\s+IntegrationDemoUnion\s*=/)
    })

    it('exposes schemaHtml, parsed typeDefs, and resolvers map getters', async () => {
      const { schemaHtml, typeDefs, resolvers } = await import('../server/schema')
      expect(schemaHtml.length).toBeGreaterThan(100)
      expect(schemaHtml).toContain('IntegrationDemoUnion')
      expect(typeDefs.kind).toBe('Document')
      expect(resolvers.Query && typeof resolvers.Query === 'object').toBe(true)
    })
  })
})
