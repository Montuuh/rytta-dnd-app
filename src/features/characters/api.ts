import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { changeCharacter, listCharacters, listAssignments } from './data/repository'
import type { CharacterAction } from './domain/character'
export const charactersQuery = (userId: string, campaignId: string, filterUserId?: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'characters', filterUserId ?? 'all'],
    queryFn: ({ signal }) => listCharacters(campaignId, signal, filterUserId),
    refetchInterval: 20_000,
  })
export function useCharacterAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: CharacterAction) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      await changeCharacter(campaignId, action)
    },
    onSuccess: async () => {
      if (controller?.getSnapshot().user?.id === userId)
        await cache.invalidateQueries({ queryKey: ['private', userId] })
    },
    onError: async (error) => {
      if (error.message === 'stale' && controller?.getSnapshot().user?.id === userId)
        await cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        })
    },
  })
}

export const assignmentsQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'assignments'],
    queryFn: ({ signal }) => listAssignments(campaignId, signal),
    refetchInterval: 20000,
  })
