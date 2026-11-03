import { useEffect, useState } from 'react'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  changeCombat,
  loadCombatState,
  loadEncounters,
  loadTemplates,
  subscribeEncounters,
} from './data/repository'
import { combatPollInterval, type CombatAction } from './domain/combat'

const combatScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'combat'] as const

export const encountersQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'encounters'],
    queryFn: ({ signal }) => loadEncounters(campaignId, signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 1,
  })

export const combatStateQuery = (
  userId: string,
  campaignId: string,
  encounterId: string | null,
  asTable = false,
) =>
  queryOptions({
    queryKey: [
      ...combatScope(userId, campaignId),
      'state',
      encounterId ?? 'live',
      asTable ? 'table' : 'self',
    ],
    queryFn: ({ signal }) => loadCombatState(campaignId, encounterId, asTable, signal),
    refetchInterval: (query) => combatPollInterval(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: 1,
  })

export const templatesQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'templates'],
    queryFn: ({ signal }) => loadTemplates(campaignId, signal),
    staleTime: 30_000,
    retry: 1,
  })

/** Subscribes to encounter changes; returns whether the realtime channel is connected. */
export function useCombatRealtime(campaignId: string, enabled: boolean) {
  const { state } = useAuth()
  const cache = useQueryClient()
  const userId = state.user?.id
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled || !userId) return
    const stop = subscribeEncounters(
      campaignId,
      () => {
        void cache.invalidateQueries({ queryKey: combatScope(userId, campaignId) })
      },
      setConnected,
    )
    return () => {
      stop()
      setConnected(false)
    }
  }, [cache, campaignId, enabled, userId])
  return connected
}

export function useCombatAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const current = () =>
    navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: CombatAction) => {
      if (!current()) throw new Error('unavailable')
      return changeCombat(campaignId, action)
    },
    onSettled: async (_result, _error, action) => {
      if (!current() || !userId) return
      await cache.invalidateQueries({ queryKey: combatScope(userId, campaignId) })
      // Character hit points and conditions are shared with the sheet and the party page.
      if (['hp', 'condition', 'deathSave', 'effect', 'removeEffect', 'undo'].includes(action.kind))
        await cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        })
    },
  })
}
