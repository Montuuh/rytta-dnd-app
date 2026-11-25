import { searchKey } from '@/features/bestiary'

type Named = { name: string; altName?: string | null }

/**
 * Where a name stands for a query (lower is better): 0 the name starts with it, 1 a word of the
 * name starts with it, 2 it appears elsewhere in the name. -1 when some word of the query is not
 * in the name at all. Accents and case are ignored (`searchKey`).
 */
function tierOf(name: string, query: string, words: readonly string[]) {
  if (!words.every((word) => name.includes(word))) return -1
  if (name.startsWith(query)) return 0
  if (words.every((word) => ` ${name}`.includes(` ${word}`))) return 1
  return 2
}

/**
 * Creature search for the bestiary list: keeps the creatures whose name (or the other language's
 * name) holds every word of the query and puts the closest matches first: names that start with the
 * query, then names where a word starts with it, then the rest. The name in the interface language
 * outranks the other language's within a tier, and the order of `items` (the chosen sort) is kept
 * inside each rank. A blank query returns the items as they are.
 */
export function searchCreatures<T extends Named>(items: readonly T[], text: string): T[] {
  const query = searchKey(text)
  if (!query) return [...items]
  const words = query.split(' ')
  const ranked: { item: T; rank: number }[] = []
  for (const item of items) {
    const own = tierOf(searchKey(item.name), query, words)
    const other = item.altName ? tierOf(searchKey(item.altName), query, words) : -1
    if (own < 0 && other < 0) continue
    ranked.push({ item, rank: Math.min(own < 0 ? 9 : own * 2, other < 0 ? 9 : other * 2 + 1) })
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.item)
}
