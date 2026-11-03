import {
  MantineProvider,
  localStorageColorSchemeManager,
  useComputedColorScheme,
} from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useMemo, type PropsWithChildren } from 'react'
import { createAppTheme } from './theme'
import { classThemes, useClassTheme } from '@/shared/theme'
import { AuthProvider } from '@/features/auth'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
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
const storedScheme = localStorageColorSchemeManager({ key: 'rytta-color-scheme' })
const colorSchemeManager = {
  ...storedScheme,
  get: () => (storedScheme.get('dark') === 'light' ? ('light' as const) : ('dark' as const)),
}

/** The one place that keeps the browser chrome color in sync with the active theme. */
function ThemeColorMeta() {
  const scheme = useComputedColorScheme('dark')
  const classTheme = useClassTheme()
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', classThemes[classTheme][scheme].bg)
  }, [scheme, classTheme])
  return null
}

export function Providers({ children }: PropsWithChildren) {
  const classTheme = useClassTheme()
  const theme = useMemo(() => createAppTheme(classTheme), [classTheme])
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      colorSchemeManager={colorSchemeManager}
      cssVariablesResolver={() => ({
        variables: {},
        light: {
          '--mantine-color-body': 'var(--app-bg)',
          '--mantine-color-text': 'var(--app-text)',
          '--mantine-color-dimmed': 'var(--app-muted)',
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
