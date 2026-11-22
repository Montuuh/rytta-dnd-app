import { z } from 'zod'
import { proficiencyForCr, xpForCr } from './stats'
import {
  challengeRatings,
  creatureSizes,
  creatureTypes,
  entryKeyPattern,
  libraryTraitSchema,
  statBlockSchema,
  type LibraryTrait,
  type MonsterRow,
  type StatBlock,
} from './types'

/**
 * RYT-094: creatures come from the content packs a campaign uses (ADR 051). An SRD creature keeps
 * its bare key; a creature from another pack is stored as `<pack ref>--<key>` (keys never contain
 * `--`), so fights, tokens, images and campaign versions know which pack it comes from.
 */
export const creatureReferencePattern = /^(?:[0-9a-f]{8}--)?[a-z0-9]+(?:-[a-z0-9]+)*$/

export const creaturePackSchema = z.object({
  id: z.uuid(),
  ref: z.string().regex(/^[0-9a-f]{8}$/),
  slug: z.string(),
  title_en: z.string(),
  title_es: z.string(),
  srd: z.boolean(),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  hidden: z.array(z.string()),
})
export type CreaturePack = z.infer<typeof creaturePackSchema>
export const creaturePacksSchema = z.array(creaturePackSchema)

export const creatureReference = (pack: Pick<CreaturePack, 'srd' | 'ref'>, key: string) =>
  pack.srd ? key : `${pack.ref}--${key}`

/** The pack ref of a stored reference, or null for an SRD creature. */
export function referencePack(reference: string): string | null {
  const at = reference.indexOf('--')
  return at === 8 ? reference.slice(0, 8) : null
}

/** The pack key of a stored reference (an SRD reference is its key). */
export const referenceKey = (reference: string) =>
  referencePack(reference) === null ? reference : reference.slice(10)

export const packTitle = (pack: Pick<CreaturePack, 'title_en' | 'title_es'>, language: string) =>
  (language.startsWith('en') ? pack.title_en : pack.title_es) || pack.title_en || pack.title_es

/**
 * One row of a pack's index. The SRD rows carry every field; a custom pack may leave out the ones
 * the app can derive (XP, proficiency, pages, names repeated from the entry).
 */
const packRowSchema = z.object({
  id: z.string().regex(entryKeyPattern),
  name_en: z.string().default(''),
  name_es: z.string().default(''),
  en: z.string().optional(),
  es: z.string().optional(),
  cr: z.enum(challengeRatings as unknown as [string, ...string[]]),
  xp: z.number().int().min(0).optional(),
  pb: z.number().int().min(2).max(9).optional(),
  ac: z.number().int().min(1).max(30),
  hp: z.number().int().min(1),
  init: z.number().int().default(0),
  size: z.array(z.enum(creatureSizes)).min(1),
  type: z.enum(creatureTypes),
  tags: z.array(z.string()).optional(),
  swarm: z.literal(1).optional(),
  pages: z.object({ en: z.number().int(), es: z.number().int() }).optional(),
  group: z.object({ en: z.string(), es: z.string() }).optional(),
  xpLair: z.number().int().optional(),
  leg: z.number().int().min(1).max(9).optional(),
  legLair: z.number().int().optional(),
  animal: z.literal(1).optional(),
})

export type PackIndex = { version: number; rows: MonsterRow[]; unreadable: number }
export type PackBodies = {
  version: number
  monsters: Record<string, StatBlock>
  traits: LibraryTrait[]
  unreadable: number
}

const indexPayload = z.object({ version: z.number().int(), rows: z.array(z.unknown()) })
const bodiesPayload = z.object({
  version: z.number().int(),
  monsters: z.record(z.string(), z.unknown()),
  traits: z.array(z.unknown()),
})

/** A pack's index as bestiary rows keyed by reference; rows the app cannot read are counted. */
export function parsePackIndex(data: unknown, pack: Pick<CreaturePack, 'srd' | 'ref'>): PackIndex {
  const payload = indexPayload.parse(data)
  const rows: MonsterRow[] = []
  for (const raw of payload.rows) {
    const parsed = packRowSchema.safeParse(raw)
    if (!parsed.success) continue
    const { name_en, name_es, ...row } = parsed.data
    const en = row.en || name_en || name_es
    const es = row.es || name_es || en
    if (!en) continue
    rows.push({
      ...row,
      id: creatureReference(pack, row.id),
      en,
      es,
      xp: row.xp ?? xpForCr(row.cr),
      pb: row.pb ?? proficiencyForCr(row.cr),
      pages: row.pages ?? { en: 0, es: 0 },
    })
  }
  return { version: payload.version, rows, unreadable: payload.rows.length - rows.length }
}

/** A pack's stat blocks in one language keyed by reference, and its trait library. */
export function parsePackBodies(
  data: unknown,
  pack: Pick<CreaturePack, 'srd' | 'ref'>,
): PackBodies {
  const payload = bodiesPayload.parse(data)
  const monsters: Record<string, StatBlock> = {}
  let unreadable = 0
  for (const [key, raw] of Object.entries(payload.monsters)) {
    const parsed = statBlockSchema.safeParse(raw)
    if (parsed.success) monsters[creatureReference(pack, key)] = parsed.data
    else unreadable++
  }
  const traits: LibraryTrait[] = []
  for (const raw of payload.traits) {
    const parsed = libraryTraitSchema.safeParse(raw)
    if (parsed.success) traits.push(parsed.data)
  }
  return { version: payload.version, monsters, traits, unreadable }
}
