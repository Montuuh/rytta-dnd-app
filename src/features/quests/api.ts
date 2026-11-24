import { useEffect } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { useCampaign } from '@/features/campaigns'
import { liveChannelUp, livePollInterval } from '@/shared/lib/live-poll'
import {
  deleteQuest,
  listQuests,
  markQuestSeen,
  questsChannelKey,
  saveQuest,
  subscribeQuests,
} from './data/repository'
import { questIsNew, type QuestDraft, type QuestList } from './domain/quest'

export const questsScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'quests'] as const

/** RYT-006: the campaign's quest journal. Realtime refetches it; polling is the fallback. */
export const questsQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: questsScope(userId, campaignId),
    queryFn: ({ signal }) => listQuests(campaignId, signal),
    refetchInterval: () => livePollInterval(liveChannelUp(questsChannelKey(campaignId)), 30_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  })

/** Whether the signed-in account may open the journal of the current campaign. */
function useJournalAccess() {
  const campaign = useCampaign()
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  const open = campaign.role === 'dm' || (campaign.player_modules ?? []).includes('quests')
  return { campaign, userId, open: open && userId !== '' }
}

/** The journal, refreshed live while the page is open. */
export function useQuests() {
  const { campaign, userId, open } = useJournalAccess()
  const cache = useQueryClient()
  const query = useQuery({ ...questsQuery(userId, campaign.id), enabled: open })
  useEffect(() => {
    if (!open) return
    return subscribeQuests(campaign.id, () => {
      void cache.invalidateQueries({ queryKey: questsScope(userId, campaign.id) })
    })
  }, [cache, campaign.id, open, userId])
  return query
}

/** A Player has quests they have not opened since they last changed (for the navigation dot).
 * Used by the app layout, which knows the campaign without the campaign context. */
export function useQuestsUnseen(campaignId: string | undefined, enabled: boolean) {
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  const query = useQuery({
    ...questsQuery(userId, campaignId ?? ''),
    enabled: enabled && !!campaignId && userId !== '',
  })
  return enabled && (query.data?.quests ?? []).some((quest) => questIsNew(quest, query.data!.dm))
}

function useGuard() {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  return {
    userId,
    check: () => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
    },
    same: () => !!userId && controller?.getSnapshot().user?.id === userId,
  }
}

/** Creates or saves a quest; the answer replaces it in the journal. */
export function useSaveQuest(campaignId: string) {
  const { userId, check, same } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: { id: string; revision: number | null; draft: QuestDraft }) => {
      check()
      return saveQuest(campaignId, input.id, input.revision, input.draft)
    },
    onSuccess: (saved) => {
      if (!same()) return
      cache.setQueryData<QuestList>(questsScope(userId!, campaignId), (list) =>
        list
          ? {
              ...list,
              quests: [saved, ...list.quests.filter((quest) => quest.id !== saved.id)],
            }
          : list,
      )
    },
    onError: async (error) => {
      if (same() && error.message === 'stale')
        await cache.invalidateQueries({ queryKey: questsScope(userId!, campaignId) })
    },
  })
}

export function useDeleteQuest(campaignId: string) {
  const { userId, check, same } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: { id: string; revision: number }) => {
      check()
      await deleteQuest(campaignId, input.id, input.revision)
      return input.id
    },
    onSuccess: (id) => {
      if (!same()) return
      cache.setQueryData<QuestList>(questsScope(userId!, campaignId), (list) =>
        list ? { ...list, quests: list.quests.filter((quest) => quest.id !== id) } : list,
      )
    },
    onError: async () => {
      if (same()) await cache.invalidateQueries({ queryKey: questsScope(userId!, campaignId) })
    },
  })
}

/** A Player opened a quest: its marks clear on every device. */
export function useMarkQuestSeen(campaignId: string) {
  const { userId, same } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: (questId: string) => markQuestSeen(campaignId, questId),
    onSuccess: (seenAt, questId) => {
      if (!same()) return
      cache.setQueryData<QuestList>(questsScope(userId!, campaignId), (list) =>
        list
          ? {
              ...list,
              quests: list.quests.map((quest) =>
                quest.id === questId ? { ...quest, seen_at: seenAt } : quest,
              ),
            }
          : list,
      )
    },
  })
}
