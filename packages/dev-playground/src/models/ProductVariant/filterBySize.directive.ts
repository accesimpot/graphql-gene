import { defineDirective } from 'graphql-gene'
import type { SHOE_SIZES, APPAREL_SIZES, ProductVariant } from './ProductVariant.model'

export const filterBySizeDirective = defineDirective<{
  exclude: (`${SHOE_SIZES}` | `${APPAREL_SIZES}`)[]
}>(args => ({
  name: 'filterBySize',
  args,

  async handler({ context, filter }) {
    // For testing purposes
    const isActive = context.request.headers.get('x-test-size-filter-active') === 'true'
    if (!isActive) return

    // TODO: Improve by inferring the type from defineDirective
    filter((variant: ProductVariant) =>
      args.exclude.every(excludedSize => variant.size !== excludedSize)
    )
  },
}))
