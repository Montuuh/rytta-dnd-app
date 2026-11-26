import { liveCategories, type ContentCategory, type ContentPack } from '../domain/content'

/** RYT-184: one thing a pack brings, as the card's line names it; `count` is null when unknown. */
export type SummaryPart = { category: ContentCategory; count: number | null }

/** The entry kind whose count stands for the category (a creature's traits are not creatures). */
const headKind: Record<ContentCategory, string> = {
  creatures: 'creature',
  spells: 'spell',
  classes: 'class',
  rules: 'rule',
  items: 'item',
}
/** Creatures, spells and classes always carry their number; rules and items only when alone. */
const numbered: readonly ContentCategory[] = ['creatures', 'spells', 'classes']

/**
 * What the pack brings, from the categories in use (or from all of them when `all`): the parts of
 * the card's line, in the order the panel lists categories. A category with nothing in it is left
 * out. `partial` is true when the pack has categories the campaign does not use.
 */
export function packParts(pack: ContentPack, all = false) {
  const chosen = pack.categories
    .filter((entry) => all || entry.enabled)
    .sort((a, b) => liveCategories.indexOf(a.category) - liveCategories.indexOf(b.category))
  const parts: SummaryPart[] = chosen
    .filter((entry) => entry.entries > 0)
    .map((entry) => {
      const head = entry.kinds[headKind[entry.category]]
      // Without a kind breakdown the category total is the best number for a category whose head
      // kind is its only kind; classes then say "clases" without one.
      const count = head ?? (entry.category === 'classes' ? null : entry.entries)
      return { category: entry.category, count }
    })
    .filter((part) => part.count !== 0)
  const alone = parts.length === 1
  return {
    parts: parts.map((part) => ({
      ...part,
      count: numbered.includes(part.category) || alone ? part.count : null,
    })),
    partial: !all && chosen.length < pack.categories.length,
  }
}

/** What a published index says about an entry, before words are chosen for it. */
export type EntryLine =
  | { kind: 'creature'; type: string | null; cr: string | null }
  | { kind: 'spell'; level: number | null; school: string | null }
  | { kind: 'item'; category: string | null }
  | null

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** The facts of an entry's one-line description, from its index; null when it has none to show. */
export function entryLine(kind: string, index: Record<string, unknown>): EntryLine {
  if (kind === 'creature') {
    const type = text(index.type)
    const cr = text(index.cr) ?? (typeof index.cr === 'number' ? String(index.cr) : null)
    return type || cr ? { kind, type, cr } : null
  }
  if (kind === 'spell') {
    const level = typeof index.lv === 'number' ? index.lv : null
    const school = text(index.sc)
    return level !== null || school ? { kind, level, school } : null
  }
  if (kind === 'item') {
    const category = text(index.category)
    return category ? { kind, category } : null
  }
  return null
}
