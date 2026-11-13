import { z } from 'zod'
import { srdCategories } from '@/features/glossary'

/**
 * RYT-092 content library (ADR 040): packs of downloadable game data and their entries. Entries
 * are drafts until their pack publishes a version; readers only ever see the published copy.
 */
export type ContentLanguage = 'es' | 'en'
export const entryStates = ['new', 'changed', 'deleted', 'published'] as const
export type EntryState = (typeof entryStates)[number]

export const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const kindPattern = /^[a-z][a-z0-9-]{0,31}$/
export const entryKeySchema = z.string().max(80).regex(keyPattern)
export const entryKindSchema = z.string().regex(kindPattern)

/** Kinds with their own form; any other valid kind gets the common form and the JSON tab. */
export const glossaryKinds = srdCategories
export type GlossaryKind = (typeof glossaryKinds)[number]
export const knownKinds = [
  'creature',
  ...glossaryKinds,
  'subclass',
  'species',
  'background',
  'feat',
  'item',
  'creature-trait',
  'table',
] as const
export type KnownKind = (typeof knownKinds)[number]
export const isKnownKind = (kind: string): kind is KnownKind =>
  (knownKinds as readonly string[]).includes(kind)
export const isGlossaryKind = (kind: string): kind is GlossaryKind =>
  (glossaryKinds as readonly string[]).includes(kind)
export type FormFamily = 'creature' | 'glossary' | 'common'
export const formFamily = (kind: string): FormFamily =>
  kind === 'creature' ? 'creature' : isGlossaryKind(kind) ? 'glossary' : 'common'

const counts = z.record(z.string(), z.number().int().min(0))
export const packSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(keyPattern),
  title_en: z.string().max(120),
  title_es: z.string().max(120),
  description_en: z.string().max(2000),
  description_es: z.string().max(2000),
  edition: z.enum(['2024', '2014']).optional(),
  license: z.string().max(120),
  attribution: z.string().max(2000),
  visibility: z.enum(['public', 'private']),
  mine: z.boolean().optional(),
  version: z.number().int().min(0),
  published_at: z.string().optional(),
  kinds: counts,
  drafts: counts.optional(),
  pending: z.number().int().min(0).optional(),
  revision: z.number().int().min(1).optional(),
})
export type ContentPack = z.infer<typeof packSchema>
export const librarySchema = z.object({ editor: z.boolean(), packs: z.array(packSchema) })
export type ContentLibrary = z.infer<typeof librarySchema>

const record = z.record(z.string(), z.unknown())
export const draftRowSchema = z.object({
  id: z.uuid(),
  kind: entryKindSchema,
  key: entryKeySchema,
  name_en: z.string().max(120),
  name_es: z.string().max(120),
  index: record.optional(),
  state: z.enum(entryStates),
  revision: z.number().int().min(1),
  updated_at: z.string(),
})
export type DraftRow = z.infer<typeof draftRowSchema>
export const draftListSchema = z.array(draftRowSchema)

export const draftSchema = draftRowSchema.omit({ index: true }).extend({
  pack_id: z.uuid(),
  data: record,
  published: z
    .object({
      name_en: z.string(),
      name_es: z.string(),
      data: record,
      version: z.number().int().min(1),
    })
    .optional(),
})
export type Draft = z.infer<typeof draftSchema>

export const saveResultSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().min(1).optional(),
  state: z.enum(entryStates).optional(),
  deleted: z.boolean().optional(),
})
export const importReportSchema = z.object({
  added: z.number().int().min(0),
  updated: z.number().int().min(0),
  unchanged: z.number().int().min(0),
  refused: z.number().int().min(0),
  problems: z.array(
    z.object({
      position: z.number().int().min(1),
      key: z.string().nullable().optional(),
      reason: z.string(),
    }),
  ),
  dry_run: z.boolean(),
})
export type ImportReport = z.infer<typeof importReportSchema>
export const publishResultSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  revision: z.number().int().min(1),
  added: z.number().int().min(0),
  changed: z.number().int().min(0),
  removed: z.number().int().min(0),
})
export type PublishResult = z.infer<typeof publishResultSchema>

/** What a pack form or an entry form sends; the server repeats every check. */
export type PackInput = {
  slug: string
  title_en: string
  title_es: string
  description_en: string
  description_es: string
  edition: '2024' | '2014' | ''
  license: string
  attribution: string
  visibility: 'public' | 'private'
}
export type EntryInput = {
  kind: string
  key: string
  name_en: string
  name_es: string
  data: Record<string, unknown>
}

/** Entry data is a JSON object of at most 128 KB as text; its "index" at most 4 KB. */
export const entryDataLimit = 131072
export const entryIndexLimit = 4096
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
export type EntryProblem = 'kind' | 'key' | 'name' | 'data' | 'size' | 'index' | 'duplicate'
export function entryProblem(entry: EntryInput): EntryProblem | null {
  if (!kindPattern.test(entry.kind)) return 'kind'
  if (!keyPattern.test(entry.key) || entry.key.length > 80) return 'key'
  const en = entry.name_en.trim(),
    es = entry.name_es.trim()
  if (en.length > 120 || es.length > 120 || (!en && !es)) return 'name'
  if (!entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) return 'data'
  if (byteLength(entry.data) > entryDataLimit) return 'size'
  const index = entry.data.index
  if (
    index !== undefined &&
    (!index ||
      typeof index !== 'object' ||
      Array.isArray(index) ||
      byteLength(index) > entryIndexLimit)
  )
    return 'index'
  return null
}

/** The entry name in the reader's language, falling back to the other one. */
export const entryName = (row: { name_en: string; name_es: string }, language: ContentLanguage) =>
  (language === 'es' ? row.name_es || row.name_en : row.name_en || row.name_es) || ''
export const packTitle = (
  pack: { title_en: string; title_es: string },
  language: ContentLanguage,
) => (language === 'es' ? pack.title_es || pack.title_en : pack.title_en || pack.title_es) || ''
export const missingLanguage = (row: {
  name_en: string
  name_es: string
}): ContentLanguage | null => (!row.name_en.trim() ? 'en' : !row.name_es.trim() ? 'es' : null)

/** A key from a name: lowercase ASCII words joined by hyphens. */
export function keyFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

const libraryErrors = [
  'forbidden',
  'stale',
  'invalid',
  'slugTaken',
  'keyTaken',
  'nothingToPublish',
  'packPublished',
  'unavailable',
  'mismatch',
  'network',
] as const
export type LibraryError = (typeof libraryErrors)[number]
export function libraryErrorCode(message: string): LibraryError {
  // The data adapter already throws codes: keep them.
  if ((libraryErrors as readonly string[]).includes(message)) return message as LibraryError
  if (message.includes('Forbidden') || message.includes('permission denied')) return 'forbidden'
  if (message.includes('Stale revision')) return 'stale'
  if (message.includes('Slug taken')) return 'slugTaken'
  if (message.includes('Key taken')) return 'keyTaken'
  if (message.includes('Nothing to publish')) return 'nothingToPublish'
  if (message.includes('Pack published')) return 'packPublished'
  if (message.includes('unavailable')) return 'unavailable'
  if (message.includes('Request mismatch')) return 'mismatch'
  if (message.includes('Invalid request')) return 'invalid'
  return 'network'
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Rows in the reader's alphabetical order of names; a search matches either name or the key without
 * accents, exact names first, then names that start with the query, then the rest.
 */
export function sortRows<T extends { name_en: string; name_es: string; key: string }>(
  rows: T[],
  query: string,
  language: ContentLanguage,
): T[] {
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true })
  const needle = fold(query)
  const rank = (row: T) => {
    if (!needle) return 0
    const names = [fold(row.name_es), fold(row.name_en)]
    if (names.includes(needle)) return 0
    if (names.some((name) => name.startsWith(needle))) return 1
    if (names.some((name) => name.includes(needle)) || row.key.includes(needle)) return 2
    return -1
  }
  return rows
    .map((row) => ({ row, rank: rank(row) }))
    .filter((item) => item.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank || collator.compare(entryName(a.row, language), entryName(b.row, language)),
    )
    .map((item) => item.row)
}
