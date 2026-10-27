import { HashRouter, Route, Routes } from 'react-router'
import { lazy, Suspense } from 'react'
import { LoadingScreen } from '@/shared/ui/loading-screen'
import { Layout } from './layout'
import { CampaignBoundary, CampaignHub, CampaignMembers } from '@/features/campaigns'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import { SignInPage } from '@/pages/sign-in-page'
import { CampaignPage } from '@/pages/campaign-page'

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
  const { state } = useAuth()
  const live = config.VITE_DATA_MODE === 'supabase'
  return (
    <HashRouter>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route element={<Layout />}>
            {live && state.status !== 'signed-in' ? (
              <Route
                path="*"
                element={state.status === 'loading' ? <LoadingScreen /> : <SignInPage />}
              />
            ) : (
              <>
                <Route index element={live ? <CampaignHub /> : <CampPage />} />
                <Route path="settings" element={<SettingsPage />} />
                {live && (
                  <Route path="campaign/:campaignId" element={<CampaignBoundary />}>
                    <Route index element={<CampaignPage />} />
                    <Route path="members" element={<CampaignMembers />} />
                    <Route path="*" element={<ModulePage />} />
                  </Route>
                )}
                <Route path="*" element={<ModulePage />} />
              </>
            )}
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
