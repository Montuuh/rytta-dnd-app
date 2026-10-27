import { lazy, Suspense, type PropsWithChildren } from 'react'
import { config } from '@/shared/lib/config'
import { LoadingScreen } from '@/shared/ui/loading-screen'
import type { AuthSnapshot } from './domain/auth'
import { AuthContext } from './auth-context'

const demoState: AuthSnapshot = { status: 'signed-out', user: null, issue: null }
const LiveAuthProvider = lazy(() =>
  import('./live-auth-provider').then((m) => ({ default: m.LiveAuthProvider })),
)

export function AuthProvider({ children }: PropsWithChildren) {
  return config.VITE_DATA_MODE === 'demo' ? (
    <AuthContext.Provider value={{ state: demoState, controller: null }}>
      {children}
    </AuthContext.Provider>
  ) : (
    <Suspense fallback={<LoadingScreen />}>
      <LiveAuthProvider>{children}</LiveAuthProvider>
    </Suspense>
  )
}
