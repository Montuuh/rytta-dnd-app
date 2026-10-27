import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { theme } from './theme'
import { AuthProvider } from '@/features/auth'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})
const storedScheme = localStorageColorSchemeManager({ key: 'rytta-color-scheme' })
const colorSchemeManager = {
  ...storedScheme,
  get: () => (storedScheme.get('dark') === 'light' ? ('light' as const) : ('dark' as const)),
}

export function Providers({ children }: PropsWithChildren) {
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
        },
        dark: {
          '--mantine-color-body': 'var(--app-bg)',
          '--mantine-color-text': 'var(--app-text)',
          '--mantine-color-dimmed': 'var(--app-muted)',
        },
      })}
    >
      <QueryClientProvider client={queryClient}>
        <Notifications position="top-right" />
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  )
}
