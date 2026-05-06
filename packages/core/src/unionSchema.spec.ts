import { describe, expect, it } from 'vitest'
import { defineUnion, generateSchema } from 'graphql-gene'

describe('GraphQL union (defineUnion + schema build)', () => {
  it('includes union PageBlockContent = HeroBlock | TextBlock in printed schema', () => {
    const PageBlockContent = defineUnion(['HeroBlock', 'TextBlock'])

    const { schemaString } = generateSchema({
      schema: `
        type Query {
          _: Boolean
        }
        type HeroBlock {
          id: Int
        }
        type TextBlock {
          id: Int
        }
      `,
      types: { PageBlockContent },
      plugins: [],
    })

    expect(schemaString).toMatch(/union PageBlockContent = HeroBlock \| TextBlock/)
  })
})
