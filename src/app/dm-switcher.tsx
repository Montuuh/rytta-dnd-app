import { useMemo } from 'react'
import { Gift, LayoutDashboard, Plus, TrendingUp, UserPlus, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  dmPanelIcons,
  dmPanelLabels,
  dmPanels,
  dmPlaceHref,
  type DmPanel,
  type DmPlace,
} from '@/features/campaigns'
import { QuickSwitcher, type SwitcherGroup } from '@/shared/ui/quick-switcher'
import { afterOverlayEntriesSettle } from '@/shared/ui/use-back-to-close'

/** The actions a DM repeats: the panel that runs each one and the `?do=` it consumes once. */
const actions = [
  { id: 'invite', label: 'members.invite', icon: UserPlus, place: 'members', run: 'invite' },
  { id: 'loot', label: 'loot.open', icon: Gift, place: 'items', run: 'loot' },
  { id: 'newCreature', label: 'bestiary.new', icon: Plus, place: 'bestiary', run: 'new' },
  { id: 'newItem', label: 'catalogue.create', icon: Plus, place: 'items', run: 'new' },
  { id: 'setLevel', label: 'switcher.setLevel', icon: TrendingUp, place: 'level', run: undefined },
] as const satisfies readonly {
  id: string
  label: string
  icon: LucideIcon
  place: DmPanel
  run?: string
}[]

const places: readonly DmPlace[] = ['home', ...dmPanels]

/**
 * The DM's quick switcher: the home and the command centre's panels with the names and icons of
 * its navigation, then the actions. A panel's name typed and Enter opens that panel, never an
 * action that only mentions it.
 */
export function DmQuickSwitcher({
  campaignId,
  opened,
  onClose,
}: {
  campaignId: string
  opened: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { groups, targets } = useMemo(() => {
    const targets = new Map<string, string>()
    const drawn = (Icon: LucideIcon) => <Icon size={20} aria-hidden="true" />
    const actionEntries = actions.map(({ id, label, icon, place, run }) => {
      targets.set(`action-${id}`, dmPlaceHref(campaignId, place, run))
      return {
        id: `action-${id}`,
        label: t(label),
        keywords: t(`switcher.kw.${id}`),
        icon: drawn(icon),
      }
    })
    const panelEntries = places.map((place) => {
      targets.set(`panel-${place}`, dmPlaceHref(campaignId, place))
      return {
        id: `panel-${place}`,
        label: t(place === 'home' ? 'dm.home' : dmPanelLabels[place]),
        keywords: t(`switcher.kw.${place}`),
        icon: drawn(place === 'home' ? LayoutDashboard : dmPanelIcons[place]),
      }
    })
    const groups: SwitcherGroup[] = [
      { id: 'panels', label: t('switcher.panels'), entries: panelEntries },
      { id: 'actions', label: t('switcher.actions'), entries: actionEntries },
    ]
    return { groups, targets }
  }, [t, campaignId])
  return (
    <QuickSwitcher
      opened={opened}
      onClose={onClose}
      groups={groups}
      title={t('switcher.title')}
      searchLabel={t('switcher.search')}
      closeLabel={t('switcher.close')}
      emptyText={(query) => t('switcher.none', { query })}
      countText={(count) => t('switcher.found', { count })}
      onChoose={(entry) => {
        const to = targets.get(entry.id)
        onClose()
        // The dialog gives its history entry back first, so the navigation lands on the page's own.
        if (to) void afterOverlayEntriesSettle().then(() => navigate(to))
      }}
      onSettled={() => {
        // A same-page choice leaves nothing focused once the dialog is gone: land on the page.
        const active = document.activeElement
        if (!active || active === document.body) document.getElementById('main-content')?.focus()
      }}
    />
  )
}
