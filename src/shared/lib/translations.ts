import { z } from 'zod'

// Optional second-language text of user content. The record's own name and description are
// the original and the fallback.
/** RYT-176: the longest text an item carries, so a magic item of the SRD fits whole. */
export const descriptionLimit = 10000
/** A Player's proposal keeps the old limit: its draft is stored under a smaller byte ceiling. */
export const proposalDescriptionLimit = 2000
const entry = z.object({
  name: z.string().max(100).optional(),
  description: z.string().max(descriptionLimit).optional(),
})

export const translationsSchema = z
  .object({ en: entry.optional(), es: entry.optional() })
  .nullish()
  .transform((value) => value ?? null)

export type Translations = z.infer<typeof translationsSchema>

type Translatable = { name: string; description?: string | null; translations?: Translations }

const pick = (translations: Translations | undefined, language: string) =>
  translations?.[language.toLowerCase().startsWith('en') ? 'en' : 'es']

export const localizedName = (record: Translatable, language: string) =>
  pick(record.translations, language)?.name?.trim() || record.name

export const localizedDescription = (record: Translatable, language: string) =>
  pick(record.translations, language)?.description?.trim() || (record.description ?? '')
