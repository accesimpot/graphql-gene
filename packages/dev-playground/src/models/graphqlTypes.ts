/** Initializes Sequelize models (associations) before SDL/schema consumers import concrete types. */
import './sequelize'

export * from './models'

export { ProductReviewAverage } from './Product/Product.model'
export {
  UpdateOrderStatusOutput,
  OrderStatusEnum,
  MessageOutput,
  MessageTypeEnum,
  SomeOtherInput,
} from './Order/Order.model'
