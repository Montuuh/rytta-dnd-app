import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Menu,
  Modal,
  Popover,
  Stack,
  Switch,
  Text,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  Compass,
  Package,
  Eye,
  Languages,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Settings,
  Shield,
  Sun,
  UserRound,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from './modules'
import { config } from '@/shared/lib/config'
import { PreferencesControls } from '@/shared/ui/preferences-controls'
import { useQuery } from '@tanstack/react-query'
import {
  CampaignViewContext,
  campaignsQuery,
  membersQuery,
  type Campaign,
} from '@/features/campaigns'
import { useAuth } from '@/features/auth'

const defaultActivePaths = new Set(['/', '/party'])
/** Phones show this many destinations before folding the rest into "More". */
const bottomSlots = 5

type NavEntry = {
  to: string
  end?: boolean
  label: string
  /** Shorter bottom-bar label; it must stay contained in the full accessible label. */
  short?: string
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>
  dm?: boolean
}

/** Only reachable destinations appear in navigation. Planned modules live on the campaign
 * home "Coming soon" card and in the DM module controls instead of crowding the bar. */
function useNavEntries(campaign: Campaign | undefined, playerPreview: boolean): NavEntry[] {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const live = config.VITE_DATA_MODE === 'supabase'
  if (!live)
    return modules
      .filter(({ path }) => defaultActivePaths.has(path))
      .map(({ path, label, icon }) => ({ to: path, end: path === '/', label: t(label), icon }))
  const prefix = pathname.match(/^\/campaign\/[^/]+/)?.[0]
  if (!prefix || !campaign) return []
  const effectiveDm = campaign.role === 'dm' && !playerPreview
  const enabledKeys = new Set(campaign.player_modules ?? ['party'])
  const reachable = modules.filter(
    ({ path, ...module }) =>
      path === '/' ||
      enabledKeys.has(path.replace(/^\//, '')) ||
      (effectiveDm && 'implemented' in module && module.implemented),
  )
  const entries: NavEntry[] = reachable.map(({ path, label, icon }) => ({
    to: path === '/' ? prefix : `${prefix}${path}`,
    end: path === '/',
    label: t(label),
    icon,
  }))
  if (effectiveDm)
    entries.splice(1, 0, {
      to: `${prefix}/members`,
      label: t('campaign.manage'),
      short: t('nav.dmShort'),
      icon: Shield,
      dm: true,
    })
  if (effectiveDm)
    entries.push({ to: `${prefix}/items`, label: t('catalogue.title'), icon: Package, dm: true })
  return entries
}

function TopNavigation({ entries }: { entries: NavEntry[] }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('nav.main')} className="nav-tabs">
      {entries.map(({ to, end, label, icon: Icon, dm }) => (
        <NavLink
          key={to}
          end={end}
          to={to}
          className={({ isActive }) =>
            `nav-item ${dm ? 'nav-item-dm' : ''} ${isActive ? 'active' : ''}`
          }
        >
          <Icon size={18} aria-hidden="true" />
          {label}
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
  const moreActive = rest.some(({ to, end }) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`),
  )
  useEffect(close, [pathname, close])
  return (
    <>
      <nav aria-label={t('nav.main')} className="bottom-nav">
        {primary.map(({ to, end, label, short, icon: Icon, dm }) => (
          <NavLink
            key={to}
            end={end}
            to={to}
            aria-label={short ? label : undefined}
            className={({ isActive }) =>
              `bottom-nav-item ${dm ? 'is-dm' : ''} ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={22} aria-hidden="true" />
            <span className="bottom-nav-label">{short ?? label}</span>
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
          {rest.map(({ to, end, label, icon: Icon, dm }) => (
            <NavLink
              key={to}
              end={end}
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
            </NavLink>
          ))}
        </Stack>
      </Drawer>
    </>
  )
}

export function Layout() {
  const { t, i18n } = useTranslation()
  const scheme = useComputedColorScheme('dark')
  const { setColorScheme } = useMantineColorScheme()
  const { state, controller } = useAuth()
  const live = config.VITE_DATA_MODE === 'supabase'
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', scheme === 'dark' ? '#140f0b' : '#f7efe2')
  }, [scheme])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  const [settingsOpened, setSettingsOpened] = useState(false)
  const [previewScope, setPreviewScope] = useState<string | null>(null)
  const [previewUserId, setPreviewUserId] = useState<string | null>(null)
  const [previewLabel, setPreviewLabel] = useState<string | null>(null)
  const [pickerOpened, setPickerOpened] = useState(false)
  const pendingSettings = useRef(false)
  const [opened, { open, close }] = useDisclosure(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const previewSwitch = useRef<HTMLInputElement>(null)
  const restoreMenuFocus = useRef(false)
  const { pathname } = useLocation()
  const campaignId = pathname.match(/^\/campaign\/([^/]+)/)?.[1]
  const campaigns = useQuery({
    ...campaignsQuery(state.user?.id ?? ''),
    enabled: live && !!state.user && !!campaignId,
  })
  const campaign = !campaigns.isError ? campaigns.data?.find((c) => c.id === campaignId) : undefined
  const scope = `${state.user?.id}:${campaignId}`
  const playerPreview = campaign?.role === 'dm' && previewScope === scope
  const members = useQuery({
    ...membersQuery(state.user?.id ?? '', campaignId ?? ''),
    enabled: live && !!state.user && !!campaignId && campaign?.role === 'dm',
  })
  const previewPlayers =
    !members.isError && members.data
      ? members.data.filter((member) => member.role === 'player')
      : []
  const entries = useNavEntries(campaign, playerPreview)
  const showNav = (!live || !!campaign) && entries.length > 0
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      window.scrollTo(0, 0)
      previousPath.current = pathname
    }
    const modulePath = live ? pathname.replace(/^\/campaign\/[^/]+/, '') || '/' : pathname
    const key =
      live && state.status !== 'signed-in'
        ? 'auth.google'
        : live && pathname === '/'
          ? 'hub.title'
          : pathname.endsWith('/members')
            ? 'campaign.manage'
            : /^\/party\/[^/]+\/create$/.test(modulePath)
              ? 'wizard.editorTitle'
              : /^\/party\/[^/]+$/.test(modulePath)
                ? 'sheet.title'
                : (modules.find((m) => m.path === modulePath)?.label ??
                  (pathname === '/settings' ? 'nav.settings' : 'page.notFound'))
    document.title = `${t(key)} · Rytta`
  }, [pathname, t, live, state.status])
  const currentLang = i18n.resolvedLanguage === 'en' ? 'en' : 'es'
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
      <div
        className={`app-layout ${live && !pathname.startsWith('/campaign/') ? 'account-layout' : ''} ${campaign?.role === 'dm' && !playerPreview ? 'dm-layout' : ''} ${showNav ? 'has-bottom-nav' : ''}`}
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
              <div className="brand-bar">
                <span className="brand-emblem" aria-hidden="true">
                  <Compass size={22} strokeWidth={1.7} />
                </span>
                <div className="brand-copy">
                  <span className="brand-title">RYTTA</span>
                  {campaign ? (
                    <Text size="xs" fw={600} className="header-campaign-name user-copy">
                      {campaign.name}
                    </Text>
                  ) : (
                    <span className="brand-subtitle">{t('brand.tag')}</span>
                  )}
                </div>
              </div>
              <div className="header-actions">
                {campaign?.role === 'dm' && (
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
                          title={t('shell.playerSwitchHint')}
                          thumbIcon={<Eye size={12} aria-hidden="true" />}
                        />
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
                <Menu
                  opened={opened}
                  onChange={(value) => {
                    if (value) {
                      restoreMenuFocus.current = true
                      open()
                    } else close()
                  }}
                  position="bottom-end"
                  width={260}
                  withinPortal
                  withInitialFocusPlaceholder={false}
                  returnFocus={false}
                  onExitTransitionEnd={() => {
                    if (pendingSettings.current) {
                      pendingSettings.current = false
                      setSettingsOpened(true)
                    } else if (restoreMenuFocus.current) menuButton.current?.focus()
                  }}
                >
                  <Menu.Target>
                    <Button
                      ref={menuButton}
                      variant="subtle"
                      className="account-button profile-trigger-btn"
                      leftSection={<UserRound size={18} aria-hidden="true" />}
                      aria-label={
                        state.user
                          ? `${t('account.profile')} · ${t('auth.account', { email: state.user.email })}`
                          : `${t('account.profile')} · ${t('account.menu')}`
                      }
                    >
                      <span className="profile-label">{t('account.profile')}</span>
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown className="account-dropdown" maw="calc(100vw - 32px)">
                    {state.user && (
                      <>
                        <Menu.Label className="user-copy">{state.user.email}</Menu.Label>
                        <Menu.Item
                          component={NavLink}
                          to="/"
                          leftSection={<Compass size={18} aria-hidden="true" />}
                        >
                          {t('hub.title')}
                        </Menu.Item>
                        <Menu.Divider />
                      </>
                    )}
                    <Menu.Item
                      closeMenuOnClick={false}
                      leftSection={
                        scheme === 'dark' ? (
                          <Moon size={18} aria-hidden="true" />
                        ) : (
                          <Sun size={18} aria-hidden="true" />
                        )
                      }
                      rightSection={
                        <span className="menu-toggle-pill" aria-hidden="true">
                          <span data-on={scheme === 'dark' || undefined}>
                            <Moon size={14} />
                          </span>
                          <span data-on={scheme === 'light' || undefined}>
                            <Sun size={14} />
                          </span>
                        </span>
                      }
                      aria-label={t(
                        scheme === 'dark' ? 'preferences.toLight' : 'preferences.toDark',
                      )}
                      onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
                    >
                      {t('preferences.themeShort')}
                    </Menu.Item>
                    <Menu.Item
                      closeMenuOnClick={false}
                      leftSection={<Languages size={18} aria-hidden="true" />}
                      rightSection={
                        <span className="menu-toggle-pill" aria-hidden="true">
                          <span data-on={currentLang === 'es' || undefined}>ES</span>
                          <span data-on={currentLang === 'en' || undefined}>EN</span>
                        </span>
                      }
                      aria-label={t(
                        currentLang === 'es' ? 'preferences.switchToEn' : 'preferences.switchToEs',
                      )}
                      onClick={() => void i18n.changeLanguage(currentLang === 'es' ? 'en' : 'es')}
                    >
                      {t('preferences.languageShort')}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<Settings size={18} aria-hidden="true" />}
                      onClick={() => {
                        pendingSettings.current = true
                        restoreMenuFocus.current = false
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
              </div>
            </div>
            {showNav && (
              <div className="nav-tabs-row">
                <TopNavigation entries={entries} />
              </div>
            )}
          </header>
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
          <main id="main-content" ref={mainRef} tabIndex={-1}>
            {live && !online && (
              <Alert role="status" mb="lg">
                {t('campaign.offline')}
              </Alert>
            )}
            <Outlet key={state.user?.id ?? 'guest'} />
          </main>
          <footer className="page-footer">{t('brand.footer')}</footer>
        </div>
        {showNav && <BottomNavigation entries={entries} />}
        <Modal
          opened={settingsOpened}
          onClose={() => setSettingsOpened(false)}
          centered
          size="xl"
          title={t('nav.settings')}
          returnFocus={false}
          onExitTransitionEnd={() => menuButton.current?.focus()}
          closeButtonProps={{ 'aria-label': t('preferences.close'), size: 44 }}
        >
          <Stack p={{ base: 'xs', sm: 'xl' }}>
            <Text fw={600}>{t('preferences.title')}</Text>
            <PreferencesControls />
          </Stack>
        </Modal>
      </div>
    </CampaignViewContext.Provider>
  )
}
