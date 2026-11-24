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

/** RYT-168, RYT-171: pack kinds read by the characters feature, not shown as glossary entries. */
export const characterKinds = ['class', 'subclass', 'species', 'background', 'feat'] as const
export type CharacterKind = (typeof characterKinds)[number]
/**
 * RYT-168: a class or subclass of a pack (RYT-171: or a species, background or feat), kept apart
 * from the glossary: `key` is its reference (`wizard`, `<ref>--rune-knight`) and `data` its other
 * index fields, read by the characters feature.
 */
export type ClassRow = {
  id: string
  cat: CharacterKind
  key: string
  en: string
  es: string
  data: Record<string, unknown>
  /** No longer offered by the campaign; characters that have it keep it. */
  hidden?: boolean
  /** The pack, for pack classes listed beside the SRD ones. */
  pack?: { title_en: string; title_es: string }
}
export type RuleIndex = {
  version: number
  rows: IndexRow[]
  classRows: ClassRow[]
  unreadable: number
}
const indexPayload = z.object({ version: z.number().int(), rows: z.array(z.unknown()) })
const bodiesPayload = z.object({
  version: z.number().int(),
  bodies: z.record(z.string(), z.unknown()),
})

/** A pack category's index rows; rows the glossary cannot read are counted, not shown. */
export function parseRuleIndex(data: unknown): RuleIndex {
  const payload = indexPayload.parse(data)
  const rows: IndexRow[] = []
  const classRows: ClassRow[] = []
  for (const raw of payload.rows) {
    const row = classRow(raw)
    if (row) {
      classRows.push(row)
      continue
    }
    const parsed = indexRowSchema.safeParse(raw)
    if (parsed.success) rows.push(parsed.data)
  }
  return {
    version: payload.version,
    rows,
    classRows,
    unreadable: payload.rows.length - rows.length - classRows.length,
  }
}

const classRowSchema = z.object({
  id: z
    .string()
    .regex(
      /^(class|subclass|species|background|feat)\.(?:[0-9a-f]{8}--)?[a-z0-9]+(?:-[a-z0-9]+)*$/,
    ),
  cat: z.enum(characterKinds),
  en: z.string().min(1).max(80),
  es: z.string().min(1).max(80),
})
function classRow(raw: unknown): ClassRow | null {
  const parsed = classRowSchema.safeParse(raw)
  if (!parsed.success || !parsed.data.id.startsWith(`${parsed.data.cat}.`)) return null
  const { id, cat, en, es, ...data } = raw as Record<string, unknown>
  void en
  void es
  return {
    id,
    cat,
    key: (id as string).slice((id as string).indexOf('.') + 1),
    en: parsed.data.en,
    es: parsed.data.es,
    data,
  } as ClassRow
}

/**
 * RYT-168: inside a pack other than the SRD, a class or subclass named by its bare key is one of
 * that pack's own: spells (`cl`), features (`fc`, `sb`) and subclasses (`class`) refer to it by its
 * reference, `<ref>--<key>`. Names that are not the pack's own stay as they are (SRD classes).
 * RYT-171: the same holds for a background's origin feat.
 */
export function localizeIndexes(
  packs: readonly RulePack[],
  indexes: readonly (RuleIndex | undefined)[],
): (RuleIndex | undefined)[] {
  type Own = { classes: Set<string>; subclasses: Set<string>; feats: Set<string> }
  const own = new Map<string, Own>()
  packs.forEach((pack, at) => {
    if (pack.srd) return
    const sets = own.get(pack.id) ?? {
      classes: new Set<string>(),
      subclasses: new Set<string>(),
      feats: new Set<string>(),
    }
    for (const row of indexes[at]?.classRows ?? []) {
      const bare = row.key.startsWith(`${pack.ref}--`) ? row.key.slice(10) : row.key
      if (row.cat === 'class') sets.classes.add(bare)
      else if (row.cat === 'subclass') sets.subclasses.add(bare)
      else if (row.cat === 'feat') sets.feats.add(bare)
    }
    own.set(pack.id, sets)
  })
  return indexes.map((index, at) => {
    const pack = packs[at]!
    const sets = own.get(pack.id)
    if (!index || pack.srd || !sets) return index
    const local = (set: Set<string>) => (value: string) =>
      set.has(value) ? `${pack.ref}--${value}` : value
    const cls = local(sets.classes)
    const sub = local(sets.subclasses)
    const feat = local(sets.feats)
    return {
      ...index,
      rows: index.rows.map((row) => ({
        ...row,
        ...(row.cl ? { cl: row.cl.map(cls) } : {}),
        ...(row.fc ? { fc: cls(row.fc) } : {}),
        ...(row.sb ? { sb: sub(row.sb) } : {}),
      })),
      classRows: index.classRows.map((row) =>
        row.cat === 'subclass' && typeof row.data.class === 'string'
          ? { ...row, data: { ...row.data, class: cls(row.data.class) } }
          : row.cat === 'background' && typeof row.data.feat === 'string'
            ? { ...row, data: { ...row.data, feat: feat(row.data.feat) } }
            : row,
      ),
    }
  })
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
    if (!pack.enabled) {
      for (const row of indexes[at]?.rows ?? []) ids.add(row.id)
      for (const row of indexes[at]?.classRows ?? []) ids.add(row.id)
    }
  })
  return ids
}
