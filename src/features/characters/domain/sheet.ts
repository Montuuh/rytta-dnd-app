import { z } from 'zod'
import {
  abilityKeys,
  casterKinds,
  choiceKeys,
  conditionKeys,
  skillKeys,
  type Ability,
  type ChoiceKey,
  type Skill,
} from './srd'

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
/** Glossary entry ids (`feature.monk-stunning-strike`, `spell.fireball`). */
const ref = z
  .string()
  .regex(/^[a-z]+\.[a-z0-9-]+$/)
  .max(80)
export const featureSchema = z.object({
  // SRD features use readable ids (`srd-monk-stunning-strike`), longer than player entries.
  id: z.string().min(1).max(90),
  name: z.string().trim().min(1).max(100),
  source: z.enum(featureSources),
  description: text(2000),
  /** RYT-071: the SRD class feature this entry links to; its text lives in the glossary. */
  ref: ref.optional(),
  level: z.number().int().min(1).max(20).optional(),
})
export const restKinds = ['short', 'long', 'none'] as const
export const trackerDisplays = ['pips', 'counter'] as const
export const trackerSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  max: z.number().int().min(1).max(999),
  reset: z.enum(restKinds),
  /** RYT-071: a class resource (see domain/resources.ts) whose maximum follows the level. */
  key: z.string().min(1).max(60).optional(),
  /** Pips for small pools (Ki, Rage); a counter for large ones (Lay on Hands). */
  display: z.enum(trackerDisplays).optional(),
  /** RYT-102: a once-per-turn mark (reset `short`, so any rest clears it on the server too). */
  per: z.literal('turn').optional(),
})
export const spellSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  level: z.number().int().min(0).max(9),
  concentration: z.boolean(),
  ritual: z.boolean(),
  prepared: z.boolean(),
  notes: text(600),
  ref: ref.optional(),
})
export const proficiencyLevels = ['proficient', 'expertise'] as const
/** RYT-073 sheet blocks a player can hide; HP, stats and abilities always show. */
export const sheetBlocks = [
  'skills',
  'attacks',
  'features',
  'spells',
  'conditions',
  'notes',
] as const
export type SheetBlock = (typeof sheetBlocks)[number]
export const creationOrigins = ['quick', 'full', 'blank'] as const
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
  acBonus: z.number().int().min(-20).max(20).optional(),
  acOverride: z.number().int().min(0).max(99).nullable(),
  casterKind: z.enum(casterKinds),
  spellAbility: z.enum(abilityKeys).nullable(),
  languages: text(500),
  proficiencies: text(1000),
  appearance: text(2000),
  notes: text(4000),
  features: featureSchema.array().max(120),
  trackers: trackerSchema.array().max(30),
  spells: spellSchema.array().max(100),
  /** RYT-071: the SRD subclass whose features are added (empty for none or homebrew). */
  subclassKey: text(40).optional(),
  /** RYT-071: class resources (`tracker:<key>`) and features (`feature:<ref>`) the player
   * removed, so levelling up does not add them back. */
  removed: z.array(z.string().max(100)).max(300).optional(),
  /** RYT-073: hidden blocks of the sheet. */
  layout: z.object({ hidden: z.array(z.enum(sheetBlocks)).max(sheetBlocks.length) }).optional(),
  /** RYT-072: how the sheet was created. */
  origin: z.enum(creationOrigins).optional(),
  /** RYT-102: options picked for species traits (`giantAncestry: 'fire'`); unknown values are
   * kept but grant nothing. */
  choices: z.partialRecord(z.enum(choiceKeys as [ChoiceKey, ...ChoiceKey[]]), text(40)).optional(),
})
export type Build = z.infer<typeof buildSchema>
export type Feature = z.infer<typeof featureSchema>
export type Tracker = z.infer<typeof trackerSchema>
export type Spell = z.infer<typeof spellSchema>
// The database limits build to 64 KiB; stay below it with a margin for encoding.
export const maxBuildBytes = 60_000
export const buildFits = (build: Build) =>
  new TextEncoder().encode(JSON.stringify(build)).length <= maxBuildBytes

/**
 * What `set_character_vitals` accepts as a concentration marker (20261203120000): the text
 * trimmed of Unicode spaces at both ends, 1 to 100 characters (code points), and none of the
 * C0, DEL and C1 controls, the zero-width and bidi controls (U+200B to U+200F, U+202A to U+202E,
 * U+2060 to U+2064, U+2066 to U+2069) or U+FEFF anywhere. Anything else is answered with
 * `Invalid concentration`, so the client applies exactly this before it sends.
 */
export const concentrationMaxLength = 100
/* eslint-disable no-control-regex */
const forbiddenInMarker =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu
/* eslint-enable no-control-regex */
const unicodeSpaces =
  /^[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+|[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/gu
export const trimMarkerSpaces = (value: string) => value.replace(unicodeSpaces, '')
export const hasForbiddenMarkerCharacters = (value: string) => {
  forbiddenInMarker.lastIndex = 0
  return forbiddenInMarker.test(value)
}
export const stripForbiddenMarkerCharacters = (value: string) =>
  value.replace(forbiddenInMarker, '')
const codePoints = (value: string) => Array.from(value).length
/** The marker to send for `value`, or null when the server would refuse it. */
export function markerFor(value: string): string | null {
  const trimmed = trimMarkerSpaces(value)
  return trimmed.length > 0 &&
    codePoints(trimmed) <= concentrationMaxLength &&
    !hasForbiddenMarkerCharacters(trimmed)
    ? trimmed
    : null
}
export const concentrationSchema = z.string().refine((value) => markerFor(value) !== null)
/** The marker as the sheet reads it. What the server stores is valid, but a sheet must never fail
 * to load over a marker: anything unexpected is cleaned or dropped for display. */
export function readMarker(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const marker = markerFor(value)
  if (marker !== null) return marker
  const cleaned = Array.from(trimMarkerSpaces(stripForbiddenMarkerCharacters(value)))
    .slice(0, concentrationMaxLength)
    .join('')
  return trimMarkerSpaces(cleaned) || null
}

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
  tracker_uses: z.record(z.string().max(40), z.number().int().min(0).max(999)),
  /** RYT-134: the spell the character concentrates on (the server keeps 1 to 100 characters). */
  concentration: z.unknown().optional().transform(readMarker),
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

export type SheetDraft = {
  name?: string
  build: Build
  level: number
  maxHp: number
  armorClass: number
}
export type SheetAction =
  | {
      kind: 'save'
      characterId: string
      expectedRevision: number
      draft: SheetDraft
      complete: boolean
      requestId: string
    }
  | {
      kind: 'vitals'
      characterId: string
      values: Vitals
      requestId: string
      /** RYT-134: present only when this write sets (`value`) or clears (`null`) the marker. */
      concentration?: { value: string | null }
    }
  | { kind: 'rename'; characterId: string; name: string; requestId: string }

/** RYT-070: whether the play lock applies to the caller (a Player whose character fights). */
export const playLockSchema = z.object({ in_encounter: z.boolean(), locked: z.boolean() })
export type PlayLock = z.infer<typeof playLockSchema>
export const historyActors = ['self', 'dm', 'player', 'system'] as const
export const historyItemSchema = z.object({
  id: z.uuid(),
  at: z.string(),
  kind: z.string().max(60),
  actor: z.enum(historyActors),
  actor_name: z.string().max(200).nullable(),
  changes: z
    .object({ field: z.string().max(80), before: z.unknown(), after: z.unknown() })
    .array()
    .max(80),
})
export type HistoryItem = z.infer<typeof historyItemSchema>
