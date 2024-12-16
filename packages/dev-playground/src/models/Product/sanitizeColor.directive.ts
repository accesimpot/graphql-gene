import { defineDirective } from 'graphql-gene'
import type { Product } from './Product.model'

export const sanitizeColorDirective = defineDirective<{
  exclude: ('Gray' | 'White')[]
}>(args => ({
  name: 'sanitizeColor',
  args,

  async handler({ filter }) {
    filter((color: Product['color']) =>
      args.exclude.every(excludedColor => !color?.includes(excludedColor))
    )
  },
}))
