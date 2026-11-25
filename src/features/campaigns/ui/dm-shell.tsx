import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { UnstyledButton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { closeOnEscapeWhileOpening } from '@/shared/ui/escape-while-opening'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { Drawer } from '@/shared/ui/overlays'
import { PageHead } from '@/shared/ui/page-head'
import { afterOverlayEntriesSettle } from '@/shared/ui/use-back-to-close'
import { sentInvitationsQuery } from '../api'
import { useCampaign } from '../campaign-context'
import { dmPanelGroups, dmPlaceHref, type DmPanel, type DmPlace } from '../domain/dm-panels'
import { dmGroupLabels, dmPanelIcons, dmPanelLabels } from './dm-panel-meta'
import './dm-center.css'

type Counts = { members: number; items: number }

/**
 * RYT-179: the DM command centre's frame. From 48em a grouped side navigation of links, Summary
 * first; on phones a bar under the header with a way back to the home and the panel name, which
 * opens the same links in a bottom sheet. The home and every panel render inside it, so the
 * current place is always marked with `aria-current="page"`.
 */
export function DmCenterShell({
  current,
  pendingProposals = 0,
  refresh,
  children,
}: {
  current: DmPlace
  /** Item proposals waiting for review, counted by the page (inventory is not a dependency). */
  pendingProposals?: number
  /** The refresh control, only where it refetches what is on screen. */
  refresh?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const navigate = useNavigate()
  const invitations = useQuery(sentInvitationsQuery(state.user!.id, campaign.id))
  const counts: Counts = { members: invitations.data?.length ?? 0, items: pendingProposals }
  const [sheetOpen, setSheetOpen] = useState(false)
  const switcher = useRef<HTMLButtonElement>(null)
  // An Escape pressed in the same frame as the switcher opens the sheet closes it too.
  const stopEarlyEscape = useRef<() => void>(() => {})
  useEffect(() => () => stopEarlyEscape.current(), [])
  // Panel to panel is the same route, so the layout neither scrolls nor moves focus: the frame
  // does. The new panel starts at the top and takes focus, unless the sheet already handed focus
  // back to its button or a dialog opened by the new address has it.
  const panelBox = useRef<HTMLDivElement>(null)
  const previous = useRef(current)
  const viaSheet = useRef(false)
  useEffect(() => {
    if (previous.current === current) return
    const routeChange = previous.current === 'home' || current === 'home'
    previous.current = current
    if (routeChange) return
    window.scrollTo(0, 0)
    if (viaSheet.current) viaSheet.current = false
    else if (!document.querySelector('[role="dialog"]'))
      panelBox.current?.focus({ preventScroll: true })
  }, [current])
  const closeSheet = () => {
    setSheetOpen(false)
    stopEarlyEscape.current()
    focusWhenReady(() => switcher.current)
  }
  const openSheet = () => {
    setSheetOpen(true)
    stopEarlyEscape.current()
    stopEarlyEscape.current = closeOnEscapeWhileOpening(closeSheet)
  }
  // A choice in the sheet closes it first and then navigates, so the sheet's history entry is
  // given back before the new address lands (Back then returns to the previous panel).
  const choose = (event: MouseEvent<HTMLAnchorElement>, place: DmPlace) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    setSheetOpen(false)
    stopEarlyEscape.current()
    if (place === current) {
      focusWhenReady(() => switcher.current)
      return
    }
    // The home is another route: the layout moves focus to the page there.
    if (place !== 'home') {
      viaSheet.current = true
      focusWhenReady(() => switcher.current)
    }
    void afterOverlayEntriesSettle().then(() => navigate(dmPlaceHref(campaign.id, place)))
  }
  const panel = current === 'home' ? null : current
  const PanelIcon = panel ? dmPanelIcons[panel] : null

  return (
    <div className="dm-shell" data-panel={panel ?? undefined}>
      <div className="dm-shell-head">
        <PageHead
          title={t('campaign.manage')}
          titleClassName="dm-admin-heading"
          refresh={refresh && <div className="dm-head-refresh">{refresh}</div>}
        />
      </div>
      {panel && PanelIcon && (
        <div className="dm-phone-bar">
          <div className="dm-phone-bar-row">
            <Link to={dmPlaceHref(campaign.id, 'home')} className="dm-back-link">
              <ChevronLeft size={18} aria-hidden="true" />
              {t('dm.backHome')}
            </Link>
            {refresh && <div className="dm-phone-refresh">{refresh}</div>}
          </div>
          <UnstyledButton
            ref={switcher}
            className="dm-switcher"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label={`${t(dmPanelLabels[panel])}, ${t('dm.switchPanel')}`}
            onClick={openSheet}
          >
            <PanelIcon size={20} aria-hidden="true" className="dm-switcher-icon" />
            <span className="dm-switcher-name">{t(dmPanelLabels[panel])}</span>
            <ChevronDown size={20} aria-hidden="true" className="dm-switcher-chevron" />
          </UnstyledButton>
        </div>
      )}
      <div className="dm-shell-body">
        <nav aria-label={t('dm.commandCenter')} className="dm-side-nav">
          <DmNavList current={current} counts={counts} />
        </nav>
        <div className="dm-shell-panel" ref={panelBox} tabIndex={-1}>
          {children}
        </div>
      </div>
      {panel && (
        <Drawer
          opened={sheetOpen}
          onClose={closeSheet}
          position="bottom"
          size="auto"
          title={t('dm.commandCenter')}
          className="dm-sheet"
          returnFocus={false}
          closeButtonProps={{ 'aria-label': t('panel.close'), size: 44 }}
        >
          <nav aria-label={t('dm.commandCenter')} className="dm-sheet-nav">
            <DmNavList current={current} counts={counts} onChoose={choose} />
          </nav>
        </Drawer>
      )}
    </div>
  )
}

/** Summary, then the three groups of panel links; pending counts sit at the row end. A group is
 * a named list, not a heading: the page outline keeps one h1 and the panel's own h2. */
function DmNavList({
  current,
  counts,
  onChoose,
}: {
  current: DmPlace
  counts: Counts
  onChoose?: (event: MouseEvent<HTMLAnchorElement>, place: DmPlace) => void
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const id = useId()
  const description = (panel: DmPanel) => {
    if (panel === 'members' && counts.members)
      return t('dm.invitesToAccept', { count: counts.members })
    if (panel === 'items' && counts.items) return t('dm.proposalsToReview', { count: counts.items })
    return null
  }
  const mark = (place: DmPlace) => ({
    'aria-current': place === current ? ('page' as const) : undefined,
    // The sheet opens on the current place.
    'data-autofocus': onChoose && place === current ? true : undefined,
    onClick: onChoose
      ? (event: MouseEvent<HTMLAnchorElement>) => onChoose(event, place)
      : undefined,
  })
  return (
    <>
      <Link to={dmPlaceHref(campaign.id, 'home')} className="dm-nav-link" {...mark('home')}>
        <LayoutDashboard size={18} aria-hidden="true" />
        <span className="dm-nav-label">{t('dm.home')}</span>
      </Link>
      {dmPanelGroups.map((group) => (
        <div key={group.key} className="dm-nav-group">
          <p id={`${id}-${group.key}`} className="dm-nav-heading">
            {t(dmGroupLabels[group.key])}
          </p>
          <ul aria-labelledby={`${id}-${group.key}`} className="dm-nav-list">
            {group.panels.map((panel) => {
              const Icon = dmPanelIcons[panel]
              const pending = description(panel)
              // The unit is visible next to the count; the full sentence is the description.
              const unit =
                panel === 'members'
                  ? t('dm.navPending', { count: counts.members })
                  : panel === 'items'
                    ? t('dm.navToReview', { count: counts.items })
                    : ''
              return (
                <li key={panel}>
                  <Link
                    to={dmPlaceHref(campaign.id, panel)}
                    className="dm-nav-link"
                    data-panel={panel}
                    aria-describedby={pending ? `${id}-${panel}-pending` : undefined}
                    {...mark(panel)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="dm-nav-label">{t(dmPanelLabels[panel])}</span>
                    {pending && (
                      <span className="dm-nav-count tabular" aria-hidden="true">
                        {unit}
                      </span>
                    )}
                  </Link>
                  {pending && (
                    <span id={`${id}-${panel}-pending`} className="visually-hidden">
                      {pending}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )
}
