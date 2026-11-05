import { useEffect, useState } from 'react'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  changeCombat,
  combatImageUrl,
  imageBuckets,
  loadCombatState,
  loadEncounters,
  loadSrdImages,
  loadTemplates,
  subscribeEncounters,
  uploadCreatureImage,
  type ImageKind,
} from './data/repository'
import { combatPollInterval, type CombatAction } from './domain/combat'

const combatScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'combat'] as const

export const encountersQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'encounters'],
    queryFn: ({ signal }) => loadEncounters(campaignId, signal),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 1,
  })

export const combatStateQuery = (
  userId: string,
  campaignId: string,
  encounterId: string | null,
  asTable = false,
) =>
  queryOptions({
    queryKey: [
      ...combatScope(userId, campaignId),
      'state',
      encounterId ?? 'live',
      asTable ? 'table' : 'self',
    ],
    queryFn: ({ signal }) => loadCombatState(campaignId, encounterId, asTable, signal),
    refetchInterval: (query) => combatPollInterval(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: 1,
  })

export const templatesQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'templates'],
    queryFn: ({ signal }) => loadTemplates(campaignId, signal),
    staleTime: 30_000,
    retry: 1,
  })

/** RYT-053: the DM's own images of SRD creatures in this campaign (DM only). */
export const srdImagesQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'srd-images'],
    queryFn: ({ signal }) => loadSrdImages(campaignId, signal),
    staleTime: 30_000,
    retry: 1,
  })

/** Subscribes to encounter changes; returns whether the realtime channel is connected. */
export function useCombatRealtime(campaignId: string, enabled: boolean) {
  const { state } = useAuth()
  const cache = useQueryClient()
  const userId = state.user?.id
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled || !userId) return
    const stop = subscribeEncounters(
      campaignId,
      () => {
        void cache.invalidateQueries({ queryKey: combatScope(userId, campaignId) })
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

export function useCombatAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const current = () =>
    navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: CombatAction) => {
      if (!current()) throw new Error('unavailable')
      return changeCombat(campaignId, action)
    },
    onSettled: async (_result, _error, action) => {
      if (!current() || !userId) return
      await cache.invalidateQueries({ queryKey: combatScope(userId, campaignId) })
      // Character hit points and conditions are shared with the sheet and the party page.
      if (['hp', 'condition', 'deathSave', 'effect', 'removeEffect', 'undo'].includes(action.kind))
        await cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        })
    },
  })
}

/** A signed URL for a combat image, cached a little under its lifetime (RYT-043). */
export const combatImageQuery = (userId: string, kind: ImageKind, path: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'combat-image', kind, path],
    queryFn: () => combatImageUrl(kind, path!),
    enabled: Boolean(path),
    staleTime: imageBuckets[kind].seconds * 800,
    gcTime: imageBuckets[kind].seconds * 900,
    retry: false,
  })

/**
 * Uploads a prepared creature image and attaches it in one user action: to a campaign creature
 * (template, with its revision) or, RYT-053, to an SRD creature of the campaign.
 */
export function useCreatureImageUpload(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const current = () =>
    navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async ({
      target,
      image,
    }: {
      target: { templateId: string; revision: number } | { srdId: string }
      image: Blob
    }) => {
      if (!current()) throw new Error('unavailable')
      const path = await uploadCreatureImage(campaignId, target, image)
      return changeCombat(
        campaignId,
        'srdId' in target
          ? { kind: 'srdImage', srdId: target.srdId, path }
          : {
              kind: 'templateImage',
              templateId: target.templateId,
              revision: target.revision,
              path,
            },
      )
    },
    onSettled: async () => {
      if (!current() || !userId) return
      await cache.invalidateQueries({ queryKey: combatScope(userId, campaignId) })
    },
  })
}
