import { getMutable } from './typeUtils'

const IMMUTABLE = ['a', 'b'] as const

describe('#getMutable', () => {
  it('returns the array provided, but without readonly', () => {
    const mutable = getMutable(IMMUTABLE)
    expect(mutable).toEqual(IMMUTABLE)
  })
})
