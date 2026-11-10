import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import { restScope, restStateQuery } from '../api'
import { subscribeRest } from '../data/repository'
import { RestPanelContext } from './rest-context'
import { RestPanel } from './rest-panel'

/**
 * RYT-080: one rest request per campaign, kept fresh by realtime (polling as the fallback) and
 * shared by the banner, the sheet's rest buttons and the panel. A rest that lands refreshes the
 * campaign's sheets for everyone, not only for whoever settled it.
 */
export function RestProvider({
  campaignId,
  children,
}: {
  campaignId: string | null
  children: ReactNode
}) {
  const { state: auth } = useAuth()
  const userId = auth.user?.id ?? null
  const enabled = Boolean(campaignId && userId && config.VITE_DATA_MODE === 'supabase')
  const cache = useQueryClient()
  const query = useQuery({ ...restStateQuery(userId ?? '', campaignId ?? ''), enabled })
  const state = enabled ? query.data : undefined
  useEffect(() => {
    if (!enabled || !campaignId || !userId) return
    return subscribeRest(campaignId, () => {
      void cache.invalidateQueries({ queryKey: restScope(userId, campaignId) })
    })
  }, [enabled, campaignId, userId, cache])
  const landed = useRef<string | null>(null)
  useEffect(() => {
    if (!state || state.status !== 'done' || !campaignId || !userId) return
    if (landed.current === state.id) return
    landed.current = state.id
    void cache.invalidateQueries({
      queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
    })
  }, [state, campaignId, userId, cache])
  const [opened, setOpened] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const openPanel = useCallback((from?: HTMLElement | null) => {
    opener.current =
      from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setOpened(true)
  }, [])
  const close = () => {
    setOpened(false)
    const back = opener.current
    // Mantine returns focus itself when the opener still exists; otherwise the page keeps it.
    window.requestAnimationFrame(() => {
      if (back?.isConnected) back.focus()
    })
  }
  const value = useMemo(() => ({ campaignId, state, openPanel }), [campaignId, state, openPanel])
  return (
    <RestPanelContext.Provider value={value}>
      {children}
      {state && campaignId && (
        <RestPanel opened={opened} state={state} campaignId={campaignId} onClose={close} />
      )}
    </RestPanelContext.Provider>
  )
}
