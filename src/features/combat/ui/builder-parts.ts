import type { TFunction } from 'i18next'
import { Feather, Flame, Scale, Skull, Swords, type LucideIcon } from 'lucide-react'
import type { DifficultyBand } from '../domain/difficulty'

/** RYT-054: one glyph per difficulty band, always beside its word (never colour alone). */
export const bandGlyphs: Record<DifficultyBand, LucideIcon> = {
  none: Scale,
  low: Feather,
  moderate: Swords,
  high: Flame,
  aboveHigh: Skull,
}

/** "A, B and C" in the interface language (not the browser's). */
export function listOf(items: string[], t: TFunction) {
  return new Intl.ListFormat(t('builder.listLocale'), { type: 'conjunction' }).format(items)
}

/** XP and counts in the interface language: "1.500" in Spanish, "1,500" in English. */
export function formatXp(value: number, t: TFunction) {
  return value.toLocaleString(t('builder.listLocale'))
}

/** RYT-054: what the suggestion dialog remembers between openings. `type` undefined follows the
 * draft's most common enemy type; 'any' is an explicit choice. */
export type SuggestPrefs = {
  target: 'low' | 'moderate' | 'high' | null
  kinds: '1' | '2'
  type?: string
}
