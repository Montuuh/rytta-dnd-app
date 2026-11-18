import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { trackLiveChannel } from '@/shared/lib/live-poll'
import { CampaignSettingsError, campaignSettingsReason } from '@/features/campaigns'
import { rollContextSchema } from '../domain/context'
import { createRollsHub, type RollsRealtime } from './rolls-hub'

/**
 * RYT-137: the server's one-roll state of the live fight and the open rest (`get_roll_context`):
 * which characters have used their roll and the rolls in force the caller may read. The server
 * decides both; nothing here is derived from the roll log.
 */
export async function loadRollContext(campaignId: string, signal: AbortSignal) {
  if (config.VITE_DATA_MODE !== 'supabase') throw new CampaignSettingsError('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  const db = getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
  const { data, error } = await db
    .rpc('get_roll_context', { target_campaign: z.uuid().parse(campaignId) })
    .abortSignal(signal)
  if (error) throw new CampaignSettingsError(campaignSettingsReason(error.message))
  return rollContextSchema.parse(data)
}

export const rollsChannelKey = (campaignId: string) => `rolls:${campaignId}`

/**
 * RYT-133 realtime: the campaign_roll_signals row carries no roll (only a revision that moves on
 * each roll and each visibility change), so subscribers refetch what the database lets them read.
 * Polling stays on as the fallback. Every listener of a campaign shares one subscription.
 */
export const subscribeRolls: (campaignId: string, onChange: () => void) => () => void =
  config.VITE_DATA_MODE !== 'supabase'
    ? () => () => undefined
    : createRollsHub(
        async () => {
          const { getSupabase, activeSchema } = await import('@/shared/api/supabase')
          const db = getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
          return { db: db as unknown as RollsRealtime, schema: activeSchema() }
        },
        (campaignId) => trackLiveChannel(rollsChannelKey(campaignId)),
      )
