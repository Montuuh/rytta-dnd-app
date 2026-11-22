import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import {
  enterCampaign,
  exitCampaign,
  findAccount,
  loadAudit,
  loadCampaigns,
  loadFavourites,
  loadStatus,
  loadSummary,
  loadUsage,
  setFavourite,
} from './data/repository'

const root = (userId: string) => ['private', userId, 'admin'] as const

export const adminStatusQuery = (userId: string) =>
  queryOptions({
    queryKey: [...root(userId), 'status'],
    queryFn: ({ signal }) => loadStatus(signal),
    staleTime: 60_000,
  })

/** The caller's admin status; nothing for demo builds or signed-out visitors. */
export function useAdminStatus() {
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  return useQuery({
    ...adminStatusQuery(userId),
    enabled: config.VITE_DATA_MODE === 'supabase' && !!state.user,
  })
}

export const adminCampaignsQuery = (userId: string, search: string) =>
  queryOptions({
    queryKey: [...root(userId), 'campaigns', search],
    queryFn: ({ signal }) => loadCampaigns(search, signal),
    placeholderData: (previous) => previous,
  })
export const adminSummaryQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...root(userId), 'summary', campaignId],
    queryFn: ({ signal }) => loadSummary(campaignId, signal),
  })
export const adminFavouritesQuery = (userId: string) =>
  queryOptions({
    queryKey: [...root(userId), 'favourites'],
    queryFn: ({ signal }) => loadFavourites(signal),
  })
export const adminAuditQuery = (userId: string) =>
  queryOptions({
    queryKey: [...root(userId), 'audit'],
    queryFn: ({ signal }) => loadAudit(signal),
  })
export const adminUsageQuery = (userId: string) =>
  queryOptions({
    queryKey: [...root(userId), 'usage'],
    queryFn: ({ signal }) => loadUsage(signal),
  })

/** Entering or leaving a campaign changes what the whole app may read: refresh everything private. */
export function useAdminAccess() {
  const client = useQueryClient()
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  const refresh = () => client.invalidateQueries({ queryKey: ['private', userId] })
  const enter = useMutation({ mutationFn: enterCampaign, onSettled: refresh })
  const exit = useMutation({ mutationFn: exitCampaign, onSettled: refresh })
  return { enter, exit }
}

export function useAdminFavourite() {
  const client = useQueryClient()
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  return useMutation({
    mutationFn: ({ campaignId, favourite }: { campaignId: string; favourite: boolean }) =>
      setFavourite(campaignId, favourite),
    onSettled: () => client.invalidateQueries({ queryKey: root(userId) }),
  })
}

export function useAccountLookup() {
  const client = useQueryClient()
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  return useMutation({
    mutationFn: findAccount,
    onSettled: () => client.invalidateQueries({ queryKey: [...root(userId), 'audit'] }),
  })
}
