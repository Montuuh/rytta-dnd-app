import type { Build, Feature, SheetDraft } from './sheet'
import { buildFits } from './sheet'
import { featRefs, traitRef } from './resources'
import type { ClassDef } from './class-catalog'
import {
  bonusesValid,
  defaultArmorClass,
  emptyBuild,
  finalAbilities,
  isBackgroundKey,
  isSpeciesKey,
  pointBuySpent,
  pointBuyValid,
  standardArrayValid,
  suggestedMaxHp,
} from './rules'
import {
  abilityKeys,
  backgrounds,
  choiceKeys,
  pointBuyBudget,
  pointBuyCost,
  species,
  traitChoices,
  type Ability,
  type Skill,
} from './srd'

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
  | 'chooseSpeciesOption'
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

/**
 * A class from the campaign's packs or the SRD (RYT-168: its definition, `def`), or one typed by
 * hand (`custom`), which keeps its own hit die and spellcasting.
 */
export function chooseClass(build: Build, key: string, label: string, def: ClassDef | null): Build {
  if (!def || def.key !== key) return { ...build, classKey: 'custom', classLabel: label }
  const entry = def
  // A different class starts without the old class's subclass and skill picks; background
  // skills stay. Choosing the same class again changes nothing but its label.
  const changed = key !== build.classKey
  const skills = changed
    ? Object.fromEntries(
        Object.entries(build.skills).filter(([skill]) =>
          backgroundSkills(build).includes(skill as Skill),
        ),
      )
    : build.skills
  return {
    ...build,
    classKey: key,
    classLabel: label,
    hitDie: entry.hitDie,
    saves: [...entry.saves],
    casterKind: entry.caster,
    spellAbility: entry.spellAbility,
    skills,
    ...(changed ? { subclass: '', subclassKey: '' } : {}),
  }
}
/** What switching class takes away, so the wizard can say so once. */
export type ClassLoss = { subclass: string; skills: number; spells: number }
export function classChangeLoss(prev: Build, next: Build): ClassLoss | null {
  if (!prev.classKey || prev.classKey === next.classKey) return null
  const fixed = backgroundSkills(prev)
  const skills = Object.keys(prev.skills).filter(
    (skill) => !fixed.includes(skill as Skill) && !(skill in next.skills),
  ).length
  const subclass = prev.subclass.trim()
  const spells = next.casterKind === 'none' ? prev.spells.length : 0
  return subclass || skills || spells ? { subclass, skills, spells } : null
}
export function chooseSpecies(build: Build, key: string, label: string, name: Namer): Build {
  const features = withoutSeeds(build.features, 'species')
  if (!isSpeciesKey(key)) {
    const clean = label.trim()
    return {
      ...build,
      speciesKey: key === 'custom' || clean ? 'custom' : '',
      speciesLabel: clean,
      features,
    }
  }
  const entry = species[key]
  return {
    ...build,
    // Trait options belong to a species: a new species starts without them.
    choices: key === build.speciesKey ? build.choices : undefined,
    speciesKey: key,
    speciesLabel: label,
    speed: entry.speed,
    features: [
      ...entry.traits.map((trait): Feature => ({
        id: seedId('species', trait),
        name: name('trait', trait),
        source: 'species',
        description: '',
        ref: traitRef(key, trait),
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
  if (!isBackgroundKey(key)) {
    const clean = label.trim()
    return {
      ...build,
      backgroundKey: key === 'custom' || clean ? 'custom' : '',
      backgroundLabel: clean,
      features,
      bonuses,
      skills,
    }
  }
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
        ref: featRefs[entry.feat],
      },
    ],
  }
}

export function classSkillChoices(build: Build, def: ClassDef | null) {
  const fixed = backgroundSkills(build)
  const picked = (Object.keys(build.skills) as Skill[]).filter((skill) => !fixed.includes(skill))
  const entry = def && def.key === build.classKey ? def : null
  return {
    fixed,
    picked,
    count: entry?.skillCount ?? null,
    options: entry && entry.skills !== 'any' ? (entry.skills as readonly Skill[]) : null,
  }
}

export function validateStep(
  step: CreationStep,
  draft: SheetDraft,
  def: ClassDef | null,
): StepIssue[] {
  const { build } = draft
  const issues: StepIssue[] = []
  if (step === 'class') {
    if (!build.classKey) issues.push('chooseClass')
    else if (build.classKey === 'custom' && !build.classLabel.trim()) issues.push('nameClass')
  }
  if (step === 'origin') {
    if (!build.speciesKey || (build.speciesKey === 'custom' && !build.speciesLabel.trim()))
      issues.push('chooseSpecies')
    // RYT-111: a species option the SRD requires (lineage, ancestry, legacy) is asked here.
    if (
      choiceKeys.some(
        (key) => traitChoices[key].species === build.speciesKey && !build.choices?.[key],
      )
    )
      issues.push('chooseSpeciesOption')
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
    const { picked, count } = classSkillChoices(build, def)
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
export const validateAll = (draft: SheetDraft, def: ClassDef | null) => [
  ...new Set(
    creationSteps
      .filter((step) => stepApplies(step, draft.build))
      .flatMap((step) => validateStep(step, draft, def)),
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

/**
 * Choices a newcomer would otherwise skip without noticing. The domain accepts them (a blank
 * sheet is a first-class door and "save and exit" keeps drafts), so they are advisory: the
 * wizard names them on Next and on the review step and lets the player continue anyway.
 */
export type StepGap = { kind: 'bonuses' } | { kind: 'skills'; missing: number }
export function stepGaps(step: CreationStep, build: Build, def: ClassDef | null): StepGap[] {
  if (step === 'origin') {
    const total = abilityKeys.reduce((sum, key) => sum + build.bonuses[key], 0)
    return build.backgroundKey && total === 0 ? [{ kind: 'bonuses' }] : []
  }
  if (step === 'skills') {
    const { picked, count } = classSkillChoices(build, def)
    return count !== null && picked.length < count
      ? [{ kind: 'skills', missing: count - picked.length }]
      : []
  }
  return []
}
export const buildGaps = (build: Build, def: ClassDef | null) =>
  creationSteps.flatMap((step) => stepGaps(step, build, def).map((gap) => ({ step, gap })))

/** Standard array: picking a score another ability holds swaps the two, so no value repeats. */
export function assignStandard(
  scores: Build['baseAbilities'],
  key: Ability,
  value: number,
): Build['baseAbilities'] {
  const holder = abilityKeys.find((other) => other !== key && scores[other] === value)
  return {
    ...scores,
    [key]: value,
    ...(holder ? { [holder]: scores[key] } : {}),
  }
}
/** Highest score still affordable in point buy when `key` is raised (budget 27). */
export function pointBuyCeiling(scores: Build['baseAbilities'], key: Ability) {
  const spent = pointBuySpent(scores)
  if (spent === null) return 15
  const room = pointBuyBudget - (spent - (pointBuyCost[scores[key]] ?? 0))
  let top = scores[key]
  for (let score = scores[key]; score <= 15; score += 1)
    if ((pointBuyCost[score] ?? Infinity) <= room) top = score
  return top
}
