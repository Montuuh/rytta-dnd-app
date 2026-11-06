import { z } from 'zod'
import type { Json } from '@/shared/api/database.generated'
import { config } from '@/shared/lib/config'
import {
  cardSchema,
  fogSchema,
  itemSchema,
  librarySchema,
  liveSchema,
  sceneListSchema,
  sceneSchema,
  tabletopErrorCode,
  trackSchema,
  viewSchema,
  type FogChange,
  type ItemPatch,
  type LivePatch,
  type SceneFields,
} from '../domain/model'

// ADR 032 adapter: RPCs, the private tabletop-media bucket and realtime on tabletop_live.

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const uuid = (value: string) => z.uuid().parse(value)
const fail = (message: string): never => {
  throw new Error(tabletopErrorCode(message))
}
export const mediaBucket = 'tabletop-media'
export type MediaKind = 'map' | 'card' | 'audio'

export async function loadTabletop(
  campaignId: string,
  sceneId: string | null,
  asTable: boolean,
  signal: AbortSignal,
) {
  const db = await client()
  const result = await db
    .rpc('get_tabletop', {
      target_campaign: uuid(campaignId),
      target_scene: sceneId === null ? null : uuid(sceneId),
      as_table: asTable,
    })
    .abortSignal(signal)
  if (result.error) fail(result.error.message)
  return viewSchema.parse(result.data)
}

export async function loadScenes(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('list_tabletop_scenes', { target_campaign: uuid(campaignId) })
    .abortSignal(signal)
  if (result.error) fail(result.error.message)
  return sceneListSchema.parse(result.data)
}

export async function loadLibrary(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('get_tabletop_library', { target_campaign: uuid(campaignId) })
    .abortSignal(signal)
  if (result.error) fail(result.error.message)
  return librarySchema.parse(result.data)
}

export type TabletopAction =
  | { kind: 'saveScene'; sceneId: string | null; fields: SceneFields; revision: number | null }
  | { kind: 'deleteScene'; sceneId: string }
  | { kind: 'putItems'; sceneId: string; items: ItemPatch[] }
  | { kind: 'deleteItems'; sceneId: string; ids: string[] }
  | { kind: 'fog'; sceneId: string; op: FogChange }
  | { kind: 'live'; patch: LivePatch }
  | {
      kind: 'saveCard'
      cardId: string | null
      fields: { title?: string; body?: string; image_path?: string | null }
    }
  | { kind: 'deleteCard'; cardId: string }
  | { kind: 'addTrack'; title: string; path: string; mime: string; size: number }
  | { kind: 'deleteTrack'; trackId: string; path: string }
  | { kind: 'fireEvent'; itemId: string; reset: boolean }

const json = (value: unknown) => value as Json

export async function changeTabletop(campaignId: string, action: TabletopAction) {
  const db = await client()
  const target_campaign = uuid(campaignId)
  const request_id = crypto.randomUUID()
  switch (action.kind) {
    case 'saveScene': {
      const result = await db.rpc('save_tabletop_scene', {
        target_campaign,
        target_scene: action.sceneId === null ? null : uuid(action.sceneId),
        fields: json(action.fields),
        expected_revision: action.revision,
        request_id,
      })
      if (result.error) fail(result.error.message)
      return sceneSchema.parse(result.data)
    }
    case 'deleteScene': {
      const result = await db.rpc('delete_tabletop_scene', {
        target_campaign,
        target_scene: uuid(action.sceneId),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return result.data
    }
    case 'putItems': {
      const result = await db.rpc('put_tabletop_items', {
        target_campaign,
        target_scene: uuid(action.sceneId),
        items: json(action.items),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return z.array(itemSchema).parse(result.data)
    }
    case 'deleteItems': {
      const result = await db.rpc('delete_tabletop_items', {
        target_campaign,
        target_scene: uuid(action.sceneId),
        ids: action.ids.map(uuid),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return result.data
    }
    case 'fog': {
      const result = await db.rpc('change_tabletop_fog', {
        target_campaign,
        target_scene: uuid(action.sceneId),
        op: json(action.op),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return z.object({ fog: fogSchema }).parse(result.data).fog
    }
    case 'live': {
      const result = await db.rpc('set_tabletop_live', {
        target_campaign,
        patch: json(action.patch),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return liveSchema.parse(result.data)
    }
    case 'saveCard': {
      const result = await db.rpc('save_tabletop_card', {
        target_campaign,
        target_card: action.cardId === null ? null : uuid(action.cardId),
        fields: json(action.fields),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return cardSchema.parse(result.data)
    }
    case 'deleteCard': {
      const result = await db.rpc('delete_tabletop_card', {
        target_campaign,
        target_card: uuid(action.cardId),
        request_id,
      })
      if (result.error) fail(result.error.message)
      return result.data
    }
    case 'addTrack': {
      const result = await db.rpc('add_tabletop_track', {
        target_campaign,
        title: z.string().trim().min(1).max(80).parse(action.title),
        track_path: action.path,
        mime: action.mime,
        size_bytes: action.size,
        request_id,
      })
      if (result.error) fail(result.error.message)
      return trackSchema.parse(result.data)
    }
    case 'deleteTrack': {
      const result = await db.rpc('delete_tabletop_track', {
        target_campaign,
        target_track: uuid(action.trackId),
        request_id,
      })
      if (result.error) fail(result.error.message)
      // The object goes too; a failed cleanup only leaves an unreferenced file.
      await db.storage.from(mediaBucket).remove([action.path])
      return result.data
    }
    case 'fireEvent': {
      const result = await db.rpc('fire_tabletop_event', {
        target_campaign,
        target_item: uuid(action.itemId),
        reset: action.reset,
        request_id,
      })
      if (result.error) fail(result.error.message)
      return result.data
    }
  }
}

const mediaTypes: Record<MediaKind, Record<string, string>> = {
  map: { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' },
  card: { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' },
  audio: { 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm' },
}
export const mediaLimit = 20 * 1024 * 1024

/** Uploads a prepared file and returns its object path (the RPC that uses it checks it again). */
export async function uploadMedia(campaignId: string, kind: MediaKind, file: Blob) {
  const extension = mediaTypes[kind][file.type]
  if (!extension || file.size > mediaLimit || file.size === 0) throw new Error('invalid')
  const db = await client()
  const { activeSchema } = await import('@/shared/api/supabase')
  const path = `${activeSchema()}/${uuid(campaignId)}/${kind}/${crypto.randomUUID()}.${extension}`
  const result = await db.storage.from(mediaBucket).upload(path, file, { contentType: file.type })
  if (result.error) throw new Error('unavailable')
  return path
}

export async function removeMedia(path: string) {
  const db = await client()
  await db.storage.from(mediaBucket).remove([path])
}

export const mediaSeconds = 3600

export async function mediaUrl(path: string) {
  const { activeSchema } = await import('@/shared/api/supabase')
  if (!path.startsWith(`${activeSchema()}/`)) throw new Error('unavailable')
  const db = await client()
  const signed = await db.storage.from(mediaBucket).createSignedUrl(path, mediaSeconds)
  if (signed.error) throw new Error('unavailable')
  return z.url().parse(signed.data.signedUrl)
}

/**
 * Realtime invalidation: the live row carries no secrets and its revision moves on every change
 * the table may see. `onStatus` reports whether the channel is subscribed.
 */
export function subscribeTabletop(
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
        .channel(`tabletop:${campaign}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: activeSchema(),
            table: 'tabletop_live',
            filter: `campaign_id=eq.${campaign}`,
          },
          () => onChange(),
        )
        .subscribe((status) => {
          const connected = status === 'SUBSCRIBED'
          onStatus(connected)
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
