import type { BestiaryLanguage, MonsterBodies, MonsterIndex } from '../domain/types'

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
