import type { Build, Feature, SheetDraft } from './sheet'
import { buildFits } from './sheet'
import {
  bonusesValid,
  defaultArmorClass,
  emptyBuild,
  finalAbilities,
  isBackgroundKey,
  isClassKey,
  isSpeciesKey,
  pointBuyValid,
  standardArrayValid,
  suggestedMaxHp,
} from './rules'
import { abilityKeys, backgrounds, classes, species, type Skill } from './srd'

export const creationSteps = [
  'class',
  'origin',
  'abilities',
  'skills',
  'combat',
  'spells',
  'details',
] as const
export type CreationStep = (typeof creationSteps)[number]
export type StepIssue =
  | 'chooseClass'
  | 'nameClass'
  | 'chooseSpecies'
  | 'chooseBackground'
  | 'bonuses'
  | 'standardArray'
  | 'pointBuy'
  | 'skillCount'
  | 'tooLarge'
  | 'emptyName'

/** Names for seeded features come from the caller so seeds follow the interface language. */
export type Namer = (kind: 'trait' | 'feat', key: string) => string

const seedId = (prefix: string, key: string) => `${prefix}-${key}`
const withoutSeeds = (features: Feature[], prefix: string) =>
  features.filter((feature) => !feature.id.startsWith(`${prefix}-`))

export function chooseClass(build: Build, key: string, label: string): Build {
  if (!isClassKey(key)) return { ...build, classKey: 'custom', classLabel: label }
  const entry = classes[key]
  const allowed = entry.skills === 'any' ? null : (entry.skills as readonly string[])
  // Keep background skills; drop class picks that the new class does not offer.
  const keep = Object.fromEntries(
    Object.entries(build.skills).filter(
      ([skill]) =>
        backgroundSkills(build).includes(skill as Skill) || !allowed || allowed.includes(skill),
    ),
  )
  return {
    ...build,
    classKey: key,
    classLabel: label,
    hitDie: entry.hitDie,
    saves: [...entry.saves],
    casterKind: entry.caster,
    spellAbility: entry.spellAbility,
    skills: keep,
  }
}
export function chooseSpecies(build: Build, key: string, label: string, name: Namer): Build {
  const features = withoutSeeds(build.features, 'species')
  if (!isSpeciesKey(key)) return { ...build, speciesKey: 'custom', speciesLabel: label, features }
  const entry = species[key]
  return {
    ...build,
    speciesKey: key,
    speciesLabel: label,
    speed: entry.speed,
    features: [
      ...entry.traits.map((trait): Feature => ({
        id: seedId('species', trait),
        name: name('trait', trait),
        source: 'species',
        description: '',
      })),
      ...features,
    ],
  }
}
export const backgroundSkills = (build: Pick<Build, 'backgroundKey'>): Skill[] =>
  isBackgroundKey(build.backgroundKey) ? [...backgrounds[build.backgroundKey].skills] : []
export function chooseBackground(build: Build, key: string, label: string, name: Namer): Build {
  const features = withoutSeeds(build.features, 'background')
  const bonuses = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
  const skills = Object.fromEntries(
    Object.entries(build.skills).filter(
      ([skill]) => !backgroundSkills(build).includes(skill as Skill),
    ),
  )
  if (!isBackgroundKey(key))
    return { ...build, backgroundKey: 'custom', backgroundLabel: label, features, bonuses, skills }
  const entry = backgrounds[key]
  for (const skill of entry.skills) skills[skill] = 'proficient'
  return {
    ...build,
    backgroundKey: key,
    backgroundLabel: label,
    bonuses,
    skills,
    features: [
      ...features,
      {
        id: seedId('background', entry.feat),
        name: name('feat', entry.feat),
        source: 'feat',
        description: '',
      },
    ],
  }
}

export function classSkillChoices(build: Build) {
  const fixed = backgroundSkills(build)
  const picked = (Object.keys(build.skills) as Skill[]).filter((skill) => !fixed.includes(skill))
  const entry = isClassKey(build.classKey) ? classes[build.classKey] : null
  return {
    fixed,
    picked,
    count: entry?.skillCount ?? null,
    options: entry && entry.skills !== 'any' ? (entry.skills as readonly Skill[]) : null,
  }
}

export function validateStep(step: CreationStep, draft: SheetDraft): StepIssue[] {
  const { build } = draft
  const issues: StepIssue[] = []
  if (step === 'class') {
    if (!build.classKey) issues.push('chooseClass')
    else if (build.classKey === 'custom' && !build.classLabel.trim()) issues.push('nameClass')
  }
  if (step === 'origin') {
    if (!build.speciesKey || (build.speciesKey === 'custom' && !build.speciesLabel.trim()))
      issues.push('chooseSpecies')
    if (!build.backgroundKey || (build.backgroundKey === 'custom' && !build.backgroundLabel.trim()))
      issues.push('chooseBackground')
    if (!bonusesValid(build)) issues.push('bonuses')
  }
  if (step === 'abilities') {
    if (build.abilityMethod === 'standard' && !standardArrayValid(build.baseAbilities))
      issues.push('standardArray')
    if (build.abilityMethod === 'pointBuy' && !pointBuyValid(build.baseAbilities))
      issues.push('pointBuy')
  }
  if (step === 'skills') {
    const { picked, count } = classSkillChoices(build)
    if (count !== null && picked.length > count) issues.push('skillCount')
  }
  const blank = (items: { name: string }[]) => items.some((item) => !item.name.trim())
  if (step === 'spells' && blank(build.spells)) issues.push('emptyName')
  if (step === 'details' && (blank(build.features) || blank(build.trackers)))
    issues.push('emptyName')
  if (!buildFits(build)) issues.push('tooLarge')
  return issues
}
/** Every applicable step must pass before a sheet is completed. */
export const validateAll = (draft: SheetDraft) => [
  ...new Set(
    creationSteps
      .filter((step) => stepApplies(step, draft.build))
      .flatMap((step) => validateStep(step, draft)),
  ),
]
/** Derived columns follow the build so the server receives one consistent snapshot. */
export const normalizeDraft = (draft: SheetDraft): SheetDraft => ({
  ...draft,
  armorClass: draft.build.acOverride ?? defaultArmorClass(draft.build),
  build: {
    ...draft.build,
    spellAbility: draft.build.casterKind === 'none' ? null : draft.build.spellAbility,
    spells: draft.build.casterKind === 'none' ? [] : draft.build.spells,
  },
})
export const stepApplies = (step: CreationStep, build: Build) =>
  step !== 'spells' || build.casterKind !== 'none'

export function initialDraft(level = 1): SheetDraft {
  const build = emptyBuild()
  return {
    build: { ...build, baseAbilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } },
    level,
    maxHp: suggestedMaxHp(8, level, 13),
    armorClass: 11,
  }
}
export const suggestedHpFor = (draft: SheetDraft) =>
  suggestedMaxHp(draft.build.hitDie, draft.level, finalAbilities(draft.build).con)

export const pointBuyStart = () =>
  Object.fromEntries(abilityKeys.map((key) => [key, 8])) as Build['baseAbilities']
