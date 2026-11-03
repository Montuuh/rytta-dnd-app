import type { EntryBodies, GlossaryLanguage, IndexRow } from '../domain/types'

/**
 * Bundled SRD content is split into lazy chunks: a small bilingual index (names, aliases and
 * filters, needed wherever terms are linked) and one body file per language, loaded when a
 * definition is first opened. Content contract tests validate every file (content.test.ts).
 */
export async function loadGlossaryIndex(): Promise<IndexRow[]> {
  const module = await import('../content/index.json')
  return module.default as IndexRow[]
}

export async function loadGlossaryBodies(language: GlossaryLanguage): Promise<EntryBodies> {
  const module =
    language === 'es' ? await import('../content/es.json') : await import('../content/en.json')
  return module.default as unknown as EntryBodies
}
