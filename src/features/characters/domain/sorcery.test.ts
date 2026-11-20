import { describe, expect, it } from 'vitest'
import { planCast, slotChoices } from './casting'
import { actionsFor, spendAction } from './resources'
import { emptyBuild } from './rules'
import type { Build, Vitals } from './sheet'
import {
  convertSlot,
  createSlot,
  createdSlotKey,
  metamagicCost,
  metamagicKnown,
  slotsLeft,
} from './sorcery'

const points = {
  id: 'sp',
  key: 'sorcerer-sorcery-points',
  name: 'Puntos de hechicería',
  max: 5,
  reset: 'long' as const,
  display: 'counter' as const,
}
const sorcerer = (metamagic: Build['metamagic'] = []): Build => ({
  ...emptyBuild(),
  classKey: 'sorcerer',
  casterKind: 'full',
  trackers: [points],
  metamagic,
})
const play = (uses: Record<string, number> = {}, slots: number[] = []): Vitals =>
  ({
    current_hp: 10,
    temp_hp: 0,
    hit_dice_spent: 0,
    death_successes: 0,
    death_failures: 0,
    heroic_inspiration: false,
    conditions: [],
    slots_used: Array.from({ length: 9 }, (_, index) => slots[index] ?? 0),
    tracker_uses: uses,
    concentration: null,
    revision: 1,
  }) as Vitals

describe('Metamagic (RYT-110)', () => {
  it('lists only the known options with their SRD cost and refuses them without points', () => {
    expect([1, 2, 9, 10, 16, 17].map(metamagicKnown)).toEqual([0, 2, 2, 4, 4, 6])
    const build = sorcerer(['subtle', 'quickened'])
    const options = actionsFor(build, 5, 'sorcerer-sorcery-points')
    expect(options.filter((o) => o.metamagic).map((o) => [o.metamagic, o.cost])).toEqual([
      ['quickened', 2],
      ['subtle', 1],
    ])
    expect(metamagicCost.heightened).toBe(2)
    const quickened = options.find((o) => o.metamagic === 'quickened')!
    expect(spendAction(quickened, build.trackers, { sp: 2 })).toEqual({ sp: 4 })
    expect(spendAction(quickened, build.trackers, { sp: 4 })).toBeNull()
    // Not known before level 2, and never for another class's resource.
    expect(actionsFor(build, 1, 'sorcerer-sorcery-points')).toEqual([])
    expect(actionsFor(build, 5, 'monk-focus').some((o) => o.metamagic)).toBe(false)
  })
})

describe('Font of Magic (RYT-110)', () => {
  it('creates a slot for its SRD cost within the level limit, refilling a spent one first', () => {
    const build = sorcerer()
    // Level 3 Sorcerer: a 2nd-level slot costs 3; 3rd needs level 5.
    const refilled = createSlot(build, 3, play({}, [0, 1]), 2)!
    expect(refilled.slots_used[1]).toBe(0)
    expect(refilled.tracker_uses).toEqual({ sp: 3 })
    expect(createSlot(build, 3, play(), 3)).toBeNull()
    expect(createSlot(build, 3, play({ sp: 3 }), 2)).toBeNull()
    // With every slot of the level left, the created one is extra and casts first.
    const extra = createSlot(build, 3, play(), 1)!
    expect(extra.tracker_uses).toEqual({ sp: 2, [createdSlotKey(1)]: 1 })
    expect(slotsLeft(build, 3, extra)[0]).toBe(5)
    const cast = planCast(
      { level: 1, ritual: false, concentration: false },
      { kind: 'slot', level: 1 },
      build,
      3,
      extra,
      '',
    )!
    expect(cast.vitals.slots_used[0]).toBe(0)
    expect(cast.vitals.tracker_uses).toEqual({ sp: 2 })
  })

  it('turns an unexpended slot into points equal to its level, never past the maximum', () => {
    const build = sorcerer()
    const converted = convertSlot(build, 3, play({ sp: 4 }), 2)!
    expect(converted.slots_used[1]).toBe(1)
    expect(converted.tracker_uses).toEqual({ sp: 2 })
    expect(convertSlot(build, 3, play({ sp: 1 }), 2)).toBeNull()
    expect(convertSlot(build, 3, play({ sp: 4 }, [0, 2]), 2)).toBeNull()
    // No slot of that level at all.
    expect(slotChoices(build, 3, play(), 3)).toEqual([])
    expect(convertSlot(build, 3, play({ sp: 5 }), 3)).toBeNull()
  })
})
