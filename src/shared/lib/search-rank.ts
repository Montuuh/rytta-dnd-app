/** Case- and accent-insensitive key: "Poción" and "pocion" meet, punctuation is a word break. */
export function foldSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** 0 the name starts with the query, 1 a word of it does, 2 it appears elsewhere, null no match. */
export type MatchRank = 0 | 1 | 2

/**
 * How well `query` matches the best of `labels` (a name and its translation, for example).
 * An empty query matches everything at rank 0.
 */
export function matchRank(query: string, labels: readonly string[]): MatchRank | null {
  const needle = foldSearch(query)
  if (!needle) return 0
  let best: MatchRank | null = null
  for (const label of labels) {
    const text = foldSearch(label)
    if (!text.includes(needle)) continue
    const rank: MatchRank = text.startsWith(needle) ? 0 : text.includes(` ${needle}`) ? 1 : 2
    if (best === null || rank < best) best = rank
  }
  return best
}

/**
 * The items that match `query`, best matches first: names that start with it, then names where a
 * word starts with it, then the rest. Inside one rank the incoming order is kept, so a list that
 * is already sorted stays sorted. An empty query returns the items untouched.
 */
export function rankSearch<T>(
  items: readonly T[],
  query: string,
  labels: (item: T) => readonly string[],
): T[] {
  if (!foldSearch(query)) return [...items]
  const ranked: { item: T; rank: MatchRank; index: number }[] = []
  items.forEach((item, index) => {
    const rank = matchRank(query, labels(item))
    if (rank !== null) ranked.push({ item, rank, index })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((entry) => entry.item)
}
