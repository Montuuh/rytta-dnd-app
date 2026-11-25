/** Lower case and strip accents, so "botin" finds "Botín" and "NIVEL" finds "nivel". */
export function normalizeSearch(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
}

type Searchable = { label: string; keywords?: string }

/**
 * Entries that contain every word of the query in their label or keywords, ignoring case and
 * accents. Label matches come before keyword-only matches; ties keep the order given. An empty
 * query keeps every entry.
 */
export function filterEntries<T extends Searchable>(entries: readonly T[], query: string): T[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...entries]
  const ranked: { entry: T; rank: number; index: number }[] = []
  entries.forEach((entry, index) => {
    const label = normalizeSearch(entry.label)
    const keywords = normalizeSearch(entry.keywords ?? '')
    if (!words.every((word) => label.includes(word) || keywords.includes(word))) return
    const inLabel = words.every((word) => label.includes(word))
    const leading = words.every((word) =>
      label.split(/[\s-]+/).some((part) => part.startsWith(word)),
    )
    ranked.push({ entry, rank: leading ? 0 : inLabel ? 1 : 2, index })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map(({ entry }) => entry)
}
