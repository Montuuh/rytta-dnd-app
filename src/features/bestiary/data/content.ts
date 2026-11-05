import type {
  BestiaryLanguage,
  CreatureArtCatalog,
  MonsterBodies,
  MonsterIndex,
} from '../domain/types'

/**
 * Bundled SRD 5.2.1 monsters are lazy chunks loaded only on DM bestiary and combat screens: a
 * bilingual index (search, filters, combat numbers, CR medians) and one stat block file per
 * language. Content contract tests validate every file (domain/content.test.ts).
 */
export async function loadMonsterIndex(): Promise<MonsterIndex> {
  const module = await import('../content/index.json')
  return module.default as unknown as MonsterIndex
}

export async function loadMonsterBodies(language: BestiaryLanguage): Promise<MonsterBodies> {
  const module =
    language === 'es' ? await import('../content/es.json') : await import('../content/en.json')
  return module.default as unknown as MonsterBodies
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
