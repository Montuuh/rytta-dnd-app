import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { rollContextQuery, rollContextScope } from '../api'
import { isSpent, rollInForce, type OneRollKind } from '../domain/context'
import { useHeldRolls } from './held-rolls'

/**
 * RYT-137: the server's one-roll state, read by the initiative entry, the short rest and the DM
 * resets. Whether a character has used its roll comes from the server, never from the roll log or
 * from event times. `status` says whether it is loading, loaded or failed: nothing is said about a
 * roll before it has loaded, rolling stays possible when it failed (the server refuses a second
 * roll) and a retry reads it again.
 */
export function useRollContext(campaignId: string) {
  const { state } = useAuth()
  const userId = state.user!.id
  const cache = useQueryClient()
  const query = useQuery(rollContextQuery(userId, campaignId))
  const held = useHeldRolls()
  const spent = useCallback(
    (characterId: string | null, kind: OneRollKind) => isSpent(query.data, characterId, kind, held),
    [query.data, held],
  )
  const roll = useCallback(
    (characterId: string | null, kind: OneRollKind) =>
      rollInForce(query.data, characterId, kind, held),
    [query.data, held],
  )
  // Three states, never two: loading, loaded, or failed.
  const status: 'loading' | 'ready' | 'failed' = query.isSuccess
    ? 'ready'
    : query.isError
      ? 'failed'
      : 'loading'
  const refresh = useCallback(
    () => cache.invalidateQueries({ queryKey: rollContextScope(userId, campaignId) }),
    [cache, userId, campaignId],
  )
  return {
    spent,
    roll,
    status,
    encounterId: query.data?.encounter_id ?? null,
    restId: query.data?.rest_id ?? null,
    refresh,
    retry: () => void query.refetch(),
  }
}
