import { fakerEN_CA, fakerEN_US, fakerES_MX } from '@faker-js/faker'
import { sequelize } from '../models/sequelize'

import { Address } from '../models/Address/Address.model'
import { Order } from '../models/Order/Order.model'
import { OrderItem } from '../models/OrderItem/OrderItem.model'
import { Product } from '../models/Product/Product.model'
import { ProductCategory } from '../models/ProductCategory/ProductCategory.model'
import { ProductGroup } from '../models/ProductGroup/ProductGroup.model'
import { ProductVariant } from '../models/ProductVariant/ProductVariant.model'

import { SHOE_PRODUCTS } from './data/shoes'
import { APPAREL_PRODUCTS } from './data/apparel'
import type { CreationAttributes } from 'sequelize'

const ORDER_COUNT = 1000

const ORDER_STATUSES = [
  'cart',
  'cart',
  'cart',
  'shipping',
  'shipping',
  'payment',
  'paid',
  'shipped',
  'shipped',
  'shipped',
  'shipped',
  'shipped',
] as const
const COUNTRIES = {
  ca: 'ca',
  us: 'us',
  mx: 'mx',
} as const

const COUNTRY_SETTINGS = {
  [COUNTRIES.ca]: { faker: fakerEN_CA, tax: 0.15 },
  [COUNTRIES.us]: { faker: fakerEN_US, tax: 0.1 },
  [COUNTRIES.mx]: { faker: fakerES_MX, tax: 0 },
}

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

const allProductIds = new Set<Product['id']>([])

function pickRandomValue<T>(array: readonly T[] | T[]) {
  return array[Math.floor(Math.random() * array.length)]
}

function getRandomIntBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

function getRandomDateBetween(startDate: Date, endDate: Date): Date {
  // Ensure startDate is before endDate
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate]

  // Get the time in milliseconds for both dates
  const startTime = startDate.getTime()
  const endTime = endDate.getTime()

  // Generate a random time between the two dates
  const randomTime = startTime + Math.random() * (endTime - startTime)

  // Create and return a new Date object with the random time
  return new Date(randomTime)
}

function convertJsDateToSqliteDatetime(date: Date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
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
    allProductIds.add(product.id)
    const sizes = productType === 'shoes' ? SHOE_SIZES : APPAREL_SIZES

    for (const size of sizes) {
      await ProductVariant.create(
        {
          size,
          // @ts-expect-error is typed as `Inventory` instead of `CreationAttributes<Inventory>`
          inventory: { stock: getRandomIntBetween(10, 1000) },
          productId: product.id,
        },
        {
          include: [{ association: 'inventory' }],
        }
      )
    }
  }
}

async function createOrders() {
  for (let i = 0; i < ORDER_COUNT; i++) {
    await createOrder()
  }
}

async function createOrder() {
  const country = pickRandomValue(Object.values(COUNTRIES))
  const countrySettings = COUNTRY_SETTINGS[country]
  const locationApi = countrySettings.faker.location

  const itemCount = getRandomIntBetween(1, 4)
  const allProductIdsArray = [...allProductIds]

  const address = await Address.create({
    firstName: countrySettings.faker.person.firstName(),
    lastName: countrySettings.faker.person.lastName(),
    address1: locationApi.streetAddress(),
    address2: getRandomIntBetween(1, 10) === 1 ? locationApi.secondaryAddress() : null,
    city: locationApi.city(),
    province: locationApi.state(),
    postalCode: locationApi.zipCode(),
    country,
    email: countrySettings.faker.internet.email(),
    phone: countrySettings.faker.phone.number({ style: 'international' }),
  })

  const itemSettings: { price: number; quantity: number; productId: number }[] = []

  for (let i = 0; i < itemCount; i++) {
    const productId = allProductIdsArray[getRandomIntBetween(0, allProductIdsArray.length - 1)]

    itemSettings.push({
      price: getRandomIntBetween(5000, 40000) / 100,
      quantity: pickRandomValue([1, 1, 1, 1, 1, 2, 3]),
      productId: productId,
    })
  }

  let subtotal = 0
  itemSettings.forEach(item => (subtotal += item.price * item.quantity))

  const tax = countrySettings.tax
  const total = subtotal * tax
  const roundPrice = (num: number) => Math.round(num * 100) / 100

  const order = await Order.create({
    status: pickRandomValue(ORDER_STATUSES),
    tax,
    subtotal: roundPrice(subtotal),
    total: roundPrice(total),
    addressId: address.id,
  })

  for (const item of itemSettings) {
    await OrderItem.create({ ...item, orderId: order.id })
  }
  const createdAt = getRandomDateBetween(new Date('2018-01-01'), new Date())
  const updatedAt = new Date(createdAt.getTime() + getRandomIntBetween(0, 600) * 1000)

  await sequelize.query(
    'UPDATE `Orders` SET createdAt = :createdAt, updatedAt = :updatedAt WHERE id = :id',
    {
      replacements: {
        id: order.id,
        createdAt: convertJsDateToSqliteDatetime(createdAt),
        updatedAt: convertJsDateToSqliteDatetime(updatedAt),
      },
    }
  )
}

// Connect to the database
await sequelize.authenticate()

await createAllProducts()
await createOrders()

process.exit()
