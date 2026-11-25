import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import {
  Button,
  Drawer,
  Menu,
  Popover,
  Stack,
  Switch,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  Eye,
  LayoutGrid,
  Library,
  LogOut,
  Menu as MenuIcon,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from './modules'
import { documentTitleKey } from './document-title'
import { config } from '@/shared/lib/config'
import { useQuery } from '@tanstack/react-query'
import {
  CampaignViewContext,
  campaignsQuery,
  forgetCampaignShells,
  rememberCampaignShell,
  keepsStaleData,
  useCampaignShell,
  leaveBlock,
  LeaveCampaignDialog,
  LeaveCampaignItem,
  membersQuery,
  type Campaign,
} from '@/features/campaigns'
import { closeOnEscapeWhileOpening } from '@/shared/ui/escape-while-opening'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { artUrl } from '@/shared/ui/art-url'
import { RecoveryDialog, UsernameDialog, useAuth, useUsername } from '@/features/auth'
import { RestBanner, RestProvider } from '@/features/rest'
import { useContentEditor } from '@/features/content-library'
import { AdminBanner, useAdminStatus } from '@/features/admin'
import { useQuestsUnseen } from '@/features/quests'
import { ConnectionStatus, ConnectionStrip } from './connection'
import { useConnection } from './use-connection'
import { ConnectionContext } from '@/shared/lib/connection-context'
import { SettingsPanel } from '@/pages/settings-panel'
import { DmQuickSwitcher } from './dm-switcher'
import { useSwitcherShortcuts } from './use-switcher-shortcuts'

/**
 * RYT-179: the DM entry is current on the campaign index and on the Members page, where the
 * command centre's panels live; every other campaign route keeps its own mark. A link without
 * `end` matches the whole campaign, so the end flag is dropped only on the Members page.
 */
function dmEntryEnd(pathname: string, to: string) {
  const rest = pathname.startsWith(to) ? pathname.slice(to.length) : ''
  return !/^\/members(\/|$)/.test(rest)
}

/** Settings links into a campaign Members page leave the drawer behind them. */
const membersPage = /^\/campaign\/[^/]+\/members/

/** RYT-069: Settings is a right-hand drawer over the current page, not a page of its own. */
const SettingsDrawerContext = createContext<() => void>(() => {})

/** Old `#/settings` links open the drawer over the home screen. */
export function SettingsRoute() {
  const openSettings = useContext(SettingsDrawerContext)
  const navigate = useNavigate()
  useEffect(() => {
    openSettings()
    void navigate('/', { replace: true })
  }, [openSettings, navigate])
  return null
}

const defaultActivePaths = new Set(['/glossary'])
/** Phones show this many destinations before folding the rest into "More". */
const bottomSlots = 5

type NavEntry = {
  to: string
  label: string
  /** Shorter bottom-bar label; it must stay contained in the full accessible label. */
  short?: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>
  dm?: boolean
  key?: string
  /** RYT-006: something new waits there (a quiet dot, named for screen readers). */
  news?: boolean
}

const sessionModules = ['combat', 'tabletop']
/** Stable sort rank: session tools first, everything else keeps its catalogue order. */
const sessionRank = (key?: string) => {
  const index = sessionModules.indexOf(key ?? '')
  return index === -1 ? sessionModules.length : index
}

/** Only reachable destinations appear in navigation. Planned modules live in the DM module
 * controls (DM Command Center) instead of crowding the bar. */
function useNavEntries(
  campaign: Campaign | undefined,
  playerPreview: boolean,
  fromShell = false,
): NavEntry[] {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const live = config.VITE_DATA_MODE === 'supabase'
  const questNews = useQuestsUnseen(
    campaign?.id,
    live &&
      campaign?.role === 'player' &&
      !playerPreview &&
      !fromShell &&
      (campaign.player_modules ?? []).includes('quests'),
  )
  if (!live)
    return modules
      .filter(({ path }) => defaultActivePaths.has(path))
      .map(({ path, label, icon }) => ({ to: path, label: t(label), icon }))
  const prefix = pathname.match(/^\/campaign\/[^/]+/)?.[0]
  if (!prefix || !campaign) return []
  const effectiveDm = campaign.role === 'dm' && !playerPreview
  const enabledKeys = new Set(campaign.player_modules ?? ['party'])
  // Planned modules never become destinations, even if an old campaign row enables them.
  const reachable = modules.filter(
    ({ key, implemented }) => implemented && (effectiveDm || enabledKeys.has(key)),
  )
  const entries: NavEntry[] = reachable.map(({ key, path, label, icon }) => ({
    to: `${prefix}${path}`,
    label: t(label),
    icon,
    key,
    news: key === 'quests' && questNews,
  }))
  // Running a session: the DM reaches Combat and the Table in one tap, ahead of the rest.
  if (effectiveDm) entries.sort((a, b) => sessionRank(a.key) - sessionRank(b.key))
  // The DM Command Center is the DM's first destination (RYT-027); it also holds the storeroom.
  if (effectiveDm)
    entries.unshift({
      to: prefix,
      label: t('campaign.manage'),
      short: t('nav.dmShort'),
      icon: Shield,
      dm: true,
    })
  return entries
}

/** A quiet mark on a destination with something new; its name is read with the label. */
function NewsDot({ news }: { news?: boolean }) {
  const { t } = useTranslation()
  if (!news) return null
  return (
    <span className="nav-news">
      <VisuallyHidden>{` · ${t('quests.changed')}`}</VisuallyHidden>
    </span>
  )
}

function TopNavigation({ entries }: { entries: NavEntry[] }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const nav = useRef<HTMLElement>(null)
  // Tabs scroll when they do not fit: keep the current one in view after navigating.
  useEffect(() => {
    nav.current?.querySelector('.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [pathname])
  return (
    <nav ref={nav} aria-label={t('nav.main')} className="nav-tabs">
      {entries.map(({ to, label, icon: Icon, dm, news }) => (
        <NavLink
          key={to}
          to={to}
          end={dm ? dmEntryEnd(pathname, to) : undefined}
          className={({ isActive }) =>
            `nav-item ${dm ? 'nav-item-dm' : ''} ${isActive ? 'active' : ''}`
          }
        >
          <Icon size={18} aria-hidden="true" />
          {label}
          <NewsDot news={news} />
        </NavLink>
      ))}
    </nav>
  )
}

function BottomNavigation({ entries }: { entries: NavEntry[] }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [opened, { open, close }] = useDisclosure(false)
  const moreButton = useRef<HTMLButtonElement>(null)
  const navigated = useRef(false)
  const overflow = entries.length > bottomSlots
  const primary = overflow ? entries.slice(0, bottomSlots - 1) : entries
  const rest = overflow ? entries.slice(bottomSlots - 1) : []
  const moreActive = rest.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
  useEffect(close, [pathname, close])
  useBackToClose(opened, close)
  return (
    <>
      <nav aria-label={t('nav.main')} className="bottom-nav">
        {primary.map(({ to, label, short, icon: Icon, dm, news }) => (
          <NavLink
            key={to}
            to={to}
            end={dm ? dmEntryEnd(pathname, to) : undefined}
            aria-label={short ? label : undefined}
            className={({ isActive }) =>
              `bottom-nav-item ${dm ? 'is-dm' : ''} ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={22} aria-hidden="true" />
            <span className="bottom-nav-label">{short ?? label}</span>
            <NewsDot news={news} />
          </NavLink>
        ))}
        {overflow && (
          <UnstyledButton
            ref={moreButton}
            className={`bottom-nav-item ${moreActive ? 'active' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={opened}
            aria-label={t('nav.moreOpen')}
            onClick={open}
          >
            <MenuIcon size={22} aria-hidden="true" />
            <span className="bottom-nav-label">{t('nav.more')}</span>
            <NewsDot news={rest.some((entry) => entry.news)} />
          </UnstyledButton>
        )}
      </nav>
      <Drawer
        opened={opened}
        onClose={close}
        position="bottom"
        size="auto"
        title={t('nav.moreTitle')}
        className="more-drawer"
        closeButtonProps={{ 'aria-label': t('nav.close'), size: 44 }}
        onExitTransitionEnd={() => {
          if (!navigated.current) moreButton.current?.focus()
          navigated.current = false
        }}
        returnFocus={false}
      >
        <Stack gap={6} pb="md">
          {rest.map(({ to, label, icon: Icon, dm, news }) => (
            <NavLink
              key={to}
              to={to}
              // Choosing a destination lets the route change focus main content instead.
              onClick={() => {
                navigated.current = to !== pathname
                close()
              }}
              className={({ isActive }) =>
                `more-drawer-item ${dm ? 'is-dm' : ''} ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
              <NewsDot news={news} />
            </NavLink>
          ))}
        </Stack>
      </Drawer>
    </>
  )
}

/** The emblem always goes to My campaigns; inside a campaign the name beside it is that
 * campaign's home, so there is a way back to the list from every page (J1-12). */
function BrandLink({
  campaign,
  live,
  emblem,
  copy,
}: {
  campaign: Campaign | undefined
  live: boolean
  emblem: ReactNode
  copy: ReactNode
}) {
  const { t } = useTranslation()
  if (!live)
    return (
      <div className="brand-bar">
        {emblem}
        {copy}
      </div>
    )
  const hubLabel = `RYTTA · ${t('hub.title')}`
  if (!campaign)
    return (
      <NavLink to="/" end className="brand-bar" aria-label={hubLabel}>
        {emblem}
        {copy}
      </NavLink>
    )
  return (
    <div className="brand-bar">
      <NavLink to="/" className="brand-home" aria-label={hubLabel}>
        {emblem}
      </NavLink>
      <NavLink
        to={`/campaign/${campaign.id}`}
        end
        className="brand-campaign"
        aria-label={t('nav.campaignHome', { name: campaign.name })}
      >
        {copy}
      </NavLink>
    </div>
  )
}

export function Layout() {
  const { t } = useTranslation()
  const { state, controller } = useAuth()
  const username = useUsername().data
  const contentEditor = useContentEditor()
  const adminStatus = useAdminStatus().data
  const live = config.VITE_DATA_MODE === 'supabase'
  const connection = useConnection()
  const [previewScope, setPreviewScope] = useState<string | null>(null)
  const [previewUserId, setPreviewUserId] = useState<string | null>(null)
  const [previewLabel, setPreviewLabel] = useState<string | null>(null)
  const [pickerOpened, setPickerOpened] = useState(false)
  // RYT-095: the campaign being left from the profile menu (kept while the caches drop).
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null)
  const [opened, { open, close }] = useDisclosure(false)
  const [settingsOpened, settings] = useDisclosure(false)
  // RYT-078: true from opening the Settings drawer until its exit transition ends (focus is back
  // on the profile button), so the username dialog opens only after the drawer is fully gone.
  const [settingsShown, setSettingsShown] = useState(false)
  // RYT-115: the account dialog inside the drawer takes Escape first.
  const [accountDialog, setAccountDialog] = useState(false)
  if (settingsOpened && !settingsShown) setSettingsShown(true)
  useBackToClose(settingsOpened, settings.close)
  const menuButton = useRef<HTMLButtonElement>(null)
  const previewSwitch = useRef<HTMLInputElement>(null)
  const restoreMenuFocus = useRef(false)
  const stopEarlyEscape = useRef(() => {})
  useEffect(() => () => stopEarlyEscape.current(), [])
  // RYT-136: focus goes back to the trigger once, and only while it is still where the menu left it
  // (inside the closing menu or on the page): a person who has tabbed or clicked to another control
  // keeps it. A choice that opens a dialog or a drawer, or leaves the page, has cleared the flag:
  // that overlay hands focus back itself.
  const closeProfileMenu = () => {
    stopEarlyEscape.current()
    close()
    // The dropdown may only mount after this call (Escape in the frame it opens) and then takes
    // focus for its first item: it is what is leaving, so look for it once the frame has rendered.
    requestAnimationFrame(() => {
      if (!restoreMenuFocus.current) return
      focusWhenReady(() => menuButton.current, {
        from: menuButton.current,
        leaving: [...document.querySelectorAll('[role="menu"]')],
      })
    })
  }
  const { pathname } = useLocation()
  const campaignId = pathname.match(/^\/campaign\/([^/]+)/)?.[1]
  const campaigns = useQuery({
    ...campaignsQuery(state.user?.id ?? ''),
    enabled: live && !!state.user && !!campaignId,
  })
  // RYT-013: a failed refresh keeps the campaign's header and navigation, as the screen keeps its data.
  const listed =
    !campaigns.isError || keepsStaleData(campaigns.data, campaigns.error)
      ? campaigns.data?.find((c) => c.id === campaignId)
      : undefined
  // RYT-160: after a reload without signal, the campaign kept on the device names the header and
  // draws the navigation; its screens wait for the network.
  const shell = useCampaignShell(state.user?.id, campaignId, campaigns)
  const campaign = listed ?? shell
  // A kept campaign only draws: nothing is requested or offered with it.
  const fromShell = !listed && Boolean(shell)
  // RYT-153: inside through the admin panel, not as a member: nothing to leave.
  const adminInside = Boolean(
    campaign && adminStatus?.access.some((a) => a.campaign_id === campaign.id),
  )
  // RYT-160: an opened campaign is kept for an offline reload, unless entered through the admin
  // panel (temporary, audited access: RYT-153).
  const keepUser = state.user?.id
  useEffect(() => {
    if (!keepUser || !listed || !adminStatus) return
    if (adminStatus.access.some((access) => access.campaign_id === listed.id)) return
    rememberCampaignShell(keepUser, listed)
  }, [keepUser, listed, adminStatus])
  const scope = `${state.user?.id}:${campaignId}`
  const playerPreview = campaign?.role === 'dm' && previewScope === scope
  const members = useQuery({
    ...membersQuery(state.user?.id ?? '', campaignId ?? ''),
    enabled: live && !!state.user && !!campaignId && campaign?.role === 'dm' && !fromShell,
  })
  const previewPlayers =
    !members.isError && members.data
      ? members.data.filter((member) => member.role === 'player')
      : []
  const entries = useNavEntries(campaign, playerPreview, fromShell)
  // RYT-179: the quick switcher is the DM's, never in Player view or on a kept campaign shell.
  const switcherOn = live && !!state.user && campaign?.role === 'dm' && !playerPreview && !fromShell
  const [switcherShown, { open: showSwitcher, close: hideSwitcher }] = useDisclosure(false)
  const switcherOpened = switcherShown && switcherOn
  const stopSwitcherEscape = useRef(() => {})
  useEffect(() => () => stopSwitcherEscape.current(), [])
  const openSwitcher = useCallback(() => {
    stopSwitcherEscape.current()
    showSwitcher()
    // Escape in the frame the dialog opens reaches no listener yet: close it from the page.
    stopSwitcherEscape.current = closeOnEscapeWhileOpening(hideSwitcher)
  }, [showSwitcher, hideSwitcher])
  useEffect(() => {
    if (!switcherOn) hideSwitcher()
  }, [switcherOn, hideSwitcher])
  useSwitcherShortcuts(switcherOn, switcherOpened, openSwitcher)
  // One destination needs no bar: the header already names the page and links home.
  const showNav = (!live || !!campaign) && entries.length > 1
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  // RYT-115: the legal links inside Settings leave the drawer behind them.
  const closeSettings = settings.close
  // Leaving through a link in the drawer (or by signing out) hands focus to the page, not the header.
  const leaveFocus = useRef(false)
  const settingsOpenRef = useRef(settingsOpened)
  useEffect(() => {
    settingsOpenRef.current = settingsOpened
  }, [settingsOpened])
  useEffect(() => {
    if (pathname === '/privacy' || pathname === '/terms' || membersPage.test(pathname)) {
      if (settingsOpenRef.current) leaveFocus.current = true
      closeSettings()
    }
  }, [pathname, closeSettings])
  // RYT-160: signed out (also a session that expired while the app was closed), no campaign shell
  // stays on the device; signed in, only this account's.
  const signedInId = state.user?.id
  useEffect(() => {
    // A start without signal can end signed out (`connection`): the session is still on the device,
    // so its campaigns stay too.
    if (state.status === 'signed-out' && state.issue !== 'connection') forgetCampaignShells()
    else if (signedInId) forgetCampaignShells(signedInId)
  }, [state.status, state.issue, signedInId])
  // Signing out (account deletion) leaves nothing to set up behind the landing.
  const wasSignedIn = useRef(false)
  useEffect(() => {
    if (wasSignedIn.current && !state.user) {
      leaveFocus.current = true
      closeSettings()
      setAccountDialog(false)
    }
    wasSignedIn.current = !!state.user
  }, [state.user, closeSettings])
  const [ownTurn, setOwnTurn] = useState(false)
  useEffect(() => {
    const on = (event: Event) =>
      setOwnTurn((event as CustomEvent<{ yours: boolean }>).detail.yours === true)
    window.addEventListener('rytta:own-turn', on)
    return () => window.removeEventListener('rytta:own-turn', on)
  }, [])
  useEffect(() => {
    if (previousPath.current !== pathname) {
      // RYT-093: moving inside the content library keeps focus and scroll; the library moves them.
      const withinLibrary =
        previousPath.current.startsWith('/library') && pathname.startsWith('/library')
      // An old #/settings link redirects with the drawer open: focus stays inside the dialog.
      if (!settingsOpened && !withinLibrary) mainRef.current?.focus()
      if (!withinLibrary) window.scrollTo(0, 0)
      previousPath.current = pathname
    }
    const titleKey = documentTitleKey({
      pathname,
      live,
      signedIn: state.status === 'signed-in',
    })
    const title = titleKey ? t(titleKey) : (campaign?.name ?? 'Rytta')
    const base = title === 'Rytta' ? 'Rytta' : `${title} · Rytta`
    // RYT-126: on the Player's own turn a background tab says so (combat raises the event).
    document.title = ownTurn ? `${t('combat.turn.yours')} ${base}` : base
  }, [pathname, t, live, state.status, settingsOpened, campaign?.name, ownTurn])
  const enterPreview = (userId: string | null, label: string | null) => {
    setPreviewUserId(userId)
    setPreviewLabel(label)
    setPreviewScope(scope)
    setPickerOpened(false)
  }
  const exitPreview = () => {
    setPreviewScope(null)
    setPreviewUserId(null)
    setPreviewLabel(null)
    // The banner that may hold focus unmounts; keep the keyboard user on the switch.
    requestAnimationFrame(() => previewSwitch.current?.focus())
  }
  const togglePreview = (checked: boolean) => {
    if (!checked) return exitPreview()
    const only = previewPlayers.length === 1 ? previewPlayers[0] : undefined
    if (only) enterPreview(only.user_id, only.display_name)
    else setPickerOpened(true)
  }
  return (
    <CampaignViewContext.Provider
      value={{
        playerPreview,
        previewUserId: playerPreview ? previewUserId : null,
        previewLabel: playerPreview ? previewLabel : null,
        enterPreview,
        exitPreview,
      }}
    >
      <RestProvider campaignId={live && campaign && !fromShell ? campaign.id : null}>
        <div
          className={`app-layout ${live && !pathname.startsWith('/campaign/') ? 'account-layout' : ''} ${pathname.startsWith('/campaign/') ? 'campaign-layout' : ''} ${pathname.startsWith('/library') ? 'library-layout' : ''} ${campaign?.role === 'dm' && !playerPreview ? 'dm-layout' : ''} ${showNav ? 'has-bottom-nav' : ''}`}
        >
          <a
            className="skip-link"
            href="#main-content"
            onClick={(event) => {
              event.preventDefault()
              mainRef.current?.focus()
            }}
          >
            {t('nav.skip')}
          </a>
          <div className="workspace">
            <header className="app-header">
              <div className="topbar">
                <BrandLink
                  campaign={campaign}
                  live={live && !!state.user}
                  emblem={
                    <img
                      className="brand-emblem"
                      src={artUrl('brand/emblem')}
                      alt=""
                      width={40}
                      height={40}
                      draggable={false}
                    />
                  }
                  copy={
                    <div className="brand-copy">
                      <span className="brand-title">RYTTA</span>
                      {campaign && (
                        <Text
                          size="sm"
                          fw={600}
                          className="header-campaign-name user-copy"
                          title={campaign.name}
                        >
                          {campaign.name}
                        </Text>
                      )}
                    </div>
                  }
                />
                <div className="header-actions">
                  {switcherOn && (
                    <Button
                      variant="subtle"
                      className="account-button profile-trigger-btn switcher-trigger"
                      leftSection={<Search size={18} aria-hidden="true" />}
                      aria-label={t('switcher.open')}
                      aria-haspopup="dialog"
                      aria-expanded={switcherOpened}
                      aria-keyshortcuts="Control+K Meta+K"
                      onClick={openSwitcher}
                    >
                      <span className="profile-label">{t('switcher.openShort')}</span>
                    </Button>
                  )}
                  {campaign?.role === 'dm' && !fromShell && (
                    <Popover
                      opened={pickerOpened}
                      onDismiss={() => setPickerOpened(false)}
                      position="bottom-end"
                      withinPortal
                      withRoles={false}
                      trapFocus
                      returnFocus={false}
                      onExitTransitionEnd={() => previewSwitch.current?.focus()}
                    >
                      <Popover.Target>
                        <div className="preview-switch">
                          <Switch
                            ref={previewSwitch}
                            size="md"
                            checked={playerPreview}
                            onChange={(event) => togglePreview(event.currentTarget.checked)}
                            label={t('shell.playerSwitch')}
                            aria-label={t('shell.playerSwitch')}
                            aria-describedby="player-switch-hint"
                            title={t('shell.playerSwitchHint')}
                            thumbIcon={<Eye size={12} aria-hidden="true" />}
                          />
                          <span id="player-switch-hint" className="visually-hidden">
                            {t('shell.playerSwitchHint')}
                          </span>
                        </div>
                      </Popover.Target>
                      <Popover.Dropdown
                        maw="calc(100vw - 32px)"
                        role="dialog"
                        aria-label={t('shell.choosePlayerView')}
                      >
                        <Stack gap={4}>
                          <Text size="sm" fw={600}>
                            {t('shell.choosePlayerView')}
                          </Text>
                          {previewPlayers.length === 0 ? (
                            <Text size="sm" c="dimmed">
                              {t('shell.noPlayers')}
                            </Text>
                          ) : (
                            previewPlayers.map((member) => (
                              <Button
                                key={member.user_id}
                                variant="subtle"
                                justify="flex-start"
                                className="user-copy"
                                onClick={() => enterPreview(member.user_id, member.display_name)}
                              >
                                {member.display_name}
                              </Button>
                            ))
                          )}
                        </Stack>
                      </Popover.Dropdown>
                    </Popover>
                  )}
                  {!state.user ? (
                    // Signed out the profile menu would hold one item: open Settings directly.
                    <Button
                      ref={menuButton}
                      variant="subtle"
                      className="account-button profile-trigger-btn"
                      leftSection={<Settings size={18} aria-hidden="true" />}
                      aria-haspopup="dialog"
                      aria-expanded={settingsOpened}
                      onClick={settings.open}
                    >
                      <span className="profile-label">{t('nav.settings')}</span>
                    </Button>
                  ) : (
                    <Menu
                      opened={opened}
                      onChange={(value) => {
                        if (value) {
                          restoreMenuFocus.current = true
                          open()
                          // Escape in the frame the menu opens reaches no listener yet: close it from the page.
                          stopEarlyEscape.current()
                          stopEarlyEscape.current = closeOnEscapeWhileOpening(() =>
                            closeProfileMenu(),
                          )
                        } else closeProfileMenu()
                      }}
                      position="bottom-end"
                      width={260}
                      withinPortal
                      withInitialFocusPlaceholder={false}
                      returnFocus={false}
                    >
                      <Menu.Target>
                        <Button
                          ref={menuButton}
                          variant="subtle"
                          className="account-button profile-trigger-btn"
                          leftSection={
                            state.user ? (
                              <UserRound size={18} aria-hidden="true" />
                            ) : (
                              <Settings size={18} aria-hidden="true" />
                            )
                          }
                          aria-label={
                            state.user
                              ? `${t('account.profile')} · ${username ? `${username} · ` : ''}${t('auth.account', { email: state.user.email })}`
                              : `${t('nav.settings')} · ${t('account.menu')}`
                          }
                        >
                          <span className="profile-label">
                            {t(state.user ? 'account.profile' : 'nav.settings')}
                          </span>
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown className="account-dropdown" maw="calc(100vw - 32px)">
                        {state.user && (
                          <>
                            <Menu.Label className="user-copy">
                              {username && <span className="user-name">{username}</span>}
                              <span className="user-email">{state.user.email}</span>
                            </Menu.Label>
                            <Menu.Item
                              component={NavLink}
                              to="/"
                              leftSection={<LayoutGrid size={18} aria-hidden="true" />}
                            >
                              {t('hub.title')}
                            </Menu.Item>
                            {adminStatus?.super_admin && (
                              <Menu.Item
                                component={NavLink}
                                to="/admin"
                                leftSection={<ShieldCheck size={18} aria-hidden="true" />}
                              >
                                {t('superAdmin.title')}
                              </Menu.Item>
                            )}
                            {contentEditor && !adminStatus?.super_admin && (
                              <Menu.Item
                                component={NavLink}
                                to="/library"
                                leftSection={<Library size={18} aria-hidden="true" />}
                              >
                                {t('library.title')}
                              </Menu.Item>
                            )}
                            <Menu.Divider />
                          </>
                        )}
                        {/* RYT-095: leaving belongs to the open campaign, in its own group above the
                          account items; never from the DM's Player view. */}
                        {live &&
                          state.user &&
                          campaign &&
                          !fromShell &&
                          !playerPreview &&
                          !adminInside && (
                            <>
                              <Menu.Label className="user-copy">{campaign.name}</Menu.Label>
                              <LeaveCampaignItem
                                block={leaveBlock(campaign.role, members.data, members.isError)}
                                onSelect={() => {
                                  // The dialog takes focus; it hands it back to the trigger on cancel.
                                  restoreMenuFocus.current = false
                                  setLeaving({ id: campaign.id, name: campaign.name })
                                }}
                              />
                              <Menu.Divider />
                            </>
                          )}
                        {/* Language and theme live only in the Settings drawer (RYT-033, RYT-069). */}
                        <Menu.Item
                          leftSection={<Settings size={18} aria-hidden="true" />}
                          aria-haspopup="dialog"
                          // The drawer takes focus; it hands it back to the trigger when it closes.
                          onClick={() => {
                            restoreMenuFocus.current = false
                            settings.open()
                          }}
                        >
                          {t('nav.settings')}
                        </Menu.Item>
                        {state.user && (
                          <>
                            <Menu.Divider />
                            <Menu.Item
                              leftSection={<LogOut size={18} aria-hidden="true" />}
                              onClick={() => void controller?.signOut()}
                            >
                              {t('auth.signOut')}
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </div>
              </div>
              {showNav && (
                <div className="nav-tabs-row">
                  <TopNavigation entries={entries} />
                </div>
              )}
            </header>
            {/* The preview and group-rest notices stick together under the header (RYT-080). */}
            <div className="top-notices">
              {live && <ConnectionStrip phase={connection.phase} retry={connection.retry} />}
              {playerPreview && (
                <div className="preview-banner" role="status">
                  <Eye size={18} aria-hidden="true" />
                  <Text size="sm" fw={600} className="user-copy preview-banner-text">
                    {previewLabel
                      ? t('shell.previewBanner', { name: previewLabel })
                      : t('shell.previewBannerGeneric')}
                  </Text>
                  <Button size="compact-md" variant="filled" onClick={exitPreview}>
                    {t('shell.exitPreview')}
                  </Button>
                </div>
              )}
              {live && campaign && !fromShell && <AdminBanner campaignId={campaign.id} />}
              {live && campaign && <RestBanner />}
            </div>
            {live && <ConnectionStatus phase={connection.phase} />}
            <main id="main-content" ref={mainRef} tabIndex={-1}>
              <ConnectionContext.Provider value={connection.phase}>
                <SettingsDrawerContext.Provider value={settings.open}>
                  <Outlet key={state.user?.id ?? 'guest'} />
                </SettingsDrawerContext.Provider>
              </ConnectionContext.Provider>
            </main>
          </div>
          {showNav && <BottomNavigation entries={entries} />}
          {switcherOn && campaign && (
            <DmQuickSwitcher
              campaignId={campaign.id}
              opened={switcherOpened}
              onClose={() => {
                stopSwitcherEscape.current()
                hideSwitcher()
              }}
            />
          )}
          <Drawer
            opened={settingsOpened}
            onClose={settings.close}
            position="right"
            // A medium panel beside the page; phones keep a strip of the page visible.
            size="calc(min(100vw - 1.5rem, 30rem))"
            title={t('nav.settings')}
            className="settings-drawer"
            closeOnEscape={!accountDialog}
            closeButtonProps={{ 'aria-label': t('settings.close'), size: 44 }}
            // A light veil keeps the page readable, so a new theme shows behind the panel.
            overlayProps={{ backgroundOpacity: 0.3 }}
            returnFocus={false}
            onExitTransitionEnd={() => {
              if (leaveFocus.current) {
                leaveFocus.current = false
                const page = document.getElementById('main-content')
                const target =
                  page?.querySelector<HTMLElement>('[data-leave-focus]') ??
                  page?.querySelector<HTMLElement>('h1') ??
                  page
                target?.focus()
              } else menuButton.current?.focus()
              setSettingsShown(false)
            }}
          >
            <SettingsPanel onLeave={settings.close} onDialogChange={setAccountDialog} />
          </Drawer>
          {leaving && (
            <LeaveCampaignDialog
              campaign={leaving}
              onClose={() => {
                setLeaving(null)
                focusWhenReady(() => menuButton.current)
              }}
              onLeft={() => setLeaving(null)}
            />
          )}
          {/* RYT-078: asks for a missing username after every sign-in, on any page. */}
          {/* RYT-157: signed in from a password reset link: choose the new password first. */}
          {live && state.user && (
            <RecoveryDialog
              onClosed={() => focusWhenReady(() => mainRef.current, { leaving: null })}
            />
          )}
          {live && state.user && !state.recovery && (
            <UsernameDialog
              suspended={settingsOpened || settingsShown}
              onClosed={() => mainRef.current?.focus()}
            />
          )}
        </div>
      </RestProvider>
    </CampaignViewContext.Provider>
  )
}
