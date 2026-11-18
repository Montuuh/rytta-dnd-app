import { z } from 'zod'

/** RYT-133: how the table rolls. 'player' lets each Player choose on their own device. */
export const diceModes = ['physical', 'app', 'player'] as const
export type DiceMode = (typeof diceModes)[number]
/** RYT-133: who reads rolls logged in the app; enforced by RLS at read time. */
export const rollVisibilities = ['table', 'roller', 'roller_dm'] as const
export type RollVisibility = (typeof rollVisibilities)[number]
export const rollKinds = [
  'ability',
  'skill',
  'save',
  'attack',
  'damage',
  'initiative',
  'death_save',
  'hit_die',
  'custom',
] as const
export type RollKind = (typeof rollKinds)[number]
/** 'app': rolled on the server. 'recorded': physical dice reported by the roller. */
export const rollSources = ['app', 'recorded'] as const
export type RollSource = (typeof rollSources)[number]

export const partyLevelSchema = z.number().int().min(1).max(20)

/** Settings fields of list_my_campaigns_with_modules (RYT-130 / RYT-133). Defaults match the
 * database defaults, so a row from a server without the migration parses as "not set". */
export const campaignSettingsSchema = z.object({
  party_level: partyLevelSchema.nullable().default(null),
  dice_mode: z.enum(diceModes).default('physical'),
  roll_visibility: z.enum(rollVisibilities).default('roller_dm'),
})
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>

export const diceSettingsSchema = campaignSettingsSchema.pick({
  dice_mode: true,
  roll_visibility: true,
})
export type DiceSettings = z.infer<typeof diceSettingsSchema>

/** Same rule as the campaign_rolls check: dice terms of d2–d100 (keep highest/lowest of a group
 * of two or more with kh1/kl1) and whole modifiers, at most 40 characters, at most 20 dice. */
export const rollExpressionPattern =
  /^([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?([+-](([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?|[0-9]{1,3}))*$/
export const rollExpressionSchema = z.string().min(2).max(40).regex(rollExpressionPattern)
export const rollLabelSchema = z
  .string()
  .trim()
  .max(80)
  // oxlint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))

export const campaignRollSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  character_id: z.uuid().nullable(),
  roller_id: z.uuid(),
  label: z.string().max(80),
  expression: z.string(),
  dice: z.array(z.number().int().min(1).max(100)).max(20),
  total: z.number().int(),
  kind: z.enum(rollKinds),
  source: z.enum(rollSources),
  /** The campaign's roll_visibility when the roll was made; reads use the stricter of this and
   * the current setting. */
  visibility: z.enum(rollVisibilities),
  created_at: z.iso.datetime({ offset: true }),
  /** RYT-137: the fight an app initiative roll belongs to, and the rest an app hit-dice roll was
   * made in. Set by the server, never sent by the client; null for every other roll. */
  encounter_id: z.uuid().nullable().default(null),
  rest_id: z.uuid().nullable().default(null),
  /** Set when the DM cleared or re-rolled it: a superseded roll no longer counts. */
  superseded_at: z.iso.datetime({ offset: true }).nullable().default(null),
})
export type CampaignRoll = z.infer<typeof campaignRollSchema>

const rollBase = {
  campaignId: z.uuid(),
  /** Null only for the DM (a roll without a character). */
  characterId: z.uuid().nullable(),
  label: rollLabelSchema,
  expression: rollExpressionSchema,
  kind: z.enum(rollKinds),
  /** Retry with the same id after a network failure: the server returns the stored roll. */
  requestId: z.uuid(),
}
export const logRollInputSchema = z.discriminatedUnion('source', [
  z.object({ ...rollBase, source: z.literal('app') }),
  z.object({
    ...rollBase,
    source: z.literal('recorded'),
    /** Physical dice in expression order; empty when only the total was recorded. */
    dice: z.array(z.number().int().min(1).max(100)).max(20),
    total: z.number().int().min(-999).max(9999),
  }),
])
export type LogRollInput = z.input<typeof logRollInputSchema>

export const levelUpInputSchema = z.object({
  campaignId: z.uuid(),
  characterId: z.uuid(),
  /** character_sheets.revision the level-up was prepared from. */
  expectedRevision: z.number().int().min(0),
  level: partyLevelSchema,
  maxHp: z.number().int().min(1).max(9999),
  /** The whole new build (class levels, features, trackers). */
  build: z.record(z.string(), z.unknown()),
  requestId: z.uuid(),
})
export type LevelUpInput = z.input<typeof levelUpInputSchema>

/** Whether a sheet should be prompted to level up. Presentation only; the server decides. */
export function isBelowPartyLevel(level: number | null | undefined, partyLevel: number | null) {
  return partyLevel !== null && level != null && level < partyLevel
}

export type CampaignSettingsReason =
  | 'forbidden'
  | 'invalid'
  | 'request-mismatch'
  | 'stale'
  | 'encounter-locked'
  | 'above-party-level'
  | 'sheet-incomplete'
  | 'class-change'
  | 'character-unavailable'
  | 'character-absent'
  | 'dice-mode'
  | 'roll-limit'
  | 'already-rolled'
  | 'roll-required'
  | 'unavailable'
export class CampaignSettingsError extends Error {
  readonly reason: CampaignSettingsReason
  constructor(reason: CampaignSettingsReason) {
    super(reason)
    this.reason = reason
  }
}
const settingsMessages: [string, CampaignSettingsReason][] = [
  ['Request mismatch', 'request-mismatch'],
  ['Stale revision', 'stale'],
  ['Encounter locked', 'encounter-locked'],
  ['Above party level', 'above-party-level'],
  ['Sheet incomplete', 'sheet-incomplete'],
  ['Class change', 'class-change'],
  ['Character unavailable', 'character-unavailable'],
  ['Character absent', 'character-absent'],
  ['Dice mode', 'dice-mode'],
  ['Roll limit', 'roll-limit'],
  ['Already rolled', 'already-rolled'],
  ['Roll required', 'roll-required'],
  ['Invalid level', 'invalid'],
  ['Invalid settings', 'invalid'],
  ['Invalid roll', 'invalid'],
  ['Invalid request', 'invalid'],
  ['Forbidden', 'forbidden'],
]
/** Maps a database error message of the settings, level-up and roll RPCs to a typed reason. */
export function campaignSettingsReason(message: string): CampaignSettingsReason {
  return settingsMessages.find(([text]) => message.includes(text))?.[1] ?? 'unavailable'
}
