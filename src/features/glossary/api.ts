import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuth } from '@/features/auth'
import { loadGlossaryBodies, loadGlossaryIndex } from './data/content'
import { deleteHomebrew, listHomebrew, saveHomebrew } from './data/repository'
import { GlossaryError, type HomebrewDraft, type HomebrewEntry } from './domain/homebrew'
import type { GlossaryLanguage } from './domain/types'

/** Bundled, public SRD data: never refetched and not tied to an identity. */
export const glossaryIndexQuery = () =>
  queryOptions({
    queryKey: ['glossary', 'index'],
    queryFn: loadGlossaryIndex,
    staleTime: Infinity,
    gcTime: Infinity,
  })
export const glossaryBodiesQuery = (language: GlossaryLanguage) =>
  queryOptions({
    queryKey: ['glossary', 'bodies', language],
    queryFn: () => loadGlossaryBodies(language),
    staleTime: Infinity,
    gcTime: Infinity,
  })
export const homebrewQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'glossary'],
    queryFn: ({ signal }) => (campaignId ? listHomebrew(campaignId, signal) : []),
    refetchInterval: 60_000,
  })

/**
 * Fetches the campaign's homebrew now (ignoring staleness) and returns one entry, or null when it
 * no longer exists. The editor uses it to recover from a stale revision.
 */
export function useLatestHomebrew(campaignId: string) {
  const { state } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useCallback(
    async (entryId: string): Promise<HomebrewEntry | null> => {
      if (!navigator.onLine || !userId) throw new GlossaryError('unavailable')
      const list = await cache.fetchQuery({ ...homebrewQuery(userId, campaignId), staleTime: 0 })
      return list.find((entry) => entry.id === entryId) ?? null
    },
    [cache, campaignId, userId],
  )
}

export type HomebrewAction =
  | { kind: 'save'; entryId: string; revision: number | null; draft: HomebrewDraft }
  | { kind: 'delete'; entryId: string; revision: number }

export function useHomebrewAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: HomebrewAction) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new GlossaryError('unavailable')
      if (action.kind === 'save')
        return saveHomebrew(campaignId, action.entryId, action.revision, action.draft)
      await deleteHomebrew(campaignId, action.entryId, action.revision)
      return null
    },
    onSuccess: (saved, action) => {
      if (!userId || controller?.getSnapshot().user?.id !== userId) return
      // Show the saved or deleted entry at once; the refetch below confirms it.
      cache.setQueryData<HomebrewEntry[]>(
        ['private', userId, 'campaign', campaignId, 'glossary'],
        (list = []) => {
          const rest = list.filter((entry) => entry.id !== action.entryId)
          return saved ? [...rest, saved] : rest
        },
      )
    },
    onSettled: () => {
      if (!userId || controller?.getSnapshot().user?.id !== userId) return
      void cache.invalidateQueries({
        queryKey: ['private', userId, 'campaign', campaignId, 'glossary'],
      })
    },
  })
}
