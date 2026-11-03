import type { Catalog } from './catalog'
import { fold } from './normalize'

export type LinkSegment = { text: string; id?: string }

export type Linker = {
  /**
   * Splits plain text into text and term segments. `seen` carries ids already linked in the
   * current block (each term is linked once per block); `selfId` is never linked.
   */
  link(text: string, options?: { selfId?: string; seen?: Set<string> }): LinkSegment[]
  /** Exact (accent/case-insensitive) name or alias lookup, e.g. for an emphasized spell name. */
  lookup(name: string): string | null
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Builds the automatic term linker. Rules:
 * - only entries flagged for auto-linking; generic words (Action, Creature, …) are excluded
 *   in the bundled index and stay linkable explicitly by id;
 * - the longest match wins ("tirada de salvación" over "salvación");
 * - Unicode word boundaries, accent- and case-insensitive;
 * - spells link in prose only with their exact capitalization and a distinctive name
 *   (several words or 7+ letters), avoiding "Light", "Shield", "Aid" in ordinary sentences;
 * - abbreviations (2–4 capitals: CON, DES, CA, PG) link only as written.
 */
export function createLinker(catalog: Catalog): Linker {
  const terms = new Map<string, { id: string; exact: string | null }>()
  const exactNames = new Map<string, string>()
  for (const entry of catalog.entries) {
    for (const name of [entry.name, ...entry.aliases]) {
      const key = fold(name.trim())
      // Abbreviations (CON, DES, CA, PG) are unambiguous as written and link only that way,
      // even for entries whose full name is too generic to auto-link: "con" is a plain word.
      const abbreviation = /^\p{Lu}{2,4}$/u.test(name.trim())
      if (key.length < 3 && !abbreviation) continue
      if (!exactNames.has(key)) exactNames.set(key, entry.id)
      if (abbreviation) {
        if (!terms.has(key)) terms.set(key, { id: entry.id, exact: name.trim() })
        continue
      }
      if (!entry.autolink) continue
      if (entry.category === 'spell') {
        if (!name.includes(' ') && name.length < 7) continue
        if (!terms.has(key)) terms.set(key, { id: entry.id, exact: name })
        continue
      }
      // Homebrew wins over SRD for the same word: the campaign's own definition comes first.
      const existing = terms.get(key)
      if (!existing || entry.source === 'homebrew') terms.set(key, { id: entry.id, exact: null })
    }
  }
  const alternatives = [...terms.keys()].sort((a, b) => b.length - a.length).map(escape)
  const pattern = alternatives.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'gu')
    : null

  return {
    lookup: (name) => exactNames.get(fold(name.trim())) ?? null,
    link(text, options = {}) {
      if (!pattern || !text) return [{ text }]
      const folded = fold(text)
      const out: LinkSegment[] = []
      let last = 0
      for (const match of folded.matchAll(pattern)) {
        const term = terms.get(match[0])
        if (!term) continue
        const start = match.index
        const original = text.slice(start, start + match[0].length)
        if (term.exact && original !== term.exact) continue
        if (term.id === options.selfId || options.seen?.has(term.id)) continue
        options.seen?.add(term.id)
        if (start > last) out.push({ text: text.slice(last, start) })
        out.push({ text: original, id: term.id })
        last = start + match[0].length
      }
      if (last < text.length) out.push({ text: text.slice(last) })
      return out.length ? out : [{ text }]
    },
  }
}
