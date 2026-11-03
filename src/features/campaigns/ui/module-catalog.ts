import {
  Backpack,
  BookOpen,
  Gem,
  Image,
  Landmark,
  ScrollText,
  Shield,
  Store,
  Swords,
  Users,
} from 'lucide-react'
import type { CampaignModuleKey } from '../domain/campaign'

/** The one module catalogue for navigation, module pages and the DM module switches.
 * Only `implemented` modules can be enabled for Players or appear in navigation. */
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
    implemented: false,
  },
  {
    key: 'combat',
    path: '/combat',
    label: 'module.combat',
    summary: 'summary.combat',
    icon: Swords,
    ticket: 'RYT-007',
    implemented: false,
  },
  {
    key: 'atlas',
    path: '/atlas',
    label: 'module.atlas',
    summary: 'summary.atlas',
    icon: BookOpen,
    ticket: 'RYT-010',
    implemented: false,
  },
  {
    key: 'glossary',
    path: '/glossary',
    label: 'module.glossary',
    summary: 'summary.glossary',
    icon: Shield,
    ticket: 'RYT-008',
    implemented: false,
  },
  {
    key: 'memories',
    path: '/memories',
    label: 'module.memories',
    summary: 'summary.memories',
    icon: Image,
    ticket: 'RYT-009',
    implemented: false,
  },
  {
    key: 'stronghold',
    path: '/stronghold',
    label: 'module.stronghold',
    summary: 'summary.stronghold',
    icon: Landmark,
    ticket: 'RYT-011',
    implemented: false,
  },
  {
    key: 'workshop',
    path: '/workshop',
    label: 'module.workshop',
    summary: 'summary.workshop',
    icon: Gem,
    ticket: 'RYT-012',
    implemented: false,
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
