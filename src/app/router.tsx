import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { lazy, Suspense } from 'react'
import { LoadingScreen } from '@/shared/ui/loading-screen'
import { Layout } from './layout'
import { CampaignBoundary, CampaignHub } from '@/features/campaigns'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import { SignInPage } from '@/pages/sign-in-page'
import { CampaignLanding } from '@/pages/campaign-landing'

const CharacterParty = lazy(() =>
  import('@/features/characters').then((module) => ({ default: module.CharacterParty })),
)

const CharacterSheetPage = lazy(() =>
  import('@/features/characters').then((module) => ({ default: module.CharacterSheetPage })),
)
const CharacterCreationPage = lazy(() =>
  import('@/features/characters').then((module) => ({ default: module.CharacterCreationPage })),
)

const DmCenterPage = lazy(() =>
  import('@/pages/dm-center-page').then((module) => ({ default: module.DmCenterPage })),
)

const InventoryPage = lazy(() =>
  import('@/features/inventory').then((module) => ({ default: module.InventoryPage })),
)
const ShopsPage = lazy(() =>
  import('@/features/shops').then((module) => ({ default: module.ShopsPage })),
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
            <Route path="settings" element={<SettingsPage />} />
            {live && state.status !== 'signed-in' ? (
              <Route
                path="*"
                element={state.status === 'loading' ? <LoadingScreen /> : <SignInPage />}
              />
            ) : (
              <>
                <Route index element={live ? <CampaignHub /> : <Navigate to="/party" replace />} />

                {live && (
                  <Route path="campaign/:campaignId" element={<CampaignBoundary />}>
                    <Route index element={<CampaignLanding />} />
                    <Route path="party" element={<CharacterParty />} />
                    <Route path="party/:characterId" element={<CharacterSheetPage />} />
                    <Route path="party/:characterId/create" element={<CharacterCreationPage />} />
                    <Route path="members" element={<DmCenterPage />} />
                    {/* RYT-027: the storeroom moved into the DM Command Center. */}
                    <Route
                      path="items"
                      element={<Navigate to="../members?panel=items" relative="path" replace />}
                    />
                    <Route path="inventory" element={<InventoryPage />} />
                    <Route path="shops" element={<ShopsPage />} />
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
