import { describe, expect, it } from 'vitest'
import {
  cornerFromPoint,
  cornerToward,
  defaultPlate,
  mirrorCorner,
  mirrorDirection,
  nextCorner,
  parsePlate,
  plateStorageKey,
  readPlate,
  writePlate,
} from './table-plate'
import {
  nameOverflows,
  nextAnnouncement,
  orderLayout,
  sameTurn,
  turnAnnouncement,
  turnMark,
  type TurnMark,
} from './table-order'

describe('orderLayout', () => {
  it('keeps up to 16 combatants within 6 rows on wide screens', () => {
    for (const width of [1280, 1920])
      for (let n = 1; n <= 16; n++) {
        const { columns, rows } = orderLayout(n, width)
        expect(columns).toBeGreaterThanOrEqual(1)
        expect(columns).toBeLessThanOrEqual(3)
        expect(rows).toBeLessThanOrEqual(6)
        expect(columns * rows).toBeGreaterThanOrEqual(n)
      }
  })
  it('uses two columns for a mid-size order and three for a long one', () => {
    expect(orderLayout(8, 1280)).toEqual({ columns: 2, rows: 4 })
    expect(orderLayout(16, 1280)).toEqual({ columns: 3, rows: 6 })
    expect(orderLayout(16, 1920)).toEqual({ columns: 3, rows: 6 })
  })
  it('keeps two columns on a tablet and one on a phone', () => {
    expect(orderLayout(16, 820)).toEqual({ columns: 2, rows: 8 })
    expect(orderLayout(16, 390)).toEqual({ columns: 1, rows: 16 })
  })
  it('gives a short order one wide column and tolerates nothing', () => {
    expect(orderLayout(3, 1280)).toEqual({ columns: 1, rows: 3 })
    expect(orderLayout(0, 1280)).toEqual({ columns: 1, rows: 1 })
  })
})

describe('turn announcements', () => {
  const t = (key: string, p: { name: string; round: number }) => `${key}|${p.name}|${p.round}`
  const active = { name: 'Arin' }
  const mark = (id: string | null, name: string | undefined, round = 1) =>
    turnMark('active', round, id, name ? { name } : undefined)

  it('has a mark only while the fight is active', () => {
    expect(turnMark('initiative', 0, null, undefined)).toBeNull()
    expect(turnMark('ended', 3, null, undefined)).toBeNull()
    expect(mark('a', active.name)).toEqual({ activeId: 'a', name: 'Arin', hidden: false, round: 1 })
  })
  it('announces a new actor once and nothing for the same state', () => {
    const before = mark('a', 'Arin')
    const after = mark('b', 'Bea')
    expect(turnAnnouncement(before, after, t)).toBe('tabletop.table.announce|Bea|1')
    expect(turnAnnouncement(after, mark('b', 'Bea'), t)).toBeNull()
  })
  it('announces a new round even when the same combatant acts', () => {
    expect(turnAnnouncement(mark('a', 'Arin', 1), mark('a', 'Arin', 2), t)).toBe(
      'tabletop.table.announce|Arin|2',
    )
  })
  it('says a hidden turn without a name', () => {
    expect(turnAnnouncement(mark('a', 'Arin'), mark(null, undefined), t)).toBe(
      'tabletop.table.announceHidden||1',
    )
  })
  it('announces the first active turn after initiative, and nothing when the fight stops', () => {
    expect(turnAnnouncement(null, mark('a', 'Arin'), t)).toBe('tabletop.table.announce|Arin|1')
    expect(turnAnnouncement(mark('a', 'Arin'), null, t)).toBeNull()
  })
  it('announces two consecutive turns with the same words as two announcements', () => {
    const first = turnAnnouncement(mark('a', 'Rata'), mark('b', 'Rata'), t)
    const second = turnAnnouncement(mark('b', 'Rata'), mark('c', 'Rata'), t)
    expect(first).toBe(second)
    const one = nextAnnouncement({ text: '', seq: 0 }, first!)
    const two = nextAnnouncement(one, second!)
    expect(two.text).toBe(one.text)
    expect(two.seq).toBeGreaterThan(one.seq)
  })
  it('compares marks by who acts, not by identity', () => {
    const a: TurnMark = { activeId: 'a', name: 'Arin', hidden: false, round: 1 }
    expect(sameTurn(a, { ...a })).toBe(true)
    expect(sameTurn(a, null)).toBe(false)
    expect(sameTurn(null, null)).toBe(true)
  })
})

describe('plate position', () => {
  const store = (initial: Record<string, string> = {}) => {
    const data = { ...initial }
    return {
      data,
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => void (data[k] = v),
    }
  }
  it('starts at the default and survives a round trip', () => {
    const s = store()
    expect(readPlate(s)).toEqual(defaultPlate)
    expect(writePlate({ corner: 'bottom-right', size: 'small' }, s)).toBe(true)
    expect(readPlate(s)).toEqual({ corner: 'bottom-right', size: 'small' })
  })
  it('ignores values it does not know', () => {
    expect(parsePlate('nope')).toEqual(defaultPlate)
    expect(parsePlate('{"corner":"middle","size":"huge"}')).toEqual(defaultPlate)
    expect(parsePlate('{"corner":"top-right"}')).toEqual({ corner: 'top-right', size: 'full' })
    expect(readPlate(store({ [plateStorageKey]: '[]' }))).toEqual(defaultPlate)
  })
  it('falls back safely when storage is missing or blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readPlate(blocked)).toEqual(defaultPlate)
    expect(writePlate(defaultPlate, blocked)).toBe(false)
    expect(readPlate(null)).toEqual(defaultPlate)
    expect(writePlate(defaultPlate, null)).toBe(false)
  })
  it('picks the nearest corner and moves by arrows', () => {
    expect(cornerFromPoint(100, 100, 1000, 800)).toBe('top-left')
    expect(cornerFromPoint(900, 700, 1000, 800)).toBe('bottom-right')
    expect(cornerFromPoint(900, 100, 1000, 800)).toBe('top-right')
    expect(cornerFromPoint(100, 700, 1000, 800)).toBe('bottom-left')
    expect(cornerToward('top-left', 'right')).toBe('top-right')
    expect(cornerToward('top-right', 'down')).toBe('bottom-right')
    expect(cornerToward('bottom-right', 'left')).toBe('bottom-left')
    expect(cornerToward('bottom-left', 'up')).toBe('top-left')
    expect(cornerToward('top-left', 'left')).toBe('top-left')
  })
  it('mirrors corners and arrow keys on a screen turned 180 degrees', () => {
    expect(mirrorCorner('top-left')).toBe('bottom-right')
    expect(mirrorCorner('top-right')).toBe('bottom-left')
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)
      expect(mirrorCorner(mirrorCorner(corner))).toBe(corner)
    expect(mirrorDirection('left')).toBe('right')
    expect(mirrorDirection('up')).toBe('down')
    // Right on the turned screen moves the plate to the logical left.
    expect(cornerToward('top-right', mirrorDirection('right'))).toBe('top-left')
  })
  it('cycles through every corner', () => {
    const seen = new Set<string>()
    let corner = defaultPlate.corner
    for (let i = 0; i < 4; i++) seen.add((corner = nextCorner(corner)))
    expect(seen.size).toBe(4)
    expect(corner).toBe(defaultPlate.corner)
  })
})

describe('RYT-135 the order screen keeps the normal type for a name that fits', () => {
  const fits = { clientWidth: 300, scrollWidth: 300, height: 88, lineHeight: 44 }
  it('fits on one or two lines', () => {
    expect(nameOverflows({ ...fits, height: 44 })).toBe(false)
    expect(nameOverflows(fits)).toBe(false)
  })
  it('rounds one pixel away', () => {
    expect(nameOverflows({ ...fits, scrollWidth: 301, height: 89 })).toBe(false)
  })
  it('shrinks a name of three lines', () => {
    expect(nameOverflows({ ...fits, height: 132 })).toBe(true)
  })
  it('shrinks a name with a word wider than the column', () => {
    expect(nameOverflows({ ...fits, scrollWidth: 340, height: 44 })).toBe(true)
  })
})
