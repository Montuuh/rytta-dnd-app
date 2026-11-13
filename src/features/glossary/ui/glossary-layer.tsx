import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { useAuth } from '@/features/auth'
import { useCampaign } from '@/features/campaigns'
import { config } from '@/shared/lib/config'
import { glossaryBodiesQuery, glossaryIndexQuery, homebrewQuery } from '../api'
import { buildCatalog } from '../domain/catalog'
import { createLinker } from '../domain/linker'
import type { GlossaryLanguage } from '../domain/types'
import { GlossaryContext, type GlossaryContextValue } from './glossary-context'
import { useHomebrewManager } from './homebrew-manager'
import { pushRecent, readRecent, writeRecent } from './recent'
import { ReferenceSheet } from './reference-sheet'
import './glossary.css'

type LayerProps = {
  children: ReactNode
  campaignId: string | null
  /** The viewer may open the glossary page (DM, or Player with the module enabled). */
  canBrowse: boolean
  pagePath: string
}

/**
 * Provides the glossary (bundled SRD index and lazily loaded bodies, plus campaign homebrew)
 * to every page below it, and owns the reference sheet opened by inline terms.
 */
export function GlossaryLayer({ children, campaignId, canBrowse, pagePath }: LayerProps) {
  const { i18n } = useTranslation()
  const { state } = useAuth()
  const cache = useQueryClient()
  const language: GlossaryLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'es'
  const userId = state.user?.id
  const live = config.VITE_DATA_MODE === 'supabase'
  const [wantBodies, setWantBodies] = useState(false)
  const [stack, setStack] = useState<string[]>([])
  const [recent, setRecent] = useState(readRecent)

  const index = useQuery(glossaryIndexQuery())
  const bodies = useQuery({ ...glossaryBodiesQuery(language), enabled: wantBodies })
  const homebrew = useQuery({
    ...homebrewQuery(userId ?? '', campaignId ?? ''),
    enabled: live && Boolean(userId && campaignId && canBrowse),
  })

  const catalog = useMemo(
    () => (index.data ? buildCatalog(index.data, language, homebrew.data ?? []) : null),
    [index.data, language, homebrew.data],
  )
  const linker = useMemo(() => (catalog ? createLinker(catalog) : null), [catalog])
  const requestBodies = useCallback(() => setWantBodies(true), [])
  const remember = useCallback((id: string) => {
    setRecent((list) => {
      const next = pushRecent(list, id)
      writeRecent(next)
      return next
    })
  }, [])
  const open = useCallback(
    (id: string) => {
      setWantBodies(true)
      setStack((current) => (current.at(-1) === id ? current : [...current, id].slice(-12)))
      remember(id)
    },
    [remember],
  )
  const back = useCallback(() => setStack((current) => current.slice(0, -1)), [])
  const close = useCallback(() => setStack([]), [])
  const closeDefinition = useCallback(
    (id?: string) => setStack((current) => (id ? current.filter((item) => item !== id) : [])),
    [],
  )
  const canEdit = live && Boolean(campaignId && canBrowse)
  const manager = useHomebrewManager({
    campaignId,
    pagePath: canBrowse ? pagePath : null,
    catalog,
    enabled: canEdit,
    closeDefinition,
  })
  // The sheet often opens above another drawer (an item card, a shop listing). Mantine drawers
  // each close on Escape from a window capture listener, in registration order, and only a
  // Drawer.Stack coordinates them. This layer mounts before any page drawer, so its listener
  // runs first: while a definition is open, Escape closes only the definition (UI review R2-1).
  const sheetOpen = useRef(false)
  // While the homebrew editor or delete confirmation is open above the sheet, Escape belongs to it.
  useEffect(() => {
    sheetOpen.current = stack.length > 0 && !manager.busy
  }, [stack.length, manager.busy])
  // A layout effect registers before every Mantine useEffect listener, even when this layer
  // and a page drawer mount in the same commit (a direct load of a shop page).
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || !sheetOpen.current) return
      event.stopImmediatePropagation()
      setStack([])
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const retry = useCallback(() => {
    void cache.invalidateQueries({ queryKey: ['glossary'] })
  }, [cache])

  const value = useMemo<GlossaryContextValue>(
    () => ({
      language,
      catalog,
      linker,
      bodies: bodies.data ?? null,
      bodiesError: bodies.isError,
      indexError: index.isError,
      requestBodies,
      retry,
      open,
      pagePath: canBrowse ? pagePath : null,
      campaignId,
      canEdit,
      manage: manager.manage,
      recent,
      remember,
    }),
    [
      language,
      catalog,
      linker,
      bodies.data,
      bodies.isError,
      index.isError,
      requestBodies,
      retry,
      open,
      canBrowse,
      pagePath,
      campaignId,
      canEdit,
      manager.manage,
      recent,
      remember,
    ],
  )
  return (
    <GlossaryContext.Provider value={value}>
      {children}
      <ReferenceSheet stack={stack} onBack={back} onClose={close} />
      {manager.element}
    </GlossaryContext.Provider>
  )
}

/** Campaign routes: the DM always browses; Players follow the DM's module switch. */
export function CampaignGlossaryLayer() {
  const campaign = useCampaign()
  const canBrowse = campaign.role === 'dm' || (campaign.player_modules ?? []).includes('glossary')
  return (
    <GlossaryLayer
      campaignId={campaign.id}
      canBrowse={canBrowse}
      pagePath={`/campaign/${campaign.id}/glossary`}
    >
      <Outlet />
    </GlossaryLayer>
  )
}

/** The campaign-independent glossary (demo and the account home). SRD only. */
export function StandaloneGlossaryLayer() {
  return (
    <GlossaryLayer campaignId={null} canBrowse pagePath="/glossary">
      <Outlet />
    </GlossaryLayer>
  )
}
