import { describe, expect, it } from 'vitest'
import { ensureIncludeBehind } from '@graphql-gene/plugin-sequelize'

const details: object = {}

// `ensureIncludeBehind` throws outside a findOptions hook, so each call only proves it compiles.
const callOutsideHook = (call: () => unknown) => expect(call).toThrow(/findOptions hook/)

describe('ensureIncludeBehind path types', () => {
  it('accepts paths through associations of the ancestor model', () => {
    callOutsideHook(() => ensureIncludeBehind(details, 'items', 'Order'))
    callOutsideHook(() => ensureIncludeBehind(details, 'items.product', 'Order'))
  })

  it('rejects paths that do not start with an association of the ancestor model', () => {
    // @ts-expect-error — not an association of Order
    callOutsideHook(() => ensureIncludeBehind(details, 'notAnAssociation', 'Order'))
    // @ts-expect-error — first segment must be an association
    callOutsideHook(() => ensureIncludeBehind(details, 'status.anything', 'Order'))
  })
})
