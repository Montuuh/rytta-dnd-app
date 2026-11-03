import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  combatErrorCode,
  combatStateSchema,
  encounterListSchema,
  mutationResultSchema,
  templateListSchema,
  type CombatAction,
} from '../domain/combat'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const uuid = (value: string) => z.uuid().parse(value)
const int = (value: number, min: number, max: number) =>
  z.number().int().min(min).max(max).parse(value)

export async function loadEncounters(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('list_encounters', { target_campaign: uuid(campaignId) })
    .abortSignal(signal)
  if (result.error) throw new Error(combatErrorCode(result.error.message))
  return encounterListSchema.parse(result.data)
}

/** encounterId null loads the live encounter (or the latest finished one). */
export async function loadCombatState(
  campaignId: string,
  encounterId: string | null,
  asTable: boolean,
  signal: AbortSignal,
) {
  const db = await client()
  const result = await db
    .rpc('get_combat_state', {
      target_campaign: uuid(campaignId),
      target_encounter: encounterId === null ? null : uuid(encounterId),
      as_table: asTable,
    })
    .abortSignal(signal)
  if (result.error) throw new Error(combatErrorCode(result.error.message))
  return combatStateSchema.parse(result.data)
}

export async function loadTemplates(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('list_combatant_templates', { target_campaign: uuid(campaignId) })
    .abortSignal(signal)
  if (result.error) throw new Error(combatErrorCode(result.error.message))
  return templateListSchema.parse(result.data)
}

const entrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('character'),
    character_id: z.uuid(),
    initiative: z.number().int().min(-20).max(99).optional(),
  }),
  z.object({
    kind: z.literal('lair'),
    name: z.string().max(80).optional(),
    hidden: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('npc'),
    name: z.string().max(70).optional(),
    template_id: z.uuid().optional(),
    count: z.number().int().min(1).max(20).optional(),
    max_hp: z.number().int().min(1).max(99999).optional(),
    armor_class: z.number().int().min(0).max(99).optional(),
    initiative_bonus: z.number().int().min(-20).max(30).optional(),
    side: z.enum(['ally', 'enemy']).optional(),
    hidden: z.boolean().optional(),
    share_initiative: z.boolean().optional(),
    legendary_max: z.number().int().min(0).max(9).optional(),
    dm_notes: z.string().max(2000).optional(),
  }),
])

export async function changeCombat(campaignId: string, action: CombatAction) {
  const db = await client()
  const target_campaign = uuid(campaignId)
  const request_id = crypto.randomUUID()
  let result
  switch (action.kind) {
    case 'create':
      result = await db.rpc('create_encounter', {
        target_campaign,
        encounter_name: z.string().trim().min(1).max(80).parse(action.name),
        request_id,
      })
      break
    case 'rename':
      result = await db.rpc('rename_encounter', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        encounter_name: z.string().trim().min(1).max(80).parse(action.name),
        request_id,
      })
      break
    case 'delete':
      result = await db.rpc('delete_encounter', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
      })
      break
    case 'status':
      result = await db.rpc('set_encounter_status', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        new_status: action.status,
        request_id,
      })
      break
    case 'add':
      result = await db.rpc('add_combatants', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        entries: z.array(entrySchema).min(1).max(30).parse(action.entries),
        request_id,
      })
      break
    case 'update':
      result = await db.rpc('update_combatant', {
        target_campaign,
        target_combatant: uuid(action.combatantId),
        patch: action.patch,
        request_id,
      })
      break
    case 'remove':
      result = await db.rpc('remove_combatant', {
        target_campaign,
        target_combatant: uuid(action.combatantId),
        request_id,
      })
      break
    case 'initiative':
      result = await db.rpc('set_initiative', {
        target_campaign,
        target_combatant: uuid(action.combatantId),
        initiative_total: int(action.total, -20, 99),
        tiebreak_bonus: action.bonus === null ? null : int(action.bonus, -20, 30),
        request_id,
      })
      break
    case 'roll':
      result = await db.rpc('roll_npc_initiative', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        request_id,
      })
      break
    case 'order':
      result = await db.rpc('set_turn_order', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        ordered_ids: z.array(z.uuid()).max(200).parse(action.ids),
        request_id,
      })
      break
    case 'turn':
      result = await db.rpc('advance_turn', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        direction: action.direction,
        expected_active: action.expected === null ? null : uuid(action.expected),
        request_id,
      })
      break
    case 'jump':
      result = await db.rpc('set_active_turn', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        target_combatant: uuid(action.target),
        expected_active: action.expected === null ? null : uuid(action.expected),
        request_id,
      })
      break
    case 'hp':
      result = await db.rpc('apply_combat_hp', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        hp_mode: action.mode,
        hits: z
          .array(z.object({ combatant_id: z.uuid(), amount: z.number().int().min(0).max(9999) }))
          .min(1)
          .max(30)
          .parse(action.hits),
        request_id,
      })
      break
    case 'condition':
      result = await db.rpc('set_combat_condition', {
        target_campaign,
        target_combatant: uuid(action.combatantId),
        condition_key: action.condition,
        enabled: action.enabled,
        request_id,
      })
      break
    case 'concentration':
      result = await db.rpc('set_concentration', {
        target_campaign,
        target_combatant: uuid(action.combatantId),
        spell: action.spell === null ? null : z.string().trim().max(80).parse(action.spell),
        request_id,
      })
      break
    case 'deathSave':
      result = await db.rpc('record_death_save', {
        target_campaign,
        target_combatant: uuid(action.combatantId),
        outcome: action.outcome,
        request_id,
      })
      break
    case 'effect':
      result = await db.rpc('add_combat_effect', {
        target_campaign,
        target_encounter: uuid(action.encounterId),
        effect: {
          ...action.effect,
          label: z.string().trim().min(1).max(60).parse(action.effect.label),
        },
        request_id,
      })
      break
    case 'removeEffect':
      result = await db.rpc('remove_combat_effect', {
        target_campaign,
        target_effect: uuid(action.effectId),
        request_id,
      })
      break
    case 'undo':
      result = await db.rpc('undo_combat_event', {
        target_campaign,
        target_event: uuid(action.eventId),
        request_id,
      })
      break
    case 'saveTemplate':
      result = await db.rpc('save_combatant_template', {
        target_campaign,
        target_template: action.templateId === null ? null : uuid(action.templateId),
        expected_revision: action.revision,
        data: action.data,
        request_id,
      })
      break
    case 'deleteTemplate':
      result = await db.rpc('delete_combatant_template', {
        target_campaign,
        target_template: uuid(action.templateId),
      })
      break
    case 'templateImage':
      result = await db.rpc('set_combatant_template_image', {
        target_campaign,
        target_template: uuid(action.templateId),
        expected_revision: action.revision,
        new_path: action.path,
        request_id,
      })
      break
  }
  if (result.error) throw new Error(combatErrorCode(result.error.message))
  return mutationResultSchema.parse(result.data)
}

/**
 * RYT-043 combat images live in private buckets: character portraits (RYT-004) and bestiary creature
 * images. Signed URLs are short-lived; a path from the other environment (a PRE copy of PROD data) is
 * refused so the monogram fallback shows instead of a broken image.
 */
export const imageBuckets = {
  character: { bucket: 'character-portraits', seconds: 3600 },
  creature: { bucket: 'creature-images', seconds: 300 },
} as const
export type ImageKind = keyof typeof imageBuckets

export async function combatImageUrl(kind: ImageKind, path: string) {
  const { activeSchema } = await import('@/shared/api/supabase')
  if (!path.startsWith(`${activeSchema()}/`)) throw new Error('unavailable')
  const db = await client()
  const { bucket, seconds } = imageBuckets[kind]
  const signed = await db.storage.from(bucket).createSignedUrl(path, seconds)
  if (signed.error) throw new Error('unavailable')
  return z.url().parse(signed.data.signedUrl)
}

/** Uploads a prepared WebP for a bestiary template; the attach RPC links it afterwards. */
export async function uploadCreatureImage(campaignId: string, templateId: string, image: Blob) {
  if (image.type !== 'image/webp' || image.size > 1_048_576) throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const path = `${activeSchema()}/${uuid(campaignId)}/${uuid(templateId)}/${crypto.randomUUID()}.webp`
  const result = await db.storage
    .from(imageBuckets.creature.bucket)
    .upload(path, image, { contentType: image.type })
  if (result.error) throw new Error('unavailable')
  return path
}

/**
 * Realtime invalidation: the encounters row carries no secrets and its revision moves on every
 * combat change, so subscribers refetch the role projection. Polling stays on as the fallback.
 * `onStatus` reports whether the channel is subscribed (false while connecting or after loss).
 */
export function subscribeEncounters(
  campaignId: string,
  onChange: () => void,
  onStatus: (connected: boolean) => void,
) {
  let stop: (() => void) | undefined
  let cancelled = false
  void (async () => {
    try {
      const db = await client()
      const { activeSchema } = await import('@/shared/api/supabase')
      const campaign = uuid(campaignId)
      const channel = db
        .channel(`encounters:${campaign}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: activeSchema(),
            table: 'encounters',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => onChange(),
        )
        .subscribe((status) => {
          const connected = status === 'SUBSCRIBED'
          onStatus(connected)
          // A (re)connection may have missed events: refetch authoritative state.
          if (connected) onChange()
        })
      stop = () => void db.removeChannel(channel)
      if (cancelled) stop()
    } catch {
      onStatus(false)
    }
  })()
  return () => {
    cancelled = true
    stop?.()
  }
}
