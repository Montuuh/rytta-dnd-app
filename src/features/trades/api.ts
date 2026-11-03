import { useEffect } from 'react'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { changeTrade, loadTradeState, subscribeTrades } from './data/repository'
import { pollInterval, type TradeAction } from './domain/trade'

const tradeScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'trades'] as const

export const tradeStateQuery = (userId: string, campaignId: string, actingUser: string | null) =>
  queryOptions({
    queryKey: [...tradeScope(userId, campaignId), actingUser ?? 'self'],
    queryFn: ({ signal }) => loadTradeState(campaignId, actingUser, signal),
    refetchInterval: (query) => pollInterval(query.state.data),
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 1,
  })

/** Invalidates the trade state whenever Realtime reports a change to a campaign trade. */
export function useTradeRealtime(campaignId: string, enabled: boolean) {
  const { state } = useAuth()
  const cache = useQueryClient()
  const userId = state.user?.id
  useEffect(() => {
    if (!enabled || !userId) return
    return subscribeTrades(campaignId, () => {
      void cache.invalidateQueries({ queryKey: tradeScope(userId, campaignId) })
    })
  }, [cache, campaignId, enabled, userId])
}

export function useTradeAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const current = () =>
    navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: TradeAction) => {
      if (!current()) throw new Error('unavailable')
      return changeTrade(campaignId, action)
    },
    onSettled: async () => {
      if (!current() || !userId) return
      await cache.invalidateQueries({ queryKey: tradeScope(userId, campaignId) })
    },
    onSuccess: async (result) => {
      // A completed swap moves items and gold: refresh inventory and party caches too.
      if (result.status === 'completed' && userId)
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}
