import { createBatchSigner } from '@/shared/api/batch-sign'
import { z } from 'zod'
import { ownsStoragePath } from '@/shared/api/storage-paths'
import { config } from '@/shared/lib/config'
import {
  actionResultSchema,
  definitionSchema,
  eventSchema,
  stackSchema,
  type InventoryAction,
} from '../domain/item'
import {
  importResultSchema,
  mergeResultSchema,
  proposalResultSchema,
  proposalSchema,
  searchItemSchema,
  templateResultSchema,
  type ImportItem,
} from '../domain/catalogue'
import type { Json } from '@/shared/api/database.generated'
import { gpAmount } from '@/shared/lib/money'
import { newRequestId } from '@/shared/lib/request-id'
import { uploadBytes, uploadExtension, uploadTypes } from '@/shared/lib/image-encode'
import { storageUploadError } from '@/shared/api/storage-errors'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

const definitionColumns =
  'id, campaign_id, name, category, icon, rarity, weight_tenths, weight_lb, description, translations, slot_kind, properties, origin, basic_key, is_template, archived, created_by, revision, image_path'
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
  class_key: z.string().nullable().optional(),
})
export type Holder = {
  armorClass?: number
  level: number
  portraitPath: string | null
  str: number
  dex: number
  monkLevel: number
}

const goldSchema = z.object({ gold: z.coerce.number().min(0) })
const gold = (row: unknown) => {
  const parsed = goldSchema.safeParse(row)
  return parsed.success ? parsed.data.gold : null
}

/**
 * RYT-156: item values come from a DM-only read (an empty object for anyone else), never from the
 * table select, so the column can be closed to Players. Each definition row gets its value here.
 */
const valuesSchema = z.record(z.string(), z.coerce.number().pipe(gpAmount))
async function withValues(
  db: Awaited<ReturnType<typeof client>>,
  campaign: string,
  rows: unknown[],
  signal?: AbortSignal,
) {
  let call = db.rpc('get_item_values', { target_campaign: campaign })
  if (signal) call = call.abortSignal(signal)
  const result = await call
  if (result.error) throw result.error
  const values = valuesSchema.parse(result.data ?? {})
  return (rows as { id: string }[]).map((row) => ({ ...row, value_gp: values[row.id] ?? null }))
}

export async function loadInventory(campaignId: string, characterId: string, signal: AbortSignal) {
  const db = await client()
  const campaign = z.uuid().parse(campaignId)
  const character = z.uuid().parse(characterId)
  const [stacks, definitions, events, holder, resources] = await Promise.all([
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
        'level, armor_class, portrait_path, str:build->baseAbilities->>str, dex:build->baseAbilities->>dex, str_bonus:build->bonuses->>str, dex_bonus:build->bonuses->>dex, class_key:build->>classKey',
      )
      .eq('campaign_id', campaign)
      .eq('character_id', character)
      .abortSignal(signal)
      .maybeSingle(),
    // RYT-125: the purse for the inventory header. A read that fails only hides the purse.
    db
      .from('character_resources')
      .select('gold')
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
    definitions: definitionSchema
      .array()
      .parse(await withValues(db, campaign, definitions.data ?? [], signal)),
    events: eventSchema.array().parse(events.data),
    gold: gold(resources.data),
    holder: {
      armorClass: h.armor_class,
      level: h.level,
      portraitPath: h.portrait_path,
      str: Math.min(30, (h.str ?? 10) + (h.str_bonus ?? 0)),
      dex: Math.min(30, (h.dex ?? 10) + (h.dex_bonus ?? 0)),
      monkLevel: h.class_key === 'monk' ? h.level : 0,
    } satisfies Holder,
  }
}

/**
 * A cent amount the server refuses because its release migration is not applied yet: the money
 * checks raise 'Invalid request' or 'Invalid item N' with detail 'amount'.
 */
export const refusesCents = (error: { message: string; details?: string | null }) =>
  /Invalid (request|item)/.test(error.message) && error.details === 'amount'

const errorCode = (message: string) =>
  [
    ['Stale revision', 'stale'],
    ['Undo conflict', 'conflict'],
    ['Slot occupied', 'occupied'],
    ['Insufficient', 'insufficient'],
    ['Forbidden', 'forbidden'],
    ['Open orders', 'openOrders'],
    ['Open trades', 'openTrades'],
    ['Too many proposals', 'tooMany'],
    ['Proposal closed', 'closed'],
    ['Proposal unavailable', 'closed'],
    ['Item unavailable', 'gone'],
    ['Character unavailable', 'gone'],
    ['Batch name in use', 'batchName'],
    ['Batch limit reached', 'batchLimit'],
  ].find(([needle]) => message.includes(needle!))?.[1] ?? 'unavailable'

/** The Error a failed RPC throws: its stable code as the message. */
const failure = (error: { message: string; details?: string | null }) =>
  new Error(refusesCents(error) ? 'cents' : errorCode(error.message))

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
        item: action.draft as unknown as Json,
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
  if (result.error) throw failure(result.error)
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
  if (upload.error) throw new Error(storageUploadError(upload.error))
  const previous = await currentPortrait(db, campaignId, characterId)
  const saved = await db.rpc('set_character_portrait', {
    target_campaign: campaignId,
    target_character: characterId,
    new_path: path,
  })
  if (saved.error) throw failure(saved.error)
  if (previous && previous !== path) await discardPortrait(db, campaignId, characterId, previous)
  return path
}
/** RYT-090: clears the sheet's portrait, then deletes the object it pointed to (RYT-113). */
export async function removePortrait(campaignId: string, characterId: string) {
  const db = await client()
  const previous = await currentPortrait(db, campaignId, characterId)
  const saved = await db.rpc('set_character_portrait', {
    target_campaign: z.uuid().parse(campaignId),
    target_character: z.uuid().parse(characterId),
    new_path: null,
  })
  if (saved.error) throw failure(saved.error)
  if (previous) await discardPortrait(db, campaignId, characterId, previous)
}
type Db = Awaited<ReturnType<typeof client>>
/** The sheet's portrait before a write; null when unknown, so nothing is deleted. */
async function currentPortrait(db: Db, campaignId: string, characterId: string) {
  const read = await db
    .from('character_sheets')
    .select('portrait_path')
    .eq('campaign_id', z.uuid().parse(campaignId))
    .eq('character_id', z.uuid().parse(characterId))
    .maybeSingle()
  return read.error
    ? null
    : z
        .string()
        .nullable()
        .catch(null)
        .parse(read.data?.portrait_path ?? null)
}
/**
 * RYT-113: a replaced or cleared portrait stops counting against the campaign storage quota.
 * Best effort and only while no sheet still points at it; a failure leaves a harmless orphan.
 */
async function discardPortrait(db: Db, campaignId: string, characterId: string, path: string) {
  try {
    const { activeSchema } = await import('@/shared/api/supabase')
    // A PRE copy keeps production paths; never delete outside the active environment.
    if (!ownsStoragePath(path, activeSchema(), campaignId, characterId)) return
    const referenced = await db
      .from('character_sheets')
      .select('character_id')
      .eq('campaign_id', campaignId)
      .eq('portrait_path', path)
      .limit(1)
    if (referenced.error || referenced.data.length > 0) return
    await db.storage.from(bucket).remove([path])
  } catch {
    // Keep the object: an orphan is harmless, a deleted current portrait is not.
  }
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

/** The API returns at most this many rows per request (supabase/config.toml max_rows). */
export const cataloguePageSize = 1000

/** Every definition of the campaign, read page by page so a large catalogue is never cut short. */
export async function loadCatalogue(campaignId: string, signal?: AbortSignal) {
  const db = await client()
  const campaign = z.uuid().parse(campaignId)
  const rows: unknown[] = []
  for (let from = 0; ; from += cataloguePageSize) {
    let query = db
      .from('item_definitions')
      .select(definitionColumns)
      .eq('campaign_id', campaign)
      .order('name')
      .order('id')
      .range(from, from + cataloguePageSize - 1)
    if (signal) query = query.abortSignal(signal)
    const result = await query
    if (result.error) throw result.error
    rows.push(...result.data)
    if (result.data.length < cataloguePageSize) break
  }
  return definitionSchema.array().parse(await withValues(db, campaign, rows, signal))
}

/** Signed item pictures stay valid this long; the cache re-signs them well before expiry. */
export const itemImageTtlSeconds = 3600
const signItemImage = createBatchSigner(client, 'item-images', itemImageTtlSeconds)

/**
 * Signs one item picture. Calls made in the same moment (a satchel, a shop shelf) are collected
 * and signed with one Storage request per 100 pictures.
 */
let supabaseModule: Promise<typeof import('@/shared/api/supabase')> | undefined
export async function itemImageUrl(path: string) {
  const { activeSchema } = await (supabaseModule ??= import('@/shared/api/supabase'))
  if (!path.startsWith(`${activeSchema()}/`)) throw new Error('unavailable')
  return signItemImage(path)
}
export async function uploadItemImage(campaignId: string, definitionId: string, image: Blob) {
  if (!(uploadTypes as readonly string[]).includes(image.type) || image.size > uploadBytes)
    throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const path = `${activeSchema()}/${z.uuid().parse(campaignId)}/${z.uuid().parse(definitionId)}/${newRequestId()}.${uploadExtension(image.type)}`
  const result = await db.storage
    .from('item-images')
    .upload(path, image, { contentType: image.type })
  if (result.error) throw new Error(storageUploadError(result.error))
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
  const before = await db
    .from('item_definitions')
    .select('image_path')
    .eq('campaign_id', z.uuid().parse(campaignId))
    .eq('id', z.uuid().parse(definitionId))
    .maybeSingle()
  const previous = before.error
    ? null
    : z
        .string()
        .nullable()
        .catch(null)
        .parse(before.data?.image_path ?? null)
  const result = await db.rpc('set_item_image', {
    target_campaign: campaignId,
    target_definition: definitionId,
    expected_revision: revision,
    new_path: path,
    request_id: requestId,
  })
  if (result.error) throw failure(result.error)
  // RYT-113: the replaced or cleared picture is deleted once no definition points at it.
  if (previous && previous !== path) await discardItemUpload(campaignId, previous).catch(() => {})
}
/** Only clean an unreferenced object, including after an ambiguous network outcome. */
export async function discardItemUpload(campaignId: string, path: string) {
  const { activeSchema } = await import('@/shared/api/supabase')
  // A PRE copy keeps production paths; never delete outside the active environment.
  if (!ownsStoragePath(path, activeSchema(), campaignId)) return
  const db = await client()
  const referenced = await db
    .from('item_definitions')
    .select('id')
    .eq('campaign_id', z.uuid().parse(campaignId))
    .eq('image_path', path)
    .limit(1)
  if (referenced.error) throw referenced.error
  if (referenced.data.length > 0) return
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
      price: z.coerce.number().pipe(gpAmount),
      stock: z.number().int().nullable(),
      revision: z.number().int(),
    })
    .array(),
  holders: z.number().int().min(0),
  units: z.number().int().min(0),
  open_orders: z.number().int().min(0),
  open_trades: z.number().int().min(0).optional(),
})
export type DefinitionImpact = z.infer<typeof impactSchema>

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
  if (result.error) throw failure(result.error)
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
  if (result.error) throw failure(result.error)
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
    new_price: gpAmount.pipe(z.number().max(100_000_000)).parse(price),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw failure(result.error)
  return z.object({ updated: z.number().int() }).parse(result.data)
}

/** RYT-074: portrait paths the caller may show (assigned characters for members, all for DMs). */
export async function listCampaignPortraits(campaignId: string, signal?: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('list_character_portraits', { target_campaign: z.uuid().parse(campaignId) })
    .abortSignal(signal ?? new AbortController().signal)
  if (result.error) throw result.error
  return new Map(
    z
      .object({ character_id: z.uuid(), portrait_path: z.string().max(200) })
      .array()
      .max(500)
      .parse(result.data)
      .map((row) => [row.character_id, row.portrait_path]),
  )
}

// RYT-104/105 catalogue: search, templates, basic catalogue import, proposals and merges.
export async function searchCampaignItems(
  campaignId: string,
  query: string,
  limit: number,
  signal?: AbortSignal,
) {
  const db = await client()
  let call = db.rpc('search_campaign_items', {
    target_campaign: z.uuid().parse(campaignId),
    search_query: z.string().max(100).parse(query.trim()),
    max_results: z.number().int().min(1).max(200).parse(limit),
  })
  if (signal) call = call.abortSignal(signal)
  const result = await call
  if (result.error) throw failure(result.error)
  return searchItemSchema.array().max(200).parse(result.data)
}

export async function setItemTemplate(
  campaignId: string,
  definitionId: string,
  template: boolean,
  revision: number,
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('set_item_template', {
    target_campaign: z.uuid().parse(campaignId),
    target_definition: z.uuid().parse(definitionId),
    make_template: template,
    expected_revision: z.number().int().min(0).parse(revision),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw failure(result.error)
  return templateResultSchema.parse(result.data)
}

/**
 * DM only: catalogue keys become campaign definitions; keys the campaign has return their id.
 * With `updateExisting` the live ones whose catalogue fields changed are updated (never their
 * price, image or template flag).
 */
export async function importBasicItems(
  campaignId: string,
  items: ImportItem[],
  requestId: string,
  updateExisting = false,
) {
  const db = await client()
  z.array(z.object({ key: z.string().min(1) }))
    .min(1)
    .max(500)
    .parse(items)
  const result = await db.rpc('import_basic_items', {
    target_campaign: z.uuid().parse(campaignId),
    items: items as unknown as Json,
    request_id: z.uuid().parse(requestId),
    update_existing: updateExisting,
  })
  if (result.error) throw failure(result.error)
  return importResultSchema.parse(result.data)
}

export async function listItemProposals(
  campaignId: string,
  characterId: string | null,
  signal?: AbortSignal,
) {
  const db = await client()
  let call = db.rpc('list_item_proposals', {
    target_campaign: z.uuid().parse(campaignId),
    target_character: characterId === null ? null : z.uuid().parse(characterId),
    include_closed: true,
  })
  if (signal) call = call.abortSignal(signal)
  const result = await call
  if (result.error) throw failure(result.error)
  return proposalSchema.array().max(200).parse(result.data)
}

export type ProposalInput = {
  draft: Record<string, unknown>
  characterId: string
  quantity: number
  requestId: string
}
export async function proposeItem(campaignId: string, input: ProposalInput) {
  const db = await client()
  const result = await db.rpc('propose_item', {
    target_campaign: z.uuid().parse(campaignId),
    target_character: z.uuid().parse(input.characterId),
    draft: input.draft as Json,
    quantity: z.number().int().min(1).max(1000).parse(input.quantity),
    request_id: z.uuid().parse(input.requestId),
  })
  if (result.error) throw failure(result.error)
  return proposalResultSchema.parse(result.data)
}

export async function cancelItemProposal(
  campaignId: string,
  proposalId: string,
  revision: number,
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('cancel_item_proposal', {
    target_campaign: z.uuid().parse(campaignId),
    target_proposal: z.uuid().parse(proposalId),
    expected_revision: z.number().int().min(0).parse(revision),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw failure(result.error)
  return proposalResultSchema.parse(result.data)
}

export type Resolution =
  | { resolution: 'accept'; draft: Record<string, unknown>; quantity: number }
  | { resolution: 'merge'; definitionId: string; quantity: number }
  | { resolution: 'reject' }
export async function resolveItemProposal(
  campaignId: string,
  proposal: { id: string; revision: number },
  decision: Resolution & { note: string },
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('resolve_item_proposal', {
    target_campaign: z.uuid().parse(campaignId),
    target_proposal: z.uuid().parse(proposal.id),
    resolution: decision.resolution,
    draft: decision.resolution === 'accept' ? (decision.draft as Json) : null,
    target_definition:
      decision.resolution === 'merge' ? z.uuid().parse(decision.definitionId) : null,
    quantity:
      decision.resolution === 'reject'
        ? null
        : z.number().int().min(1).max(1000).parse(decision.quantity),
    note: z.string().max(500).parse(decision.note.trim()),
    expected_revision: z.number().int().min(0).parse(proposal.revision),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw failure(result.error)
  return proposalResultSchema.parse(result.data)
}

export async function mergeItemDefinitions(
  campaignId: string,
  source: { id: string; revision: number },
  target: { id: string; revision: number },
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('merge_item_definitions', {
    target_campaign: z.uuid().parse(campaignId),
    source_definition: z.uuid().parse(source.id),
    target_definition: z.uuid().parse(target.id),
    source_revision: z.number().int().min(0).parse(source.revision),
    target_revision: z.number().int().min(0).parse(target.revision),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw failure(result.error)
  return mergeResultSchema.parse(result.data)
}

const lootAllocationSchema = z.object({
  character_id: z.uuid(),
  definition_id: z.uuid(),
  quantity: z.number().int().min(1).max(1000),
})
const reviewedAllocations = lootAllocationSchema
  .extend({ revision: z.number().int().nonnegative() })
  .array()
  .min(1)
  .max(100)
export type LootAllocation = z.infer<typeof lootAllocationSchema>
export type LootRequest = {
  allocations: z.infer<typeof reviewedAllocations>
  name: string | null
  requestId: string
}

export async function distributeLoot(campaignId: string, input: LootRequest) {
  const db = await client()
  const result = await db.rpc('distribute_loot', {
    target_campaign: z.uuid().parse(campaignId),
    allocations: reviewedAllocations.parse(input.allocations),
    batch_name: z.string().trim().min(1).max(80).nullable().parse(input.name),
    request_id: z.uuid().parse(input.requestId),
  })
  if (result.error) throw failure(result.error)
  return z
    .object({
      allocations: lootAllocationSchema.array().min(1).max(100),
      batch_id: z.uuid().nullable(),
    })
    .parse(result.data)
}

export async function listLootBatches(
  campaignId: string,
  after: string | null,
  signal: AbortSignal,
) {
  const db = await client()
  const result = await db
    .rpc('list_loot_batches', {
      target_campaign: z.uuid().parse(campaignId),
      after_name: after,
    })
    .abortSignal(signal)
  if (result.error) throw failure(result.error)
  return z
    .object({
      id: z.uuid(),
      name: z.string().min(1).max(80),
      allocations: lootAllocationSchema.array().min(1).max(100),
    })
    .array()
    .max(20)
    .parse(result.data)
}

export async function deleteLootBatch(campaignId: string, id: string, requestId: string) {
  const db = await client()
  const result = await db.rpc('delete_loot_batch', {
    target_campaign: z.uuid().parse(campaignId),
    target_batch: z.uuid().parse(id),
    request_id: z.uuid().parse(requestId),
  })
  if (result.error) throw failure(result.error)
  return z.object({ id: z.uuid() }).parse(result.data)
}
