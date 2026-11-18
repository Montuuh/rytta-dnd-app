import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { trackLiveChannel } from '@/shared/lib/live-poll'

export const rollsChannelKey = (campaignId: string) => `rolls:${campaignId}`

/**
 * RYT-133 realtime: the campaign_roll_signals row carries no roll (only a revision that moves on
 * each roll and each visibility change), so subscribers refetch what the database lets them read.
 * Polling stays on as the fallback.
 */
export function subscribeRolls(campaignId: string, onChange: () => void) {
  if (config.VITE_DATA_MODE !== 'supabase') return () => undefined
  let stop: (() => void) | undefined
  let cancelled = false
  const status = trackLiveChannel(rollsChannelKey(campaignId))
  void (async () => {
    try {
      const { getSupabase, activeSchema } = await import('@/shared/api/supabase')
      const db = getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
      const campaign = z.uuid().parse(campaignId)
      const channel = db
        .channel(`rolls:${campaign}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: activeSchema(),
            table: 'campaign_roll_signals',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => onChange(),
        )
        .subscribe((next) => {
          if (cancelled) return
          // Up: a (re)connection may have missed rolls. Down: the fast poll must start at once.
          status.set(next === 'SUBSCRIBED')
          onChange()
        })
      stop = () => void db.removeChannel(channel)
      if (cancelled) stop()
    } catch {
      // Polling keeps the strip fresh without realtime.
    }
  })()
  return () => {
    cancelled = true
    status.release()
    stop?.()
  }
}
