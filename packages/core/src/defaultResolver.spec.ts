import { describe, expect, it } from 'vitest'
import {
  generateDefaultQueryFilterTypeDefs,
  getQueryOrderEnumName,
  getWhereOptionsInputName,
} from './defaultResolver'
import { getDefaultFieldLinesObject, getDefaultTypeDefLinesObject } from './utils'
import type { TypeDefLines } from './types'

const WRAPPER = 'ProductGroupProductsGeneAssociationListResult'

/**
 * Minimal `typeDefLines` mirroring a Sequelize schema where:
 * - `ProductCategory.groups` is a multi association whose target is `ProductGroup`
 * - `ProductGroup.products` is a multi association whose target is `Product` (exposed as a
 *   `{ count, items }` wrapper output type)
 * - `Product` has scalar fields only
 */
function buildTypeDefLines(): TypeDefLines {
  const field = (typeDef: string) => ({ ...getDefaultFieldLinesObject(), typeDef })

  return {
    Product: {
      ...getDefaultTypeDefLinesObject(),
      lines: { id: field('Int!'), name: field('String') },
    },
    ProductGroup: {
      ...getDefaultTypeDefLinesObject(),
      lines: { name: field('String'), products: field(WRAPPER) },
    },
    ProductCategory: {
      ...getDefaultTypeDefLinesObject(),
      lines: {
        name: field('String'),
        groups: field('ProductCategoryGroupsGeneAssociationListResult'),
      },
    },
    [WRAPPER]: {
      ...getDefaultTypeDefLinesObject(),
      lines: { count: field('Int!'), items: field(`[Product!]!`) },
    },
  }
}

const isAssociationField = (ownerType: string, fieldName: string) =>
  (ownerType === 'ProductGroup' && fieldName === 'products') ||
  (ownerType === 'ProductCategory' && fieldName === 'groups')

const resolveListWrapperTargetType = (graphqlTypeName: string) => {
  if (graphqlTypeName === WRAPPER) return 'Product'
  if (graphqlTypeName === 'ProductCategoryGroupsGeneAssociationListResult') return 'ProductGroup'
  return undefined
}

/** Emulates the plugin's parent-level association-list filter hook. */
function runParentHook(
  typeDefLines: TypeDefLines,
  graphqlType: string,
  fieldKey: string,
  fieldType: string
) {
  generateDefaultQueryFilterTypeDefs({
    typeDefLines,
    graphqlType,
    fieldKey,
    fieldType,
    associationFilterDepth: 1,
    isAssociationField,
    resolveListWrapperTargetType,
  })
}

describe('generateDefaultQueryFilterTypeDefs nested multi-association where inputs', () => {
  const productsWhereInput = getWhereOptionsInputName('ProductGroup', 'products')
  const productsOrderEnum = getQueryOrderEnumName('ProductGroup', 'products')

  it('derives the nested multi-association where input from the target type, not the wrapper', () => {
    const typeDefLines = buildTypeDefLines()

    // The parent-level hook for `ProductGroup.products` derives the canonical where input.
    runParentHook(typeDefLines, 'ProductGroup', 'products', 'Product')

    const lines = typeDefLines[productsWhereInput].lines
    expect(Object.keys(lines).sort()).toEqual(['and', 'id', 'name', 'or'])
    expect(lines.id.typeDef).toBe('GeneOperatorIntInput')
    expect(lines.name.typeDef).toBe('GeneOperatorStringInput')
    // The wrapper's own fields must never leak into a where input.
    expect(lines.count).toBeUndefined()
    expect(lines.items).toBeUndefined()

    const orderKeys = Object.keys(typeDefLines[productsOrderEnum].lines)
    expect(orderKeys).toContain('id_ASC')
    expect(orderKeys).toContain('name_ASC')
    expect(orderKeys).not.toContain('count_ASC')
    expect(orderKeys).not.toContain('items_ASC')
  })

  it('references the canonical where input from a parent that nests the wrapper association', () => {
    const typeDefLines = buildTypeDefLines()

    // Parent hook for `ProductCategory.groups` iterates `ProductGroup` fields and reaches the
    // nested multi association `products`.
    runParentHook(typeDefLines, 'ProductCategory', 'groups', 'ProductGroup')

    const groupsWhereInput = getWhereOptionsInputName('ProductCategory', 'groups')
    expect(typeDefLines[groupsWhereInput].lines.products.typeDef).toBe(productsWhereInput)
  })

  it('produces a correct where input regardless of hook execution order (wrapper-derived never wins)', () => {
    for (const order of ['nested-first', 'target-first'] as const) {
      const typeDefLines = buildTypeDefLines()

      if (order === 'nested-first') {
        runParentHook(typeDefLines, 'ProductCategory', 'groups', 'ProductGroup')
        runParentHook(typeDefLines, 'ProductGroup', 'products', 'Product')
      } else {
        runParentHook(typeDefLines, 'ProductGroup', 'products', 'Product')
        runParentHook(typeDefLines, 'ProductCategory', 'groups', 'ProductGroup')
      }

      const lines = typeDefLines[productsWhereInput].lines
      expect(lines.count, `count leaked (${order})`).toBeUndefined()
      expect(lines.id?.typeDef, `id missing (${order})`).toBe('GeneOperatorIntInput')
      expect(lines.name?.typeDef, `name missing (${order})`).toBe('GeneOperatorStringInput')
    }
  })
})
