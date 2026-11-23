import { z } from 'zod'
import { entryBodySchema, indexRowSchema, type EntryBodies, type IndexRow } from './types'

/**
 * RYT-164, RYT-165: spells, class features and rules come from the content packs a campaign uses
 * (ADR 051). Each pack category loads at the campaign's pinned version; entries the DM hid, and
 * entries of packs turned off, stay readable for characters that already have them but are no
 * longer offered (owner choice P2 A).
 */
export const ruleCategories = ['spells', 'classes', 'rules'] as const
export type RuleCategory = (typeof ruleCategories)[number]

export const rulePackSchema = z.object({
  id: z.uuid(),
  ref: z.string().regex(/^[0-9a-f]{8}$/),
  title_en: z.string(),
  title_es: z.string(),
  srd: z.boolean(),
  category: z.enum(ruleCategories),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  hidden: z.array(z.string()),
})
export type RulePack = z.infer<typeof rulePackSchema>
export const rulePacksSchema = z.array(rulePackSchema)

export type RuleIndex = { version: number; rows: IndexRow[]; unreadable: number }
const indexPayload = z.object({ version: z.number().int(), rows: z.array(z.unknown()) })
const bodiesPayload = z.object({
  version: z.number().int(),
  bodies: z.record(z.string(), z.unknown()),
})

/** A pack category's index rows; rows the glossary cannot read are counted, not shown. */
export function parseRuleIndex(data: unknown): RuleIndex {
  const payload = indexPayload.parse(data)
  const rows: IndexRow[] = []
  for (const raw of payload.rows) {
    const parsed = indexRowSchema.safeParse(raw)
    if (parsed.success) rows.push(parsed.data)
  }
  return { version: payload.version, rows, unreadable: payload.rows.length - rows.length }
}

/** A pack category's bodies in one language (the other one where it has none). */
export function parseRuleBodies(data: unknown): EntryBodies {
  const payload = bodiesPayload.parse(data)
  const bodies: EntryBodies = {}
  for (const [id, raw] of Object.entries(payload.bodies)) {
    const parsed = entryBodySchema.safeParse(raw)
    if (parsed.success) bodies[id] = parsed.data
  }
  return bodies
}

/**
 * Ids the campaign no longer offers: hidden entries, and every entry of a pack category turned
 * off. They stay readable (names, texts) for what characters already have.
 */
export function unlistedIds(
  packs: readonly RulePack[],
  indexes: readonly (RuleIndex | undefined)[],
) {
  const ids = new Set<string>()
  packs.forEach((pack, at) => {
    for (const id of pack.hidden) ids.add(id)
    if (!pack.enabled) for (const row of indexes[at]?.rows ?? []) ids.add(row.id)
  })
  return ids
}
