import { useEffect, useRef, useState } from 'react'
import { ActionIcon, Alert, Badge, Button, Drawer, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Compass, Menu, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from './modules'
import { config } from '@/shared/lib/config'
import { PreferencesControls } from '@/shared/ui/preferences-controls'
import { useAuth } from '@/features/auth'

function Navigation({ close }: { close?: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const live = config.VITE_DATA_MODE === 'supabase'
  const prefix = live ? pathname.match(/^\/campaign\/[^/]+/)?.[0] : undefined
  return (
    <nav aria-label={t('nav.main')}>
      <Stack gap={4}>
        {live && (
          <NavLink
            end
            to="/"
            onClick={close}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {t('hub.title')}
          </NavLink>
        )}
        {(!live || prefix) &&
          modules.map(({ path, label, icon: Icon }) => (
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
          ))}
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
      <NavLink
        to="/settings"
        onClick={close}
        className={({ isActive }) => `nav-item settings-link ${isActive ? 'active' : ''}`}
      >
        <Settings size={19} aria-hidden="true" />
        {t('nav.settings')}
      </NavLink>
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
  const [opened, { open, close }] = useDisclosure(false)
  const { pathname } = useLocation()
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
    <div className="app-layout">
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
          <Group gap="sm" className="topbar-identity">
            <ActionIcon
              className="mobile-menu"
              variant="subtle"
              aria-label={t('nav.open')}
              onClick={open}
              size={44}
            >
              <Menu />
            </ActionIcon>
            <Text size="sm" fw={600}>
              {t('brand.title')}
            </Text>
          </Group>
          <div className="topbar-tools">
            <Badge variant="outline" color="forest">
              {t(config.VITE_DATA_MODE === 'demo' ? 'mode.demo' : 'mode.backend')}
            </Badge>
            <PreferencesControls compact />
          </div>
          {live && state.user && (
            <Group className="account-row" justify="space-between">
              <Text size="xs" c="dimmed" className="user-copy">
                {t('auth.account', { email: state.user.email })}
              </Text>
              <Button variant="subtle" onClick={() => void controller?.signOut()}>
                {t('auth.signOut')}
              </Button>
            </Group>
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
      <Drawer
        opened={opened}
        onClose={close}
        title={t('nav.drawer')}
        closeButtonProps={{ 'aria-label': t('nav.close'), size: 44 }}
        size="xs"
        returnFocus
      >
        <Navigation close={close} />
      </Drawer>
    </div>
  )
}
