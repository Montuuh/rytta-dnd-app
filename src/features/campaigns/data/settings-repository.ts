import { z } from 'zod'
import type { AppSupabaseClient } from '@/shared/api/database.types'
import { config } from '@/shared/lib/config'
import {
  CampaignSettingsError,
  campaignRollSchema,
  campaignSettingsReason,
  diceSettingsSchema,
  levelUpInputSchema,
  logRollInputSchema,
  partyLevelSchema,
  type CampaignRoll,
  type DiceSettings,
  type LevelUpInput,
  type LogRollInput,
} from '../domain/settings'

function check(error: { message: string } | null) {
  if (error) throw new CampaignSettingsError(campaignSettingsReason(error.message))
}

const rollColumns =
  'id, campaign_id, character_id, roller_id, label, expression, dice, total, kind, source, visibility, created_at'

export type ListRollsOptions = {
  /** At most 100; default 50. */
  limit?: number
  /** Only rolls created before this ISO time (paging). */
  before?: string
  signal?: AbortSignal
}

/** RYT-130 / RYT-133 writes and the roll log. Every write carries a request id: retrying the
 * same intent with the same id is safe; a new intent needs a new id. */
export type CampaignSettingsRepository = {
  setPartyLevel(campaignId: string, level: number | null, requestId: string): Promise<number | null>
  setDiceSettings(
    campaignId: string,
    settings: DiceSettings,
    requestId: string,
  ): Promise<DiceSettings>
  /** Returns the new character_sheets revision. */
  applyLevelUp(input: LevelUpInput): Promise<number>
  logRoll(input: LogRollInput): Promise<CampaignRoll>
  /** Newest first; the server returns only the rolls the caller may read. */
  listRolls(campaignId: string, options?: ListRollsOptions): Promise<CampaignRoll[]>
}

export function createCampaignSettingsRepository(
  client: AppSupabaseClient,
): CampaignSettingsRepository {
  return {
    async setPartyLevel(campaignId, level, requestId) {
      const { data, error } = await client.rpc('set_party_level', {
        target_campaign: z.uuid().parse(campaignId),
        new_level: partyLevelSchema.nullable().parse(level),
        request_id: z.uuid().parse(requestId),
      })
      check(error)
      return partyLevelSchema.nullable().parse(data)
    },
    async setDiceSettings(campaignId, settings, requestId) {
      const values = diceSettingsSchema.parse(settings)
      const { data, error } = await client.rpc('set_dice_settings', {
        target_campaign: z.uuid().parse(campaignId),
        new_dice_mode: values.dice_mode,
        new_roll_visibility: values.roll_visibility,
        request_id: z.uuid().parse(requestId),
      })
      check(error)
      return diceSettingsSchema.parse(data)
    },
    async applyLevelUp(input) {
      const values = levelUpInputSchema.parse(input)
      const { data, error } = await client.rpc('apply_level_up', {
        target_campaign: values.campaignId,
        target_character: values.characterId,
        expected_revision: values.expectedRevision,
        new_level: values.level,
        new_max_hp: values.maxHp,
        new_build: values.build as never,
        request_id: values.requestId,
      })
      check(error)
      return z.number().int().min(0).parse(data)
    },
    async logRoll(input) {
      const values = logRollInputSchema.parse(input)
      const { data, error } = await client.rpc('log_roll', {
        target_campaign: values.campaignId,
        target_character: values.characterId,
        roll_label: values.label,
        roll_expression: values.expression,
        roll_kind: values.kind,
        roll_source: values.source,
        recorded_dice: values.source === 'recorded' ? values.dice : null,
        recorded_total: values.source === 'recorded' ? values.total : null,
        request_id: values.requestId,
      })
      check(error)
      return campaignRollSchema.parse(data)
    },
    async listRolls(campaignId, options = {}) {
      const limit = z
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(options.limit ?? 50)
      let query = client
        .from('campaign_rolls')
        .select(rollColumns)
        .eq('campaign_id', z.uuid().parse(campaignId))
      if (options.before)
        query = query.lt('created_at', z.iso.datetime({ offset: true }).parse(options.before))
      let ordered = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (options.signal) ordered = ordered.abortSignal(options.signal)
      const { data, error } = await ordered
      check(error)
      return campaignRollSchema.array().parse(data)
    },
  }
}

async function repository() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new CampaignSettingsError('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return createCampaignSettingsRepository(
    getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!),
  )
}

export const setPartyLevel: CampaignSettingsRepository['setPartyLevel'] = async (...args) =>
  (await repository()).setPartyLevel(...args)
export const setDiceSettings: CampaignSettingsRepository['setDiceSettings'] = async (...args) =>
  (await repository()).setDiceSettings(...args)
export const applyLevelUp: CampaignSettingsRepository['applyLevelUp'] = async (input) =>
  (await repository()).applyLevelUp(input)
export const logRoll: CampaignSettingsRepository['logRoll'] = async (input) =>
  (await repository()).logRoll(input)
export const listRolls: CampaignSettingsRepository['listRolls'] = async (...args) =>
  (await repository()).listRolls(...args)
