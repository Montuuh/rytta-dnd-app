import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { restError, restStateSchema, type RestAction } from '../domain/rest'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

/** RYT-080: the open rest request of a campaign, or the one closed in the last minutes. */
export async function getRestState(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_rest_state', { target_campaign: z.uuid().parse(campaignId) })
    .abortSignal(signal)
  if (error) throw new Error(restError(error.message))
  return restStateSchema.parse(data)
}

export async function changeRest(campaignId: string, action: RestAction) {
  const db = await client()
  const target_campaign = z.uuid().parse(campaignId)
  const dice = z.number().int().min(0).max(240).nullable()
  const result =
    action.kind === 'request'
      ? await db.rpc('request_rest', {
          target_campaign,
          rest_kind: action.rest,
          request_id: z.uuid().parse(action.requestId),
        })
      : action.kind === 'vote'
        ? await db.rpc('vote_rest', {
            target_campaign,
            target_request: z.uuid().parse(action.requestId),
            target_character: z.uuid().parse(action.characterId),
            vote_value: action.vote,
            spent: dice.parse(action.spent),
            roll: dice.parse(action.roll),
          })
        : await db.rpc(action.kind === 'now' ? 'resolve_rest_now' : 'cancel_rest', {
            target_campaign,
            target_request: z.uuid().parse(action.requestId),
          })
  if (result.error) throw new Error(restError(result.error.message))
  return restStateSchema.parse(result.data)
}

/**
 * Realtime invalidation: the rest_requests row carries no secrets and its revision moves on every
 * vote and outcome, so subscribers refetch the state. Polling stays on as the fallback.
 */
export function subscribeRest(campaignId: string, onChange: () => void) {
  let stop: (() => void) | undefined
  let cancelled = false
  void (async () => {
    try {
      const db = await client()
      const { activeSchema } = await import('@/shared/api/supabase')
      const campaign = z.uuid().parse(campaignId)
      const channel = db
        .channel(`rest:${campaign}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: activeSchema(),
            table: 'rest_requests',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => onChange(),
        )
        .subscribe((status) => {
          // A (re)connection may have missed events: refetch the authoritative state.
          if (status === 'SUBSCRIBED') onChange()
        })
      stop = () => void db.removeChannel(channel)
      if (cancelled) stop()
    } catch {
      // Polling keeps the state fresh without realtime.
    }
  })()
  return () => {
    cancelled = true
    stop?.()
  }
}
