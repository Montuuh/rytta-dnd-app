import { chooseBackground, chooseClass, chooseSpecies, type Namer } from './creation'
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
  backgrounds,
  classes,
  standardArray,
  type Ability,
  type BackgroundKey,
  type ClassKey,
  type Skill,
  type SpeciesKey,
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

export type QuickChoice = {
  classKey: ClassKey
  classLabel: string
  speciesKey: SpeciesKey
  speciesLabel: string
  backgroundLabel: (key: BackgroundKey) => string
  name: Namer
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
  build = chooseClass(build, choice.classKey, choice.classLabel)
  build = chooseSpecies(build, choice.speciesKey, choice.speciesLabel, choice.name)
  const backgroundKey = quickBackground[choice.classKey]
  build = chooseBackground(build, backgroundKey, choice.backgroundLabel(backgroundKey), choice.name)
  const allowed = backgrounds[backgroundKey].abilities as readonly Ability[]
  const [first, second] = order.filter((key) => allowed.includes(key))
  build = {
    ...build,
    bonuses: { ...build.bonuses, [first!]: 2, [second!]: 1 },
  }
  const entry = classes[choice.classKey]
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
  level: number
  speciesKey?: string
  speciesLabel?: string
  backgroundKey?: string
  backgroundLabel?: string
  name?: Namer
  library: LibraryFeature[]
  names: ProgressionNames
}

/** RYT-072 blank sheet: name, class and level (+ optional species/background); scores at 10. */
export function blankDraft(choice: BlankChoice): SheetDraft {
  const level = Math.min(20, Math.max(1, Math.trunc(choice.level)))
  let build: Build = { ...emptyBuild(), abilityMethod: 'manual', origin: 'blank' }
  build = chooseClass(build, choice.classKey, choice.classLabel)
  const namer: Namer = choice.name ?? ((_, key) => key)
  if (choice.speciesKey || choice.speciesLabel?.trim()) {
    build = chooseSpecies(
      build,
      choice.speciesKey ?? '',
      choice.speciesLabel ?? choice.speciesKey ?? '',
      namer,
    )
  }
  if (choice.backgroundKey || choice.backgroundLabel?.trim()) {
    build = chooseBackground(
      build,
      choice.backgroundKey ?? '',
      choice.backgroundLabel ?? choice.backgroundKey ?? '',
      namer,
    )
  }
  if (isClassKey(build.classKey))
    build = syncProgression(build, level, choice.library, choice.names)
  return {
    build,
    level,
    maxHp: suggestedMaxHp(build.hitDie, level, finalAbilities(build).con),
    armorClass: defaultArmorClass(build, undefined, level),
  }
}
