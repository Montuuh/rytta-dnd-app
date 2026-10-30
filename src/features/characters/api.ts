import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  changeCharacter,
  changeSheet,
  getSheet,
  listAssignments,
  listCharacters,
  listSheetSummaries,
} from './data/repository'
import type { CharacterAction } from './domain/character'
import type { SheetAction } from './domain/sheet'
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

export const sheetQuery = (userId: string, campaignId: string, characterId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'characters', 'sheet', characterId],
    queryFn: ({ signal }) => getSheet(campaignId, characterId, signal),
    refetchInterval: 20_000,
  })
export const sheetSummariesQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'characters', 'sheet-summaries'],
    queryFn: ({ signal }) => listSheetSummaries(campaignId, signal),
    refetchInterval: 20_000,
  })
export function useSheetAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const scope = ['private', userId, 'campaign', campaignId, 'characters']
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: SheetAction) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      return changeSheet(campaignId, action)
    },
    onSettled: async (_data, error) => {
      if (controller?.getSnapshot().user?.id !== userId) return
      if (!error || error.message === 'stale') await cache.invalidateQueries({ queryKey: scope })
    },
  })
}
