import type { GlossaryCategory, GlossaryEntry } from '../domain/catalog'

export const glossaryTabs = [
  'all',
  'condition',
  'action',
  'rule',
  'spell',
  'feature',
  'homebrew',
] as const
export type GlossaryTab = (typeof glossaryTabs)[number]
export const isGlossaryTab = (value: string | null): value is GlossaryTab =>
  (glossaryTabs as readonly string[]).includes(value ?? '')

/** "Rules" gathers the reference vocabulary: rules, areas, hazards, abilities, skills, weapons. */
const ruleFamily = new Set<GlossaryCategory>([
  'rule',
  'area',
  'attitude',
  'hazard',
  'ability',
  'skill',
  'damage',
  'property',
  'mastery',
])

export function inTab(entry: GlossaryEntry, tab: GlossaryTab) {
  if (tab === 'all') return true
  if (tab === 'homebrew') return entry.source === 'homebrew'
  if (entry.source === 'homebrew')
    return entry.category === tab || (tab === 'rule' && ruleFamily.has(entry.category))
  if (tab === 'rule') return ruleFamily.has(entry.category)
  return entry.category === tab
}
