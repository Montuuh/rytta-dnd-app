import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  changeInventory,
  listRoster,
  loadInventory,
  portraitUrl,
  uploadPortrait,
} from './data/repository'
import type { InventoryAction } from './domain/item'

export const inventoryQuery = (userId: string, campaignId: string, characterId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'inventory', characterId],
    queryFn: ({ signal }) => loadInventory(campaignId, characterId, signal),
    refetchInterval: 20_000,
  })
export const rosterQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'inventory', 'roster'],
    queryFn: ({ signal }) => listRoster(campaignId, signal),
    refetchInterval: 20_000,
  })
export const portraitQuery = (userId: string, path: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'portrait', path],
    queryFn: () => portraitUrl(path!),
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
  })

function useGuard() {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  return {
    userId,
    current: () =>
      navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId,
  }
}

export function useInventoryAction(campaignId: string) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: InventoryAction) => {
      if (!current()) throw new Error('unavailable')
      return changeInventory(campaignId, action)
    },
    onSettled: async (_data, error) => {
      if (!current() || (error && !['stale', 'conflict', 'occupied'].includes(error.message)))
        return
      // Equipment moves AC on the sheet, so refresh the whole campaign character scope.
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'inventory'],
        }),
        cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        }),
      ])
    },
  })
}

export function usePortraitUpload(campaignId: string, characterId: string) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (image: Blob) => {
      if (!current()) throw new Error('unavailable')
      return uploadPortrait(campaignId, characterId, image)
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}
