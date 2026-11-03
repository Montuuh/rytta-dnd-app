import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
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
      canEdit: live && Boolean(campaignId && canBrowse),
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
      live,
      recent,
      remember,
    ],
  )
  return (
    <GlossaryContext.Provider value={value}>
      {children}
      <ReferenceSheet
        stack={stack}
        onBack={() => setStack((current) => current.slice(0, -1))}
        onClose={() => setStack([])}
      />
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
