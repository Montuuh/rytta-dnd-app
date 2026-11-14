import { describe, expect, it } from 'vitest'
import { cellMaskPath } from './visibility'

describe('tabletop cell masks', () => {
  it('merges runs without joining the last column to the next row', () => {
    expect(cellMaskPath([5, 1, 2, 3, 4, 4, -1, 99], 4, 3)).toBe('M1 0h3v1h-3zM0 1h2v1h-2z')
    expect(cellMaskPath([], 4, 3)).toBe('')
  })
})
