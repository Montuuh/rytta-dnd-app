import { slotsFor } from './rules'
import {
  concentrationMaxLength,
  markerFor,
  stripForbiddenMarkerCharacters,
  trimMarkerSpaces,
  type Build,
  type Spell,
  type Vitals,
} from './sheet'

/** RYT-134. Casting counts a slot and marks concentration; it applies no spell effect, damage,
 * saving throw or upcasting maths. */

export type SlotChoice = {
  level: number
  left: number
  max: number
  /** A Warlock's pact slots: every slot is of one level and a short rest restores them. */
  pact: boolean
}

/** The slot levels a spell of `spellLevel` can be cast with: its own or any higher level that
 * still has a slot left. Pact casters have one slot level, so they get at most that one. */
export function slotChoices(
  build: Pick<Build, 'casterKind'>,
  level: number,
  vitals: Pick<Vitals, 'slots_used'>,
  spellLevel: number,
): SlotChoice[] {
  if (spellLevel < 1) return []
  return slotsFor(build.casterKind, level).flatMap((max, index) => {
    const slotLevel = index + 1
    const left = Math.max(0, max - (vitals.slots_used[index] ?? 0))
    return slotLevel >= spellLevel && left > 0
      ? [{ level: slotLevel, left, max, pact: build.casterKind === 'pact' }]
      : []
  })
}

/** What the "Lanzar" action of one spell can do right now. `blocked` has no way to cast it. */
export type CastAvailability = 'cantrip' | 'slot' | 'ritual-only' | 'blocked'
export function castAvailability(
  spell: Pick<Spell, 'level' | 'ritual'>,
  build: Pick<Build, 'casterKind'>,
  level: number,
  vitals: Pick<Vitals, 'slots_used'>,
): CastAvailability {
  if (spell.level === 0) return 'cantrip'
  if (slotChoices(build, level, vitals, spell.level).length > 0) return 'slot'
  return spell.ritual ? 'ritual-only' : 'blocked'
}

export type CastMode = { kind: 'cantrip' } | { kind: 'slot'; level: number } | { kind: 'ritual' }

/** The marker text for a spell name: what the server accepts (see `markerFor`), made so by
 * dropping forbidden characters and cutting at 100 characters. Empty when nothing is left. */
export function concentrationName(raw: string): string {
  const cleaned = trimMarkerSpaces(stripForbiddenMarkerCharacters(raw))
  return trimMarkerSpaces(Array.from(cleaned).slice(0, concentrationMaxLength).join(''))
}

export type CastPlan = {
  /** The play state after the cast. */
  vitals: Vitals
  /** Set when this cast changes the marker; always the spell's own name. */
  concentration: { value: string } | null
  /** The slot level spent, if any. */
  spent: number | null
}

/**
 * The play state after casting `spell`, or null when the cast is not possible (no slot of that
 * level, a level below the spell's, a ritual cast of a spell that is not a ritual). Exactly one
 * slot is spent for a slot cast; cantrips and rituals spend none. A concentration spell sets the
 * marker to `markerName` in the same write.
 */
export function planCast(
  spell: Pick<Spell, 'level' | 'ritual' | 'concentration'>,
  mode: CastMode,
  build: Pick<Build, 'casterKind'>,
  level: number,
  vitals: Vitals,
  markerName: string,
): CastPlan | null {
  let next = vitals
  let spent: number | null = null
  if (mode.kind === 'cantrip') {
    if (spell.level !== 0) return null
  } else if (mode.kind === 'ritual') {
    if (!spell.ritual || spell.level === 0) return null
  } else {
    if (!slotChoices(build, level, vitals, spell.level).some((slot) => slot.level === mode.level))
      return null
    const slots_used = [...vitals.slots_used]
    slots_used[mode.level - 1] = (slots_used[mode.level - 1] ?? 0) + 1
    next = { ...vitals, slots_used }
    spent = mode.level
  }
  if (!spell.concentration) return { vitals: next, concentration: null, spent }
  const marker = markerFor(concentrationName(markerName))
  if (marker === null) return null
  return { vitals: { ...next, concentration: marker }, concentration: { value: marker }, spent }
}
