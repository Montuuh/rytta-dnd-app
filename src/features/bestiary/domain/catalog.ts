import { crValue } from './stats'
import type {
  BestiaryLanguage,
  ChallengeRating,
  CreatureSize,
  CreatureType,
  MonsterRow,
} from './types'

/** Case- and accent-insensitive search key. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** One row of the bestiary list: an SRD creature or a campaign (homebrew) creature. */
export type CreatureListItem = {
  /** `srd:<id>` or `hb:<template uuid>`; stable across languages. */
  key: string
  source: 'srd' | 'homebrew'
  /** SRD id or template id. */
  id: string
  name: string
  /** The other language's name (SRD only), searchable and shown as a gloss. */
  altName?: string
  cr: ChallengeRating | null
  type: CreatureType | null
  size: CreatureSize[]
  ac: number
  hp: number
  initiative: number
  legendary: number
  /** The SRD creature a homebrew one was customised from. */
  srdId?: string | null
  /** A private image: the campaign creature's own, or the DM's image for an SRD creature. */
  imagePath?: string | null
  /** The SRD creature whose bundled art stands in when there is no private image (RYT-053). */
  artId?: string | null
  /** The side a campaign creature joins fights on (its token's shape). */
  side?: 'enemy' | 'ally'
}

export function srdItems(rows: MonsterRow[], language: BestiaryLanguage): CreatureListItem[] {
  return rows.map((row) => ({
    key: `srd:${row.id}`,
    source: 'srd',
    id: row.id,
    name: row[language],
    altName: row[language === 'es' ? 'en' : 'es'],
    cr: row.cr,
    type: row.type,
    size: row.size,
    ac: row.ac,
    hp: row.hp,
    initiative: row.init,
    legendary: row.leg ?? 0,
  }))
}

export type CreatureSort = 'name' | 'cr'
export type CreatureFilters = {
  query: string
  source: 'all' | 'srd' | 'homebrew' | 'favorites'
  types: CreatureType[]
  sizes: CreatureSize[]
  /** Inclusive CR range by index in `challengeRatings`. */
  crRange: [number, number] | null
  sort: CreatureSort
}
export const emptyFilters: CreatureFilters = {
  query: '',
  source: 'all',
  types: [],
  sizes: [],
  crRange: null,
  sort: 'name',
}

/**
 * Filters and orders the list. A query matches either language's name (prefixes of every word
 * rank first); without a query the list follows the chosen sort.
 */
export function filterCreatures(
  items: CreatureListItem[],
  filters: CreatureFilters,
  favorites: ReadonlySet<string>,
  crOrder: readonly string[],
): CreatureListItem[] {
  const query = searchKey(filters.query)
  const words = query ? query.split(' ') : []
  const scored: { item: CreatureListItem; score: number }[] = []
  for (const item of items) {
    if (filters.source === 'srd' && item.source !== 'srd') continue
    if (filters.source === 'homebrew' && item.source !== 'homebrew') continue
    if (filters.source === 'favorites' && !favorites.has(item.key)) continue
    if (filters.types.length && (!item.type || !filters.types.includes(item.type))) continue
    if (filters.sizes.length && !item.size.some((s) => filters.sizes.includes(s))) continue
    if (filters.crRange) {
      const at = item.cr === null ? -1 : crOrder.indexOf(item.cr)
      if (at < filters.crRange[0] || at > filters.crRange[1]) continue
    }
    let score = 0
    if (words.length) {
      const names = [searchKey(item.name), item.altName ? searchKey(item.altName) : '']
      const hit = names.findIndex((n) => words.every((w) => n.includes(w)))
      if (hit < 0) continue
      const name = names[hit]!
      score = name === query ? 0 : name.startsWith(query) ? 1 : hit === 0 ? 2 : 3
    }
    scored.push({ item, score })
  }
  const byName = (a: CreatureListItem, b: CreatureListItem) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const byCr = (a: CreatureListItem, b: CreatureListItem) =>
    (a.cr === null ? -1 : crValue(a.cr)) - (b.cr === null ? -1 : crValue(b.cr)) || byName(a, b)
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        (filters.sort === 'cr' ? byCr(a.item, b.item) : byName(a.item, b.item)),
    )
    .map((x) => x.item)
}
