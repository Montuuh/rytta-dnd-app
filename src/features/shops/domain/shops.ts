import { z } from 'zod'
import {
  itemCategories,
  itemPropertiesSchema,
  rarities,
  slotKinds,
  type ItemCategory,
} from '@/features/inventory'
import { gpAmount } from '@/shared/lib/money'
import { translationsSchema } from '@/shared/lib/translations'

/** RYT-104: gp with two decimals (0.01 gp is a copper piece), as the server sends it. */
const amount = z.coerce.number().pipe(gpAmount)
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
/** Shop archetype key (free text on the server, 1..40). */
const shopKind = z.string().max(40).nullable().optional()
const shopImage = z.string().max(300).nullable().optional()
export const shopModes = ['auto', 'approval'] as const
export const shopVisibilities = ['hidden', 'party', 'selected'] as const
export const listingVisibilities = ['shop', 'hidden', 'selected'] as const
export type ShopMode = (typeof shopModes)[number]
export type ShopVisibility = (typeof shopVisibilities)[number]
export type ListingVisibility = (typeof listingVisibilities)[number]

/** What a Player may know about an RYT-004 item definition: never the DM value. */
export const shopItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  category: z.enum(itemCategories),
  image_path: z.string().nullable().optional(),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
  rarity: z.enum(rarities),
  weight_tenths: z.number().int().min(0).max(100000).optional(),
  /** Weight of one unit in lb (three decimals); the source of truth over weight_tenths. */
  weight_lb: z.coerce.number().min(0).max(10000).optional(),
  description: z.string().max(2000),
  translations: translationsSchema.optional(),
  slot_kind: z.enum(slotKinds),
  properties: itemPropertiesSchema.catch({}),
})
export type ShopItem = z.infer<typeof shopItemSchema>

export const listingSchema = z.object({
  id: z.uuid(),
  price: amount,
  unit_price: amount,
  stock: z.number().int().min(0).nullable(),
  exclusive: z.boolean(),
  item: shopItemSchema,
})
export type Listing = z.infer<typeof listingSchema>

export const storefrontShopSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  kind: shopKind,
  image_path: shopImage,
  mode: z.enum(shopModes),
  is_open: z.boolean(),
  resale_percent: z.number().int().min(0).max(100),
  modifier: z.number().int().min(-100).max(100),
  buyback: z.record(z.string(), amount),
  listings: listingSchema.array(),
})
export type StorefrontShop = z.infer<typeof storefrontShopSchema>
export const storefrontSchema = z.object({
  character_id: z.uuid(),
  gold: amount,
  shops: storefrontShopSchema.array(),
})
export type Storefront = z.infer<typeof storefrontSchema>

export const adminItemSchema = shopItemSchema.extend({
  value_gp: amount.nullable(),
  // A Player-made item enters the economy once the DM priced it (RYT-105).
  origin: z.enum(['dm', 'srd', 'player']),
  basic_key: z.string().max(80).nullable().optional(),
  is_template: z.boolean().optional(),
})
export type AdminItem = z.infer<typeof adminItemSchema>
export const adminListingSchema = z.object({
  id: z.uuid(),
  definition_id: z.uuid(),
  price: amount,
  stock: z.number().int().min(0).nullable(),
  visibility: z.enum(listingVisibilities),
  revision,
  access: z.uuid().array(),
})
export type AdminListing = z.infer<typeof adminListingSchema>
export const adminShopSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  kind: shopKind,
  image_path: shopImage,
  visibility: z.enum(shopVisibilities),
  mode: z.enum(shopModes),
  resale_percent: z.number().int().min(0).max(100),
  is_open: z.boolean(),
  revision,
  access: z.uuid().array(),
  modifiers: z.object({ character_id: z.uuid(), percent: z.number().int() }).array(),
  listings: adminListingSchema.array(),
})
export type AdminShop = z.infer<typeof adminShopSchema>
export const shopAdminSchema = z.object({
  characters: z.object({ id: z.uuid(), name: z.string(), gold: amount.nullable() }).array(),
  items: adminItemSchema.array(),
  shops: adminShopSchema.array(),
  pending_orders: z.number().int().min(0),
})
export type ShopAdmin = z.infer<typeof shopAdminSchema>

export const orderStatuses = [
  'pending',
  'countered',
  'completed',
  'rejected',
  'cancelled',
  'reverted',
] as const
export type OrderStatus = (typeof orderStatuses)[number]
const price = amount.nullable()
export const orderLineSchema = z.object({
  id: z.uuid(),
  definition_id: z.uuid(),
  item_name: z.string(),
  translations: translationsSchema.optional(),
  icon: z.string(),
  quantity: z.number().int().min(1),
  unit_price: amount,
  offered_price: price,
  countered_price: price,
  final_price: price,
  reverted_quantity: z.number().int().min(0),
})
export type OrderLine = z.infer<typeof orderLineSchema>
export const orderSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['purchase', 'sale']),
  status: z.enum(orderStatuses),
  total: amount,
  refunded: amount,
  player_note: z.string(),
  dm_note: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  shop: z.object({ id: z.uuid(), name: z.string(), mode: z.enum(shopModes), kind: shopKind }),
  character: z.object({ id: z.uuid(), name: z.string() }),
  lines: orderLineSchema.array(),
})
export type Order = z.infer<typeof orderSchema>
export const orderResultSchema = z.object({
  order_id: z.uuid(),
  status: z.enum(orderStatuses),
  total: amount,
  refunded: amount,
  gold: amount.nullable(),
})
export type OrderResult = z.infer<typeof orderResultSchema>
/** Order outcome for commerce actions, or the saved id for shop/listing upserts. */
export type ShopActionResult = { order: OrderResult | null; id: string | null }

export const shopDraftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000),
  visibility: z.enum(shopVisibilities),
  mode: z.enum(shopModes),
  resale_percent: z.number().int().min(0).max(100),
  is_open: z.boolean(),
  access: z.uuid().array().max(50),
  /** Shop type key; an empty string clears it and a missing key keeps the saved one. */
  kind: z.string().trim().max(40).optional(),
})
export type ShopDraft = z.infer<typeof shopDraftSchema>

/** The full save payload for a shop, so inline controls can change one field at a time. */
export const draftOf = (shop: AdminShop): ShopDraft => ({
  name: shop.name,
  description: shop.description,
  visibility: shop.visibility,
  mode: shop.mode,
  resale_percent: shop.resale_percent,
  is_open: shop.is_open,
  access: shop.access,
})

export const listingDraftSchema = z.object({
  definition_id: z.uuid(),
  price: gpAmount.pipe(z.number().max(100_000_000)),
  stock: z.number().int().min(0).max(9999).nullable(),
  visibility: z.enum(listingVisibilities),
  access: z.uuid().array().max(50),
})
export type ListingDraft = z.infer<typeof listingDraftSchema>

export type CartLine = { listingId: string; quantity: number; offeredPrice: number | null }
export type SaleLine = { definitionId: string; quantity: number; offeredPrice: number | null }

/** Money adds up in copper so decimal gold never drifts (0.1 + 0.2 stays 0.3). */
export const toCents = (gp: number) => Math.round(gp * 100)

/**
 * A modified price as the server computes it: integer copper, rounded half up
 * (1.13 gp at +50 % is 1.70 gp). What a Player pays is still the server's own price.
 */
export const modifiedPrice = (base: number, percent: number) =>
  Math.max(0, Math.floor((toCents(base) * (100 + percent) + 50) / 100) / 100)
export const sumGp = (amounts: number[]) =>
  amounts.reduce((sum, value) => sum + toCents(value), 0) / 100
/** Price of a line: unit price times quantity, in exact cents. */
export const lineGp = (unit: number, quantity: number) => (toCents(unit) * quantity) / 100

/** Weight of one unit in lb: weight_lb when the server sent it, else the legacy tenths. */
export const itemPounds = (item: Pick<ShopItem, 'weight_lb' | 'weight_tenths'>) =>
  item.weight_lb ?? (item.weight_tenths ?? 0) / 10

export const maxPurchasable = (listing: Pick<Listing, 'stock'>) =>
  Math.min(999, listing.stock ?? 999)

/** What the cart will cost: the list price, or the Player's offer in approval shops. */
export function cartTotal(lines: CartLine[], listings: Listing[], mode: ShopMode) {
  const cents = lines.reduce((sum, line) => {
    const listing = listings.find((l) => l.id === line.listingId)
    if (!listing) return sum
    const each =
      mode === 'approval' && line.offeredPrice !== null ? line.offeredPrice : listing.unit_price
    return sum + toCents(each) * line.quantity
  }, 0)
  return cents / 100
}

/** Added weight in lb. */
export function cartPounds(lines: CartLine[], listings: Listing[]) {
  const thousandths = lines.reduce((sum, line) => {
    const listing = listings.find((l) => l.id === line.listingId)
    return sum + (listing ? Math.round(itemPounds(listing.item) * 1000) * line.quantity : 0)
  }, 0)
  return thousandths / 1000
}

/** Drop lines whose listing vanished and clamp quantities to the current stock. */
export function reconcileCart(lines: CartLine[], listings: Listing[]) {
  return lines.flatMap((line) => {
    const listing = listings.find((l) => l.id === line.listingId)
    if (!listing || maxPurchasable(listing) === 0) return []
    return [{ ...line, quantity: Math.min(line.quantity, maxPurchasable(listing)) }]
  })
}

export const effectiveLinePrice = (line: OrderLine) =>
  line.final_price ?? line.countered_price ?? line.offered_price ?? line.unit_price

export const isOpenOrder = (order: Pick<Order, 'status'>) =>
  order.status === 'pending' || order.status === 'countered'

/**
 * How the ledger draws an order: a purchase (the character pays), a sale (the character is
 * paid) or a live counter-offer from the DM waiting on the Player.
 */
export type OrderVariant = 'purchase' | 'sale' | 'counter'
export const orderVariant = (order: Pick<Order, 'kind' | 'status'>): OrderVariant =>
  order.status === 'countered' ? 'counter' : order.kind

/** A counter-offer the Player turned down closes as "cancelled" but keeps the DM's price. */
export const counterDeclined = (order: Pick<Order, 'status' | 'lines'>) =>
  order.status === 'cancelled' && order.lines.some((line) => line.countered_price !== null)

/** What the Player asked for before the DM countered: their offer, or the list price. */
export const askedLinePrice = (line: OrderLine) => line.offered_price ?? line.unit_price
export const askedTotal = (order: Pick<Order, 'lines'>) =>
  order.lines.reduce((sum, line) => sum + toCents(askedLinePrice(line)) * line.quantity, 0) / 100

/** Search matches the shown (localized) name and the original one. */
export function matchesName(
  item: { name: string; translations?: ShopItem['translations'] },
  needle: string,
) {
  if (!needle) return true
  const names = [item.name, item.translations?.en?.name, item.translations?.es?.name]
  return names.some((name) => name?.toLocaleLowerCase().includes(needle))
}

export function filterListings(
  listings: Listing[],
  search: string,
  category: ItemCategory | 'all',
) {
  const needle = search.trim().toLocaleLowerCase()
  return listings.filter(
    (listing) =>
      (category === 'all' || listing.item.category === category) &&
      matchesName(listing.item, needle),
  )
}

/** Units a character holds of an item, and how many of them are equipped. */
export function ownership(
  stacks: { definition_id: string; quantity: number; equipped_slot: string | null }[],
  definitionId: string,
) {
  let owned = 0
  let equipped = 0
  for (const stack of stacks)
    if (stack.definition_id === definitionId) {
      owned += stack.quantity
      if (stack.equipped_slot) equipped += stack.quantity
    }
  return { owned, equipped }
}

/** Sellable units: loose stacks the DM or a shop provided (ADR 014: player items never mint gold). */
export function sellableUnits(
  stacks: {
    definition_id: string
    quantity: number
    equipped_slot: string | null
    source: string
  }[],
) {
  const units = new Map<string, number>()
  for (const stack of stacks)
    if (!stack.equipped_slot && (stack.source === 'dm' || stack.source === 'shop'))
      units.set(stack.definition_id, (units.get(stack.definition_id) ?? 0) + stack.quantity)
  return units
}

/** Stable error codes from the shop RPCs, for actionable messages. */
export const shopErrorCodes = [
  'stale',
  'insufficient_gold',
  'out_of_stock',
  'unavailable_listing',
  'unavailable_shop',
  'shop_closed',
  'shop_not_buying',
  'insufficient_items',
  'invalid_state',
  'open_orders',
  'forbidden',
  /** The server does not take cent amounts yet (its release migration is not applied). */
  'cents',
  'unavailable',
] as const
export type ShopErrorCode = (typeof shopErrorCodes)[number]
const messageCodes: [string, ShopErrorCode][] = [
  ['Stale revision', 'stale'],
  ['Insufficient gold', 'insufficient_gold'],
  ['Out of stock', 'out_of_stock'],
  ['Unavailable listing', 'unavailable_listing'],
  ['Unavailable shop', 'unavailable_shop'],
  ['Shop closed', 'shop_closed'],
  ['Shop does not buy', 'shop_not_buying'],
  ['Insufficient items', 'insufficient_items'],
  ['Invalid state', 'invalid_state'],
  ['Open orders', 'open_orders'],
  ['Forbidden', 'forbidden'],
]
export class ShopError extends Error {
  readonly code: ShopErrorCode
  constructor(code: ShopErrorCode) {
    super(code)
    this.code = code
  }
}
export function shopError(message: string | undefined, details?: string | null) {
  if (message && /Invalid (request|item)/.test(message) && details === 'amount')
    return new ShopError('cents')
  const match = messageCodes.find(([text]) => message?.includes(text))
  return new ShopError(match?.[1] ?? 'unavailable')
}

export type ShopAction =
  | {
      kind: 'saveShop'
      shopId: string | null
      revision: number | null
      draft: ShopDraft
      requestId: string
    }
  | { kind: 'archiveShop'; shopId: string }
  | {
      kind: 'saveListing'
      shopId: string
      listingId: string | null
      revision: number | null
      draft: ListingDraft
      requestId: string
    }
  | { kind: 'archiveListing'; listingId: string }
  | { kind: 'modifier'; shopId: string; characterId: string; percent: number }
  | {
      kind: 'checkout'
      shopId: string
      characterId: string
      lines: CartLine[]
      note: string
      requestId: string
    }
  | {
      kind: 'sell'
      shopId: string
      characterId: string
      lines: SaleLine[]
      note: string
      requestId: string
    }
  | {
      kind: 'respond'
      orderId: string
      decision: 'approve' | 'reject' | 'counter'
      prices: { lineId: string; price: number }[]
      note: string
      requestId: string
    }
  | { kind: 'answer'; orderId: string; accept: boolean; requestId: string }
  | { kind: 'cancel'; orderId: string }
  | { kind: 'revert'; orderId: string; note: string; requestId: string }
