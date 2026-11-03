import type { GlossaryEntry } from '../domain/catalog'
import type { SpellClass, SpellSchool } from '../domain/types'

export type SpellFilters = {
  levels: [number, number]
  spellClass: SpellClass | null
  school: SpellSchool | null
  concentration: boolean
  ritual: boolean
}
export const noSpellFilters: SpellFilters = {
  levels: [0, 9],
  spellClass: null,
  school: null,
  concentration: false,
  ritual: false,
}
export const activeFilterCount = (f: SpellFilters) =>
  (f.levels[0] > 0 || f.levels[1] < 9 ? 1 : 0) +
  (f.spellClass ? 1 : 0) +
  (f.school ? 1 : 0) +
  (f.concentration ? 1 : 0) +
  (f.ritual ? 1 : 0)

export function matchesSpellFilters(entry: GlossaryEntry, f: SpellFilters) {
  const spell = entry.spell
  if (!spell) return false
  return (
    spell.level >= f.levels[0] &&
    spell.level <= f.levels[1] &&
    (!f.spellClass || spell.classes.includes(f.spellClass)) &&
    (!f.school || spell.school === f.school) &&
    (!f.concentration || spell.concentration) &&
    (!f.ritual || spell.ritual)
  )
}
