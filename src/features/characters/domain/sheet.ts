import { z } from 'zod'
import { abilityKeys, casterKinds, conditionKeys, skillKeys, type Ability, type Skill } from './srd'

const id = z.string().min(1).max(40)
const text = (max: number) => z.string().max(max)
const score = z.number().int().min(1).max(30)
export const abilitiesSchema = z.object(
  Object.fromEntries(abilityKeys.map((key) => [key, score])) as Record<Ability, typeof score>,
)
export type Abilities = z.infer<typeof abilitiesSchema>
const bonus = z.number().int().min(0).max(2)
export const bonusesSchema = z.object(
  Object.fromEntries(abilityKeys.map((key) => [key, bonus])) as Record<Ability, typeof bonus>,
)
export const featureSources = ['class', 'species', 'background', 'feat', 'other'] as const
export const featureSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  source: z.enum(featureSources),
  description: text(2000),
})
export const restKinds = ['short', 'long', 'none'] as const
export const trackerSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  max: z.number().int().min(1).max(99),
  reset: z.enum(restKinds),
})
export const spellSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  level: z.number().int().min(0).max(9),
  concentration: z.boolean(),
  ritual: z.boolean(),
  prepared: z.boolean(),
  notes: text(600),
})
export const proficiencyLevels = ['proficient', 'expertise'] as const
export const buildSchema = z.object({
  classKey: text(40),
  classLabel: text(60),
  subclass: text(60),
  speciesKey: text(40),
  speciesLabel: text(60),
  backgroundKey: text(40),
  backgroundLabel: text(60),
  alignment: text(40),
  abilityMethod: z.enum(['standard', 'pointBuy', 'manual']),
  baseAbilities: abilitiesSchema,
  bonuses: bonusesSchema,
  saves: z.array(z.enum(abilityKeys)).max(6),
  skills: z.partialRecord(z.enum(skillKeys as [Skill, ...Skill[]]), z.enum(proficiencyLevels)),
  hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  speed: z.number().int().min(0).max(200),
  acOverride: z.number().int().min(0).max(99).nullable(),
  casterKind: z.enum(casterKinds),
  spellAbility: z.enum(abilityKeys).nullable(),
  languages: text(500),
  proficiencies: text(1000),
  appearance: text(2000),
  notes: text(4000),
  features: featureSchema.array().max(60),
  trackers: trackerSchema.array().max(30),
  spells: spellSchema.array().max(100),
})
export type Build = z.infer<typeof buildSchema>
export type Feature = z.infer<typeof featureSchema>
export type Tracker = z.infer<typeof trackerSchema>
export type Spell = z.infer<typeof spellSchema>
// The database limits build to 64 KiB; stay below it with a margin for encoding.
export const maxBuildBytes = 60_000
export const buildFits = (build: Build) =>
  new TextEncoder().encode(JSON.stringify(build)).length <= maxBuildBytes

const safeRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
// A never-saved sheet stores {}; expose it as "no build yet" rather than failing.
const storedBuild = z.preprocess(
  (value) => (value && typeof value === 'object' && Object.keys(value).length === 0 ? null : value),
  buildSchema.nullable(),
)
export const sheetRowSchema = z.object({
  character_id: z.uuid(),
  campaign_id: z.uuid(),
  status: z.enum(['draft', 'complete']),
  level: z.number().int().min(1).max(20),
  max_hp: z.number().int().min(1).max(9999),
  armor_class: z.number().int().min(0).max(99),
  build: storedBuild,
  revision: safeRevision,
  portrait_path: z.string().max(200).nullable().optional(),
})
export type SheetRow = z.infer<typeof sheetRowSchema>
export const vitalsSchema = z.object({
  current_hp: z.number().int().min(0).max(9999),
  temp_hp: z.number().int().min(0).max(9999),
  hit_dice_spent: z.number().int().min(0).max(20),
  death_successes: z.number().int().min(0).max(3),
  death_failures: z.number().int().min(0).max(3),
  heroic_inspiration: z.boolean(),
  conditions: z.array(z.enum(conditionKeys)),
  slots_used: z.array(z.number().int().min(0).max(9)).length(9),
  tracker_uses: z.record(z.string().max(40), z.number().int().min(0).max(99)),
  revision: safeRevision,
})
export type Vitals = z.infer<typeof vitalsSchema>
export const sheetSummarySchema = z.object({
  character_id: z.uuid(),
  status: z.enum(['draft', 'complete']),
  level: z.number().int(),
  max_hp: z.number().int(),
  armor_class: z.number().int(),
  class_key: z.string().nullable(),
  class_label: z.string().nullable(),
})
export const vitalsSummarySchema = z.object({
  character_id: z.uuid(),
  current_hp: z.number().int(),
  temp_hp: z.number().int(),
})
export type SheetSummary = z.infer<typeof sheetSummarySchema> & {
  current_hp: number
  temp_hp: number
}

export type SheetDraft = { build: Build; level: number; maxHp: number; armorClass: number }
export type SheetAction =
  | {
      kind: 'save'
      characterId: string
      expectedRevision: number
      draft: SheetDraft
      complete: boolean
      requestId: string
    }
  | { kind: 'vitals'; characterId: string; values: Vitals; requestId: string }
