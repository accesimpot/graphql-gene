import { sequelize } from '../models/sequelize'

import { Product } from '../models/Product/Product.model'
import { ProductCategory } from '../models/ProductCategory/ProductCategory.model'
import { ProductGroup } from '../models/ProductGroup/ProductGroup.model'
import { ProductVariant } from '../models/ProductVariant/ProductVariant.model'

import { SHOE_PRODUCTS } from './data/shoes'
import { APPAREL_PRODUCTS } from './data/apparel'
import type { CreationAttributes } from 'sequelize'

const SHOE_SIZES = [
  'US 7',
  'US 7.5',
  'US 8',
  'US 8.5',
  'US 9',
  'US 9.5',
  'US 10',
  'US 10.5',
  'US 11',
  'US 11.5',
  'US 12',
  'US 13',
]
const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XLL']

function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

/////////////////

async function createAllProducts() {
  const productGroupNames = new Set<string>([])
  const productCategoryNames = new Set<string>([])

  const productSettings: Partial<
    Record<string, { group?: string; color?: string; productType?: string }>
  > = {}
  const productCategories: Partial<Record<string, ProductCategory>> = {}
  const productGroupCategories: Partial<Record<string, Set<string>>> = {}
  const productGroups: Partial<Record<string, ProductGroup>> = {}

  ;[...SHOE_PRODUCTS, ...APPAREL_PRODUCTS].forEach(([productName, categories], index) => {
    const [productGroupName, colorway] = productName.split(/\s*-\s*/)
    const productType = index < SHOE_PRODUCTS.length ? 'shoes' : 'apparel'

    productSettings[productName] = productSettings[productName] || {}
    productSettings[productName].group = productGroupName
    productSettings[productName].color = colorway
    productSettings[productName].productType = productType

    productGroupNames.add(productGroupName)
    productGroupCategories[productGroupName] =
      productGroupCategories[productGroupName] || new Set([])

    if (categories) {
      ;[productType, ...categories].forEach(category => {
        productCategoryNames.add(category)
        productGroupCategories[productGroupName]!.add(category)
      })
    }
  })

  for (const categoryName of productCategoryNames) {
    const productCategory = await ProductCategory.create({ name: categoryName })
    productCategories[categoryName] = productCategory
  }

  for (const groupName of productGroupNames) {
    const productGroup = await ProductGroup.create({ name: groupName })

    if (productGroupCategories[groupName]) {
      for (const categoryName of productGroupCategories[groupName]) {
        const category = productCategories[categoryName]
        if (!category) continue

        productGroup.addCategory(category)
      }
    }
    productGroups[groupName] = productGroup
  }

  for (const productName in productSettings) {
    const { group, color, productType } = productSettings[productName] || {}

    const creationAttributes: CreationAttributes<Product> = { name: productName }

    if (group && productGroups[group]) creationAttributes.groupId = productGroups[group].id
    if (color) creationAttributes.color = color

    const product = await Product.create(creationAttributes)
    const sizes = productType === 'shoes' ? SHOE_SIZES : APPAREL_SIZES

    for (const size of sizes) {
      await ProductVariant.create(
        {
          size,
          // @ts-expect-error is typed as `Inventory` instead of `CreationAttributes<Inventory>`
          inventory: { stock: randomIntFromInterval(10, 1000) },
          productId: product.id,
        },
        {
          include: [{ association: 'inventory' }],
        }
      )
    }
  }
}

// Connect to the database
await sequelize.authenticate()

await createAllProducts()

process.exit()
