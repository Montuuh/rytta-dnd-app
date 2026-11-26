import {
  Dices,
  History,
  Library,
  Package,
  PawPrint,
  Shield,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { DmPanel, DmPanelGroup } from '../domain/dm-panels'

/** The name of each command centre panel: the side navigation, the sheet and the home use it. */
export const dmPanelLabels = {
  bestiary: 'dm.panelBestiary',
  items: 'dm.panelItems',
  members: 'dm.panelMembers',
  level: 'dm.panelLevel',
  modules: 'dm.panelModules',
  dice: 'dm.panelDice',
  content: 'dm.panelContent',
  audit: 'dm.panelAudit',
} as const satisfies Record<DmPanel, string>

export const dmPanelIcons: Record<DmPanel, LucideIcon> = {
  bestiary: PawPrint,
  items: Package,
  members: Users,
  level: TrendingUp,
  modules: Shield,
  dice: Dices,
  content: Library,
  audit: History,
}

export const dmGroupLabels = {
  table: 'dm.groupTable',
  party: 'dm.groupParty',
  settings: 'dm.groupSettings',
} as const satisfies Record<DmPanelGroup, string>
