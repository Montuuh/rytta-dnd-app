import { useCallback } from 'react'
import { newRequestId } from '@/shared/lib/request-id'
import { useRecordRoll } from '../api'
import { rollMaths, type RollSpec } from '../domain/roll'

/**
 * RYT-133: the rolls of initiative and the short rest happen inside flows that have their own save
 * (the initiative total, the vote), so a roll made with dice in the app is recorded for the
 * strip without ever holding that flow up: a failure here is not shown and changes nothing there.
 */
export function useQuietRollLog(campaignId: string, characterId: string | null) {
  const record = useRecordRoll(campaignId)
  return useCallback(
    (spec: RollSpec, dice: readonly number[]) => {
      const maths = rollMaths(spec.expression, dice)
      if (!maths) return
      void record({
        source: 'recorded',
        campaignId,
        characterId,
        label: spec.label,
        expression: spec.expression,
        kind: spec.kind,
        dice: [...dice],
        total: maths.total,
        requestId: newRequestId(),
      }).catch(() => undefined)
    },
    [record, campaignId, characterId],
  )
}
