import { describe, expect, it } from 'vitest'
import { hasTokenBelow, splitTrailingNumber } from './token-name'

describe('RYT-135 name plates on the phone map', () => {
  it('keeps the trailing number of similar names apart from the cut part', () => {
    expect(splitTrailingNumber('Goblin arquero 14')).toEqual({
      head: 'Goblin arquero',
      tail: ' 14',
    })
    expect(splitTrailingNumber('Goblin arquero 15')).toEqual({
      head: 'Goblin arquero',
      tail: ' 15',
    })
  })
  it('leaves names without a trailing number whole', () => {
    expect(splitTrailingNumber('Centinela')).toEqual({ head: 'Centinela', tail: '' })
    expect(splitTrailingNumber('Nivel 2 guardián')).toEqual({ head: 'Nivel 2 guardián', tail: '' })
    expect(splitTrailingNumber('7')).toEqual({ head: '7', tail: '' })
  })
  it('knows when a token sits right under another', () => {
    const token = { x: 4, y: 4, w: 1, h: 1 }
    expect(hasTokenBelow(token, [{ x: 4, y: 5, w: 1, h: 1 }])).toBe(true)
    expect(hasTokenBelow(token, [{ x: 4.4, y: 5.25, w: 1, h: 1 }])).toBe(true)
    expect(hasTokenBelow(token, [{ x: 4, y: 6, w: 1, h: 1 }])).toBe(false)
    expect(hasTokenBelow(token, [{ x: 7, y: 5, w: 1, h: 1 }])).toBe(false)
    expect(hasTokenBelow(token, [{ x: 4, y: 3, w: 1, h: 1 }])).toBe(false)
    expect(hasTokenBelow(token, [token])).toBe(false)
  })
})
