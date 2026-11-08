import { describe, expect, it } from 'vitest'
import {
  fromSetup,
  pixelsPerInch,
  reportedResolution,
  squareCss,
  squarePx,
  squaresThatFit,
  toSetup,
  type Calibration,
} from './calibration'
import {
  areaCells,
  areaRevealed,
  caughtTokens,
  doorSquares,
  itemCells,
  measurePath,
  nearestEdge,
  roomAt,
  routeMarks,
  sizeSquares,
  snapItem,
  squaresBetween,
  stillHidden,
  stillRevealed,
} from './geometry'

const tv: Calibration = { diagonalIn: 55, pxW: 3840, pxH: 2160, baseMm: 25.4, fine: 1, flip: false }

describe('ADR 032 calibration', () => {
  it('turns a 55-inch 4K screen and a one-inch base into squares', () => {
    expect(pixelsPerInch(tv)).toBeCloseTo(80.1, 1)
    expect(squarePx(tv)).toBeCloseTo(80.1, 1)
    expect(squaresThatFit(tv)).toEqual({ cols: 47, rows: 26 })
    // A 2× display draws the same physical square with half the CSS pixels.
    expect(squareCss(tv, 2)).toBeCloseTo(40.05, 1)
    expect(squaresThatFit({ ...tv, baseMm: 32 })).toEqual({ cols: 38, rows: 21 })
    expect(squaresThatFit({ ...tv, diagonalIn: 32, pxW: 1920, pxH: 1080 })).toEqual({
      cols: 27,
      rows: 15,
    })
  })

  it('round-trips the stored setup and refuses incomplete ones', () => {
    expect(fromSetup(toSetup(tv))).toEqual(tv)
    expect(fromSetup({ diagonal_in: 55, px_w: 3840 })).toBeNull()
    expect(fromSetup({ diagonal_in: 55, px_w: 3840, px_h: 2160, base_mm: 25, fine: 3 })).toEqual({
      ...tv,
      baseMm: 25,
      fine: 1,
    })
    expect(reportedResolution({ width: 1080, height: 1920 }, 2)).toEqual({ pxW: 3840, pxH: 2160 })
  })
})

describe('SRD 5.2.1 grid measuring', () => {
  it('costs one square per orthogonal or diagonal step', () => {
    expect(squaresBetween([0.5, 0.5], [3.5, 0.5])).toBe(3)
    expect(squaresBetween([0.5, 0.5], [3.5, 3.5])).toBe(3)
    expect(squaresBetween([0.5, 0.5], [4.5, 2.5])).toBe(4)
    expect(squaresBetween([1.9, 1.1], [1.2, 1.7])).toBe(0)
    expect(
      measurePath([
        [0.5, 0.5],
        [3.5, 0.5],
        [3.5, 5.5],
      ]),
    ).toEqual({
      segments: [3, 5],
      squares: 8,
      feet: 40,
    })
    expect(
      routeMarks([
        [0.5, 0.5],
        [2.5, 2.5],
      ]),
    ).toEqual([
      [1.5, 1.5],
      [2.5, 2.5],
    ])
  })

  it('sizes creature spaces and snaps them to squares', () => {
    expect(sizeSquares).toMatchObject({ tiny: 0.5, medium: 1, large: 2, huge: 3, gargantuan: 4 })
    expect(itemCells({ x: 2, y: 3, w: 2, h: 2 })).toEqual([
      [2, 3],
      [2, 4],
      [3, 3],
      [3, 4],
    ])
    expect(itemCells({ x: 2.5, y: 3, w: 0.5, h: 0.5 })).toEqual([[2, 3]])
    expect(snapItem(2.4, 3.6, 1, 1)).toEqual([2, 4])
    expect(snapItem(2.3, 3.6, 0.5, 0.5)).toEqual([2.5, 3.5])
  })

  it('places doors on the nearest edge and finds rooms', () => {
    expect(nearestEdge([3.5, 2.1])).toEqual({ x: 3.5, y: 2, rotation: 0 })
    expect(nearestEdge([2.9, 4.4])).toEqual({ x: 3, y: 4.5, rotation: 90 })
    const rooms = [{ id: 'hall', rects: [[0, 0, 4, 4] as [number, number, number, number]] }]
    expect(roomAt(rooms, [3.9, 0.2])?.id).toBe('hall')
    expect(roomAt(rooms, [4, 0.2])).toBeUndefined()
  })
})

describe('areas of effect (centre-of-square convention)', () => {
  it('covers a 20-foot sphere as a disc of squares', () => {
    const cells = areaCells({ data: { shape: 'sphere', size_ft: 20 }, x: 10, y: 10 }, 40, 40)
    // Squares whose centres are within four squares of the corner the sphere starts from.
    expect(cells).toHaveLength(52)
    expect(cells).toContainEqual([6, 9])
    expect(cells).not.toContainEqual([6, 6])
  })

  it('widens cones with distance and keeps lines narrow', () => {
    const cone = areaCells({ data: { shape: 'cone', size_ft: 15, angle: 0 }, x: 5, y: 5.5 }, 20, 20)
    expect(cone).toEqual(
      expect.arrayContaining([
        [5, 5],
        [6, 5],
        [7, 4],
        [7, 5],
        [7, 6],
      ]),
    )
    expect(cone).not.toContainEqual([4, 5])
    expect(cone).not.toContainEqual([5, 4])
    const line = areaCells(
      { data: { shape: 'line', size_ft: 30, width_ft: 5, angle: 0 }, x: 2, y: 2.5 },
      20,
      20,
    )
    expect(line).toEqual([
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
      [6, 2],
      [7, 2],
    ])
    const cube = areaCells({ data: { shape: 'cube', size_ft: 10, angle: 90 }, x: 3, y: 3 }, 20, 20)
    expect(cube.sort()).toEqual([
      [2, 3],
      [2, 4],
      [3, 3],
      [3, 4],
    ])
  })

  it('surrounds a creature with an emanation that leaves out its space', () => {
    const cells = areaCells(
      { data: { shape: 'emanation', size_ft: 5 }, x: 5.5, y: 5.5, w: 1, h: 1 },
      20,
      20,
    )
    expect(cells).toHaveLength(8)
    expect(cells).not.toContainEqual([5, 5])
    const tokens = [
      { id: 'a', kind: 'token' as const, x: 4, y: 4, w: 1, h: 1 },
      { id: 'b', kind: 'token' as const, x: 9, y: 9, w: 2, h: 2 },
      { id: 'c', kind: 'prop' as const, x: 6, y: 6, w: 1, h: 1 },
      { id: 'self', kind: 'token' as const, x: 5, y: 5, w: 1, h: 1 },
    ]
    expect(caughtTokens(cells, tokens, 'self').map((t) => t.id)).toEqual(['a'])
  })
})

describe('room fog margins (RYT-068)', () => {
  const a = {
    mode: 'reveal' as const,
    shape: 'rects' as const,
    rects: [[0, 0, 4, 4]] as [number, number, number, number][],
  }
  const b = {
    mode: 'reveal' as const,
    shape: 'rects' as const,
    rects: [[5, 0, 4, 4]] as [number, number, number, number][],
  }
  const hide = (op: typeof a) => ({ ...op, mode: 'hide' as const })

  it('reveals a neighbour again when a room next to it is hidden', () => {
    expect(stillRevealed([a, b, hide(a)])).toEqual([b])
    expect(stillRevealed([b, a, hide(a)])).toEqual([b])
  })

  it('never brings back a room hidden itself or covered by a hand-drawn hide', () => {
    expect(stillRevealed([a, b, hide(a), hide(b)])).toEqual([])
    expect(
      stillRevealed([a, b, { mode: 'hide', shape: 'rect', x: 0, y: 0, w: 20, h: 20 }, hide(a)]),
    ).toEqual([])
    // Nothing to restore while no room was hidden.
    expect(stillRevealed([a, b])).toEqual([])
  })

  it('names the two squares a door joins and whether a room op left an area revealed', () => {
    expect(doorSquares({ x: 3.5, y: 4, rotation: 0 })).toEqual([
      [3, 3],
      [3, 4],
    ])
    expect(doorSquares({ x: 4, y: 3.5, rotation: 90 })).toEqual([
      [3, 3],
      [4, 3],
    ])
    const room = { id: 'r1', rects: a.rects }
    expect(areaRevealed({ base: 'hidden', ops: [] }, room)).toBe(false)
    expect(areaRevealed({ base: 'hidden', ops: [a, b] }, room)).toBe(true)
    expect(areaRevealed({ base: 'hidden', ops: [a, hide(a)] }, room)).toBe(false)
    expect(areaRevealed({ base: 'revealed', ops: [b] }, room)).toBe(true)
  })

  it('covers again only rooms no later reveal reopened', () => {
    expect(stillHidden([a, b, hide(a)])).toEqual([hide(a)])
    expect(stillHidden([a, hide(a), a])).toEqual([])
    expect(
      stillHidden([hide(a), { mode: 'reveal', shape: 'brush', r: 1, points: [[1, 1]] }]),
    ).toEqual([])
  })
})
