import type { Catalog, GlossaryCategory, GlossaryEntry } from './catalog'
import { searchKey } from './normalize'

export type SearchHit = { entry: GlossaryEntry; score: number; matched: string | null }

function distanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      // Substitution or adjacent transposition.
      if (a[i + 1] === b[j] && a[j + 1] === b[i]) {
        i += 2
        j += 2
        continue
      }
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

function scoreKey(query: string, key: string, weight: number): number {
  if (!key) return 0
  if (key === query) return 100 * weight
  if (key.startsWith(query)) return 80 * weight - Math.min(20, key.length - query.length) / 10
  if (key.split(' ').some((word) => word.startsWith(query))) return 60 * weight
  if (key.includes(query)) return 40 * weight
  if (query.length >= 5 && key.split(' ').some((word) => distanceAtMostOne(word, query)))
    return 25 * weight
  return 0
}

export type SearchOptions = {
  category?: GlossaryCategory | 'all'
  summaries?: Record<string, string>
  limit?: number
}

/**
 * Ranked search over names (both languages), aliases and optionally summaries. Accent- and
 * case-insensitive; "grappled" finds "Agarrado" in a Spanish catalog.
 */
export function searchGlossary(
  catalog: Catalog,
  rawQuery: string,
  options: SearchOptions = {},
): SearchHit[] {
  const query = searchKey(rawQuery)
  if (!query) return []
  const hits: SearchHit[] = []
  for (const entry of catalog.entries) {
    if (options.category && options.category !== 'all' && entry.category !== options.category)
      continue
    let best = scoreKey(query, searchKey(entry.name), 1.2)
    let matched: string | null = null
    const candidates: [string, number][] = [
      ...entry.aliases.map((a) => [a, 1] as [string, number]),
      ...(entry.otherName ? [[entry.otherName, 0.95] as [string, number]] : []),
      ...entry.otherAliases.map((a) => [a, 0.9] as [string, number]),
    ]
    for (const [candidate, weight] of candidates) {
      const score = scoreKey(query, searchKey(candidate), weight)
      if (score > best) {
        best = score
        matched = candidate
      }
    }
    if (!best && options.summaries) {
      const summary = options.summaries[entry.id]
      if (summary && query.length >= 3 && searchKey(summary).includes(query)) best = 10
    }
    if (best > 0) hits.push({ entry, score: best, matched })
  }
  hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
  return options.limit ? hits.slice(0, options.limit) : hits
}
