import type { Abilities, Build, Vitals } from './sheet'
import {
  abilityKeys,
  backgrounds,
  classes,
  fullCasterSlots,
  pointBuyBudget,
  pointBuyCost,
  skillAbilities,
  species,
  type Ability,
  type BackgroundKey,
  type CasterKind,
  type ClassKey,
  type HitDie,
  type Skill,
  type SpeciesKey,
} from './srd'

export const modifier = (score: number) => Math.floor((score - 10) / 2)
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
export const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`)

export function finalAbilities(build: Pick<Build, 'baseAbilities' | 'bonuses'>): Abilities {
  return Object.fromEntries(
    abilityKeys.map((key) => [key, Math.min(30, build.baseAbilities[key] + build.bonuses[key])]),
  ) as Abilities
}
export const saveBonus = (build: Build, level: number, ability: Ability) =>
  modifier(finalAbilities(build)[ability]) +
  (build.saves.includes(ability) ? proficiencyBonus(level) : 0)
export function skillBonus(build: Build, level: number, skill: Skill) {
  const proficiency = build.skills[skill]
  const multiplier = proficiency === 'expertise' ? 2 : proficiency === 'proficient' ? 1 : 0
  return (
    modifier(finalAbilities(build)[skillAbilities[skill]]) + multiplier * proficiencyBonus(level)
  )
}
export const passivePerception = (build: Build, level: number) =>
  10 + skillBonus(build, level, 'perception')
export const initiative = (build: Build) => modifier(finalAbilities(build).dex)
export const defaultArmorClass = (build: Build) => 10 + modifier(finalAbilities(build).dex)
export function spellcasting(build: Build, level: number) {
  if (build.casterKind === 'none' || !build.spellAbility) return null
  const mod = modifier(finalAbilities(build)[build.spellAbility])
  const prof = proficiencyBonus(level)
  return { ability: build.spellAbility, saveDc: 8 + prof + mod, attack: prof + mod }
}

/** Spell slots per spell level (index 0 = 1st level), always nine entries. */
export function slotsFor(kind: CasterKind, level: number): number[] {
  const slots = Array<number>(9).fill(0)
  const clamped = Math.min(20, Math.max(1, level))
  if (kind === 'full' || kind === 'half') {
    // 2024 half casters follow the full table at half their level, rounded up.
    const row = fullCasterSlots[(kind === 'full' ? clamped : Math.ceil(clamped / 2)) - 1]!
    row.forEach((count, index) => (slots[index] = count))
  } else if (kind === 'pact') {
    const count = clamped >= 17 ? 4 : clamped >= 11 ? 3 : clamped >= 2 ? 2 : 1
    const slotLevel = Math.min(5, Math.ceil(clamped / 2))
    slots[slotLevel - 1] = count
  }
  return slots
}

/** Level 1 takes the full die; later levels take the fixed average. Each level grants at least 1. */
export function suggestedMaxHp(hitDie: HitDie, level: number, conScore: number) {
  const con = modifier(conScore)
  const later = Math.max(1, hitDie / 2 + 1 + con) * (Math.max(1, level) - 1)
  return Math.min(9999, Math.max(1, hitDie + con) + later)
}

export function pointBuySpent(scores: Abilities) {
  let total = 0
  for (const key of abilityKeys) {
    const cost = pointBuyCost[scores[key]]
    if (cost === undefined) return null
    total += cost
  }
  return total
}
export const pointBuyValid = (scores: Abilities) => {
  const spent = pointBuySpent(scores)
  return spent !== null && spent <= pointBuyBudget
}
export function standardArrayValid(scores: Abilities) {
  const sorted = abilityKeys.map((key) => scores[key]).sort((a, b) => b - a)
  return sorted.join() === '15,14,13,12,10,8'
}
/** 2024 backgrounds: +2/+1 or +1/+1/+1 among the background's three abilities. */
export function bonusesValid(build: Pick<Build, 'backgroundKey' | 'bonuses'>) {
  const values = abilityKeys.map((key) => build.bonuses[key])
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total === 0) return true
  if (total !== 3) return false
  const allowed =
    build.backgroundKey in backgrounds
      ? (backgrounds[build.backgroundKey as BackgroundKey].abilities as readonly Ability[])
      : abilityKeys
  return abilityKeys.every((key) => build.bonuses[key] === 0 || allowed.includes(key))
}

export const isClassKey = (key: string): key is ClassKey => key in classes
export const isSpeciesKey = (key: string): key is SpeciesKey => key in species
export const isBackgroundKey = (key: string): key is BackgroundKey => key in backgrounds

export function emptyBuild(): Build {
  const base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  return {
    classKey: '',
    classLabel: '',
    subclass: '',
    speciesKey: '',
    speciesLabel: '',
    backgroundKey: '',
    backgroundLabel: '',
    alignment: '',
    abilityMethod: 'standard',
    baseAbilities: base,
    bonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    saves: [],
    skills: {},
    hitDie: 8,
    speed: 30,
    acOverride: null,
    casterKind: 'none',
    spellAbility: null,
    languages: '',
    proficiencies: '',
    appearance: '',
    notes: '',
    features: [],
    trackers: [],
    spells: [],
  }
}

export const hpLabel = (vitals: Pick<Vitals, 'current_hp' | 'temp_hp'>, max: number) =>
  `${vitals.current_hp}/${max}${vitals.temp_hp > 0 ? ` (+${vitals.temp_hp})` : ''}`

/** Damage consumes temporary hit points first; healing never exceeds the maximum. */
export function applyHp(vitals: Vitals, maxHp: number, kind: 'damage' | 'heal', amount: number) {
  const value = Math.max(0, Math.trunc(amount))
  if (kind === 'heal')
    return {
      ...vitals,
      current_hp: Math.min(maxHp, vitals.current_hp + value),
      death_successes: 0,
      death_failures: 0,
    }
  const absorbed = Math.min(vitals.temp_hp, value)
  return {
    ...vitals,
    temp_hp: vitals.temp_hp - absorbed,
    current_hp: Math.max(0, vitals.current_hp - (value - absorbed)),
  }
}

/** 2024 rests: a long rest restores HP, all hit dice, slots and uses; a short rest restores
 * short-rest uses and pact slots. Exhaustion stays a DM-controlled resource. */
export function applyRest(vitals: Vitals, build: Build, maxHp: number, kind: 'short' | 'long') {
  const tracker_uses = Object.fromEntries(
    Object.entries(vitals.tracker_uses).filter(([trackerId]) => {
      const tracker = build.trackers.find((item) => item.id === trackerId)
      if (!tracker) return false
      return !(tracker.reset === 'short' || (kind === 'long' && tracker.reset === 'long'))
    }),
  )
  if (kind === 'short')
    return {
      ...vitals,
      tracker_uses,
      slots_used: build.casterKind === 'pact' ? Array<number>(9).fill(0) : vitals.slots_used,
    }
  return {
    ...vitals,
    current_hp: maxHp,
    temp_hp: 0,
    hit_dice_spent: 0,
    death_successes: 0,
    death_failures: 0,
    slots_used: Array<number>(9).fill(0),
    tracker_uses,
  }
}
