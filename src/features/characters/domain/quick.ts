import type { ClassDef, SubclassDef } from './class-catalog'
import { chooseBackground, chooseClass, chooseSpecies, type OriginFeat } from './creation'
import type { BackgroundDef, SpeciesDef } from './origin-catalog'
import { syncProgression, type LibraryFeature, type ProgressionNames } from './progression'
import {
  defaultArmorClass,
  emptyBuild,
  finalAbilities,
  isClassKey,
  modifier,
  suggestedMaxHp,
} from './rules'
import type { Build, SheetDraft } from './sheet'
import {
  abilityKeys,
  standardArray,
  type Ability,
  type BackgroundKey,
  type ClassKey,
  type Skill,
} from './srd'

/**
 * RYT-072 quick build (like D&D Beyond's Quickbuilder): class, species and name at level 1.
 * Rytta places the standard array by the class's usual priorities, picks a fitting SRD
 * background (+2/+1 to its best abilities), the class's usual skills, unarmored AC where the
 * class has it, average-free level 1 HP, and the class resources and features. Everything stays
 * editable on the sheet afterwards.
 */
export const quickAbilityOrder: Record<ClassKey, readonly Ability[]> = {
  barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  cleric: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
  druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  monk: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
  sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
}
export const quickBackground: Record<ClassKey, BackgroundKey> = {
  barbarian: 'soldier',
  bard: 'acolyte',
  cleric: 'acolyte',
  druid: 'sage',
  fighter: 'soldier',
  monk: 'criminal',
  paladin: 'soldier',
  ranger: 'soldier',
  rogue: 'criminal',
  sorcerer: 'acolyte',
  warlock: 'acolyte',
  wizard: 'sage',
}
const quickSkills: Record<ClassKey, readonly Skill[]> = {
  barbarian: ['perception', 'survival', 'athletics', 'intimidation'],
  bard: ['performance', 'persuasion', 'deception', 'insight'],
  cleric: ['medicine', 'persuasion', 'history', 'insight'],
  druid: ['nature', 'perception', 'survival', 'animalHandling'],
  fighter: ['perception', 'acrobatics', 'athletics', 'survival'],
  monk: ['acrobatics', 'insight', 'athletics', 'religion'],
  paladin: ['persuasion', 'insight', 'athletics', 'medicine'],
  ranger: ['perception', 'survival', 'nature', 'stealth', 'insight'],
  rogue: ['perception', 'acrobatics', 'investigation', 'deception', 'insight', 'persuasion'],
  sorcerer: ['arcana', 'persuasion', 'deception', 'insight'],
  warlock: ['arcana', 'deception', 'intimidation', 'investigation'],
  wizard: ['investigation', 'insight', 'medicine', 'religion'],
}

/** Unarmored Defense: barbarians add CON, monks add WIS; other classes start at 10 + DEX. */
export function unarmoredClass(build: Build) {
  const scores = finalAbilities(build)
  const dex = modifier(scores.dex)
  if (build.classKey === 'barbarian') return 10 + dex + modifier(scores.con)
  if (build.classKey === 'monk') return 10 + dex + modifier(scores.wis)
  return defaultArmorClass(build)
}

/** Sheet order, the standard array before a class is known. */
const sheetOrderArray = (): Build['baseAbilities'] => ({
  str: 15,
  dex: 14,
  con: 13,
  int: 12,
  wis: 10,
  cha: 8,
})
/** The standard array placed by the class's usual priorities (as the quick path does). */
export function standardAbilitiesFor(classKey: string): Build['baseAbilities'] {
  if (!isClassKey(classKey)) return sheetOrderArray()
  return Object.fromEntries(
    quickAbilityOrder[classKey].map((key, index) => [key, standardArray[index]!]),
  ) as Build['baseAbilities']
}
const sameScores = (a: Build['baseAbilities'], b: Build['baseAbilities']) =>
  abilityKeys.every((key) => a[key] === b[key])
/**
 * A new class re-places the standard array when the scores are still the previous seed, so a
 * Wizard does not keep INT 12 and a player's own arrangement is never overwritten.
 */
export function reseedStandard(prev: Build, next: Build): Build {
  if (next.abilityMethod !== 'standard' || prev.classKey === next.classKey) return next
  return sameScores(prev.baseAbilities, standardAbilitiesFor(prev.classKey))
    ? { ...next, baseAbilities: standardAbilitiesFor(next.classKey) }
    : next
}

export type QuickChoice = {
  classKey: ClassKey
  classLabel: string
  /** RYT-167: the SRD class's table, from the campaign's packs. */
  classDef: ClassDef
  /** RYT-171: the species and the class's SRD background, from the campaign's packs. */
  speciesDef: SpeciesDef
  speciesLabel: string
  backgroundDef: BackgroundDef
  backgroundLabel: string
  feat: OriginFeat | null
  language: string
  library: LibraryFeature[]
  names: ProgressionNames
}

export function quickDraft(choice: QuickChoice): SheetDraft {
  const order = quickAbilityOrder[choice.classKey]
  const base = Object.fromEntries(
    order.map((key, index) => [key, standardArray[index]!]),
  ) as Build['baseAbilities']
  let build: Build = {
    ...emptyBuild(),
    abilityMethod: 'standard',
    baseAbilities: base,
    origin: 'quick',
  }
  build = chooseClass(build, choice.classKey, choice.classLabel, choice.classDef)
  build = chooseSpecies(
    build,
    choice.speciesDef.key,
    choice.speciesLabel,
    choice.speciesDef,
    choice.language,
  )
  const background = choice.backgroundDef
  build = chooseBackground(build, background.key, choice.backgroundLabel, background, choice.feat)
  const allowed = background.abilities as readonly Ability[]
  const [first, second] = order.filter((key) => allowed.includes(key))
  build = {
    ...build,
    bonuses: { ...build.bonuses, [first!]: 2, [second!]: 1 },
  }
  const entry = choice.classDef
  const options = entry.skills === 'any' ? null : (entry.skills as readonly Skill[])
  const skills = { ...build.skills }
  const picks = quickSkills[choice.classKey].filter(
    (skill) => !skills[skill] && (!options || options.includes(skill)),
  )
  for (const skill of picks.slice(0, entry.skillCount)) skills[skill] = 'proficient'
  build = { ...build, skills }
  const ac = defaultArmorClass(build)
  build = { ...build, acOverride: null }
  build = syncProgression(build, 1, choice.library, choice.names)
  return {
    build,
    level: 1,
    maxHp: suggestedMaxHp(build.hitDie, 1, finalAbilities(build).con),
    armorClass: ac,
  }
}

export type BlankChoice = {
  classKey: string
  classLabel: string
  /** RYT-168: the chosen class's definition (null for a class typed by hand). */
  classDef?: ClassDef | null
  subclassKey?: string
  subclass?: string
  subclassDef?: SubclassDef | null
  level: number
  speciesKey?: string
  speciesLabel?: string
  /** RYT-171: the chosen species and background from the campaign's packs (null: by hand). */
  speciesDef?: SpeciesDef | null
  choices?: Record<string, string>
  backgroundKey?: string
  backgroundLabel?: string
  backgroundDef?: BackgroundDef | null
  feat?: OriginFeat | null
  language?: string
  library: LibraryFeature[]
  names: ProgressionNames
}

/** RYT-072 blank sheet: name, class and level (+ optional species/background); scores at 10. */
export function blankDraft(choice: BlankChoice): SheetDraft {
  const level = Math.min(20, Math.max(1, Math.trunc(choice.level)))
  let build: Build = { ...emptyBuild(), abilityMethod: 'manual', origin: 'blank' }
  const def = choice.classDef ?? null
  build = chooseClass(build, choice.classKey, choice.classLabel, def)
  if (choice.subclassKey || choice.subclass?.trim()) {
    const subCaster = choice.subclassDef?.caster
    build = {
      ...build,
      subclassKey: choice.subclassKey ?? '',
      subclass: (choice.subclass ?? '').trim().slice(0, 60),
      ...(build.casterKind === 'none' && subCaster && subCaster !== 'none'
        ? {
            casterKind: subCaster,
            spellAbility: choice.subclassDef?.spellAbility ?? build.spellAbility ?? 'int',
          }
        : {}),
    }
  }
  const language = choice.language ?? 'es'
  if (choice.speciesKey || choice.speciesLabel?.trim()) {
    build = chooseSpecies(
      build,
      choice.speciesKey ?? '',
      choice.speciesLabel ?? choice.speciesKey ?? '',
      choice.speciesDef ?? null,
      language,
    )
  }
  if (choice.choices && Object.keys(choice.choices).length > 0) {
    build = { ...build, choices: { ...choice.choices } }
  }
  if (choice.backgroundKey || choice.backgroundLabel?.trim()) {
    build = chooseBackground(
      build,
      choice.backgroundKey ?? '',
      choice.backgroundLabel ?? choice.backgroundKey ?? '',
      choice.backgroundDef ?? null,
      choice.feat ?? null,
    )
  }
  if (def) build = syncProgression(build, level, choice.library, choice.names)
  return {
    build,
    level,
    maxHp: suggestedMaxHp(build.hitDie, level, finalAbilities(build).con),
    armorClass: defaultArmorClass(build, undefined, level),
  }
}
