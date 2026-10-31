import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { characterSchema, resourceSchema, type CharacterAction } from '../domain/character'
import {
  buildSchema,
  sheetRowSchema,
  sheetSummarySchema,
  vitalsSchema,
  vitalsSummarySchema,
  type SheetAction,
  type SheetSummary,
} from '../domain/sheet'
async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
export async function listCharacters(campaignId: string, signal: AbortSignal, playerId?: string) {
  let query = (await client())
    .from('characters')
    .select(
      'id, campaign_id, user_id, name, character_resources(gold, water_units, rations, exhaustion, revision)',
    )
    .eq('campaign_id', z.uuid().parse(campaignId))
    .order('created_at')
    .abortSignal(signal)
  if (playerId) query = query.eq('user_id', playerId)
  const { data, error } = await query
  if (error) throw error
  return characterSchema.array().parse(data)
}
export async function listAssignments(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .from('characters')
    .select('id, name, user_id')
    .eq('campaign_id', z.uuid().parse(campaignId))
    .order('created_at')
    .abortSignal(signal)
  if (error) throw error
  return z
    .object({ id: z.uuid(), name: z.string(), user_id: z.uuid().nullable() })
    .array()
    .parse(data)
}
export async function changeCharacter(campaignId: string, action: CharacterAction) {
  const db = await client()
  const target_campaign = z.uuid().parse(campaignId)
  let result
  switch (action.kind) {
    case 'create':
      result = await db.rpc('create_character', {
        target_campaign,
        character_name: characterSchema.shape.name.parse(action.name),
      })
      break
    case 'invite':
      result = await db.rpc('invite_character_player', {
        target_campaign,
        target_character: z.uuid().parse(action.characterId),
        invite_email: z.email().max(254).parse(action.email.trim()),
      })
      break
    case 'assign':
      result = await db.rpc('assign_character', {
        target_campaign,
        target_character: action.characterId,
        target_user: action.userId,
      })
      break
    case 'unassign':
      result = await db.rpc('unassign_character', {
        target_campaign,
        target_character: z.uuid().parse(action.characterId),
        expected_user: z.uuid().parse(action.expectedUser),
      })
      break
    case 'resources': {
      const v = resourceSchema.parse(action.values)
      result = await db.rpc('set_character_resources', {
        target_campaign,
        target_character: z.uuid().parse(action.characterId),
        expected_revision: v.revision,
        new_gold: v.gold,
        new_water: v.water_units,
        new_rations: v.rations,
        new_exhaustion: v.exhaustion,
        request_id: z.uuid().parse(action.requestId),
      })
      break
    }
  }
  if (result.error)
    throw new Error(result.error.message.includes('Stale revision') ? 'stale' : 'unavailable')
}

const sheetColumns =
  'character_id, campaign_id, status, level, max_hp, armor_class, build, revision, portrait_path'
const vitalsColumns =
  'character_id, current_hp, temp_hp, hit_dice_spent, death_successes, death_failures, heroic_inspiration, conditions, slots_used, tracker_uses, revision'
export async function getSheet(campaignId: string, characterId: string, signal: AbortSignal) {
  const db = await client()
  const campaign = z.uuid().parse(campaignId)
  const character = z.uuid().parse(characterId)
  const [owner, sheet, vitals] = await Promise.all([
    db
      .from('characters')
      .select('id, name, user_id')
      .eq('campaign_id', campaign)
      .eq('id', character)
      .abortSignal(signal)
      .maybeSingle(),
    db
      .from('character_sheets')
      .select(sheetColumns)
      .eq('campaign_id', campaign)
      .eq('character_id', character)
      .abortSignal(signal)
      .maybeSingle(),
    db
      .from('character_vitals')
      .select(vitalsColumns)
      .eq('campaign_id', campaign)
      .eq('character_id', character)
      .abortSignal(signal)
      .maybeSingle(),
  ])
  for (const result of [owner, sheet, vitals]) if (result.error) throw result.error
  // RLS hides other characters entirely; a missing row means not found or forbidden.
  if (!owner.data || !sheet.data || !vitals.data) return null
  return {
    character: z
      .object({ id: z.uuid(), name: z.string(), user_id: z.uuid().nullable() })
      .parse(owner.data),
    sheet: sheetRowSchema.parse(sheet.data),
    vitals: vitalsSchema.parse(vitals.data),
  }
}
export async function listSheetSummaries(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const campaign = z.uuid().parse(campaignId)
  const [sheets, vitals] = await Promise.all([
    db
      .from('character_sheets')
      .select(
        'character_id, status, level, max_hp, armor_class, class_key:build->>classKey, class_label:build->>classLabel',
      )
      .eq('campaign_id', campaign)
      .abortSignal(signal),
    db
      .from('character_vitals')
      .select('character_id, current_hp, temp_hp')
      .eq('campaign_id', campaign)
      .abortSignal(signal),
  ])
  if (sheets.error) throw sheets.error
  if (vitals.error) throw vitals.error
  const hp = new Map(
    vitalsSummarySchema
      .array()
      .parse(vitals.data)
      .map((row) => [row.character_id, row]),
  )
  return sheetSummarySchema
    .array()
    .parse(sheets.data)
    .map((row): SheetSummary => ({
      ...row,
      current_hp: hp.get(row.character_id)?.current_hp ?? 0,
      temp_hp: hp.get(row.character_id)?.temp_hp ?? 0,
    }))
}
export async function changeSheet(campaignId: string, action: SheetAction) {
  const db = await client()
  const target_campaign = z.uuid().parse(campaignId)
  const target_character = z.uuid().parse(action.characterId)
  const request_id = z.uuid().parse(action.requestId)
  let result
  if (action.kind === 'save') {
    const build = buildSchema.parse(action.draft.build)
    result = await db.rpc('save_character_sheet', {
      target_campaign,
      target_character,
      expected_revision: action.expectedRevision,
      new_level: sheetRowSchema.shape.level.parse(action.draft.level),
      new_max_hp: sheetRowSchema.shape.max_hp.parse(action.draft.maxHp),
      new_armor_class: sheetRowSchema.shape.armor_class.parse(action.draft.armorClass),
      new_build: build,
      mark_complete: action.complete,
      request_id,
    })
  } else {
    const v = vitalsSchema.parse(action.values)
    result = await db.rpc('set_character_vitals', {
      target_campaign,
      target_character,
      expected_revision: v.revision,
      new_current_hp: v.current_hp,
      new_temp_hp: v.temp_hp,
      new_hit_dice_spent: v.hit_dice_spent,
      new_death_successes: v.death_successes,
      new_death_failures: v.death_failures,
      new_heroic_inspiration: v.heroic_inspiration,
      new_conditions: v.conditions,
      new_slots_used: v.slots_used,
      new_tracker_uses: v.tracker_uses,
      request_id,
    })
  }
  if (result.error) {
    const message = result.error.message
    throw new Error(
      message.includes('Stale revision')
        ? 'stale'
        : message.includes('Forbidden')
          ? 'forbidden'
          : 'unavailable',
    )
  }
  return result.data
}
