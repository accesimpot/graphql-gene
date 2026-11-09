import { ensureIncludeBehind } from '@graphql-gene/plugin-sequelize'

declare const details: object

ensureIncludeBehind(details, 'items', 'Order')
ensureIncludeBehind(details, 'items.product', 'Order')
// @ts-expect-error — not an association of Order
ensureIncludeBehind(details, 'notAnAssociation', 'Order')
// @ts-expect-error — first segment must be an association
ensureIncludeBehind(details, 'status.anything', 'Order')
