import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  actionResultSchema,
  definitionSchema,
  eventSchema,
  stackSchema,
  type InventoryAction,
} from '../domain/item'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

const definitionColumns =
  'id, campaign_id, name, category, icon, rarity, weight_tenths, value_gp, description, slot_kind, properties, origin, archived, created_by, revision'
const stackColumns =
  'id, campaign_id, character_id, definition_id, quantity, equipped_slot, source, notes, revision'
const eventColumns =
  'id, character_id, item_id, actor_id, kind, quantity_delta, after_value, undo_of, undone_by, created_at'

// Only what equipment math needs from the sheet; the characters feature owns the rest.
const holderSchema = z.object({
  level: z.number().int().min(1).max(20),
  portrait_path: z.string().nullable(),
  str: z.coerce.number().int().nullable(),
  dex: z.coerce.number().int().nullable(),
  str_bonus: z.coerce.number().int().nullable(),
  dex_bonus: z.coerce.number().int().nullable(),
})
export type Holder = { level: number; portraitPath: string | null; str: number; dex: number }

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
        'level, portrait_path, str:build->baseAbilities->>str, dex:build->baseAbilities->>dex, str_bonus:build->bonuses->>str, dex_bonus:build->bonuses->>dex',
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
  const request_id = crypto.randomUUID()
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
  const path = `${activeSchema()}/${z.uuid().parse(campaignId)}/${z.uuid().parse(characterId)}/${crypto.randomUUID()}.${extension}`
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
