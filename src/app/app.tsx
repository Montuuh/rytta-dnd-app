import { lazy, Suspense } from 'react'
import { Providers } from './providers'
import { ErrorBoundary } from '@/shared/ui/error-boundary'
import { LoadingScreen } from '@/shared/ui/loading-screen'

const AppRouter = lazy(() => import('./router').then((module) => ({ default: module.AppRouter })))

export function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <Suspense fallback={<LoadingScreen />}>
          <AppRouter />
        </Suspense>
      </Providers>
    </ErrorBoundary>
  )
}
