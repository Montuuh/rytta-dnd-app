import { MantineProvider, type MantineColorSchemeManager } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useMemo, type PropsWithChildren } from 'react'
import { useTranslation } from 'react-i18next'
import { createAppTheme } from './theme'
import { classThemes, getClassTheme, themeScheme, useClassTheme } from '@/shared/theme'
import { AuthProvider } from '@/features/auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    // A mutation is never paused for the network and resumed later: offline it fails at once, so
    // a purchase, a deletion or an upload cannot fire by itself when the connection returns.
    mutations: { networkMode: 'always' },
  },
})
/** Red light, subtle and outline variants read the contrast-tested danger token in both schemes
 * (Mantine's dark red-light text is near white and loses the destructive signal). */
const dangerVariables = {
  '--mantine-color-red-text': 'var(--danger)',
  '--mantine-color-red-light-color': 'var(--danger)',
  '--mantine-color-red-light': 'var(--danger-soft)',
  '--mantine-color-red-light-hover': 'color-mix(in srgb, var(--danger) 22%, transparent)',
  '--mantine-color-red-outline': 'var(--danger)',
  '--mantine-color-red-outline-hover': 'var(--danger-soft)',
}
/** RYT-069: the color scheme follows the theme. Mantine reads it from here on mount (before the
 * forced value applies) and never stores a scheme of its own. */
const colorSchemeManager: MantineColorSchemeManager = {
  get: () => themeScheme(getClassTheme()),
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
}

/** The one place that keeps the browser chrome color in sync with the active theme. */
function ThemeColorMeta() {
  const classTheme = useClassTheme()
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', classThemes[classTheme].tokens.bg)
  }, [classTheme])
  return null
}

export function Providers({ children }: PropsWithChildren) {
  const classTheme = useClassTheme()
  const { t } = useTranslation()
  const closeLabel = t('common.close')
  const theme = useMemo(() => createAppTheme(classTheme, closeLabel), [classTheme, closeLabel])
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      forceColorScheme={themeScheme(classTheme)}
      colorSchemeManager={colorSchemeManager}
      cssVariablesResolver={() => ({
        variables: {},
        light: {
          '--mantine-color-body': 'var(--app-bg)',
          '--mantine-color-text': 'var(--app-text)',
          '--mantine-color-dimmed': 'var(--app-muted)',
          // Disabled controls on the theme's paper instead of Mantine's cold grey (dark themes
          // already repaint the dark-* slots these read).
          '--mantine-color-disabled': 'var(--app-raised)',
          '--mantine-color-disabled-color':
            'color-mix(in srgb, var(--app-muted) 82%, var(--app-raised))',
          '--mantine-color-disabled-border': 'var(--app-border)',
          ...dangerVariables,
        },
        dark: {
          '--mantine-color-body': 'var(--app-bg)',
          '--mantine-color-text': 'var(--app-text)',
          '--mantine-color-dimmed': 'var(--app-muted)',
          ...dangerVariables,
        },
      })}
    >
      <ThemeColorMeta />
      <QueryClientProvider client={queryClient}>
        <Notifications position="top-right" />
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
