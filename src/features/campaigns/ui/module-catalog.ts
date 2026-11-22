import { Backpack, BookMarked, Map as TableMap, ScrollText, Store, Swords, Users } from 'lucide-react'
import type { CampaignModuleKey } from '../domain/campaign'

/** The one module catalogue for navigation, module pages and the DM module switches.
 * Only shipped modules are listed: planned ones (atlas, memories, stronghold, workshop)
 * stay out of the DM controls and navigation for launch, and their paths show "not found".
 * Add an entry here when its page ships. */
export const campaignModules = [
  {
    key: 'party',
    path: '/party',
    label: 'module.party',
    summary: 'summary.party',
    icon: Users,
    ticket: 'RYT-003',
    implemented: true,
  },
  {
    key: 'inventory',
    path: '/inventory',
    label: 'module.inventory',
    summary: 'summary.inventory',
    icon: Backpack,
    ticket: 'RYT-004',
    implemented: true,
  },
  {
    key: 'shops',
    path: '/shops',
    label: 'module.shops',
    summary: 'summary.shops',
    icon: Store,
    ticket: 'RYT-005',
    implemented: true,
  },
  {
    key: 'quests',
    path: '/quests',
    label: 'module.quests',
    summary: 'summary.quests',
    icon: ScrollText,
    ticket: 'RYT-006',
    implemented: true,
  },
  {
    key: 'combat',
    path: '/combat',
    label: 'module.combat',
    summary: 'summary.combat',
    icon: Swords,
    ticket: 'RYT-007',
    implemented: true,
  },
  {
    key: 'tabletop',
    path: '/tabletop',
    label: 'module.tabletop',
    summary: 'summary.tabletop',
    icon: TableMap,
    ticket: 'RYT-055',
    implemented: true,
  },
  {
    key: 'glossary',
    path: '/glossary',
    label: 'module.glossary',
    summary: 'summary.glossary',
    icon: BookMarked,
    ticket: 'RYT-008',
    implemented: true,
  },
] as const satisfies readonly {
  key: CampaignModuleKey
  path: `/${CampaignModuleKey}`
  label: string
  summary: string
  icon: unknown
  ticket: string
  implemented: boolean
}[]

export const implementedModuleKeys = new Set<string>(
  campaignModules.filter((module) => module.implemented).map((module) => module.key),
)
