import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { rosterOf } from './domain/roster'
import { useAuth } from '@/features/auth'
import {
  changeCharacter,
  changeSheet,
  getPartyOverview,
  getSheet,
  listAssignments,
  listCharacters,
  listRoster,
  listSheetSummaries,
} from './data/repository'
import type { Character, CharacterAction, Resources } from './domain/character'
import { newRequestId } from '@/shared/lib/request-id'
import type { SheetAction } from './domain/sheet'
/**
 * Characters in play: each Player's active character plus the DM's unassigned ones (RYT-044).
 * Party, combat, shops and other campaign lists read this, so benched characters stay out.
 */
export const charactersQuery = (userId: string, campaignId: string, filterUserId?: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'characters', filterUserId ?? 'all'],
    queryFn: ({ signal }) => listCharacters(campaignId, signal, filterUserId),
    refetchInterval: 20_000,
  })
/** RYT-044: whole rosters (active and in reserve) for the character manager. */
export const characterRosterQuery = (userId: string, campaignId: string, filterUserId?: string) =>
  queryOptions({
    queryKey: [
      'private',
      userId,
      'campaign',
      campaignId,
      'characters',
      'roster',
      filterUserId ?? 'all',
    ],
    queryFn: ({ signal }) => listRoster(campaignId, signal, filterUserId),
    refetchInterval: 20_000,
  })

/** One Player's roster (the viewer's or the previewed Player's); null owner disables it. */
export function useOwnRoster(campaignId: string, ownerId: string | null) {
  const { state } = useAuth()
  const query = useQuery({
    ...characterRosterQuery(state.user!.id, campaignId, ownerId ?? undefined),
    enabled: Boolean(ownerId),
  })
  return { query, roster: ownerId ? rosterOf(query.data ?? [], ownerId) : null }
}

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
      return changeCharacter(campaignId, action)
    },
    onSuccess: async () => {
      // Character changes stay inside this campaign (sheets, inventory roster, shops).
      if (controller?.getSnapshot().user?.id === userId)
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
    onError: async (error) => {
      if (error.message === 'stale' && controller?.getSnapshot().user?.id === userId)
        await cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        })
    },
  })
}

/**
 * RYT-044: a Player creates an own character. The refresh is not awaited, so the caller can
 * move on to the sheet wizard before Party re-renders without its onboarding.
 */
export function useCreateOwnCharacter(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async ({ name, requestId }: { name: string; requestId: string }) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      return z
        .uuid()
        .parse(await changeCharacter(campaignId, { kind: 'createOwn', name, requestId }))
    },
    onSuccess: () => {
      if (controller?.getSnapshot().user?.id === userId)
        void cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

/**
 * RYT-044: archive or restore a character. The refresh is not awaited, so the caller's
 * callbacks run before the character leaves (or rejoins) the list that rendered the control.
 */
export function useArchiveAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: { kind: 'archive' | 'restore'; characterId: string }) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      return changeCharacter(campaignId, action)
    },
    onSuccess: () => {
      if (controller?.getSnapshot().user?.id === userId)
        void cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

/**
 * RYT-044: switch the active character. Switches run one at a time (mutation scope), so
 * arrowing through the radio group sends them in order and the last choice wins.
 */
export function useActivateCharacter(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    scope: { id: `active-character:${campaignId}` },
    retry: false,
    networkMode: 'always',
    mutationFn: async (characterId: string) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      return changeCharacter(campaignId, { kind: 'activate', characterId })
    },
    onSettled: async () => {
      if (controller?.getSnapshot().user?.id === userId)
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

/**
 * Quick resource steps for one character. Each tap updates the cached party at once and is
 * queued per character (mutation scope), so the next tap sends the revision the previous one
 * will produce. Steps for other characters never wait. A conflict refetches the server truth.
 */
export function useResourceAction(campaignId: string, characterId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const scope = ['private', userId, 'campaign', campaignId, 'characters']
  const mutationKey = ['resources', campaignId, characterId]
  const patch = (resources: Resources) =>
    cache.setQueriesData<unknown>({ queryKey: scope }, (data: unknown) =>
      Array.isArray(data)
        ? data.map((item: Character) =>
            item?.id === characterId && item.character_resources
              ? { ...item, character_resources: resources }
              : item,
          )
        : data,
    )
  const latest = (): Resources | undefined => {
    for (const [, data] of cache.getQueriesData<unknown>({ queryKey: scope }))
      if (Array.isArray(data)) {
        const found = (data as Character[]).find((item) => item?.id === characterId)
        if (found?.character_resources) return found.character_resources
      }
    return undefined
  }
  const mutation = useMutation({
    mutationKey,
    scope: { id: `resources:${characterId}` },
    retry: false,
    networkMode: 'always',
    onMutate: (values: Resources) => {
      // Synchronous so a fast second tap already reads this optimistic revision.
      patch({ ...values, revision: values.revision + 1 })
      void cache.cancelQueries({ queryKey: scope })
    },
    mutationFn: async (values: Resources) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('unavailable')
      await changeCharacter(campaignId, {
        kind: 'resources',
        characterId,
        values,
        requestId: newRequestId(),
      })
    },
    onSettled: async () => {
      if (controller?.getSnapshot().user?.id !== userId) return
      // Refetch once the queue for this character drains (or after any failure).
      if (cache.isMutating({ mutationKey }) <= 1)
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
  return {
    ...mutation,
    /** Applies `change` to the newest known values (optimistic included) and sends it. */
    apply: (change: (current: Resources) => Partial<Resources>) => {
      const current = latest()
      if (!current) return
      mutation.mutate({ ...current, ...change(current) })
    },
  }
}

/** RYT-031 live party state; polls every 10s only while the tab is visible. */
export const partyOverviewQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'characters', 'party-overview'],
    queryFn: ({ signal }) => getPartyOverview(campaignId, signal),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })

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
