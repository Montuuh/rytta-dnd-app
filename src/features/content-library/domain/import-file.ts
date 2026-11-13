import { z } from 'zod'
import { entryProblem, kindPattern, type EntryInput, type EntryProblem } from './library'

/**
 * A Rytta content file: `{ "format": "rytta-content", "version": 1, "kind"?: string, "entries": [...] }`.
 * Each entry has a key, a name in English and/or Spanish, its data object and, when the file has
 * no `kind`, its own `kind`. The file is checked here before any batch reaches the server, which
 * repeats every check.
 */
export const fileSizeLimit = 20 * 1024 * 1024
export const fileEntryLimit = 5000
const batchEntries = 200
const batchBytes = 1_500_000

const fileSchema = z.object({
  format: z.literal('rytta-content'),
  version: z.literal(1),
  kind: z.string().regex(kindPattern).optional(),
  entries: z.array(z.unknown()).min(1).max(fileEntryLimit),
})

export type FileProblem = { position: number; key: string | null; reason: EntryProblem }
export type ParsedFile = {
  groups: { kind: string; entries: EntryInput[] }[]
  problems: FileProblem[]
  total: number
}
export type FileError = 'tooLarge' | 'notJson' | 'notContent'

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function parseContentFile(source: string): ParsedFile | FileError {
  if (source.length > fileSizeLimit) return 'tooLarge'
  let json: unknown
  try {
    json = JSON.parse(source)
  } catch {
    return 'notJson'
  }
  const file = fileSchema.safeParse(json)
  if (!file.success) return 'notContent'
  const groups = new Map<string, EntryInput[]>()
  const seen = new Set<string>()
  const problems: FileProblem[] = []
  file.data.entries.forEach((raw, index) => {
    const position = index + 1
    const item =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
    const entry: EntryInput = {
      kind: text(item?.kind) || file.data.kind || '',
      key: text(item?.key),
      name_en: text(item?.name_en),
      name_es: text(item?.name_es),
      data: (item?.data ?? null) as Record<string, unknown>,
    }
    const id = `${entry.kind}:${entry.key}`
    const reason: EntryProblem | null = !item
      ? 'data'
      : seen.has(id)
        ? 'duplicate'
        : entryProblem(entry)
    if (reason) {
      problems.push({ position, key: entry.key || null, reason })
      return
    }
    seen.add(id)
    groups.set(entry.kind, [...(groups.get(entry.kind) ?? []), entry])
  })
  return {
    groups: [...groups].map(([kind, entries]) => ({ kind, entries })),
    problems,
    total: file.data.entries.length,
  }
}

/** Batches the server accepts: at most 200 entries and about 1.5 MB each. */
export function batches<T>(entries: T[]): T[][] {
  const result: T[][] = []
  let current: T[] = []
  let bytes = 0
  for (const entry of entries) {
    const size = JSON.stringify(entry).length
    if (current.length && (current.length >= batchEntries || bytes + size > batchBytes)) {
      result.push(current)
      current = []
      bytes = 0
    }
    current.push(entry)
    bytes += size
  }
  if (current.length) result.push(current)
  return result
}

/** The file a pack's drafts of one kind would export to (the same format the import reads). */
export function contentFile(kind: string, entries: EntryInput[]) {
  return {
    format: 'rytta-content' as const,
    version: 1 as const,
    kind,
    entries: entries.map(({ key, name_en, name_es, data }) => ({ key, name_en, name_es, data })),
  }
}
