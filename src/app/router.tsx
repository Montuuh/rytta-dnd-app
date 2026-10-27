import { HashRouter, Route, Routes } from 'react-router'
import { lazy, Suspense } from 'react'
import { LoadingScreen } from '@/shared/ui/loading-screen'
import { Layout } from './layout'

const CampPage = lazy(() =>
  import('@/pages/camp-page').then((module) => ({ default: module.CampPage })),
)
const ModulePage = lazy(() =>
  import('@/pages/module-page').then((module) => ({ default: module.ModulePage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((module) => ({ default: module.SettingsPage })),
)

export function AppRouter() {
  return (
    <HashRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<CampPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<ModulePage />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
