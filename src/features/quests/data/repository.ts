import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { trackLiveChannel } from '@/shared/lib/live-poll'
import { questError, questListSchema, questSchema, type QuestDraft } from '../domain/quest'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

/** RYT-006: every quest for the DM; published quests and visible objectives for Players. */
export async function listQuests(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('list_quests', { target_campaign: z.uuid().parse(campaignId) })
    .abortSignal(signal)
  if (error) throw new Error(questError(error.message))
  return questListSchema.parse(data)
}

export async function saveQuest(
  campaignId: string,
  questId: string,
  revision: number | null,
  draft: QuestDraft,
) {
  const { data, error } = await (
    await client()
  ).rpc('save_quest', {
    target_campaign: z.uuid().parse(campaignId),
    target_quest: z.uuid().parse(questId),
    expected_revision: revision,
    payload: draft,
  })
  if (error) throw new Error(questError(error.message))
  return questSchema.parse(data)
}

export async function deleteQuest(campaignId: string, questId: string, revision: number) {
  const { error } = await (
    await client()
  ).rpc('delete_quest', {
    target_campaign: z.uuid().parse(campaignId),
    target_quest: z.uuid().parse(questId),
    expected_revision: revision,
  })
  if (error) throw new Error(questError(error.message))
}

export async function markQuestSeen(campaignId: string, questId: string) {
  const { data, error } = await (
    await client()
  ).rpc('mark_quest_seen', {
    target_campaign: z.uuid().parse(campaignId),
    target_quest: z.uuid().parse(questId),
  })
  if (error) throw new Error(questError(error.message))
  return z.string().parse(data)
}

export const questsChannelKey = (campaignId: string) => `quests:${campaignId}`

/** Follows the campaign's secret-free quest signal; polling covers a missing channel. */
export function subscribeQuests(campaignId: string, onChange: () => void) {
  let stop: (() => void) | undefined
  let cancelled = false
  const status = trackLiveChannel(questsChannelKey(campaignId))
  void (async () => {
    try {
      const db = await client()
      const { activeSchema } = await import('@/shared/api/supabase')
      const campaign = z.uuid().parse(campaignId)
      const channel = db
        .channel(`quests:${campaign}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: activeSchema(),
            table: 'quest_signals',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => onChange(),
        )
        .subscribe((next) => {
          if (cancelled) return
          status.set(next === 'SUBSCRIBED')
          // A (re)connection may have missed a change: read the journal again.
          if (next === 'SUBSCRIBED') onChange()
        })
      stop = () => void db.removeChannel(channel)
      if (cancelled) stop()
    } catch {
      // Polling keeps the journal fresh without realtime.
    }
  })()
  return () => {
    cancelled = true
    status.release()
    stop?.()
  }
}
