import { z } from 'zod'

/** RYT-008 campaign homebrew entries; the SQL RPCs re-validate every field (ADR 023). */
export const homebrewCategories = ['rule', 'condition', 'action', 'spell', 'lore', 'other'] as const
export type HomebrewCategory = (typeof homebrewCategories)[number]

export const homebrewLimits = {
  name: 80,
  alias: 60,
  aliases: 10,
  summary: 280,
  body: 8000,
  facts: 8,
  factLabel: 40,
  factValue: 200,
} as const

const srdRef = z.string().regex(/^[a-z]+\.[a-z0-9-]{1,80}$/)
const factSchema = z
  .object({
    label: z.string().trim().min(1).max(homebrewLimits.factLabel),
    value: z.string().trim().min(1).max(homebrewLimits.factValue),
  })
  .strict()

export const homebrewEntrySchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  category: z.enum(homebrewCategories),
  name: z.string().min(1).max(homebrewLimits.name),
  aliases: z.array(z.string().min(1).max(homebrewLimits.alias)).max(homebrewLimits.aliases),
  summary: z.string().max(homebrewLimits.summary),
  body: z.string().max(homebrewLimits.body),
  facts: z.array(factSchema).max(homebrewLimits.facts),
  srd_ref: srdRef.nullable(),
  revision: z.number().int().min(1),
  created_by: z.uuid().nullable(),
  updated_by: z.uuid().nullable(),
  updated_at: z.string(),
})
export type HomebrewEntry = z.infer<typeof homebrewEntrySchema>

export const homebrewDraftSchema = z
  .object({
    category: z.enum(homebrewCategories),
    name: z.string().trim().min(1).max(homebrewLimits.name),
    aliases: z
      .array(z.string().trim().min(1).max(homebrewLimits.alias))
      .max(homebrewLimits.aliases),
    summary: z.string().trim().max(homebrewLimits.summary),
    body: z.string().trim().max(homebrewLimits.body),
    facts: z.array(factSchema).max(homebrewLimits.facts),
    srd_ref: srdRef.nullable(),
  })
  .strict()
export type HomebrewDraft = z.infer<typeof homebrewDraftSchema>

export const emptyDraft = (srdRef: string | null = null): HomebrewDraft => ({
  category: srdRef ? 'rule' : 'lore',
  name: '',
  aliases: [],
  summary: '',
  body: '',
  facts: [],
  srd_ref: srdRef,
})

/** Comma or newline separated aliases, trimmed and de-duplicated case-insensitively. */
export function parseAliases(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(/[,\n]/)) {
    const alias = part.trim()
    if (!alias || seen.has(alias.toLocaleLowerCase())) continue
    seen.add(alias.toLocaleLowerCase())
    out.push(alias)
  }
  return out
}

export type GlossaryErrorCode =
  'stale' | 'duplicate' | 'forbidden' | 'invalid' | 'unavailable' | 'unknown'
export class GlossaryError extends Error {
  readonly code: GlossaryErrorCode
  constructor(code: GlossaryErrorCode) {
    super(code)
    this.code = code
  }
}
export function glossaryError(message: string) {
  if (/Stale revision/.test(message)) return new GlossaryError('stale')
  if (/Duplicate name/.test(message)) return new GlossaryError('duplicate')
  if (/Forbidden|permission denied/.test(message)) return new GlossaryError('forbidden')
  if (/Invalid request/.test(message)) return new GlossaryError('invalid')
  if (/fetch|network|Failed to fetch/i.test(message)) return new GlossaryError('unavailable')
  return new GlossaryError('unknown')
}

/** Homebrew entries live under their own id namespace so they never collide with SRD ids. */
export const homebrewEntryId = (uuid: string) => `homebrew.${uuid}`
export const homebrewUuid = (entryId: string) =>
  entryId.startsWith('homebrew.') ? entryId.slice('homebrew.'.length) : null

/** Homebrew body: paragraphs separated by blank lines; single newlines are kept. */
export const homebrewParagraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
