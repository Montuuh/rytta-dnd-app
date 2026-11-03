import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { tradeErrorCode, tradeStateSchema, type TradeAction } from '../domain/trade'
import { newRequestId } from '@/shared/lib/request-id'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

export async function loadTradeState(
  campaignId: string,
  actingUser: string | null,
  signal: AbortSignal,
) {
  const db = await client()
  const result = await db
    .rpc('get_trade_state', {
      target_campaign: z.uuid().parse(campaignId),
      acting_user: actingUser === null ? null : z.uuid().parse(actingUser),
    })
    .abortSignal(signal)
  if (result.error) throw new Error(tradeErrorCode(result.error.message))
  return tradeStateSchema.parse(result.data)
}

const resultSchema = z.object({
  trade_id: z.uuid(),
  status: z.string(),
  revision: z.number().int().min(0),
})

export async function changeTrade(campaignId: string, action: TradeAction) {
  const db = await client()
  const target_campaign = z.uuid().parse(campaignId)
  const request_id = newRequestId()
  let result
  switch (action.kind) {
    case 'invite':
      result = await db.rpc('invite_trade', {
        target_campaign,
        from_character: z.uuid().parse(action.from),
        to_character: z.uuid().parse(action.to),
        request_id,
      })
      break
    case 'respond':
      result = await db.rpc('respond_trade_invite', {
        target_campaign,
        target_trade: z.uuid().parse(action.tradeId),
        accept: action.accept,
        request_id,
      })
      break
    case 'offer':
      result = await db.rpc('set_trade_offer', {
        target_campaign,
        target_trade: z.uuid().parse(action.tradeId),
        acting_character: z.uuid().parse(action.acting),
        expected_revision: action.revision,
        offer_items: z
          .array(z.object({ item_id: z.uuid(), quantity: z.number().int().min(1) }))
          .max(8)
          .parse(action.items),
        offer_gold: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(action.gold),
        request_id,
      })
      break
    case 'confirm':
      result = await db.rpc('confirm_trade', {
        target_campaign,
        target_trade: z.uuid().parse(action.tradeId),
        acting_character: z.uuid().parse(action.acting),
        expected_revision: action.revision,
        request_id,
      })
      break
    case 'cancel':
      result = await db.rpc('cancel_trade', {
        target_campaign,
        target_trade: z.uuid().parse(action.tradeId),
        acting_character: z.uuid().parse(action.acting),
      })
      break
  }
  if (result.error) throw new Error(tradeErrorCode(result.error.message))
  return resultSchema.parse(result.data)
}

/**
 * Realtime invalidation: any change to a trade of this campaign that RLS lets the viewer see.
 * Polling stays on as the fallback, so a failed socket only slows updates down.
 */
export function subscribeTrades(campaignId: string, onChange: () => void) {
  let stop: (() => void) | undefined
  let cancelled = false
  void (async () => {
    try {
      const db = await client()
      const { activeSchema } = await import('@/shared/api/supabase')
      const campaign = z.uuid().parse(campaignId)
      const channel = db
        .channel(`trades:${campaign}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: activeSchema(),
            table: 'trades',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => onChange(),
        )
        .subscribe()
      stop = () => void db.removeChannel(channel)
      if (cancelled) stop()
    } catch {
      /* Polling covers an unavailable realtime connection. */
    }
  })()
  return () => {
    cancelled = true
    stop?.()
  }
}
