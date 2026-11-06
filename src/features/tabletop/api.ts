import { useEffect, useState } from 'react'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  changeTabletop,
  loadLibrary,
  loadScenes,
  loadTabletop,
  mediaSeconds,
  mediaUrl,
  subscribeTabletop,
  uploadMedia,
  type MediaKind,
  type TabletopAction,
} from './data/repository'
import { tabletopPollMs, type Item, type TabletopView } from './domain/model'

export const tabletopScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'tabletop'] as const

/** sceneId null: the scene on the table. asTable: the projection the table screen shows. */
export const tabletopQuery = (
  userId: string,
  campaignId: string,
  sceneId: string | null,
  asTable: boolean,
  connected = false,
) =>
  queryOptions({
    queryKey: [
      ...tabletopScope(userId, campaignId),
      'view',
      sceneId ?? 'live',
      asTable ? 'table' : 'self',
    ],
    queryFn: ({ signal }) => loadTabletop(campaignId, sceneId, asTable, signal),
    refetchInterval: tabletopPollMs(connected),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: 1,
  })

export const scenesQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...tabletopScope(userId, campaignId), 'scenes'],
    queryFn: ({ signal }) => loadScenes(campaignId, signal),
    staleTime: 5_000,
    retry: 1,
  })

export const libraryQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...tabletopScope(userId, campaignId), 'library'],
    queryFn: ({ signal }) => loadLibrary(campaignId, signal),
    staleTime: 10_000,
    retry: 1,
  })

/** A signed URL for a tabletop object, cached a little under its lifetime. */
export const mediaQuery = (userId: string, path: string | null | undefined) =>
  queryOptions({
    queryKey: ['private', userId, 'tabletop-media', path ?? null],
    queryFn: () => mediaUrl(path!),
    enabled: Boolean(path),
    staleTime: mediaSeconds * 800,
    gcTime: mediaSeconds * 900,
    retry: 1,
  })

/** Subscribes to the live row; returns whether the realtime channel is connected. */
export function useTabletopRealtime(campaignId: string, enabled: boolean) {
  const { state } = useAuth()
  const cache = useQueryClient()
  const userId = state.user?.id
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled || !userId) return
    const stop = subscribeTabletop(
      campaignId,
      () => {
        void cache.invalidateQueries({ queryKey: [...tabletopScope(userId, campaignId), 'view'] })
      },
      setConnected,
    )
    return () => {
      stop()
      setConnected(false)
    }
  }, [cache, campaignId, enabled, userId])
  return connected
}

/** Merges saved or moved items into every cached view of that scene (drags feel immediate). */
function patchItems(view: TabletopView | undefined, sceneId: string, items: Partial<Item>[]) {
  if (!view?.scene || view.scene.id !== sceneId) return view
  const byId = new Map(items.filter((i) => i.id).map((i) => [i.id!, i]))
  return {
    ...view,
    items: view.items.map((item) => {
      const patch = byId.get(item.id)
      if (!patch) return item
      return { ...item, ...patch, data: { ...item.data, ...(patch.data ?? {}) } } as Item
    }),
  }
}

export function useTabletopAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const current = () =>
    navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: TabletopAction) => {
      if (!current()) throw new Error('offline')
      return changeTabletop(campaignId, action)
    },
    onMutate: (action) => {
      if (!userId || action.kind !== 'putItems') return
      const known = action.items.filter((i) => i.id) as Partial<Item>[]
      if (!known.length) return
      const key = [...tabletopScope(userId, campaignId), 'view']
      // Kept so a failed write puts the board back the way the server has it.
      const previous = cache.getQueriesData<TabletopView>({ queryKey: key })
      cache.setQueriesData<TabletopView>({ queryKey: key }, (view) =>
        patchItems(view, action.sceneId, known),
      )
      return { previous }
    },
    onError: (_error, _action, context) => {
      for (const [key, view] of context?.previous ?? []) cache.setQueryData(key, view)
    },
    onSettled: async () => {
      if (!current() || !userId) return
      await cache.invalidateQueries({ queryKey: tabletopScope(userId, campaignId) })
    },
  })
}

export function useMediaUpload(campaignId: string) {
  return useMutation({
    retry: false,
    mutationFn: ({ kind, file }: { kind: MediaKind; file: Blob }) =>
      uploadMedia(campaignId, kind, file),
  })
}
