import { z } from 'zod'
import { config } from '@/shared/lib/config'

/**
 * RYT-174 (ADR 051): the base pack started as the SRD and is changed by hand. Its entries are the
 * SRD as uploaded (`srd`), SRD entries the pack changed (`changed`) or the pack's own (`own`). The
 * server sends only the entries that are not plain SRD, at the versions the reader sees.
 */
export type EntryOrigin = 'srd' | 'changed' | 'own'
export type PackOrigins = {
  /** The base pack's titles; null when the reader has no pack with a baseline. */
  title: { en: string; es: string } | null
  /** `<kind>.<key>` of the entries that are changed or the pack's own. */
  entries: ReadonlyMap<string, Exclude<EntryOrigin, 'srd'>>
}
export const noPackOrigins: PackOrigins = { title: null, entries: new Map() }

const packSchema = z.object({
  title_en: z.string().max(120),
  title_es: z.string().max(120),
  entries: z.array(z.unknown()).max(20000),
})
const entrySchema = z.object({
  kind: z.string().max(32),
  key: z.string().max(80),
  origin: z.enum(['changed', 'own']),
})

/** Only the base pack has a baseline (owner choice P5 A): the first pack is the one. */
export function parsePackOrigins(data: unknown): PackOrigins {
  const pack = z.array(packSchema).max(20).parse(data)[0]
  if (!pack) return noPackOrigins
  const entries = new Map<string, Exclude<EntryOrigin, 'srd'>>()
  // An entry that does not read is skipped alone: it then reads as the SRD, as before.
  for (const value of pack.entries) {
    const row = entrySchema.safeParse(value)
    if (row.success) entries.set(`${row.data.kind}.${row.data.key}`, row.data.origin)
  }
  const en = pack.title_en || pack.title_es
  return { title: { en, es: pack.title_es || en }, entries }
}

/** The origin of a base pack entry by kind and bare key; null without a base pack. */
export function entryOrigin(origins: PackOrigins, kind: string, key: string): EntryOrigin | null {
  if (!origins.title) return null
  return origins.entries.get(`${kind}.${key}`) ?? 'srd'
}

/** The same by an app id `<kind>.<key>`; ids of other packs (`<ref>--<key>`) have no origin. */
export function entryOriginById(origins: PackOrigins, id: string): EntryOrigin | null {
  if (!origins.title || id.includes('--')) return null
  return origins.entries.get(id) ?? 'srd'
}

/**
 * The base pack's name where the app printed a fixed "SRD". A long title (the SRD's own, before
 * the pack is renamed) keeps the short fallback, so segments and filters do not overflow.
 */
export function basePackLabel(origins: PackOrigins, language: 'en' | 'es', fallback: string) {
  const title = origins.title?.[language]
  return title && title.length <= 18 ? title : fallback
}

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}

/** A campaign's origins at the versions it pins, or the published pack's outside a campaign. */
export async function loadPackOrigins(campaignId: string | null, signal?: AbortSignal) {
  const db = await client()
  let call = campaignId
    ? db.rpc('get_campaign_content_origins', { target_campaign: z.uuid().parse(campaignId) })
    : db.rpc('get_content_origins')
  if (signal) call = call.abortSignal(signal)
  const result = await call
  if (result.error) throw new Error('unavailable')
  return parsePackOrigins(result.data)
}

/** Query options (TanStack shape). Content changes refresh the campaign scope, this included. */
export const packOriginsOptions = (userId: string | undefined, campaignId: string | null) => ({
  queryKey: campaignId
    ? (['private', userId, 'campaign', campaignId, 'pack-origins'] as const)
    : (['private', userId, 'pack-origins'] as const),
  queryFn: ({ signal }: { signal: AbortSignal }) => loadPackOrigins(campaignId, signal),
  enabled: config.VITE_DATA_MODE === 'supabase' && Boolean(userId),
  staleTime: 5 * 60_000,
  retry: false,
})
