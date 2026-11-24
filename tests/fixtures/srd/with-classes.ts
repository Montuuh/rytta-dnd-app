import { classDefFor } from '../../../src/features/characters/domain/class-catalog'
import * as creation from '../../../src/features/characters/domain/creation'
import * as levelUp from '../../../src/features/characters/domain/level-up'
import * as quick from '../../../src/features/characters/domain/quick'
import type { Build, SheetDraft } from '../../../src/features/characters/domain/sheet'
import type { ClassKey } from '../../../src/features/characters/domain/srd'
import { srdClasses } from './classes'
import { srdOrigins } from './origins'
import {
  backgroundDefFor,
  featDefFor,
  speciesDefFor,
  type BackgroundDef,
} from '../../../src/features/characters/domain/origin-catalog'

/**
 * RYT-167: the class functions with the campaign's class taken from the SRD as the library
 * publishes it, for unit tests of SRD characters (the app passes the campaign's catalog).
 */
const def = (key: string) => classDefFor(srdClasses, key)

export const chooseClass = (build: Build, key: string, label: string) =>
  creation.chooseClass(build, key, label, def(key))
export const classSkillChoices = (build: Build) =>
  creation.classSkillChoices(build, def(build.classKey))
export const validateStep = (step: creation.CreationStep, draft: SheetDraft) =>
  creation.validateStep(
    step,
    draft,
    def(draft.build.classKey),
    speciesDefFor(srdOrigins, draft.build.speciesKey),
  )
export const validateAll = (draft: SheetDraft) =>
  creation.validateAll(
    draft,
    def(draft.build.classKey),
    speciesDefFor(srdOrigins, draft.build.speciesKey),
  )
export const stepGaps = (step: creation.CreationStep, build: Build) =>
  creation.stepGaps(step, build, def(build.classKey))
export const buildGaps = (build: Build) => creation.buildGaps(build, def(build.classKey))
export const levelUpRequirements = (build: Build, toLevel: number) =>
  levelUp.levelUpRequirements(build, toLevel, def(build.classKey))
export const planLevelUp = (
  input: Parameters<typeof levelUp.planLevelUp>[0],
  library: Parameters<typeof levelUp.planLevelUp>[1],
  names: Parameters<typeof levelUp.planLevelUp>[2],
) => levelUp.planLevelUp(input, library, names, def(input.build.classKey))
type Legacy = { name?: unknown }
export const quickDraft = (
  choice: Omit<
    quick.QuickChoice,
    'classDef' | 'speciesDef' | 'backgroundDef' | 'backgroundLabel' | 'feat' | 'language'
  > &
    Legacy & { classKey: ClassKey; speciesKey: string; backgroundLabel?: unknown },
) => {
  const background = backgroundDefFor(srdOrigins, quick.quickBackground[choice.classKey])!
  return quick.quickDraft({
    ...choice,
    classDef: def(choice.classKey)!,
    speciesDef: speciesDefFor(srdOrigins, choice.speciesKey)!,
    backgroundDef: background,
    backgroundLabel: background.name.es,
    feat: originFeatFor(background),
    language: 'es',
  })
}
export const blankDraft = (choice: quick.BlankChoice & Legacy) => {
  const background = backgroundDefFor(srdOrigins, choice.backgroundKey ?? '')
  return quick.blankDraft({
    ...choice,
    classDef: choice.classDef ?? def(choice.classKey),
    speciesDef: choice.speciesDef ?? speciesDefFor(srdOrigins, choice.speciesKey ?? ''),
    backgroundDef: choice.backgroundDef ?? background,
    feat: choice.feat ?? (background ? originFeatFor(background) : null),
  })
}

/** RYT-171: species and backgrounds with their SRD definition, named in Spanish. */
const listName = (list: string) => ({ cleric: 'clérigo', wizard: 'mago' })[list] ?? list
export const chooseSpecies = (build: Build, key: string, label: string, _name?: unknown) =>
  creation.chooseSpecies(build, key, label, speciesDefFor(srdOrigins, key), 'es')
const originFeatFor = (background: BackgroundDef) =>
  creation.originFeat(background, featDefFor(srdOrigins, background.feat ?? ''), 'es', listName)
export const chooseBackground = (build: Build, key: string, label: string, _name?: unknown) => {
  const background = backgroundDefFor(srdOrigins, key)
  return creation.chooseBackground(
    build,
    key,
    label,
    background,
    background ? originFeatFor(background) : null,
  )
}
