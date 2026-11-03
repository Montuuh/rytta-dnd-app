import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  actionResultSchema,
  definitionSchema,
  eventSchema,
  stackSchema,
  type InventoryAction,
} from '../domain/item'
import { newRequestId } from '@/shared/lib/request-id'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

const definitionColumns =
  'id, campaign_id, name, category, icon, rarity, weight_tenths, value_gp, description, slot_kind, properties, origin, archived, created_by, revision, image_path'
const stackColumns =
  'id, campaign_id, character_id, definition_id, quantity, equipped_slot, source, notes, revision'
const eventColumns =
  'id, character_id, item_id, actor_id, kind, quantity_delta, after_value, undo_of, undone_by, created_at'

// Only what equipment math needs from the sheet; the characters feature owns the rest.
const holderSchema = z.object({
  armor_class: z.number().int().optional(),
  level: z.number().int().min(1).max(20),
  portrait_path: z.string().nullable(),
  str: z.coerce.number().int().nullable(),
  dex: z.coerce.number().int().nullable(),
  str_bonus: z.coerce.number().int().nullable(),
  dex_bonus: z.coerce.number().int().nullable(),
})
export type Holder = {
  armorClass?: number
  level: number
  portraitPath: string | null
  str: number
  dex: number
}

export async function loadInventory(campaignId: string, characterId: string, signal: AbortSignal) {
  const db = await client()
  const campaign = z.uuid().parse(campaignId)
  const character = z.uuid().parse(characterId)
  const [stacks, definitions, events, holder] = await Promise.all([
    db
      .from('inventory_items')
      .select(stackColumns)
      .eq('campaign_id', campaign)
      .eq('character_id', character)
      .gt('quantity', 0)
      .order('created_at')
      .abortSignal(signal),
    db
      .from('item_definitions')
      .select(definitionColumns)
      .eq('campaign_id', campaign)
      .order('name')
      .abortSignal(signal),
    db
      .from('inventory_events')
      .select(eventColumns)
      .eq('campaign_id', campaign)
      .eq('character_id', character)
      .order('created_at', { ascending: false })
      .limit(40)
      .abortSignal(signal),
    db
      .from('character_sheets')
      .select(
        'level, armor_class, portrait_path, str:build->baseAbilities->>str, dex:build->baseAbilities->>dex, str_bonus:build->bonuses->>str, dex_bonus:build->bonuses->>dex',
      )
      .eq('campaign_id', campaign)
      .eq('character_id', character)
      .abortSignal(signal)
      .maybeSingle(),
  ])
  for (const r of [stacks, definitions, events, holder]) if (r.error) throw r.error
  if (!holder.data) return null
  const h = holderSchema.parse(holder.data)
  return {
    stacks: stackSchema.array().parse(stacks.data),
    definitions: definitionSchema.array().parse(definitions.data),
    events: eventSchema.array().parse(events.data),
    holder: {
      armorClass: h.armor_class,
      level: h.level,
      portraitPath: h.portrait_path,
      str: Math.min(30, (h.str ?? 10) + (h.str_bonus ?? 0)),
      dex: Math.min(30, (h.dex ?? 10) + (h.dex_bonus ?? 0)),
    } satisfies Holder,
  }
}

const errorCode = (message: string) =>
  [
    ['Stale revision', 'stale'],
    ['Undo conflict', 'conflict'],
    ['Slot occupied', 'occupied'],
    ['Insufficient', 'insufficient'],
    ['Forbidden', 'forbidden'],
  ].find(([needle]) => message.includes(needle!))?.[1] ?? 'unavailable'

export async function changeInventory(campaignId: string, action: InventoryAction) {
  const db = await client()
  const target_campaign = z.uuid().parse(campaignId)
  const request_id = 'requestId' in action ? (action.requestId ?? newRequestId()) : newRequestId()
  let result
  switch (action.kind) {
    case 'define':
      result = await db.rpc('save_item_definition', {
        target_campaign,
        target_definition: action.definitionId,
        expected_revision: action.expectedRevision,
        item: action.draft,
        request_id,
      })
      break
    case 'grant':
      result = await db.rpc('grant_item', {
        target_campaign,
        target_character: z.uuid().parse(action.characterId),
        target_definition: z.uuid().parse(action.definitionId),
        amount: z.number().int().min(1).max(1000).parse(action.amount),
        request_id,
      })
      break
    case 'use':
    case 'remove':
      result = await db.rpc(action.kind === 'use' ? 'use_item' : 'remove_item', {
        target_campaign,
        target_item: z.uuid().parse(action.itemId),
        expected_revision: action.expectedRevision,
        amount: z.number().int().min(1).parse(action.amount),
        request_id,
      })
      break
    case 'equip':
      result = await db.rpc('equip_item', {
        target_campaign,
        target_item: z.uuid().parse(action.itemId),
        expected_revision: action.expectedRevision,
        target_slot: action.slot,
        request_id,
      })
      break
    case 'unequip':
      result = await db.rpc('unequip_item', {
        target_campaign,
        target_item: z.uuid().parse(action.itemId),
        expected_revision: action.expectedRevision,
        request_id,
      })
      break
    case 'undo':
      result = await db.rpc('undo_inventory_event', {
        target_campaign,
        target_event: z.uuid().parse(action.eventId),
        request_id,
      })
      break
  }
  if (result.error) throw new Error(errorCode(result.error.message))
  return action.kind === 'define'
    ? { definitionId: z.object({ id: z.uuid() }).parse(result.data).id }
    : actionResultSchema.parse(result.data)
}

const portraitTypes = ['image/webp', 'image/png', 'image/jpeg']
const bucket = 'character-portraits'
export async function uploadPortrait(campaignId: string, characterId: string, image: Blob) {
  if (!portraitTypes.includes(image.type) || image.size > 1_048_576) throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const extension = image.type === 'image/jpeg' ? 'jpg' : image.type.split('/')[1]
  const path = `${activeSchema()}/${z.uuid().parse(campaignId)}/${z.uuid().parse(characterId)}/${newRequestId()}.${extension}`
  const upload = await db.storage.from(bucket).upload(path, image, { contentType: image.type })
  if (upload.error) throw new Error('unavailable')
  const saved = await db.rpc('set_character_portrait', {
    target_campaign: campaignId,
    target_character: characterId,
    new_path: path,
  })
  if (saved.error) throw new Error(errorCode(saved.error.message))
  return path
}
export async function portraitUrl(path: string) {
  const db = await client()
  const signed = await db.storage.from(bucket).createSignedUrl(path, 3600)
  if (signed.error) throw signed.error
  return z.url().parse(signed.data.signedUrl)
}

const rosterSchema = z.object({ id: z.uuid(), name: z.string(), user_id: z.uuid().nullable() })
export async function listRoster(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const campaign = z.uuid().parse(campaignId)
  const [characters, sheets] = await Promise.all([
    db
      .from('characters')
      .select('id, name, user_id')
      .eq('campaign_id', campaign)
      // RYT-044: benched characters stay out of campaign lists.
      .eq('is_active', true)
      .order('created_at')
      .abortSignal(signal),
    db
      .from('character_sheets')
      .select('character_id, portrait_path')
      .eq('campaign_id', campaign)
      .abortSignal(signal),
  ])
  if (characters.error) throw characters.error
  if (sheets.error) throw sheets.error
  const portraits = new Map(
    z
      .object({ character_id: z.uuid(), portrait_path: z.string().nullable() })
      .array()
      .parse(sheets.data)
      .map((row) => [row.character_id, row.portrait_path]),
  )
  return rosterSchema
    .array()
    .parse(characters.data)
    .map((row) => ({ ...row, portraitPath: portraits.get(row.id) ?? null }))
}

export async function loadCatalogue(campaignId: string, signal?: AbortSignal) {
  const db = await client()
  let query = db
    .from('item_definitions')
    .select(definitionColumns)
    .eq('campaign_id', z.uuid().parse(campaignId))
    .order('name')
  if (signal) query = query.abortSignal(signal)
  const result = await query
  if (result.error) throw result.error
  return definitionSchema.array().parse(result.data)
}

export async function itemImageUrl(path: string) {
  const { activeSchema } = await import('@/shared/api/supabase')
  if (!path.startsWith(`${activeSchema()}/`)) throw new Error('unavailable')
  const db = await client()
  const result = await db.storage.from('item-images').createSignedUrl(path, 300)
  if (result.error) throw result.error
  return z.url().parse(result.data.signedUrl)
}
export async function uploadItemImage(campaignId: string, definitionId: string, image: Blob) {
  if (image.type !== 'image/webp' || image.size > 1_048_576) throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const path = `${activeSchema()}/${z.uuid().parse(campaignId)}/${z.uuid().parse(definitionId)}/${newRequestId()}.webp`
  const result = await db.storage
    .from('item-images')
    .upload(path, image, { contentType: image.type })
  if (result.error) throw new Error('unavailable')
  return path
}
export async function attachItemImage(
  campaignId: string,
  definitionId: string,
  revision: number,
  path: string | null,
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('set_item_image', {
    target_campaign: campaignId,
    target_definition: definitionId,
    expected_revision: revision,
    new_path: path,
    request_id: requestId,
  })
  if (result.error) throw new Error(errorCode(result.error.message))
}
/** Only clean an unreferenced object, including after an ambiguous network outcome. */
export async function discardItemUpload(campaignId: string, path: string) {
  const definitions = await loadCatalogue(campaignId)
  if (definitions.some((item) => item.image_path === path)) return
  const db = await client()
  const result = await db.storage.from('item-images').remove([path])
  if (result.error) throw result.error
}

// RYT-032 item lifecycle: impact preview, soft delete and linked listing price sync (DM only).
const impactSchema = z.object({
  listings: z
    .object({
      id: z.uuid(),
      shop_id: z.uuid(),
      shop_name: z.string(),
      price: z.number().int().min(0),
      stock: z.number().int().nullable(),
      revision: z.number().int(),
    })
    .array(),
  holders: z.number().int().min(0),
  units: z.number().int().min(0),
  open_orders: z.number().int().min(0),
})
export type DefinitionImpact = z.infer<typeof impactSchema>
const lifecycleError = (message: string) =>
  message.includes('Open orders') ? 'openOrders' : errorCode(message)

export async function loadDefinitionImpact(
  campaignId: string,
  definitionId: string,
  signal?: AbortSignal,
) {
  const db = await client()
  let call = db.rpc('item_definition_impact', {
    target_campaign: z.uuid().parse(campaignId),
    target_definition: z.uuid().parse(definitionId),
  })
  if (signal) call = call.abortSignal(signal)
  const result = await call
  if (result.error) throw new Error(lifecycleError(result.error.message))
  return impactSchema.parse(result.data)
}
export async function archiveDefinition(
  campaignId: string,
  definitionId: string,
  revision: number,
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('archive_item_definition', {
    target_campaign: z.uuid().parse(campaignId),
    target_definition: z.uuid().parse(definitionId),
    expected_revision: z.number().int().min(0).parse(revision),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw new Error(lifecycleError(result.error.message))
  return z.object({ id: z.uuid(), archived_listings: z.number().int() }).parse(result.data)
}
export async function syncListingPrices(
  campaignId: string,
  definitionId: string,
  listingIds: string[],
  price: number,
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('sync_listing_prices', {
    target_campaign: z.uuid().parse(campaignId),
    target_definition: z.uuid().parse(definitionId),
    listing_ids: z.uuid().array().min(1).max(200).parse(listingIds),
    new_price: z.number().int().min(0).max(100_000_000).parse(price),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw new Error(lifecycleError(result.error.message))
  return z.object({ updated: z.number().int() }).parse(result.data)
}
