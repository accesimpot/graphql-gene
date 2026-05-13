/** Initializes Sequelize models (associations) before SDL/schema consumers import concrete types. */
import './sequelize'
import { defineUnion } from 'graphql-gene'

export * from './models'

export { ProductReviewAverage } from './Product/Product.model'
export {
  UpdateOrderStatusOutput,
  OrderStatusEnum,
  MessageOutput,
  MessageTypeEnum,
  SomeOtherInput,
} from './Order/Order.model'

/** Covers graphql-gene `defineUnion` / union SDL emission in `schema.ts`. */
export const IntegrationDemoUnion = defineUnion(['Product', 'Order'])
