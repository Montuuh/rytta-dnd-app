import { z } from 'zod'
import { rarities } from '@/features/inventory'

/** Offer slots per side; the RPC rejects more. */
export const tradeSlots = 8
export const tradeStatuses = [
  'invited',
  'open',
  'completed',
  'cancelled',
  'declined',
  'expired',
] as const
export type TradeStatus = (typeof tradeStatuses)[number]

const gold = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const tradeItemSchema = z.object({
  item_id: z.uuid(),
  definition_id: z.uuid(),
  name: z.string(),
  icon: z.string(),
  rarity: z.enum(rarities),
  category: z.string(),
  quantity: z.number().int().min(1),
})
export type TradeItem = z.infer<typeof tradeItemSchema>

const sideSchema = z.object({
  character_id: z.uuid(),
  name: z.string(),
  gold,
  confirmed: z.boolean(),
  items: z.array(tradeItemSchema).max(tradeSlots),
})
export type TradeSide = z.infer<typeof sideSchema>

export const tradeSchema = z.object({
  id: z.uuid(),
  status: z.enum(tradeStatuses),
  revision: z.number().int().min(0),
  initiated_by_you: z.boolean(),
  expires_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  you: sideSchema,
  partner: sideSchema,
})
export type Trade = z.infer<typeof tradeSchema>

const summarySideSchema = z.object({
  name: z.string().optional(),
  gold,
  items: z.array(
    z.object({
      name: z.string(),
      icon: z.string(),
      rarity: z.enum(rarities),
      quantity: z.number().int().min(1),
    }),
  ),
})
export type TradeSummarySide = z.infer<typeof summarySideSchema>

export const tradeStateSchema = z.object({
  character: z.object({ id: z.uuid(), name: z.string(), gold: gold.nullable() }).nullable(),
  partners: z.array(z.object({ id: z.uuid(), name: z.string(), busy: z.boolean() })),
  items: z.array(tradeItemSchema),
  trade: tradeSchema.nullable(),
  recent: tradeSchema
    .extend({
      closed_by_you: z.boolean(),
      summary: z.object({ initiator: summarySideSchema, partner: summarySideSchema }).nullable(),
    })
    .nullable(),
  history: z.array(
    z.object({
      id: z.uuid(),
      completed_at: z.iso.datetime({ offset: true }),
      partner: z.string(),
      gave: summarySideSchema,
      received: summarySideSchema,
    }),
  ),
})
export type TradeState = z.infer<typeof tradeStateSchema>
export type TradeHistoryEntry = TradeState['history'][number]
export type RecentTrade = NonNullable<TradeState['recent']>

export type OfferLine = { item_id: string; quantity: number }
export type TradeAction =
  | { kind: 'invite'; from: string; to: string }
  | { kind: 'respond'; tradeId: string; accept: boolean }
  | {
      kind: 'offer'
      tradeId: string
      acting: string
      revision: number
      items: OfferLine[]
      gold: number
    }
  | { kind: 'confirm'; tradeId: string; acting: string; revision: number }
  | { kind: 'cancel'; tradeId: string; acting: string }

export const tradeErrorCodes = [
  'stale',
  'gold',
  'quantity',
  'equipped',
  'item',
  'busy',
  'partnerBusy',
  'closed',
  'empty',
  'character',
  'forbidden',
  'unavailable',
] as const
export type TradeErrorCode = (typeof tradeErrorCodes)[number]
export function tradeErrorCode(message: string): TradeErrorCode {
  const table: [string, TradeErrorCode][] = [
    ['Stale revision', 'stale'],
    ['Insufficient gold', 'gold'],
    ['Insufficient quantity', 'quantity'],
    ['Item equipped', 'equipped'],
    ['Item unavailable', 'item'],
    ['Partner busy', 'partnerBusy'],
    ['Trade busy', 'busy'],
    ['Trade closed', 'closed'],
    ['Empty trade', 'empty'],
    ['Character unavailable', 'character'],
    ['Forbidden', 'forbidden'],
  ]
  if ((tradeErrorCodes as readonly string[]).includes(message)) return message as TradeErrorCode
  return table.find(([needle]) => message.includes(needle))?.[1] ?? 'unavailable'
}

/** Milliseconds until the trade or invitation lapses, never negative. */
export const remainingMs = (expiresAt: string, now: number) =>
  Math.max(0, new Date(expiresAt).getTime() - now)
export const formatCountdown = (ms: number) => {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** The current offer lines of a side, in the shape set_trade_offer expects. */
export const offerLines = (side: TradeSide): OfferLine[] =>
  side.items.map(({ item_id, quantity }) => ({ item_id, quantity }))

/** Adds, changes (quantity > 0) or removes (quantity 0) one stack in an offer. */
export function withLine(lines: OfferLine[], itemId: string, quantity: number): OfferLine[] {
  const rest = lines.filter((line) => line.item_id !== itemId)
  if (quantity <= 0) return rest
  const index = lines.findIndex((line) => line.item_id === itemId)
  const next = { item_id: itemId, quantity: Math.trunc(quantity) }
  if (index === -1) return rest.length >= tradeSlots ? lines : [...rest, next]
  return lines.map((line) => (line.item_id === itemId ? next : line))
}

export const sameOffer = (a: OfferLine[], b: OfferLine[]) =>
  a.length === b.length &&
  a.every((line) => b.some((o) => o.item_id === line.item_id && o.quantity === line.quantity))

/** Polling cadence: fast while a trade or invitation is live, slow while idle. */
export const pollInterval = (state: TradeState | undefined) => (state?.trade ? 3_000 : 10_000)
