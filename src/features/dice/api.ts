import { useCallback } from 'react'
import { queryOptions, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  CampaignSettingsError,
  campaignsQuery,
  listRolls,
  logRoll,
  type CampaignRoll,
  type LogRollInput,
} from '@/features/campaigns'
import { liveChannelUp, livePollInterval, liveStatePollMs } from '@/shared/lib/live-poll'
import { loadRollContext, rollsChannelKey } from './data/repository'
import { withRoll, type RollContext } from './domain/context'
import { mergeRoll } from './domain/rolls'

export const rollsScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'rolls'] as const

export const rollContextScope = (userId: string, campaignId: string) =>
  ['private', userId, 'campaign', campaignId, 'roll-context'] as const

export const recentRollLimit = 50

/** RYT-137: the server's one-roll state. A roll, a DM reset or a fight starting changes it, so it
 * refetches on each of those and polls like the roll log as the fallback. */
export const rollContextQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: rollContextScope(userId, campaignId),
    queryFn: ({ signal }) => loadRollContext(campaignId, signal),
    refetchInterval: () =>
      livePollInterval(liveChannelUp(rollsChannelKey(campaignId)), 10_000, liveStatePollMs),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: 1,
  })

/** RYT-133: the newest rolls the database lets this account read. Visibility is never decided
 * here: whatever the server returns is what is shown. Realtime refetches; polling is the
 * fallback. */
export const rollsQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: rollsScope(userId, campaignId),
    queryFn: ({ signal }) => listRolls(campaignId, { limit: recentRollLimit, signal }),
    refetchInterval: () =>
      livePollInterval(liveChannelUp(rollsChannelKey(campaignId)), 10_000, liveStatePollMs),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: 1,
  })

/** Records a roll (typed with physical dice) or has the server roll it (source 'app'), and puts it
 * in the strip. The request id makes a retry safe: the server
 * returns the stored roll instead of recording another. Rejects with a CampaignSettingsError. */
export function useRecordRoll(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  /** Puts a stored roll in the strip and refetches what this account may read. */
  const publish = useCallback(
    (roll: CampaignRoll) => {
      if (!userId || controller?.getSnapshot().user?.id !== userId) return
      cache.setQueryData<CampaignRoll[]>(rollsScope(userId, campaignId), (rolls) =>
        rolls ? mergeRoll(rolls, roll, recentRollLimit) : rolls,
      )
      // The server decides what this account reads: refetch to reconcile.
      void cache.invalidateQueries({ queryKey: rollsScope(userId, campaignId) })
      // The one-roll state shows the new roll at once; the server's next answer reconciles it.
      cache.setQueryData<RollContext>(rollContextScope(userId, campaignId), (context) =>
        context ? withRoll(context, roll) : context,
      )
      void cache.invalidateQueries({ queryKey: rollContextScope(userId, campaignId) })
    },
    [userId, controller, cache, campaignId],
  )
  const record = useCallback(
    async (
      input: LogRollInput,
      { publishNow = true }: { publishNow?: boolean } = {},
    ): Promise<CampaignRoll> => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new CampaignSettingsError('unavailable')
      let roll: CampaignRoll
      try {
        roll = await logRoll(input)
      } catch (error) {
        // The DM changed the mode since this device last read it: read it again now, so the sheet
        // stops offering dice the table no longer uses.
        if (error instanceof CampaignSettingsError && error.reason === 'dice-mode')
          void cache.invalidateQueries({ queryKey: campaignsQuery(userId).queryKey })
        // The server already holds this character's roll (another device, or the DM): read its
        // state again so the screen stops offering a roll.
        if (error instanceof CampaignSettingsError && error.reason === 'already-rolled')
          void cache.invalidateQueries({ queryKey: rollContextScope(userId, campaignId) })
        throw error
      }
      if (publishNow) publish(roll)
      return roll
    },
    [userId, controller, cache, publish, campaignId],
  )
  return { record, publish }
}
