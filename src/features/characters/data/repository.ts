import { z } from 'zod'
import { config } from '@/shared/lib/config'
import { characterSchema, resourceSchema, type CharacterAction } from '../domain/character'
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
