import type { StatBlock } from './types'

/** A per-creature tracker created when the creature joins a fight (ADR 028). */
export type TrackerDefinition =
  | { key: string; kind: 'recharge'; label: string; min: number }
  | { key: string; kind: 'uses'; label: string; max: number }

const MAX_TRACKERS = 24

/**
 * Trackers a stat block needs at the table: every "Recharge X–6" entry, every "N/Day" entry
 * (Legendary Resistance included) and every spell castable N times per day. Keys are
 * language-neutral (entry keys, glossary spell ids), so a fight reads the same in both languages.
 */
export function trackersOf(
  block: StatBlock,
  spellLabel: (spellId: string, perDay: number) => string,
): TrackerDefinition[] {
  const out: TrackerDefinition[] = []
  const seen = new Set<string>()
  const push = (tracker: TrackerDefinition) => {
    if (seen.has(tracker.key) || out.length >= MAX_TRACKERS) return
    seen.add(tracker.key)
    out.push({ ...tracker, label: tracker.label.slice(0, 120) })
  }
  for (const section of block.sections)
    for (const entry of section.entries) {
      if (entry.usage?.recharge)
        push({ key: entry.key, kind: 'recharge', label: entry.name, min: entry.usage.recharge })
      else if (entry.usage?.perDay)
        push({ key: entry.key, kind: 'uses', label: entry.name, max: entry.usage.perDay })
      for (const list of entry.spells ?? [])
        for (const spell of list.spells)
          push({
            key: `${entry.key}:${spell}`,
            kind: 'uses',
            label: spellLabel(spell, list.perDay),
            max: list.perDay,
          })
    }
  return out
}

/** Reads "(Recharge 5–6)", "(Recarga 6)", "(3/Day)" or "(2/día…)" from an entry name. */
export function usageFromName(name: string): { recharge?: number; perDay?: number } {
  const recharge = name.match(/\((?:[^)]*?\b)?(?:recharge|recarga)\s+(\d)(?:\s*[–-]\s*6)?\)/i)
  if (recharge) return { recharge: Number(recharge[1]) }
  const perDay = name.match(/\((\d)\s*\/\s*(?:day|día)/i)
  if (perDay) return { perDay: Number(perDay[1]) }
  return {}
}
