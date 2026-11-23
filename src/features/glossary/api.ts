import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useAuth } from '@/features/auth'
import {
  deleteHomebrew,
  listHomebrew,
  loadRulePack,
  loadRulePacks,
  loadSrdRules,
  saveHomebrew,
} from './data/repository'
import { parseRuleBodies, parseRuleIndex, type RuleCategory, type RulePack } from './domain/packs'
import { GlossaryError, type HomebrewDraft, type HomebrewEntry } from './domain/homebrew'
import type { GlossaryLanguage } from './domain/types'

/** RYT-164, RYT-165: the campaign's spells, classes and rules packs and their hidden entries. */
export const rulePacksQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'rule-packs'],
    queryFn: ({ signal }) => loadRulePacks(campaignId, signal),
    staleTime: 30_000,
    retry: 1,
  })

/** A pack category never changes within a version: cached by pack, category and version. */
const ruleScope = (userId: string, pack: RulePack) =>
  ['private', userId, 'rule-pack', pack.id, pack.category, pack.version] as const

export const ruleIndexQuery = (userId: string, campaignId: string, pack: RulePack) =>
  queryOptions({
    queryKey: [...ruleScope(userId, pack), 'index'],
    queryFn: async ({ signal }) =>
      parseRuleIndex(await loadRulePack(campaignId, pack, 'index', signal)),
    staleTime: Infinity,
    retry: 1,
  })

export const ruleBodiesQuery = (
  userId: string,
  campaignId: string,
  pack: RulePack,
  language: GlossaryLanguage,
) =>
  queryOptions({
    queryKey: [...ruleScope(userId, pack), language],
    queryFn: async ({ signal }) =>
      parseRuleBodies(await loadRulePack(campaignId, pack, language, signal)),
    staleTime: Infinity,
    retry: 1,
  })

/** The published SRD outside a campaign (P3 A): it can gain a version while the app is open. */
export const srdRuleIndexQuery = (userId: string, category: RuleCategory) =>
  queryOptions({
    queryKey: ['private', userId, 'srd-rules', category, 'index'],
    queryFn: async ({ signal }) => parseRuleIndex(await loadSrdRules(category, 'index', signal)),
    staleTime: 30 * 60_000,
    retry: 1,
  })

export const srdRuleBodiesQuery = (
  userId: string,
  category: RuleCategory,
  language: GlossaryLanguage,
) =>
  queryOptions({
    queryKey: ['private', userId, 'srd-rules', category, language],
    queryFn: async ({ signal }) => parseRuleBodies(await loadSrdRules(category, language, signal)),
    staleTime: 30 * 60_000,
    retry: 1,
  })

export const homebrewQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'glossary'],
    queryFn: ({ signal }) => (campaignId ? listHomebrew(campaignId, signal) : []),
    // House rules change rarely: no interval; refetch on mount and focus once five minutes old.
    // Own writes invalidate the campaign scope, and the editor refetches before a stale save.
    staleTime: 5 * 60_000,
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
