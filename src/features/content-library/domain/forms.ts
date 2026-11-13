import type { ContentLanguage, EntryInput } from './library'
import { blocksToText, textToBlocks } from './text'

/**
 * Pure helpers the entry forms use to read and change an entry's data without dropping the fields
 * a form does not show (quick facts, spell stats, 2014 rules, pages): those stay as they are and
 * are edited in the JSON tab.
 */
type Data = Record<string, unknown>
const isRecord = (value: unknown): value is Data =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const indexOf = (data: Data): Data => (isRecord(data.index) ? data.index : {})
export const bodyOf = (data: Data, language: ContentLanguage): Data | null =>
  isRecord(data[language]) ? (data[language] as Data) : null

/** Index fields set to undefined, '' or an empty list are removed. */
export function withIndex(data: Data, patch: Data): Data {
  const index: Data = { ...indexOf(data), ...patch }
  for (const [key, value] of Object.entries(index))
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
      delete index[key]
  return { ...data, index }
}

export const bodyText = (data: Data, language: ContentLanguage) =>
  blocksToText(bodyOf(data, language)?.blocks)
export const bodySummary = (data: Data, language: ContentLanguage) => {
  const summary = bodyOf(data, language)?.summary
  return typeof summary === 'string' ? summary : ''
}

/** A language's summary and text; a body left with nothing in it is removed. */
export function withBody(
  data: Data,
  language: ContentLanguage,
  patch: { summary?: string; text?: string },
): Data {
  const body: Data = { ...(bodyOf(data, language) ?? {}) }
  if (patch.summary !== undefined) body.summary = patch.summary
  if (patch.text !== undefined) body.blocks = textToBlocks(patch.text, body.blocks)
  if (body.summary === '') delete body.summary
  if (Array.isArray(body.blocks) && body.blocks.length === 0) delete body.blocks
  const next = { ...data }
  if (Object.keys(body).length === 0) delete next[language]
  else next[language] = body
  return next
}

export const listText = (value: unknown) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string').join(', ') : ''
export const textList = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

/** Bundled index rows repeat the names (`en`, `es`); keep them in step with the entry's names. */
export function withNames(
  entry: EntryInput,
  names: { name_en?: string; name_es?: string },
): EntryInput {
  const next = { ...entry, ...names }
  const index = indexOf(entry.data)
  if ('en' in index || 'es' in index)
    next.data = withIndex(entry.data, {
      ...('en' in index ? { en: next.name_en } : {}),
      ...('es' in index ? { es: next.name_es } : {}),
    })
  return next
}
