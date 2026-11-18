import type { Build, Feature, Spell } from './sheet'
import {
  syncChanges,
  syncProgressionReport,
  type LibraryFeature,
  type ProgressionNames,
  type SyncChanges,
} from './progression'
import { finalAbilities, isClassKey, modifier, proficiencyBonus, slotsFor } from './rules'
import { abilityKeys, subclassOf, type Ability, type ClassKey, type HitDie } from './srd'

// Level-up rules of the SRD 5.2 classes (D&D 2024). Only numbers and levels are encoded. A
// class outside the SRD (a homebrew class) gets the hit points and the SRD-independent maths
// only: its features, subclass, increases and spells stay on the sheet, by hand.

/** The level at which every SRD class chooses a subclass. */
export const subclassLevel = 3
/** Levels with an Ability Score Improvement (or a feat); 19 is the Epic Boon level. */
const defaultImprovementLevels = [4, 8, 12, 16, 19]
const improvementLevels: Partial<Record<ClassKey, readonly number[]>> = {
  fighter: [4, 6, 8, 12, 14, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
}
/** An ability score never goes above this by an improvement. */
export const abilityCap = 20
/** Spells a class prepares or knows at each level (index 0 = level 1), from its class table. */
const spellsAtLevel: Partial<Record<ClassKey, readonly number[]>> = {
  bard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  cleric: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  druid: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  wizard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  paladin: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  ranger: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
}

/** Levels at which a spellcasting class learns one more cantrip (SRD 5.2 class tables). */
export const cantripLevels = [4, 10]
const cantripClasses: readonly ClassKey[] = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard']
/** Spells a Wizard copies into the spellbook with every level after the first. */
export const spellbookPerLevel = 2

/** The server rule: a Player gains 1 to 64 hit points a level. */
export const maxHpGain = 64

// ---------------------------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------------------------

/** The fixed value of a hit die: half the die, plus one. */
export const hitDieAverage = (die: HitDie) => die / 2 + 1

export type HitPointChoice = { kind: 'average' } | { kind: 'roll'; roll: number | null }

/** Whether a typed roll is a whole number on the die. */
export const validRoll = (die: HitDie, roll: number | null): roll is number =>
  roll !== null && Number.isInteger(roll) && roll >= 1 && roll <= die

/**
 * Hit points a level adds: the average or the typed roll plus the Constitution modifier, never
 * less than 1. Null while a typed roll is missing or off the die.
 */
export function hitPointGain(die: HitDie, conModifier: number, choice: HitPointChoice) {
  const base =
    choice.kind === 'average'
      ? hitDieAverage(die)
      : validRoll(die, choice.roll)
        ? choice.roll
        : null
  return base === null ? null : Math.max(1, base + conModifier)
}

/**
 * Raising Constitution so its modifier rises adds one hit point for every level the character
 * has, the new one included.
 */
export function retroactiveHitPoints(before: Build, after: Build, toLevel: number) {
  const gain = modifier(finalAbilities(after).con) - modifier(finalAbilities(before).con)
  return Math.max(0, gain) * toLevel
}

// ---------------------------------------------------------------------------------------------
// Required choices
// ---------------------------------------------------------------------------------------------

export type LevelUpRequirements = {
  /** A subclass is still to choose. */
  subclass: boolean
  /** An ability increase or a feat. */
  improvement: boolean
  /** New spells to pick (prepared or known). */
  spells: number
  /** New cantrips to pick (levels 4 and 10 of the casting classes). */
  cantrips: number
  /** Spells to copy into a Wizard's spellbook: the sheet keeps them as spells not prepared. */
  spellbook: number
  /** Highest spell level of the new level, to filter the picker. */
  maxSpellLevel: number
}

export function levelUpRequirements(build: Build, toLevel: number): LevelUpRequirements {
  const slots = slotsFor(build.casterKind, toLevel)
  const maxSpellLevel = slots.reduce((top, count, index) => (count > 0 ? index + 1 : top), 0)
  if (!isClassKey(build.classKey))
    return { subclass: false, improvement: false, spells: 0, cantrips: 0, spellbook: 0, maxSpellLevel }
  const table = spellsAtLevel[build.classKey]
  const spells =
    table && build.casterKind !== 'none' && toLevel >= 2
      ? Math.max(0, (table[toLevel - 1] ?? 0) - (table[toLevel - 2] ?? 0))
      : 0
  return {
    subclass: toLevel >= subclassLevel && !build.subclassKey && !build.subclass.trim(),
    improvement: (improvementLevels[build.classKey] ?? defaultImprovementLevels).includes(toLevel),
    spells,
    cantrips:
      cantripClasses.includes(build.classKey) &&
      build.casterKind !== 'none' &&
      cantripLevels.includes(toLevel)
        ? 1
        : 0,
    spellbook: build.classKey === 'wizard' && toLevel >= 2 ? spellbookPerLevel : 0,
    maxSpellLevel,
  }
}

export const hasChoices = (requirements: LevelUpRequirements) =>
  requirements.subclass ||
  requirements.improvement ||
  requirements.spells > 0 ||
  requirements.cantrips > 0 ||
  requirements.spellbook > 0

/** A spell picked in the level-up: from the glossary (with a ref) or typed by hand. */
export type SpellPick = {
  id: string
  ref?: string
  name: string
  level: number
  concentration: boolean
  ritual: boolean
}
export type Improvement =
  { kind: 'abilities'; split: boolean; picks: Ability[] } | { kind: 'feat'; name: string }
export type LevelUpChoices = {
  /** `key` is the SRD subclass of the class, or empty with a typed `name`. */
  subclass: { key: string; name: string } | null
  improvement: Improvement | null
  spells: SpellPick[]
  cantrips: SpellPick[]
  spellbook: SpellPick[]
}
export const noChoices: LevelUpChoices = {
  subclass: null,
  improvement: null,
  spells: [],
  cantrips: [],
  spellbook: [],
}
export type ChoiceKind = 'subclass' | 'improvement' | 'spells' | 'cantrips' | 'spellbook'

/** The SRD subclass of a class, when the class is an SRD one. */
export const srdSubclassOf = (build: Pick<Build, 'classKey'>) =>
  isClassKey(build.classKey) ? subclassOf[build.classKey] : null

export const improvementAmount = (improvement: Extract<Improvement, { kind: 'abilities' }>) =>
  improvement.split ? 1 : 2
/** Whether an ability can still take the increase (the final score stays within 20). */
export function canRaise(build: Build, ability: Ability, amount: 1 | 2) {
  return finalAbilities(build)[ability] + amount <= abilityCap
}

function improvementValid(build: Build, improvement: Improvement | null) {
  if (!improvement) return false
  if (improvement.kind === 'feat') return improvement.name.trim().length > 0
  const amount = improvement.split ? 1 : 2
  const picks = new Set(improvement.picks)
  return (
    picks.size === improvement.picks.length &&
    picks.size === (improvement.split ? 2 : 1) &&
    improvement.picks.every((ability) => canRaise(build, ability, amount))
  )
}

/** The required choices still missing; the confirm waits until the list is empty. */
export function missingChoices(
  build: Build,
  requirements: LevelUpRequirements,
  choices: LevelUpChoices,
): ChoiceKind[] {
  const missing: ChoiceKind[] = []
  if (requirements.subclass && !(choices.subclass?.key || choices.subclass?.name.trim()))
    missing.push('subclass')
  if (requirements.improvement && !improvementValid(build, choices.improvement))
    missing.push('improvement')
  if (requirements.spells > 0 && choices.spells.length !== requirements.spells)
    missing.push('spells')
  if (requirements.cantrips > 0 && choices.cantrips.length !== requirements.cantrips)
    missing.push('cantrips')
  if (requirements.spellbook > 0 && choices.spellbook.length !== requirements.spellbook)
    missing.push('spellbook')
  return missing
}

/** The build with the choices written in; class features and resources come from `levelUp`. */
export function applyChoices(
  build: Build,
  toLevel: number,
  requirements: LevelUpRequirements,
  choices: LevelUpChoices,
): Build {
  let next = build
  if (requirements.subclass && choices.subclass) {
    const { key, name } = choices.subclass
    next = { ...next, subclassKey: key, subclass: name.trim().slice(0, 60) }
  }
  const improvement = requirements.improvement ? choices.improvement : null
  if (improvement?.kind === 'abilities') {
    const amount = improvementAmount(improvement)
    next = {
      ...next,
      baseAbilities: Object.fromEntries(
        abilityKeys.map((key) => [
          key,
          next.baseAbilities[key] + (improvement.picks.includes(key) ? amount : 0),
        ]),
      ) as Build['baseAbilities'],
    }
  } else if (improvement?.kind === 'feat') {
    const feat: Feature = {
      id: `levelup-feat-${toLevel}`,
      name: improvement.name.trim().slice(0, 100),
      source: 'feat',
      description: '',
      level: toLevel,
    }
    next = { ...next, features: [...next.features.filter((item) => item.id !== feat.id), feat] }
  }
  const groups: [number, SpellPick[], boolean][] = [
    [requirements.spells, choices.spells, true],
    [requirements.cantrips, choices.cantrips, true],
    [requirements.spellbook, choices.spellbook, false],
  ]
  for (const [need, picks, prepared] of groups) {
    if (need <= 0) continue
    const have = new Set(next.spells.map((spell) => spell.id))
    const added: Spell[] = picks
      .filter((pick) => !have.has(pick.id))
      .map((pick) => ({
        id: pick.id,
        name: pick.name.trim().slice(0, 100),
        level: pick.level,
        concentration: pick.concentration,
        ritual: pick.ritual,
        prepared,
        notes: '',
        ...(pick.ref ? { ref: pick.ref } : {}),
      }))
    next = { ...next, spells: [...next.spells, ...added].slice(0, 100) }
  }
  return next
}

// ---------------------------------------------------------------------------------------------
// The whole level-up
// ---------------------------------------------------------------------------------------------

export type SlotChange = { level: number; from: number; to: number }
export type LevelUpGrants = {
  features: Feature[]
  resources: SyncChanges
  proficiency: { from: number; to: number } | null
  slots: SlotChange[]
  /** Granted resources left out because the sheet holds the most it can. */
  leftOut: number
}

/** What a level-up added, comparing the build before and after it. */
export function grantsBetween(
  before: Build,
  after: Build,
  fromLevel: number,
  toLevel: number,
  leftOut = 0,
): LevelUpGrants {
  const had = new Set(before.features.map((feature) => feature.id))
  const was = slotsFor(before.casterKind, fromLevel)
  const now = slotsFor(after.casterKind, toLevel)
  return {
    features: after.features.filter((feature) => !had.has(feature.id)),
    resources: syncChanges(before, after),
    proficiency:
      proficiencyBonus(toLevel) !== proficiencyBonus(fromLevel)
        ? { from: proficiencyBonus(fromLevel), to: proficiencyBonus(toLevel) }
        : null,
    slots: now.flatMap((to, index) =>
      to !== was[index]! ? [{ level: index + 1, from: was[index]!, to }] : [],
    ),
    leftOut,
  }
}

/** What the new level gives a build, before any choice: class features, resources, slots. */
export function levelUpGrants(
  build: Build,
  fromLevel: number,
  toLevel: number,
  library: LibraryFeature[],
  names: ProgressionNames,
): LevelUpGrants {
  const { build: after, leftOut } = syncProgressionReport(build, toLevel, library, names)
  return grantsBetween(build, after, fromLevel, toLevel, leftOut)
}

export type LevelUpInputs = {
  build: Build
  level: number
  maxHp: number
  hitPoints: HitPointChoice
  choices: LevelUpChoices
}
export type LevelUpPlan = {
  level: number
  maxHp: number
  build: Build
  gain: number
  /** Hit points added by a higher Constitution modifier (counted in `maxHp`). */
  retroactive: number
  requirements: LevelUpRequirements
  missing: ChoiceKind[]
}

/**
 * The level-up the sheet would send: one level, the new maximum hit points and the whole new
 * build with the choices and the class features and resources of the new level. Null while the
 * hit points are not settled. The caller sends it only when `missing` is empty.
 */
export function planLevelUp(
  input: LevelUpInputs,
  library: LibraryFeature[],
  names: ProgressionNames,
): LevelUpPlan | null {
  const toLevel = input.level + 1
  const requirements = levelUpRequirements(input.build, toLevel)
  const gain = hitPointGain(
    input.build.hitDie,
    modifier(finalAbilities(input.build).con),
    input.hitPoints,
  )
  if (gain === null) return null
  const chosen = applyChoices(input.build, toLevel, requirements, input.choices)
  const { build } = syncProgressionReport(chosen, toLevel, library, names)
  const retroactive = retroactiveHitPoints(input.build, build, toLevel)
  return {
    level: toLevel,
    maxHp: Math.min(9999, input.maxHp + gain + retroactive),
    build,
    gain,
    retroactive,
    requirements,
    missing: missingChoices(input.build, requirements, input.choices),
  }
}

export type LevelUpSummary = {
  fromLevel: number
  toLevel: number
  hp: { from: number; to: number }
  grants: LevelUpGrants
  abilities: { ability: Ability; from: number; to: number }[]
  subclass: string | null
  feat: string | null
  spells: string[]
}

/** What changed, for the notice after the confirm (computed from the saved before and after). */
export function summarizeLevelUp(
  before: { level: number; maxHp: number; build: Build },
  after: { level: number; maxHp: number; build: Build },
): LevelUpSummary {
  const was = finalAbilities(before.build)
  const now = finalAbilities(after.build)
  const hadSpell = new Set(before.build.spells.map((spell) => spell.id))
  const hadFeature = new Set(before.build.features.map((feature) => feature.id))
  return {
    fromLevel: before.level,
    toLevel: after.level,
    hp: { from: before.maxHp, to: after.maxHp },
    grants: grantsBetween(before.build, after.build, before.level, after.level),
    abilities: abilityKeys.flatMap((ability) =>
      was[ability] !== now[ability] ? [{ ability, from: was[ability], to: now[ability] }] : [],
    ),
    subclass:
      after.build.subclass.trim() && after.build.subclass !== before.build.subclass
        ? after.build.subclass
        : null,
    feat:
      after.build.features.find((item) => item.source === 'feat' && !hadFeature.has(item.id))
        ?.name ?? null,
    spells: after.build.spells
      .filter((spell) => !hadSpell.has(spell.id))
      .map((spell) => spell.name),
  }
}
