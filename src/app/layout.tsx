import { useEffect, useRef } from 'react'
import { ActionIcon, Badge, Drawer, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Compass, Menu, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from './modules'
import { config } from '@/shared/lib/config'
import { PreferencesControls } from '@/shared/ui/preferences-controls'

function Navigation({ close }: { close?: () => void }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('nav.main')}>
      <Stack gap={4}>
        {modules.map(({ path, label, icon: Icon }) => (
          <NavLink
            end={path === '/'}
            key={path}
            to={path}
            onClick={close}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={19} aria-hidden="true" />
            {t(label)}
          </NavLink>
        ))}
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
    const key =
      modules.find((m) => m.path === pathname)?.label ??
      (pathname === '/settings' ? 'nav.settings' : 'page.notFound')
    document.title = `${t(key)} · Rytta`
  }, [pathname, t])
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
        </header>
        <main id="main-content" ref={mainRef} tabIndex={-1}>
          <Outlet />
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
