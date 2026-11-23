import { classDefFor } from '../../../src/features/characters/domain/class-catalog'
import * as creation from '../../../src/features/characters/domain/creation'
import * as levelUp from '../../../src/features/characters/domain/level-up'
import * as quick from '../../../src/features/characters/domain/quick'
import type { Build, SheetDraft } from '../../../src/features/characters/domain/sheet'
import type { ClassKey } from '../../../src/features/characters/domain/srd'
import { srdClasses } from './classes'

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
  creation.validateStep(step, draft, def(draft.build.classKey))
export const validateAll = (draft: SheetDraft) =>
  creation.validateAll(draft, def(draft.build.classKey))
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
export const quickDraft = (choice: Omit<quick.QuickChoice, 'classDef'> & { classKey: ClassKey }) =>
  quick.quickDraft({ ...choice, classDef: def(choice.classKey)! })
export const blankDraft = (choice: quick.BlankChoice) =>
  quick.blankDraft({ ...choice, classDef: choice.classDef ?? def(choice.classKey) })
