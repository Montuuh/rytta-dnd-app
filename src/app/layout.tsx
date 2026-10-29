import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Stack,
  Text,
  Modal,
  Menu as AccountMenu,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Compass, Menu, Settings, UserRound, PanelLeft } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from './modules'
import { config } from '@/shared/lib/config'
import { PreferencesControls } from '@/shared/ui/preferences-controls'
import { useQuery } from '@tanstack/react-query'
import { CampaignViewContext, campaignsQuery, membersQuery } from '@/features/campaigns'
import { useAuth } from '@/features/auth'

function Navigation({ close }: { close?: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const live = config.VITE_DATA_MODE === 'supabase'
  const prefix = live ? pathname.match(/^\/campaign\/[^/]+/)?.[0] : undefined
  return (
    <nav aria-label={t('nav.main')}>
      <Stack gap={4}>
        {(!live || prefix) &&
          modules.map(({ path, label, icon: Icon }) =>
            !['/', '/party'].includes(path) ? (
              <Text key={path} className="nav-item disabled-module" aria-disabled="true">
                {' '}
                <Icon size={19} aria-hidden="true" />
                {t(label)} <span className="planned-label">{t('common.planned')}</span>
              </Text>
            ) : (
              <NavLink
                end={path === '/'}
                key={path}
                to={prefix ? `${prefix}${path === '/' ? '' : path}` : path}
                onClick={close}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} aria-hidden="true" />
                {t(label)}
              </NavLink>
            ),
          )}
        {prefix && (
          <NavLink
            to={`${prefix}/members`}
            onClick={close}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {t('campaign.manage')}
          </NavLink>
        )}
      </Stack>
    </nav>
  )
}

export function Layout() {
  const { t } = useTranslation()
  const { state, controller } = useAuth()
  const live = config.VITE_DATA_MODE === 'supabase'
  const [online, setOnline] = useState(navigator.onLine)
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
  const [navigationOpened, setNavigationOpened] = useState(false)
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
  return (
    <CampaignViewContext.Provider
      value={{
        playerPreview,
        previewUserId: playerPreview ? previewUserId : null,
        previewLabel: playerPreview ? previewLabel : null,
      }}
    >
      <div
        className={`app-layout ${live && !pathname.startsWith('/campaign/') ? 'account-layout' : ''}`}
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
        <aside className="sidebar">
          <div className="brand">
            <Compass size={32} strokeWidth={1.4} aria-hidden="true" />
            <div>
              RYTTA<small>{t('brand.tag')}</small>
            </div>
          </div>
          <Text className="nav-caption">{t('nav.adventure')}</Text>
          <Navigation />
          <div className="sidebar-note">
            {t('brand.less')}
            <br />
            {t('brand.more')}
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <Group className="header-campaign" gap="xs">
              {(!live || campaign) && (
                <ActionIcon
                  className="mobile-navigation"
                  variant="subtle"
                  size={44}
                  aria-label={t('nav.open')}
                  onClick={() => setNavigationOpened(true)}
                >
                  <PanelLeft />
                </ActionIcon>
              )}
              {campaign && (
                <Text fw={600} className="user-copy">
                  {campaign.name}
                </Text>
              )}
            </Group>
            <Group gap="xs" wrap="nowrap" className="header-actions">
              {campaign?.role === 'dm' &&
                (playerPreview ? (
                  <Button
                    variant="light"
                    aria-pressed
                    onClick={() => {
                      setPreviewScope(null)
                      setPreviewUserId(null)
                      setPreviewLabel(null)
                    }}
                  >
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
                            onClick={() => {
                              setPreviewUserId(member.user_id)
                              setPreviewLabel(member.display_name)
                              setPreviewScope(scope)
                            }}
                          >
                            {member.display_name}
                          </AccountMenu.Item>
                        ))
                      )}
                    </AccountMenu.Dropdown>
                  </AccountMenu>
                ))}
              <Group gap="xs" wrap="nowrap" className="account-controls">
                {state.user && (
                  <AccountMenu
                    position="bottom-end"
                    withinPortal
                    withInitialFocusPlaceholder={false}
                  >
                    <AccountMenu.Target>
                      <Button
                        variant="subtle"
                        className="account-button"
                        leftSection={<UserRound size={20} />}
                        aria-label={t('auth.account', { email: state.user.email })}
                      >
                        <span className="account-email">{state.user.email}</span>
                      </Button>
                    </AccountMenu.Target>
                    <AccountMenu.Dropdown className="account-dropdown" maw="calc(100vw - 32px)">
                      <AccountMenu.Label className="user-copy">
                        {state.user.email}
                      </AccountMenu.Label>
                      <AccountMenu.Item component={NavLink} to="/">
                        {t('hub.title')}
                      </AccountMenu.Item>
                      <AccountMenu.Item onClick={() => void controller?.signOut()}>
                        {t('auth.signOut')}
                      </AccountMenu.Item>
                    </AccountMenu.Dropdown>
                  </AccountMenu>
                )}
                <AccountMenu
                  opened={opened}
                  onChange={(value) => {
                    if (value) {
                      restoreMenuFocus.current = true
                      open()
                    } else close()
                  }}
                  position="bottom-end"
                  width={220}
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
                    <ActionIcon
                      ref={menuButton}
                      variant="subtle"
                      size={44}
                      aria-label={t('account.menu')}
                    >
                      <Menu />
                    </ActionIcon>
                  </AccountMenu.Target>
                  <AccountMenu.Dropdown maw="calc(100vw - 32px)">
                    <AccountMenu.Item
                      leftSection={<Settings size={20} aria-hidden="true" />}
                      onClick={() => {
                        pendingSettings.current = true
                        restoreMenuFocus.current = false
                      }}
                    >
                      {t('nav.settings')}
                    </AccountMenu.Item>
                  </AccountMenu.Dropdown>
                </AccountMenu>
              </Group>
            </Group>
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
        <Drawer
          opened={navigationOpened}
          onClose={() => setNavigationOpened(false)}
          title={t('nav.drawer')}
          closeButtonProps={{ 'aria-label': t('nav.close'), size: 44 }}
        >
          <Navigation close={() => setNavigationOpened(false)} />
        </Drawer>
      </div>
    </CampaignViewContext.Provider>
  )
}
