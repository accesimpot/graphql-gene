import { defineDirective } from 'graphql-gene'
import type { ProductVariant } from './ProductVariant.model'

export const filterBySizeDirective = defineDirective(() => ({
  name: 'filterBySize',

  async handler({ context, filter }) {
    // For testing purposes
    const isActive = context.request.headers.get('x-test-size-filter-active') === 'true'
    if (!isActive) return

    // TODO: Improve by inferring the type from defineDirective
    filter((variant: ProductVariant) => variant.size !== 'XLL')
  },
}))
