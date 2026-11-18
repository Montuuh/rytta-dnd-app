import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { rollContextQuery, rollContextScope } from '../api'
import { subscribeRolls } from '../data/repository'
import { isSpent, rollInForce, type OneRollKind } from '../domain/context'
import { useHeldRolls } from './held-rolls'

/**
 * RYT-137: the server's one-roll state, read by the initiative entry, the short rest and the DM
 * resets. Whether a character has used its roll comes from the server, never from the roll log or
 * from event times. `status` says whether it is loading, loaded or failed: nothing is said about a
 * roll before it has loaded, rolling stays possible when it failed (the server refuses a second
 * roll) and a retry reads it again.
 *
 * - `enabled` false (physical dice, nobody to reset anything): nothing is requested and the state
 *   reads as empty and loaded.
 * - `expectEncounter`: the fight the screen shows. A state that names another fight is not this
 *   fight's: it reads as loading and is requested again.
 * - The roll signal (a roll, a DM reset) refetches it at once; polling is the fallback.
 */
export function useRollContext(
  campaignId: string,
  { enabled = true, expectEncounter }: { enabled?: boolean; expectEncounter?: string } = {},
) {
  const { state } = useAuth()
  const userId = state.user!.id
  const cache = useQueryClient()
  const query = useQuery({ ...rollContextQuery(userId, campaignId), enabled })
  const held = useHeldRolls()
  useEffect(() => {
    if (!enabled) return
    return subscribeRolls(campaignId, () => {
      void cache.invalidateQueries({ queryKey: rollContextScope(userId, campaignId) })
    })
  }, [enabled, campaignId, userId, cache])
  const wrongFight =
    expectEncounter !== undefined && query.isSuccess && query.data.encounter_id !== expectEncounter
  // A state that names another fight is read again once per fight shown; if it still names
  // another one it stays unusable (never an endless loop of requests), reads as failed so the
  // screen says so and rolling stays possible (the server decides), and the poll and the signals
  // keep looking.
  const refetch = query.refetch
  const [rechecked, setRechecked] = useState<string | null>(null)
  useEffect(() => {
    if (!wrongFight || query.isFetching || rechecked === (expectEncounter ?? null)) return
    // Marks this fight as read again before the request, so it is asked for once.
    // oxlint-disable-next-line react/set-state-in-effect
    setRechecked(expectEncounter ?? null)
    void refetch()
  }, [wrongFight, expectEncounter, query.isFetching, refetch, rechecked])
  const waitingForRecheck = wrongFight && rechecked !== (expectEncounter ?? null)
  const usable = enabled && !wrongFight ? query.data : undefined
  const spent = useCallback(
    (characterId: string | null, kind: OneRollKind) => isSpent(usable, characterId, kind, held),
    [usable, held],
  )
  const roll = useCallback(
    (characterId: string | null, kind: OneRollKind) => rollInForce(usable, characterId, kind, held),
    [usable, held],
  )
  // Three states, never two: loading, loaded, or failed.
  const status: 'loading' | 'ready' | 'failed' = !enabled
    ? 'ready'
    : wrongFight
      ? waitingForRecheck || query.isFetching
        ? 'loading'
        : 'failed'
      : query.isSuccess
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
    encounterId: usable?.encounter_id ?? null,
    restId: usable?.rest_id ?? null,
    refresh,
    retry: () => void query.refetch(),
  }
}
