import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { gpAmount } from '@/shared/lib/money'
import { newRequestId } from '@/shared/lib/request-id'
import { uploadBytes, uploadExtension, uploadTypes } from '@/shared/lib/image-encode'
import { addListingsResultSchema } from '../domain/stocking'
import {
  listingDraftSchema,
  orderResultSchema,
  orderSchema,
  shopAdminSchema,
  shopDraftSchema,
  storefrontSchema,
  type ShopActionResult,
  shopError,
  type ShopAction,
} from '../domain/shops'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const id = z.uuid()
const quantity = z.number().int().min(1).max(999)
const money = gpAmount.pipe(z.number().max(100_000_000))
const offer = money.nullable()
const note = z.string().trim().max(500)

export async function getStorefront(campaignId: string, characterId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_storefront', {
      target_campaign: id.parse(campaignId),
      target_character: id.parse(characterId),
    })
    .abortSignal(signal)
  if (error) throw shopError(error.message, error.details)
  return storefrontSchema.parse(data)
}
export async function getShopAdmin(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_shop_admin', { target_campaign: id.parse(campaignId) })
    .abortSignal(signal)
  if (error) throw shopError(error.message, error.details)
  return shopAdminSchema.parse(data)
}
export async function listOrders(
  campaignId: string,
  characterId: string | null,
  signal: AbortSignal,
) {
  const { data, error } = await (
    await client()
  )
    .rpc('list_shop_orders', {
      target_campaign: id.parse(campaignId),
      target_character: characterId === null ? null : id.parse(characterId),
    })
    .abortSignal(signal)
  if (error) throw shopError(error.message, error.details)
  return orderSchema.array().parse(data)
}

export async function changeShop(
  campaignId: string,
  action: ShopAction,
): Promise<ShopActionResult> {
  const db = await client()
  const target_campaign = id.parse(campaignId)
  let result: { data: unknown; error: { message: string; details?: string | null } | null }
  switch (action.kind) {
    case 'saveShop':
      result = await db.rpc('save_shop', {
        target_campaign,
        target_shop: action.shopId === null ? null : id.parse(action.shopId),
        expected_revision: action.revision,
        definition: shopDraftSchema.parse(action.draft),
        request_id: id.parse(action.requestId),
      })
      break
    case 'archiveShop':
      result = await db.rpc('archive_shop', {
        target_campaign,
        target_shop: id.parse(action.shopId),
      })
      break
    case 'saveListing':
      result = await db.rpc('save_listing', {
        target_campaign,
        target_shop: id.parse(action.shopId),
        target_listing: action.listingId === null ? null : id.parse(action.listingId),
        expected_revision: action.revision,
        definition: listingDraftSchema.parse(action.draft),
        request_id: id.parse(action.requestId),
      })
      break
    case 'archiveListing':
      result = await db.rpc('archive_listing', {
        target_campaign,
        target_listing: id.parse(action.listingId),
      })
      break
    case 'modifier':
      result = await db.rpc('set_shop_modifier', {
        target_campaign,
        target_shop: id.parse(action.shopId),
        target_character: id.parse(action.characterId),
        new_percent: z.number().int().min(-100).max(100).parse(action.percent),
      })
      break
    case 'checkout':
      result = await db.rpc('checkout', {
        target_campaign,
        target_shop: id.parse(action.shopId),
        target_character: id.parse(action.characterId),
        order_lines: action.lines.map((line) => ({
          listing_id: id.parse(line.listingId),
          quantity: quantity.parse(line.quantity),
          offered_price: offer.parse(line.offeredPrice),
        })),
        note: note.parse(action.note),
        request_id: id.parse(action.requestId),
      })
      break
    case 'sell':
      result = await db.rpc('sell_to_shop', {
        target_campaign,
        target_shop: id.parse(action.shopId),
        target_character: id.parse(action.characterId),
        order_lines: action.lines.map((line) => ({
          definition_id: id.parse(line.definitionId),
          quantity: quantity.parse(line.quantity),
          offered_price: offer.parse(line.offeredPrice),
        })),
        note: note.parse(action.note),
        request_id: id.parse(action.requestId),
      })
      break
    case 'respond':
      result = await db.rpc('respond_order', {
        target_campaign,
        target_order: id.parse(action.orderId),
        decision: action.decision,
        line_prices: action.prices.map((p) => ({
          line_id: id.parse(p.lineId),
          price: money.parse(p.price),
        })),
        note: note.parse(action.note),
        request_id: id.parse(action.requestId),
      })
      break
    case 'answer':
      result = await db.rpc('answer_counter_offer', {
        target_campaign,
        target_order: id.parse(action.orderId),
        accept: action.accept,
        request_id: id.parse(action.requestId),
      })
      break
    case 'cancel':
      result = await db.rpc('cancel_order', {
        target_campaign,
        target_order: id.parse(action.orderId),
      })
      break
    case 'revert':
      result = await db.rpc('revert_order', {
        target_campaign,
        target_order: id.parse(action.orderId),
        note: note.parse(action.note),
        request_id: id.parse(action.requestId),
      })
      break
  }
  if (result.error) throw shopError(result.error.message, result.error.details)
  const parsed = orderResultSchema.safeParse(result.data)
  const created = id.safeParse(result.data)
  return { order: parsed.success ? parsed.data : null, id: created.success ? created.data : null }
}

// RYT-107: listing imported catalogue items, and the shop image (private shop-images bucket).

/** DM only: list definitions at once (atomic); definitions the shop already lists are skipped. */
export async function addListings(
  campaignId: string,
  shopId: string,
  items: { definition_id: string; price: number }[],
  requestId: string,
) {
  const { data, error } = await (
    await client()
  ).rpc('add_listings', {
    target_campaign: id.parse(campaignId),
    target_shop: id.parse(shopId),
    items: items.map((item) => ({
      definition_id: id.parse(item.definition_id),
      price: money.parse(item.price),
      stock: null,
    })),
    request_id: id.parse(requestId),
  })
  if (error) throw shopError(error.message, error.details)
  return addListingsResultSchema.parse(data)
}

const bucket = 'shop-images'

/** A five-minute address; a path from the other environment (a PRE copy) is never read. */
export async function shopImageUrl(path: string) {
  const { activeSchema } = await import('@/shared/api/supabase')
  if (!path.startsWith(`${activeSchema()}/`)) throw new Error('unavailable')
  const db = await client()
  const result = await db.storage.from(bucket).createSignedUrl(path, 300)
  if (result.error) throw result.error
  return z.url().parse(result.data.signedUrl)
}

export async function uploadShopImage(campaignId: string, shopId: string, image: Blob) {
  if (!(uploadTypes as readonly string[]).includes(image.type) || image.size > uploadBytes)
    throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const path = `${activeSchema()}/${id.parse(campaignId)}/${id.parse(shopId)}/${newRequestId()}.${uploadExtension(image.type)}`
  const result = await db.storage.from(bucket).upload(path, image, { contentType: image.type })
  if (result.error) throw new Error('unavailable')
  return path
}

const imageResultSchema = z.object({
  id: z.uuid(),
  image_path: z.string().nullable(),
  revision: z.number().int().min(0),
})

/** Attach (or clear with null) an uploaded object; revision-checked and idempotent. */
export async function attachShopImage(
  campaignId: string,
  shopId: string,
  revision: number,
  path: string | null,
  requestId: string,
) {
  const { data, error } = await (
    await client()
  ).rpc('set_shop_image', {
    target_campaign: id.parse(campaignId),
    target_shop: id.parse(shopId),
    expected_revision: revision,
    new_path: path,
    request_id: id.parse(requestId),
  })
  if (error) throw shopError(error.message, error.details)
  return imageResultSchema.parse(data)
}

/** Remove an upload that never got attached (objects are immutable; attached ones stay). */
export async function discardShopUpload(path: string) {
  const db = await client()
  const result = await db.storage.from(bucket).remove([path])
  if (result.error) throw result.error
}
