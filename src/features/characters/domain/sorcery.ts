import { slotsFor } from './rules'
import type { Build, Tracker, Vitals } from './sheet'

/**
 * RYT-110 Sorcerer options from SRD 5.2.1 (names and numbers only; the rules text is the
 * glossary entry). Metamagic options are paid from Sorcery Points; Font of Magic converts points
 * and spell slots both ways.
 */
export { metamagicCost, metamagicKeys, type MetamagicKey } from './srd'

/** Options a Sorcerer knows: 2 at level 2, 4 at level 10 and 6 at level 17. */
export const metamagicKnown = (level: number) =>
  level >= 17 ? 6 : level >= 10 ? 4 : level >= 2 ? 2 : 0

export const sorceryPointsKey = 'sorcerer-sorcery-points'

/** Creating Spell Slots: point cost and minimum Sorcerer level per slot level (5th at most). */
export const createSlotTable = [
  { level: 1, cost: 2, from: 2 },
  { level: 2, cost: 3, from: 3 },
  { level: 3, cost: 5, from: 5 },
  { level: 4, cost: 6, from: 7 },
  { level: 5, cost: 7, from: 9 },
] as const

/** Created slots above the table live in the play state's uses, so a conversion is one write
 * with the slots and points it changes. Every rest clears them (the server keeps only uses of
 * the sheet's trackers). */
export const createdSlotKey = (slotLevel: number) => `font-slot-${slotLevel}`
export const createdSlots = (uses: Vitals['tracker_uses']) =>
  Array.from({ length: 9 }, (_, index) => Math.max(0, uses[createdSlotKey(index + 1)] ?? 0))

type Play = Pick<Vitals, 'slots_used' | 'tracker_uses'>
type Caster = Pick<Build, 'casterKind' | 'trackers'>

const pointsOf = (build: Pick<Build, 'trackers'>): Tracker | undefined =>
  build.trackers.find((tracker) => tracker.key === sorceryPointsKey)
/** Sorcery Points left, or null without the tracker. */
export function pointsLeft(build: Pick<Build, 'trackers'>, vitals: Play): number | null {
  const points = pointsOf(build)
  if (!points) return null
  return points.max - Math.min(points.max, vitals.tracker_uses[points.id] ?? 0)
}
/** Slots left of one level, the table's and the created ones. */
export function slotsLeft(build: Pick<Build, 'casterKind'>, level: number, vitals: Play) {
  return slotsFor(build.casterKind, level).map(
    (max, index) =>
      Math.max(0, max - Math.min(max, vitals.slots_used[index] ?? 0)) +
      createdSlots(vitals.tracker_uses)[index]!,
  )
}

/** One slot of `slotLevel` spent: a created slot first, then one of the table. */
export function spendSlot<T extends Play>(
  build: Pick<Build, 'casterKind'>,
  level: number,
  vitals: T,
  slotLevel: number,
): T | null {
  const index = slotLevel - 1
  const created = createdSlots(vitals.tracker_uses)[index] ?? 0
  if (created > 0) {
    const key = createdSlotKey(slotLevel)
    const tracker_uses = { ...vitals.tracker_uses }
    if (created === 1) delete tracker_uses[key]
    else tracker_uses[key] = created - 1
    return { ...vitals, tracker_uses }
  }
  const max = slotsFor(build.casterKind, level)[index] ?? 0
  const used = vitals.slots_used[index] ?? 0
  if (used >= max) return null
  const slots_used = [...vitals.slots_used]
  slots_used[index] = used + 1
  return { ...vitals, slots_used }
}

/** Font of Magic: a slot of `slotLevel` for its point cost, refilling a spent one before adding
 * a created slot. Null when the level, the Sorcerer level or the points do not allow it. */
export function createSlot<T extends Play>(
  build: Caster,
  level: number,
  vitals: T,
  slotLevel: number,
): T | null {
  const row = createSlotTable.find((entry) => entry.level === slotLevel)
  const points = pointsOf(build)
  if (!row || !points || level < row.from) return null
  const spent = Math.min(points.max, vitals.tracker_uses[points.id] ?? 0)
  if (points.max - spent < row.cost) return null
  const index = slotLevel - 1
  const tracker_uses = { ...vitals.tracker_uses, [points.id]: spent + row.cost }
  const used = vitals.slots_used[index] ?? 0
  if (used > 0) {
    const slots_used = [...vitals.slots_used]
    slots_used[index] = used - 1
    return { ...vitals, slots_used, tracker_uses }
  }
  const key = createdSlotKey(slotLevel)
  return { ...vitals, tracker_uses: { ...tracker_uses, [key]: (tracker_uses[key] ?? 0) + 1 } }
}

/** Font of Magic: an unexpended slot turned into points equal to its level. Refused when no slot
 * of that level is left or the points would pass their maximum. */
export function convertSlot<T extends Play>(
  build: Caster,
  level: number,
  vitals: T,
  slotLevel: number,
): T | null {
  const points = pointsOf(build)
  if (!points) return null
  const spent = Math.min(points.max, vitals.tracker_uses[points.id] ?? 0)
  if (spent < slotLevel) return null
  const after = spendSlot(build, level, vitals, slotLevel)
  if (!after) return null
  return { ...after, tracker_uses: { ...after.tracker_uses, [points.id]: spent - slotLevel } }
}
