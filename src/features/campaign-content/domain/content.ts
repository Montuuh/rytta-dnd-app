import { z } from 'zod'

export const contentCategories = ['creatures', 'spells', 'classes', 'rules', 'items'] as const
export type ContentCategory = (typeof contentCategories)[number]

/** Categories a module reads from the campaign's packs (RYT-094, RYT-164 to RYT-166). */
export const liveCategories: readonly ContentCategory[] = contentCategories

export const packCategorySchema = z.object({
  category: z.enum(contentCategories),
  enabled: z.boolean(),
  pinned_version: z.number().int().nullable(),
  entries: z.number().int(),
  hidden: z.number().int(),
})
export type PackCategory = z.infer<typeof packCategorySchema>

export const contentPackSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title_en: z.string(),
  title_es: z.string(),
  /** False for a pack made private: the campaign can only turn it off. */
  offered: z.boolean().default(true),
  /** The SRD pack: turning its creatures off also deletes the campaign's versions of them. */
  srd: z.boolean().default(false),
  /** Null when the pack is no longer offered: its newer versions stay out of reach. */
  version: z.number().int().nullable(),
  categories: z.array(packCategorySchema),
})
export type ContentPack = z.infer<typeof contentPackSchema>
export const campaignContentSchema = z.array(contentPackSchema)

export const contentChangeSchema = z.object({
  kind: z.string(),
  key: z.string(),
  name_en: z.string().nullable(),
  name_es: z.string().nullable(),
  change: z.enum(['new', 'changed', 'withdrawn']),
  hidden: z.boolean(),
  campaign_version: z.boolean(),
})
export type ContentChange = z.infer<typeof contentChangeSchema>
export const contentChangesSchema = z.object({
  pinned_version: z.number().int(),
  version: z.number().int(),
  changes: z.array(contentChangeSchema),
})
export type ContentChanges = z.infer<typeof contentChangesSchema>

export const contentEntrySchema = z.object({
  kind: z.string(),
  key: z.string(),
  name_en: z.string().nullable(),
  name_es: z.string().nullable(),
  hidden: z.boolean(),
})
export type ContentEntry = z.infer<typeof contentEntrySchema>
export const contentEntriesSchema = z.object({
  total: z.number().int(),
  entries: z.array(contentEntrySchema),
})

/** A pack enabled for a category at an older version than the one published. */
export const hasUpdate = (pack: ContentPack, category: PackCategory) =>
  pack.version !== null &&
  category.enabled &&
  category.pinned_version !== null &&
  category.pinned_version < pack.version

export const titleOf = (pack: ContentPack, language: string) =>
  (language.startsWith('es') ? pack.title_es || pack.title_en : pack.title_en || pack.title_es) ||
  pack.slug

export const nameOf = (
  entry: { name_en: string | null; name_es: string | null; key: string },
  language: string,
) =>
  (language.startsWith('es') ? entry.name_es || entry.name_en : entry.name_en || entry.name_es) ||
  entry.key

export type ContentErrorCode = 'forbidden' | 'stale' | 'invalid' | 'unavailable'
export function contentError(message: string): ContentErrorCode {
  if (/Forbidden|permission denied/i.test(message)) return 'forbidden'
  if (/Stale revision/i.test(message)) return 'stale'
  if (/Invalid/i.test(message)) return 'invalid'
  return 'unavailable'
}
