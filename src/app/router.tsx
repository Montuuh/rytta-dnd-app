import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router'
import { lazy, Suspense, useEffect } from 'react'
import { LoadingScreen } from '@/shared/ui/loading-screen'
import { Layout, SettingsRoute } from './layout'
import { CampaignBoundary, CampaignHub, useCampaign } from '@/features/campaigns'
import { documentTitleKey } from './document-title'
import { takeReturnTo, useAuth } from '@/features/auth'
import { LibraryPage } from '@/features/content-library'
import { AdminPage } from '@/features/admin'
import { QuestsPage } from '@/features/quests'
import { config } from '@/shared/lib/config'
import { routerBasename } from '@/shared/lib/app-path'
import { SignInPage } from '@/pages/sign-in-page'
import { PartyRecapLink } from '@/pages/session-links'
import { CampaignLanding } from '@/pages/campaign-landing'
import { LegalPage } from '@/pages/legal-page'

// RYT-034: campaign pages render inside the trade layer (invitation popup, window, dock).
const TradeLayer = lazy(() =>
  import('@/features/trades').then((module) => ({ default: module.TradeLayer })),
)
// RYT-008: the glossary layer makes rules terms clickable on every campaign page.
const CampaignGlossaryLayer = lazy(() =>
  import('@/features/glossary').then((module) => ({ default: module.CampaignGlossaryLayer })),
)
const StandaloneGlossaryLayer = lazy(() =>
  import('@/features/glossary').then((module) => ({ default: module.StandaloneGlossaryLayer })),
)
const GlossaryPage = lazy(() =>
  import('@/features/glossary').then((module) => ({ default: module.GlossaryPage })),
)
const CharacterParty = lazy(() =>
  import('@/features/characters').then((module) => ({ default: module.CharacterParty })),
)

// RYT-044: the Player character manager (roster and active character).
const CharacterRosterPage = lazy(() =>
  import('@/features/characters').then((module) => ({ default: module.CharacterRosterPage })),
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

const SessionPage = lazy(() =>
  import('@/pages/session-page').then((module) => ({ default: module.SessionPage })),
)
const CombatPage = lazy(() =>
  import('@/features/combat').then((module) => ({ default: module.CombatPage })),
)
const CombatEncounterPage = lazy(() =>
  import('@/features/combat').then((module) => ({ default: module.CombatEncounterPage })),
)
const CombatTablePage = lazy(() =>
  import('@/features/combat').then((module) => ({ default: module.CombatTablePage })),
)

// ADR 032: the tabletop editor, the Player view and the chrome-less table screen.
const TabletopPage = lazy(() =>
  import('@/features/tabletop').then((module) => ({ default: module.TabletopPage })),
)
const TableProjectionButton = lazy(() =>
  import('@/features/tabletop').then((module) => ({ default: module.TableProjectionButton })),
)
const TabletopScenePage = lazy(() =>
  import('@/features/tabletop').then((module) => ({ default: module.TabletopScenePage })),
)
const TabletopTablePage = lazy(() =>
  import('@/features/tabletop').then((module) => ({ default: module.TabletopTablePage })),
)

const ModulePage = lazy(() =>
  import('@/pages/module-page').then((module) => ({ default: module.ModulePage })),
)

/** J3-16: the storeroom lives in the DM Command Center; a Player's equivalent is the inventory. */
function ItemsRedirect() {
  const { role } = useCampaign()
  return (
    <Navigate
      to={role === 'dm' ? '../members?panel=items' : '../inventory'}
      relative="path"
      replace
    />
  )
}

/** J1-17: after signing in from a deep link the callback lands on the hub; this returns there. */
function RestoreReturnTo() {
  const { state } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (state.status !== 'signed-in') return
    const route = takeReturnTo()
    if (route) void navigate(route, { replace: true })
  }, [state.status, navigate])
  return null
}

/** RYT-160: the title of an offline section of a kept campaign, as its document title. */
const shellTitle = (pathname: string) => documentTitleKey({ pathname, live: true, signedIn: true })

export function AppRouter() {
  const { state } = useAuth()
  const live = config.VITE_DATA_MODE === 'supabase'
  return (
    <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
      <RestoreReturnTo />
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          {/* The table screen lies under the miniatures: no app chrome around the map. */}
          {live && state.status === 'signed-in' && (
            <Route
              path="campaign/:campaignId/tabletop-table"
              element={<CampaignBoundary shellTitle={shellTitle} />}
            >
              <Route index element={<TabletopTablePage />} />
            </Route>
          )}
          <Route element={<Layout />}>
            {/* RYT-069: Settings is a drawer; old links open it over the home screen. */}
            <Route path="settings" element={<SettingsRoute />} />
            {/* RYT-115: public documents, reachable signed out, so they sit before the gate. */}
            <Route path="privacy" element={<LegalPage kind="privacy" />} />
            <Route path="terms" element={<LegalPage kind="terms" />} />
            {live && state.status !== 'signed-in' ? (
              <Route
                path="*"
                element={state.status === 'loading' ? <LoadingScreen /> : <SignInPage />}
              />
            ) : (
              <>
                <Route
                  index
                  element={live ? <CampaignHub /> : <Navigate to="/glossary" replace />}
                />

                {live && (
                  <Route
                    path="campaign/:campaignId"
                    element={<CampaignBoundary shellTitle={shellTitle} />}
                  >
                    <Route element={<TradeLayer />}>
                      <Route element={<CampaignGlossaryLayer />}>
                        <Route index element={<CampaignLanding />} />
                        <Route
                          path="party"
                          element={
                            <>
                              <CharacterParty />
                              <PartyRecapLink />
                            </>
                          }
                        />
                        <Route path="party/roster" element={<CharacterRosterPage />} />
                        <Route path="party/:characterId" element={<CharacterSheetPage />} />
                        <Route
                          path="party/:characterId/create"
                          element={<CharacterCreationPage />}
                        />
                        <Route path="members" element={<DmCenterPage />} />
                        <Route path="session" element={<SessionPage />} />
                        {/* RYT-027: the storeroom moved into the DM Command Center. */}
                        <Route path="items" element={<ItemsRedirect />} />
                        <Route path="inventory" element={<InventoryPage />} />
                        <Route path="shops" element={<ShopsPage />} />
                        <Route path="quests" element={<QuestsPage />} />
                        <Route path="combat" element={<CombatPage />} />
                        <Route
                          path="combat/:encounterId"
                          element={<CombatEncounterPage projection={TableProjectionButton} />}
                        />
                        <Route path="combat/:encounterId/table" element={<CombatTablePage />} />
                        <Route path="glossary" element={<GlossaryPage />} />
                        <Route path="glossary/:entryId" element={<GlossaryPage />} />
                        <Route path="tabletop" element={<TabletopPage />} />
                        <Route path="tabletop/:sceneId" element={<TabletopScenePage />} />
                        <Route path="*" element={<ModulePage />} />
                      </Route>
                    </Route>
                  </Route>
                )}
                {/* RYT-093: the content library, for editor accounts (the database decides). */}
                {live && (
                  <>
                    <Route path="admin" element={<AdminPage />} />
                    <Route path="library" element={<LibraryPage />} />
                    <Route path="library/:packId" element={<LibraryPage />} />
                    <Route path="library/:packId/:kind" element={<LibraryPage />} />
                    <Route path="library/:packId/:kind/:entryId" element={<LibraryPage />} />
                  </>
                )}
                {/* The SRD glossary also works outside a campaign (demo and account home). */}
                <Route element={<StandaloneGlossaryLayer />}>
                  <Route path="glossary" element={<GlossaryPage />} />
                  <Route path="glossary/:entryId" element={<GlossaryPage />} />
                </Route>
                <Route path="*" element={<ModulePage />} />
              </>
            )}
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
