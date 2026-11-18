import { useCallback } from 'react'
import type { CampaignRoll } from '@/features/campaigns'
import { useRecordRoll } from '../api'
import type { RollSpec } from '../domain/roll'
import { holdRoll, releaseRoll } from './held-rolls'
import { tumble } from './roll-engine'

/**
 * RYT-133, dice in the app: the server rolls (`log_roll` with source 'app') and its dice and
 * total are the only truth. The 3D dice tumble beside the request as decoration and are gone
 * before they settle; the result is revealed (card and strip together) when both are done. The request id belongs to the roll, so a retry after a failure with the same
 * id returns the roll the server already made instead of rolling again. Rejects with a
 * CampaignSettingsError; there is no roll on this device to fall back to.
 */
export function useAppRoll(campaignId: string) {
  const { record, publish } = useRecordRoll(campaignId)
  return useCallback(
    async (
      spec: RollSpec,
      characterId: string | null,
      requestId: string,
      { animate = true }: { animate?: boolean } = {},
    ): Promise<CampaignRoll> => {
      holdRoll(requestId)
      try {
        const [roll] = await Promise.all([
          record(
            {
              source: 'app',
              campaignId,
              characterId,
              label: spec.label,
              expression: spec.expression,
              kind: spec.kind,
              requestId,
            },
            // One reveal moment: the strip is told only when the tumble is over, with the card.
            { publishNow: false },
          ),
          animate ? tumble(spec.expression) : Promise.resolve(),
        ])
        publish(roll)
        return roll
      } finally {
        releaseRoll(requestId)
      }
    },
    [record, publish, campaignId],
  )
}
