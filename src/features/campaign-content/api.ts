import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  getCampaignContent,
  getContentChanges,
  getContentChoices,
  getPackChanges,
  listContentEntries,
  setCampaignContent,
  setCampaignContentPack,
  setContentHidden,
  updateCampaignContent,
  updateCampaignContentPack,
} from './data/repository'
import type { ContentCategory } from './domain/content'

const campaignScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId] as const
export const contentScope = (userId: string, campaignId: string) =>
  [...campaignScope(userId, campaignId), 'content'] as const

export const campaignContentQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: contentScope(userId, campaignId),
    queryFn: ({ signal }) => getCampaignContent(campaignId, signal),
    retry: 1,
  })

export const contentChangesQuery = (
  userId: string,
  campaignId: string,
  packId: string,
  category: ContentCategory,
) =>
  queryOptions({
    queryKey: [...contentScope(userId, campaignId), 'changes', packId, category],
    queryFn: ({ signal }) => getContentChanges(campaignId, packId, category, signal),
    retry: 1,
  })

export const contentEntriesQuery = (
  userId: string,
  campaignId: string,
  packId: string,
  category: ContentCategory,
  search: string,
  page: number,
  onlyHidden = false,
) =>
  queryOptions({
    queryKey: [
      ...contentScope(userId, campaignId),
      'entries',
      packId,
      category,
      search,
      page,
      onlyHidden,
    ],
    queryFn: ({ signal }) =>
      listContentEntries(campaignId, packId, category, search, page, onlyHidden, signal),
    placeholderData: keepPreviousData,
    retry: 1,
  })

/** RYT-184: the digest of a pack's newer version, for its notice and its review. */
export const packChangesQuery = (userId: string, campaignId: string, packId: string) =>
  queryOptions({
    queryKey: [...contentScope(userId, campaignId), 'pack-changes', packId],
    queryFn: ({ signal }) => getPackChanges(campaignId, packId, signal),
    retry: 1,
  })

/** Enable, update, hide: every change refreshes the whole campaign, since modules read from it. */
export function useContentAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const same = () => !!userId && controller?.getSnapshot().user?.id === userId
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (
      action:
        | { kind: 'enable'; packId: string; category: ContentCategory; enabled: boolean }
        | { kind: 'update'; packId: string; category: ContentCategory; version: number }
        | { kind: 'hide'; packId: string; entryKind: string; key: string; hidden: boolean }
        | { kind: 'enablePack'; packId: string; enabled: boolean }
        | { kind: 'updatePack'; packId: string; version: number },
    ) => {
      if (!navigator.onLine || !same()) throw new Error('unavailable')
      if (action.kind === 'enable')
        return setCampaignContent(campaignId, action.packId, action.category, action.enabled)
      if (action.kind === 'enablePack')
        return setCampaignContentPack(campaignId, action.packId, action.enabled)
      if (action.kind === 'updatePack')
        return updateCampaignContentPack(campaignId, action.packId, action.version)
      if (action.kind === 'update')
        return updateCampaignContent(campaignId, action.packId, action.category, action.version)
      await setContentHidden(campaignId, action.packId, action.entryKind, action.key, action.hidden)
      return null
    },
    onSettled: async () => {
      if (same()) await cache.invalidateQueries({ queryKey: campaignScope(userId!, campaignId) })
    },
  })
}

/** RYT-167: the packs offered when creating a campaign. */
export const contentChoicesQuery = (userId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'content-choices'],
    queryFn: ({ signal }) => getContentChoices(signal),
    retry: 1,
  })
