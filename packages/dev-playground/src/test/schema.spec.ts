import { schemaString } from '../server/schema'

/** Extracts the SDL block (`input|type|enum <name> { ... }`) for a named type. */
function getTypeBlock(sdl: string, name: string): string | undefined {
  const match = sdl.match(new RegExp(`(?:input|type|enum) ${name} \\{[\\s\\S]*?\\n\\}`, 'm'))
  return match?.[0]
}

describe('generated schema: nested multi-association where inputs', () => {
  it('derives nested has-many (list wrapper) where inputs from the target type, not the wrapper', () => {
    // `ProductGroup.products` is a HasMany (exposed as a `{ count, items }` wrapper). It is reached
    // both directly and nested under `ProductCategory.groups`, which previously corrupted its
    // filter input with the wrapper's own `count`/`items` fields.
    const whereInput = getTypeBlock(schemaString, 'ProductGroupWhereOptionsProducts')

    expect(whereInput).toBeDefined()
    expect(whereInput).toContain('name: GeneOperatorStringInput')
    expect(whereInput).toContain('color: GeneOperatorStringInput')
    // Wrapper facets must never leak into a filter input.
    expect(whereInput).not.toContain('count: GeneOperatorIntInput')
    expect(whereInput).not.toMatch(/\bitems:/)
  })

  it('does not leak wrapper facets into association order enums', () => {
    const orderEnum = getTypeBlock(schemaString, 'ProductGroupSelectOrderProducts')

    expect(orderEnum).toBeDefined()
    expect(orderEnum).toContain('name_ASC')
    expect(orderEnum).not.toContain('count_ASC')
    expect(orderEnum).not.toContain('items_ASC')
  })
})
