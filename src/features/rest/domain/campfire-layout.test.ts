import { describe, expect, it } from 'vitest'
import { pickLayout, seatsFit } from './campfire-layout'

describe('campfire layout', () => {
  it('never reports a placement whose seat boxes touch', () => {
    for (let count = 1; count <= 8; count++)
      for (let width = 200; width <= 420; width += 4) {
        const layout = pickLayout(count, false, width)
        if (layout === 'rows') continue
        const height = layout === 'ring' ? width : 250
        expect(seatsFit(layout, count, { width, height })).toBe(true)
      }
  })
  it('seats the phone-sized big table on the ring and falls back to rows when narrow', () => {
    expect(pickLayout(7, false, 340)).toBe('ring')
    expect(pickLayout(8, false, 220)).toBe('rows')
    expect(pickLayout(7, true, 340)).toBe('rows')
    expect(pickLayout(3, false, 0)).toBe('rows')
  })
})
