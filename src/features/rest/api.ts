import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { changeRest, getRestState } from './data/repository'
import type { RestAction, RestState } from './domain/rest'

export const restScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'rest'] as const

/** RYT-080: the campaign's rest request. Realtime refetches it; polling is the fallback. */
export const restStateQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: restScope(userId, campaignId),
    queryFn: ({ signal }) => getRestState(campaignId, signal),
    refetchInterval: (query) => (query.state.data?.status === 'open' ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
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
        await cache.invalidateQueries({ queryKey: restScope(userId, campaignId) })
    },
  })
}
