import type { ExecutionResult } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { buildHTTPExecutor, type HTTPExecutorOptions } from '@graphql-tools/executor-http'
import { Product } from '../models'
import { sequelize } from '../models/sequelize'
import { useMetaPlugin } from '../plugins/useMetaPlugin'
import { schema } from '../server/schema'
import { getFixtureQuery } from './utils'

function graphqlVariantItems(product: unknown) {
  return (
    product as {
      variants?: { items?: Array<{ size?: string; inventory?: { stock?: number } | null }> }
    }
  ).variants?.items
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

  // const consoleErrorSpy =
  vi.spyOn(console, 'error').mockImplementation(() => undefined) // Prevent logging errors

  describe('when sending query with filters for default resolver returning single entry', async () => {
    const result = await execute({
      document: getFixtureQuery('queries/mostRecentOrderByStatus.gql'),
      variables: { status: 'paid' },
    })

    it('returns the expected data', () => {
      expect(result.errors).toBeUndefined()
      const order = result.data.order as unknown as {
        items: {
          items: Array<{
            id: number
            price: number
            quantity: number
            product: {
              name: string
              color: string
              group: { products: { items: { id: number }[] }; categories: string[] }
            }
          }>
        }
      }

      expect(order).toMatchObject({
        id: 397,
        status: 'paid',
        updatedAt: '2024-11-03T21:20:43.000Z',
        fieldAddedWithExtendTypes: 'status: paid',
        items: {
          items: [
            {
              id: 976,
              price: 145.85,
              quantity: 3,
              product: {
                name: 'StreetStyle - Slate Thunder',
                color: 'Slate Thunder',
              },
            },
          ],
        },
      })

      const group = order.items.items[0]?.product.group
      expect(new Set(group.categories)).toEqual(new Set(['shoes', 'urban']))
      expect(new Set(group.products.items.map(i => i.id))).toEqual(
        new Set([116, 117, 118, 119, 120, 121])
      )
    })
  })

  describe('when sending query including type with authorization directive', async () => {
    const targetedOrderId = 117

    describe('when the directive throws an error', async () => {
      const result = await execute({
        document: getFixtureQuery('queries/orderWithInventory.gql'),
        variables: { id: String(targetedOrderId) },
      })

      it('returns null for each field returning the type with the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every((_item: unknown) => {
            const item = _item as unknown as { product?: Product }
            const variants = graphqlVariantItems(item.product)
            return !!variants?.length && variants.every(variant => variant.inventory === null)
          })
        ).toBe(true)
      })
    })

    describe('when the directive does not throw an error', async () => {
      const result = await execute(
        {
          document: getFixtureQuery('queries/orderWithInventory.gql'),
          variables: { id: String(targetedOrderId) },
        },
        { headers: { authorization: '5Jx4SHbtvaxFmAHMxIlCvf9V66YdCy' } }
      )

      it('returns the real value of each field returning the type with the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every((_item: unknown) => {
            const item = _item as unknown as { product?: Product }
            const variants = graphqlVariantItems(item.product)
            return (
              !!variants?.length &&
              variants.every(variant => typeof variant.inventory?.stock === 'number')
            )
          })
        ).toBe(true)
      })
    })
  })

  describe('when sending query including field with authorization directive', async () => {
    describe('when the directive throws an error', async () => {
      const result = await execute({
        document: getFixtureQuery('queries/orderWithPublished.gql'),
      })

      it('returns null for each field having the directive', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        expect(
          result.data?.order?.items?.items?.every(
            (item: unknown) =>
              (item as unknown as { product?: Product }).product?.isPublished == null
          )
        ).toBe(true)
      })
    })

    describe('when the directive does not throw an error', async () => {
      const result = await execute(
        { document: getFixtureQuery('queries/orderWithPublished.gql') },
        { headers: { authorization: '5Jx4SHbtvaxFmAHMxIlCvf9V66YdCy' } }
      )

      it('returns the real value of each field having the directive', () => {
        const rows = result.data?.order?.items?.items ?? []
        expect(rows.length).toBeTruthy()

        expect(
          rows.some((item: unknown) => {
            const product = (item as unknown as { product?: Product }).product
            return (
              product != null && (product.isPublished === true || product.isPublished === false)
            )
          })
        ).toBe(true)

        expect(
          rows.every((item: unknown) => {
            const product = (item as unknown as { product?: Product }).product
            if (product == null) return true
            return product.isPublished === true || product.isPublished === false
          })
        ).toBe(true)
      })
    })
  })

  describe('when sending query including type with filterBySize directive', async () => {
    const targetedOrderId = 707

    describe('when filtering is set to active by test header', async () => {
      const result = await execute(
        {
          document: getFixtureQuery('queries/orderById.gql'),
          variables: { id: String(targetedOrderId) },
        },
        { headers: { 'x-test-size-filter-active': 'true' } }
      )

      const apparelOrderItem = result.data?.order?.items?.items?.find((_item: unknown) => {
        const item = _item as unknown as { product?: Product }
        return item.product?.group?.categories?.includes('apparel')
      }) as unknown as { product?: Product }
      const apparelProduct = apparelOrderItem?.product

      it('filters out the XXL variants', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        const variantRows = graphqlVariantItems(apparelProduct)
        expect(variantRows?.length).toBeTruthy()
        expect(new Set(variantRows?.map(v => v.size))).toEqual(new Set(['S', 'M', 'L', 'XL']))
      })
    })

    describe('when filtering is set to inactive by test header', async () => {
      const result = await execute(
        {
          document: getFixtureQuery('queries/orderById.gql'),
          variables: { id: String(targetedOrderId) },
        },
        { headers: { 'x-test-size-filter-active': 'false' } }
      )

      const apparelOrderItem = result.data?.order?.items?.items?.find((_item: unknown) => {
        const item = _item as unknown as { product?: Product }
        return item.product?.group?.categories?.includes('apparel')
      }) as unknown as { product?: Product }
      const apparelProduct = apparelOrderItem?.product

      it('does not filter out the XXL variants', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        const variantRows = graphqlVariantItems(apparelProduct)
        expect(variantRows?.length).toBeTruthy()
        expect(new Set(variantRows?.map(v => v.size))).toEqual(
          new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
        )
      })
    })
  })

  describe('when sending query including type filtering published items using "findOptions"', async () => {
    const targetedOrderId = 363
    const firstProductId = 22
    const secondProductId = 246
    const thirdProductId = 248

    const targetedProductId = secondProductId
    const targetedProduct = await Product.findOne({ where: { id: targetedProductId } })

    const productFindOptions = { where: { id: targetedProductId } }
    const originalIsPublished = targetedProduct?.isPublished

    afterAll(async () => {
      await Product.update({ isPublished: originalIsPublished }, productFindOptions)
    })

    describe('when all items are published', async () => {
      await Product.update({ isPublished: true }, productFindOptions)

      const result = await execute({
        document: getFixtureQuery('queries/orderById.gql'),
        variables: { id: String(targetedOrderId) },
      })

      it('returns all items', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        const ids =
          result.data?.order?.items?.items
            ?.map((item: unknown) => (item as unknown as { product?: Product }).product?.id)
            .filter((id: unknown): id is number => typeof id === 'number') ?? []
        expect(ids).toEqual([firstProductId, secondProductId, thirdProductId])
      })
    })

    describe('when all items are published except one', async () => {
      await Product.update({ isPublished: false }, productFindOptions)

      const result = await execute({
        document: getFixtureQuery('queries/orderById.gql'),
        variables: { id: String(targetedOrderId) },
      })

      it('returns all items except the one unpublished', () => {
        expect(result.data?.order?.items?.items?.length).toBeTruthy()
        const ids =
          result.data?.order?.items?.items
            ?.map((item: unknown) => (item as unknown as { product?: Product }).product?.id)
            .filter((id: unknown): id is number => typeof id === 'number') ?? []
        expect(ids).toEqual([firstProductId, thirdProductId])
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
            items: {
              items: [{ product: { name: 'SpeedTech - Arctic Mint' } }],
            },
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

    it('filters association list items with one-level-deep where on a related model', async () => {
      const result = await execute({
        document: getFixtureQuery('queries/orderItemsDeepFilter.gql'),
        variables: { id: '399', productName: 'Fusion - Ocean Mist' },
      })

      expect(result.errors).toBeUndefined()

      const facet = (
        result.data?.order as unknown as {
          byProductName: { count: number; items: { product: { name: string } }[] }
        }
      ).byProductName

      expect(facet.count).toBe(1)
      expect(facet.items.every(row => row.product.name === 'Fusion - Ocean Mist')).toBe(true)
    })
  })

  describe('polymorphic page blocks (GraphQL interface + @Polymorphic)', () => {
    const demoPath = '/__polymorphic_demo_page__'

    it('resolves interface members via inline fragments and __typename', async () => {
      const result = await execute({
        document: getFixtureQuery('queries/pagePolymorphicBlocks.gql'),
        variables: { path: demoPath },
      })

      expect(result.errors).toBeUndefined()
      expect(result.data?.pageByPath).toEqual({
        id: expect.any(Number),
        path: demoPath,
        blocks: {
          count: 2,
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

    it('resolves junction rows with id and __typename without concrete-table inline fragments', async () => {
      const result = await execute({
        document: getFixtureQuery('queries/pagePolymorphicBlocksTypenamesOnly.gql'),
        variables: { path: demoPath },
      })

      expect(result.errors).toBeUndefined()
      expect(result.data?.pageByPath?.blocks).toEqual({
        items: [
          { id: expect.any(Number), __typename: 'HeroBlock' },
          { id: expect.any(Number), __typename: 'TextBlock' },
        ],
      })
    })
  })

  describe('when sending query including field with function-based directive', async () => {
    const result = await execute({
      document: getFixtureQuery('queries/orderById.gql'),
      variables: { id: '397' },
    })

    it('returns the field value correctly with directive applied', () => {
      expect(result.data?.order?.items?.items?.length).toBeTruthy()
      expect(
        result.data?.order?.items?.items?.every(
          (item: unknown) =>
            typeof (item as unknown as { product?: Product }).product?.color === 'string' ||
            (item as unknown as { product?: Product }).product?.color === null
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
