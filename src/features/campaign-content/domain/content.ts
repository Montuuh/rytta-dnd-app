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

/** RYT-174: the renamed base pack says what it starts from; a title that names the SRD does not. */
export const startsFromSrd = (pack: { srd: boolean }, title: string) =>
  pack.srd && !/srd|5\.2\.1|system reference|referencia del sistema/i.test(title)

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

/** RYT-167: a pack a new campaign can use, with the categories it has. */
export const contentChoiceSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title_en: z.string(),
  title_es: z.string(),
  srd: z.boolean(),
  private: z.boolean(),
  version: z.number().int().positive(),
  categories: z.array(
    z.object({
      category: z.enum(contentCategories),
      entries: z.number().int().min(0),
      /** A new campaign starts with it (the SRD, and the items of the Rytta basics). */
      default: z.boolean(),
    }),
  ),
})
export type ContentChoice = z.infer<typeof contentChoiceSchema>
export const contentChoicesSchema = z.array(contentChoiceSchema)
export type ChosenContent = { pack: string; category: ContentCategory }
export const choiceKey = (pack: string, category: string) => `${pack}:${category}`

/** What a new campaign starts with: the SRD, and the items of the Rytta basics. */
export const defaultChoice = (choices: readonly ContentChoice[]) =>
  new Set(
    choices.flatMap((pack) =>
      pack.categories
        .filter((item) => item.default)
        .map((item) => choiceKey(pack.id, item.category)),
    ),
  )
export function chosenContent(choices: readonly ContentChoice[], picked: ReadonlySet<string>) {
  return choices.flatMap((pack) =>
    pack.categories
      .filter((item) => picked.has(choiceKey(pack.id, item.category)))
      .map((item): ChosenContent => ({ pack: pack.id, category: item.category })),
  )
}
