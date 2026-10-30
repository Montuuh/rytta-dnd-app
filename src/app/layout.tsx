import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Stack,
  Text,
  Modal,
  Menu as AccountMenu,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Compass, LogOut, Moon, Settings, Shield, Sun, UserRound } from 'lucide-react'
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

function Navigation({ campaign, playerPreview }: { campaign?: Campaign; playerPreview?: boolean }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const live = config.VITE_DATA_MODE === 'supabase'
  const prefix = live ? pathname.match(/^\/campaign\/[^/]+/)?.[0] : undefined

  if (!live) {
    const activeModules = modules.filter(({ path }) => defaultActivePaths.has(path))
    const plannedModules = modules.filter(({ path }) => !defaultActivePaths.has(path))
    return (
      <nav aria-label={t('nav.main')} className="nav-tabs">
        {activeModules.map(({ path, label, icon: Icon }) => (
          <NavLink
            end={path === '/'}
            key={path}
            to={path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={17} aria-hidden="true" />
            {t(label)}
          </NavLink>
        ))}
        {plannedModules.map(({ path, label, icon: Icon }) => (
          <Text
            component="span"
            key={path}
            className="nav-item disabled-module"
            aria-disabled="true"
          >
            <Icon size={16} aria-hidden="true" />
            {t(label)} <span className="planned-label">{t('common.planned')}</span>
          </Text>
        ))}
      </nav>
    )
  }

  if (!prefix || !campaign) return null
  const effectiveDm = campaign.role === 'dm' && !playerPreview
  const enabledKeys = new Set(campaign.player_modules ?? ['party'])
  const isModuleEnabled = (path: string) => path === '/' || enabledKeys.has(path.replace(/^\//, ''))

  if (!effectiveDm) {
    const visiblePlayerModules = modules.filter(({ path }) => isModuleEnabled(path))
    return (
      <nav aria-label={t('nav.main')} className="nav-tabs">
        {visiblePlayerModules.map(({ path, label, icon: Icon }) => (
          <NavLink
            end={path === '/'}
            key={path}
            to={`${prefix}${path === '/' ? '' : path}`}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={17} aria-hidden="true" />
            {t(label)}
          </NavLink>
        ))}
      </nav>
    )
  }

  const campModule = modules[0]!
  const partyModule = modules[1]!
  const secondaryModules = modules.slice(2)
  const CampIcon = campModule.icon
  const PartyIcon = partyModule.icon

  return (
    <nav aria-label={t('nav.main')} className="nav-tabs">
      <NavLink end to={prefix} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <CampIcon size={17} aria-hidden="true" />
        {t(campModule.label)}
      </NavLink>
      <NavLink
        to={`${prefix}/members`}
        className={({ isActive }) => `nav-item nav-item-dm ${isActive ? 'active' : ''}`}
      >
        <Shield size={17} aria-hidden="true" />
        {t('campaign.manage')}
      </NavLink>
      <NavLink
        to={`${prefix}${partyModule.path}`}
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        <PartyIcon size={17} aria-hidden="true" />
        {t(partyModule.label)}
      </NavLink>
      {secondaryModules.map(({ path, label, icon: Icon }) =>
        isModuleEnabled(path) ? (
          <NavLink
            key={path}
            to={`${prefix}${path}`}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={17} aria-hidden="true" />
            {t(label)}
          </NavLink>
        ) : (
          <Text
            component="span"
            key={path}
            className="nav-item disabled-module"
            aria-disabled="true"
          >
            <Icon size={16} aria-hidden="true" />
            {t(label)} <span className="planned-label">{t('common.planned')}</span>
          </Text>
        ),
      )}
    </nav>
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
  const pendingSettings = useRef(false)
  const [opened, { open, close }] = useDisclosure(false)
  const menuButton = useRef<HTMLButtonElement>(null)
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
            : (modules.find((m) => m.path === modulePath)?.label ??
              (pathname === '/settings' ? 'nav.settings' : 'page.notFound'))
    document.title = `${t(key)} · Rytta`
  }, [pathname, t, live, state.status])
  const currentLang = i18n.resolvedLanguage === 'en' ? 'en' : 'es'
  const enterPreview = (userId: string | null, label: string | null) => {
    setPreviewUserId(userId)
    setPreviewLabel(label)
    setPreviewScope(scope)
  }
  const exitPreview = () => {
    setPreviewScope(null)
    setPreviewUserId(null)
    setPreviewLabel(null)
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
        className={`app-layout ${live && !pathname.startsWith('/campaign/') ? 'account-layout' : ''} ${campaign?.role === 'dm' && !playerPreview ? 'dm-layout' : ''}`}
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
              <Group gap={6} wrap="nowrap" className="header-actions">
                {campaign?.role === 'dm' &&
                  (playerPreview ? (
                    <Button variant="light" aria-pressed onClick={exitPreview}>
                      {t('shell.dmView')}
                    </Button>
                  ) : (
                    <AccountMenu
                      position="bottom-end"
                      withinPortal
                      withInitialFocusPlaceholder={false}
                    >
                      <AccountMenu.Target>
                        <Button variant="light" aria-haspopup="menu" aria-pressed={false}>
                          {t('shell.playerView')}
                        </Button>
                      </AccountMenu.Target>
                      <AccountMenu.Dropdown maw="calc(100vw - 32px)">
                        <AccountMenu.Label>{t('shell.choosePlayerView')}</AccountMenu.Label>
                        {previewPlayers.length === 0 ? (
                          <AccountMenu.Item disabled>{t('shell.noPlayers')}</AccountMenu.Item>
                        ) : (
                          previewPlayers.map((member) => (
                            <AccountMenu.Item
                              key={member.user_id}
                              className="user-copy"
                              onClick={() => enterPreview(member.user_id, member.display_name)}
                            >
                              {member.display_name}
                            </AccountMenu.Item>
                          ))
                        )}
                      </AccountMenu.Dropdown>
                    </AccountMenu>
                  ))}
                <Button
                  variant="subtle"
                  className="lang-toggle-btn"
                  aria-label={t(
                    currentLang === 'es' ? 'preferences.switchToEn' : 'preferences.switchToEs',
                  )}
                  title={t(
                    currentLang === 'es' ? 'preferences.switchToEn' : 'preferences.switchToEs',
                  )}
                  onClick={() => void i18n.changeLanguage(currentLang === 'es' ? 'en' : 'es')}
                >
                  {currentLang.toUpperCase()}
                </Button>
                <ActionIcon
                  variant="subtle"
                  size={44}
                  className="theme-toggle-btn"
                  aria-label={t(scheme === 'dark' ? 'preferences.toLight' : 'preferences.toDark')}
                  title={t(scheme === 'dark' ? 'preferences.toLight' : 'preferences.toDark')}
                  onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
                >
                  {scheme === 'dark' ? (
                    <Sun size={20} aria-hidden="true" />
                  ) : (
                    <Moon size={20} aria-hidden="true" />
                  )}
                </ActionIcon>
                <AccountMenu
                  opened={opened}
                  onChange={(value) => {
                    if (value) {
                      restoreMenuFocus.current = true
                      open()
                    } else close()
                  }}
                  position="bottom-end"
                  width={236}
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
                  <AccountMenu.Target>
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
                  </AccountMenu.Target>
                  <AccountMenu.Dropdown className="account-dropdown" maw="calc(100vw - 32px)">
                    {state.user && (
                      <>
                        <AccountMenu.Label className="user-copy">
                          {state.user.email}
                        </AccountMenu.Label>
                        <AccountMenu.Item
                          component={NavLink}
                          to="/"
                          leftSection={<Compass size={18} aria-hidden="true" />}
                        >
                          {t('hub.title')}
                        </AccountMenu.Item>
                      </>
                    )}
                    <AccountMenu.Item
                      leftSection={<Settings size={18} aria-hidden="true" />}
                      onClick={() => {
                        pendingSettings.current = true
                        restoreMenuFocus.current = false
                      }}
                    >
                      {t('nav.settings')}
                    </AccountMenu.Item>
                    {state.user && (
                      <>
                        <AccountMenu.Divider />
                        <AccountMenu.Item
                          leftSection={<LogOut size={18} aria-hidden="true" />}
                          onClick={() => void controller?.signOut()}
                        >
                          {t('auth.signOut')}
                        </AccountMenu.Item>
                      </>
                    )}
                  </AccountMenu.Dropdown>
                </AccountMenu>
              </Group>
            </div>
            {(!live || campaign) && (
              <div className="nav-tabs-row">
                <Navigation campaign={campaign} playerPreview={playerPreview} />
              </div>
            )}
          </header>
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
