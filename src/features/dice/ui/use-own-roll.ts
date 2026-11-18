import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import type { CampaignRoll } from '@/features/campaigns'
import { rollsQuery } from '../api'
import { ownRollSince } from '../domain/rolls'
import { useHeldRolls } from './held-rolls'

/**
 * RYT-133: finds the roll the viewer already made of a kind for a character since a moment, in the
 * roll log. It survives closing a screen, a reload and another device. `status` says whether the log is
 * loading, loaded or failed (nothing can be said about a roll before it has loaded). Only the newest rolls of the
 * campaign are listed, so a very busy table could push an old roll out of the window.
 */
export function useOwnRoll(campaignId: string) {
  const { state } = useAuth()
  const userId = state.user!.id
  const query = useQuery(rollsQuery(userId, campaignId))
  const held = useHeldRolls()
  const find = useCallback(
    (characterId: string | null, kind: CampaignRoll['kind'], since: string | null) =>
      ownRollSince(
        (query.data ?? []).filter((roll) => !held.has(roll.id)),
        { userId, characterId, kind, since },
      ),
    [query.data, held, userId],
  )
  // Three states, never two: loading, loaded, or failed (the screen then says so and offers a retry;
  // rolling stays possible because the server is the one that rolls).
  const status: 'loading' | 'ready' | 'failed' = query.isSuccess
    ? 'ready'
    : query.isError
      ? 'failed'
      : 'loading'
  return { find, status, retry: () => void query.refetch() }
}
