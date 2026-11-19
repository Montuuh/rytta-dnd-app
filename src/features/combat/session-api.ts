import { useRef } from 'react'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { combatScope } from './api'
import {
  duplicatePlan,
  loadContinuity,
  loadEncounterPlan,
  loadSharedRecap,
  saveContinuity,
  savePlan,
} from './data/session-repository'

export const sessionContinuityQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'session-continuity'],
    queryFn: ({ signal }) => loadContinuity(campaignId, signal),
  })
export const sharedRecapQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'shared-recap'],
    queryFn: ({ signal }) => loadSharedRecap(campaignId, signal),
  })
export const encounterPlanQuery = (userId: string, campaignId: string, encounterId: string) =>
  queryOptions({
    queryKey: [...combatScope(userId, campaignId), 'plan', encounterId],
    queryFn: ({ signal }) => loadEncounterPlan(campaignId, encounterId, signal),
  })
function useSessionMutation<Input, Output>(
  campaignId: string,
  write: (campaignId: string, input: Input, requestId: string) => Promise<Output>,
) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const attempt = useRef<{ key: string; id: string } | null>(null)
  const current = () => Boolean(userId) && controller?.getSnapshot().user?.id === userId
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: (input: Input) => {
      if (!navigator.onLine || !current()) throw new Error('unavailable')
      const key = JSON.stringify([userId, campaignId, input])
      if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() }
      return write(campaignId, input, attempt.current.id)
    },
    onSuccess: () => {
      attempt.current = null
    },
    onSettled: async () => {
      if (current() && userId)
        await cache.invalidateQueries({ queryKey: combatScope(userId, campaignId) })
    },
  })
}
export const useSaveSessionContinuity = (campaignId: string) =>
  useSessionMutation(campaignId, saveContinuity)
export const useSaveEncounterPlan = (campaignId: string) => useSessionMutation(campaignId, savePlan)
export const useDuplicateEncounterPlan = (campaignId: string) =>
  useSessionMutation(campaignId, duplicatePlan)
