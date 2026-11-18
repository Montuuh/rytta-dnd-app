import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { liveChannelUp, livePollInterval, liveStatePollMs } from '@/shared/lib/live-poll'
import { rollContextScope } from '@/features/dice'
import { changeRest, getRestState, resetHitDiceRoll, restChannelKey } from './data/repository'
import type { RestAction, RestState } from './domain/rest'

export const restScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'rest'] as const

/** RYT-080: the campaign's rest request. Realtime refetches it; polling is the fallback. */
export const restStateQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: restScope(userId, campaignId),
    queryFn: ({ signal }) => getRestState(campaignId, signal),
    refetchInterval: (query) => {
      const connected = liveChannelUp(restChannelKey(campaignId))
      return query.state.data?.status === 'open'
        ? livePollInterval(connected, 5_000, liveStatePollMs)
        : livePollInterval(connected, 30_000)
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: 1,
  })

/** Ask, vote, rest now or cancel. The answer is the new state; a rest refreshes every sheet. */
export function useRestAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: RestAction) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      return changeRest(campaignId, action)
    },
    onSuccess: async (next: RestState | null) => {
      if (!userId || controller?.getSnapshot().user?.id !== userId) return
      cache.setQueryData(restScope(userId, campaignId), next)
      if (next?.status === 'done')
        await cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        })
    },
    onError: async () => {
      if (userId && controller?.getSnapshot().user?.id === userId)
        // A refused vote can mean the server's roll changed (a DM reset): read both again.
        await Promise.all([
          cache.invalidateQueries({ queryKey: restScope(userId, campaignId) }),
          cache.invalidateQueries({ queryKey: rollContextScope(userId, campaignId) }),
        ])
    },
  })
}

/** RYT-137 (DM): clear a Player's hit-dice roll for the open rest. The roll state and the rest
 * are read again, since the vote made with that roll is gone. */
export function useResetHitDice(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: { characterId: string; requestId: string }) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      return resetHitDiceRoll(campaignId, input.characterId, input.requestId)
    },
    onSettled: async () => {
      if (!userId || controller?.getSnapshot().user?.id !== userId) return
      await Promise.all([
        cache.invalidateQueries({ queryKey: restScope(userId, campaignId) }),
        cache.invalidateQueries({ queryKey: rollContextScope(userId, campaignId) }),
      ])
    },
  })
}
