import { describe, expect, it } from 'vitest'
import { castAvailability, concentrationName, planCast, slotChoices } from './casting'
import { hasForbiddenMarkerCharacters, markerFor, type Vitals } from './sheet'

const vitals = (over: Partial<Vitals> = {}): Vitals => ({
  current_hp: 10,
  temp_hp: 0,
  hit_dice_spent: 0,
  death_successes: 0,
  death_failures: 0,
  heroic_inspiration: false,
  conditions: [],
  slots_used: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  tracker_uses: {},
  concentration: null,
  revision: 3,
  ...over,
})
const spell = { level: 1, ritual: false, concentration: false }
const full = { casterKind: 'full' as const }

describe('slotChoices', () => {
  it('offers the spell level and above that still have a slot (full caster, level 5)', () => {
    // Level 5 full caster: 4 / 3 / 2 slots of levels 1 / 2 / 3.
    const used = vitals({ slots_used: [4, 1, 0, 0, 0, 0, 0, 0, 0] })
    expect(slotChoices(full, 5, used, 1)).toEqual([
      { level: 2, left: 2, max: 3, pact: false },
      { level: 3, left: 2, max: 2, pact: false },
    ])
    expect(slotChoices(full, 5, used, 3).map((slot) => slot.level)).toEqual([3])
  })
  it('never offers a level below the spell, a spent level or a level the character lacks', () => {
    const spent = vitals({ slots_used: [4, 3, 2, 0, 0, 0, 0, 0, 0] })
    expect(slotChoices(full, 5, spent, 1)).toEqual([])
    expect(slotChoices(full, 5, vitals(), 4)).toEqual([])
  })
  it('follows half casters, who use the full table at half their level, rounded up', () => {
    expect(slotChoices({ casterKind: 'half' }, 1, vitals(), 1)).toEqual([
      { level: 1, left: 2, max: 2, pact: false },
    ])
    expect(slotChoices({ casterKind: 'half' }, 9, vitals(), 3).map((slot) => slot.level)).toEqual([
      3,
    ])
  })
  it('gives a pact caster the one slot level, which also casts lower spells', () => {
    // Level 5 pact: two slots of level 3.
    const pact = { casterKind: 'pact' as const }
    expect(slotChoices(pact, 5, vitals(), 1)).toEqual([{ level: 3, left: 2, max: 2, pact: true }])
    const spent = vitals({ slots_used: [0, 0, 2, 0, 0, 0, 0, 0, 0] })
    expect(slotChoices(pact, 5, spent, 1)).toEqual([])
    expect(slotChoices(pact, 5, vitals(), 4)).toEqual([])
  })
  it('has no slot for a non caster or for a cantrip', () => {
    expect(slotChoices({ casterKind: 'none' }, 9, vitals(), 1)).toEqual([])
    expect(slotChoices(full, 9, vitals(), 0)).toEqual([])
  })
})

describe('castAvailability', () => {
  const noSlots = vitals({ slots_used: [2, 0, 0, 0, 0, 0, 0, 0, 0] })
  it('casts cantrips always and levelled spells while a slot is left', () => {
    expect(castAvailability({ level: 0, ritual: false }, full, 1, noSlots)).toBe('cantrip')
    expect(castAvailability({ level: 1, ritual: false }, full, 1, vitals())).toBe('slot')
  })
  it('is blocked without a slot, except a ritual, which still casts without one', () => {
    expect(castAvailability({ level: 1, ritual: false }, full, 1, noSlots)).toBe('blocked')
    expect(castAvailability({ level: 1, ritual: true }, full, 1, noSlots)).toBe('ritual-only')
    expect(castAvailability({ level: 1, ritual: false }, { casterKind: 'none' }, 1, vitals())).toBe(
      'blocked',
    )
  })
})

describe('planCast', () => {
  it('spends exactly one slot of the chosen level and nothing else', () => {
    const before = vitals()
    const plan = planCast(spell, { kind: 'slot', level: 2 }, full, 5, before, 'Cure Wounds')!
    expect(plan.vitals.slots_used).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0])
    expect(plan.spent).toBe(2)
    expect(plan.concentration).toBeNull()
    expect(plan.vitals).toEqual({ ...before, slots_used: [0, 1, 0, 0, 0, 0, 0, 0, 0] })
    expect(before.slots_used).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
  it('refuses a level below the spell, a spent level and a level without slots', () => {
    const spent = vitals({ slots_used: [0, 3, 0, 0, 0, 0, 0, 0, 0] })
    const two = { ...spell, level: 2 }
    expect(planCast(two, { kind: 'slot', level: 1 }, full, 5, vitals(), 'X')).toBeNull()
    expect(planCast(spell, { kind: 'slot', level: 2 }, full, 5, spent, 'X')).toBeNull()
    expect(planCast(spell, { kind: 'slot', level: 4 }, full, 5, vitals(), 'X')).toBeNull()
  })
  it('casts a cantrip without spending a slot', () => {
    const cantrip = { ...spell, level: 0 }
    const plan = planCast(cantrip, { kind: 'cantrip' }, full, 1, vitals(), 'Light')!
    expect(plan.vitals).toEqual(vitals())
    expect(plan.spent).toBeNull()
    expect(planCast(spell, { kind: 'cantrip' }, full, 1, vitals(), 'Light')).toBeNull()
  })
  it('casts a ritual spell as a ritual without a slot, and refuses other spells', () => {
    const empty = vitals({ slots_used: [2, 0, 0, 0, 0, 0, 0, 0, 0] })
    const ritual = { ...spell, ritual: true }
    const plan = planCast(ritual, { kind: 'ritual' }, full, 1, empty, 'Detect Magic')!
    expect(plan.vitals.slots_used).toEqual(empty.slots_used)
    expect(plan.spent).toBeNull()
    expect(planCast(spell, { kind: 'ritual' }, full, 1, empty, 'Bless')).toBeNull()
  })
  it('sets the marker with the slot, replaces an earlier one and keeps it for other spells', () => {
    const concentrating = { ...spell, concentration: true }
    const first = planCast(concentrating, { kind: 'slot', level: 1 }, full, 1, vitals(), ' Bless ')!
    expect(first.concentration).toEqual({ value: 'Bless' })
    expect(first.vitals.concentration).toBe('Bless')
    expect(first.vitals.slots_used[0]).toBe(1)
    const held = vitals({ concentration: 'Bless' })
    const second = planCast(concentrating, { kind: 'slot', level: 1 }, full, 3, held, 'Bane')!
    expect(second.vitals.concentration).toBe('Bane')
    const plain = planCast(spell, { kind: 'slot', level: 1 }, full, 3, held, 'Shield')!
    expect(plain.concentration).toBeNull()
    expect(plain.vitals.concentration).toBe('Bless')
  })
  it('marks a concentration cantrip and a concentration ritual without spending a slot', () => {
    const cantrip = { level: 0, ritual: false, concentration: true }
    const guidance = planCast(cantrip, { kind: 'cantrip' }, full, 1, vitals(), 'Guidance')!
    expect(guidance.vitals.concentration).toBe('Guidance')
    expect(guidance.spent).toBeNull()
    const spellRitual = { level: 1, ritual: true, concentration: true }
    const ritual = planCast(spellRitual, { kind: 'ritual' }, full, 1, vitals(), 'Detect Magic')!
    expect(ritual.vitals.slots_used).toEqual(vitals().slots_used)
    expect(ritual.concentration).toEqual({ value: 'Detect Magic' })
  })
  it('refuses a concentration spell whose name leaves nothing to store', () => {
    const concentrating = { ...spell, concentration: true }
    const blank = '  \u0007 '
    expect(planCast(concentrating, { kind: 'slot', level: 1 }, full, 1, vitals(), blank)).toBeNull()
  })
})

describe('concentrationName', () => {
  it('trims, drops control characters and stops at 100 characters', () => {
    expect(concentrationName('  Hold\u0000 Person\n')).toBe('Hold Person')
    expect(concentrationName('a'.repeat(150))).toHaveLength(100)
    expect(concentrationName(`${'a'.repeat(99)} b`)).toBe('a'.repeat(99))
    expect(concentrationName('\u0001\u0002')).toBe('')
  })
})

describe('markerFor (what the server accepts as a concentration marker)', () => {
  it('trims the Unicode spaces the server trims, at both ends only', () => {
    expect(markerFor('\u00a0\u3000 Bless \u2003\u202f\u205f\u1680')).toBe('Bless')
    expect(markerFor('Hold\u00a0Person')).toBe('Hold\u00a0Person')
    expect(markerFor(' \u00a0\u2009 ')).toBeNull()
    expect(markerFor('')).toBeNull()
  })
  it('refuses controls, zero-width and bidi characters and the byte order mark anywhere', () => {
    const forbidden = [
      '\u0000',
      '\u001f',
      '\u007f',
      '\u0085',
      '\u009f',
      '\u200b',
      '\u200f',
      '\u202a',
      '\u202e',
      '\u2060',
      '\u2064',
      '\u2066',
      '\u2069',
      '\ufeff',
    ]
    for (const char of forbidden) {
      expect(markerFor(`Bl${char}ess`), JSON.stringify(char)).toBeNull()
      expect(hasForbiddenMarkerCharacters(`Bl${char}ess`)).toBe(true)
    }
    // Neighbours of the ranges stay valid: U+00A0 is a space, U+2065 and U+2070 are not controls.
    expect(markerFor('Bl\u2065ess')).toBe('Bl\u2065ess')
    expect(markerFor('Bl\u2070ess')).toBe('Bl\u2070ess')
    expect(markerFor('Bl\u00a1ess')).toBe('Bl\u00a1ess')
  })
  it('counts characters, not UTF-16 units, up to 100', () => {
    expect(markerFor('a'.repeat(100))).toBe('a'.repeat(100))
    expect(markerFor('a'.repeat(101))).toBeNull()
    expect(markerFor('\u{1f52e}'.repeat(100))).not.toBeNull()
    expect(markerFor('\u{1f52e}'.repeat(101))).toBeNull()
  })
  it('turns any spell name into a marker the server accepts', () => {
    const names = ['Bless\u200b', '\ufeff Hold Person', 'a'.repeat(300), 'Ray\u202e of Frost']
    for (const name of names) expect(markerFor(concentrationName(name)), name).not.toBeNull()
    expect(concentrationName('Ray\u202e of Frost')).toBe('Ray of Frost')
    expect(concentrationName('\u200b\u00a0')).toBe('')
  })
})
