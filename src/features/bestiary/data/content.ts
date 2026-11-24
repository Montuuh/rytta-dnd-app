import { config } from '@/shared/lib/config'
import { parsePackBodies, parsePackIndex } from '../domain/packs'
import {
  baselineSchema,
  type BestiaryLanguage,
  type CreatureArtCatalog,
  type MonsterBodies,
  type MonsterIndex,
} from '../domain/types'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const srd = { srd: true, ref: '00000000' } as const

/**
 * RYT-167: the SRD's creatures, their traits and the CR baselines come from the published SRD pack
 * of the library (the bundled copy left the code). Signed-in accounts only.
 */
export async function loadMonsterIndex(): Promise<MonsterIndex> {
  const { data, error } = await (await client()).rpc('get_srd_creature_pack', { part: 'index' })
  if (error) throw new Error('unavailable')
  const baselines = baselineSchema
    .array()
    .catch([])
    .parse((data as { baselines?: unknown } | null)?.baselines)
  return { monsters: parsePackIndex(data, srd).rows, baselines }
}

export async function loadMonsterBodies(language: BestiaryLanguage): Promise<MonsterBodies> {
  const { data, error } = await (await client()).rpc('get_srd_creature_pack', { part: language })
  if (error) throw new Error('unavailable')
  const { monsters, traits } = parsePackBodies(data, srd)
  return { monsters, traits }
}

/** Credits of the bundled creature art (RYT-053); the images are static files under `bestiary/`. */
export async function loadCreatureArt(): Promise<CreatureArtCatalog> {
  const module = await import('../content/art.json')
  return module.default as unknown as CreatureArtCatalog
}

/** Public URL of a creature's bundled art: a 128px square thumbnail or the full image. */
export function creatureArtUrl(id: string, size: 'thumb' | 'full'): string {
  return `${import.meta.env.BASE_URL}bestiary/${size === 'thumb' ? 'thumbs' : 'art'}/${id}.webp`
}
