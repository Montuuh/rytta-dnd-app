import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CampaignRoll } from '@/features/campaigns'
import { newRequestId } from '@/shared/lib/request-id'
import { announcement, mathsText, rollMaths, type RollSpec } from '../domain/roll'
import {
  DiceContext,
  RollResultContext,
  type DiceContextValue,
  type RollResultView,
} from './dice-context'
import { failureReason } from './failure-reason'
import { RecordDialog, type Recording } from './record-dialog'
import { useRollName } from './roll-name'
import { useAppRoll } from './use-app-roll'
import { useDiceMode } from './use-dice-mode'

/**
 * RYT-133: what the sheet's numbers do. With physical dice a tap opens the dialog where the
 * result is typed and recorded (source 'recorded'). With dice in the app a tap asks the server to
 * roll (source 'app'): the server's dice and total are shown and are the only ones there are; the
 * 3D dice are decoration that clears before they settle, and with reduced motion nothing plays.
 * Mount it where the character's sheet is; `canRoll` is presentation only, the database refuses a
 * roll that is not the viewer's to make.
 */
export function DiceProvider({
  campaignId,
  characterId,
  canRoll,
  children,
}: {
  campaignId: string
  characterId: string | null
  canRoll: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const rollName = useRollName()
  const { behaviour } = useDiceMode(campaignId)
  const appRoll = useAppRoll(campaignId)
  const sequence = useRef(0)
  const [result, setResult] = useState<RollResultView | null>(null)
  const resultRef = useRef<RollResultView | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [rolling, setRolling] = useState(false)
  const rollingRef = useRef(false)
  const show = useCallback((next: RollResultView | null) => {
    resultRef.current = next
    setResult(next)
  }, [])
  const patch = useCallback(
    (seq: number, change: Partial<RollResultView>) => {
      const current = resultRef.current
      if (current?.seq === seq) show({ ...current, ...change })
    },
    [show],
  )

  /** Asks the server to roll; the same request id makes a retry return the same roll. */
  const run = useCallback(
    async (entry: RollResultView, animate: boolean) => {
      rollingRef.current = true
      setRolling(true)
      patch(entry.seq, { phase: 'rolling', reason: undefined })
      try {
        const roll = await appRoll(entry.spec, characterId, entry.requestId, { animate })
        patch(entry.seq, { phase: 'saved', roll })
      } catch (error) {
        patch(entry.seq, { phase: 'failed', reason: failureReason(error) })
      } finally {
        rollingRef.current = false
        setRolling(false)
      }
    },
    [appRoll, characterId, patch],
  )

  const roll = useCallback(
    (spec: RollSpec) => {
      if (!canRoll || rollingRef.current) return
      const entry: RollResultView = {
        seq: ++sequence.current,
        phase: 'rolling',
        spec,
        requestId: newRequestId(),
      }
      show(entry)
      void run(entry, true)
    },
    [canRoll, run, show],
  )

  const record = useCallback(
    (spec: RollSpec, opener: HTMLElement | null) => {
      if (canRoll) setRecording({ spec, opener, open: true })
    },
    [canRoll],
  )

  const value = useMemo<DiceContextValue>(
    () => ({ behaviour, canRoll, roll, record, rolling }),
    [behaviour, canRoll, roll, record, rolling],
  )
  const shared = useMemo(
    () => ({
      result,
      retry: () => {
        const current = resultRef.current
        if (current?.phase === 'failed') void run(current, false)
      },
      dismiss: () => show(null),
    }),
    [result, run, show],
  )
  // Always mounted, empty until a roll lands, so the first announcement is not lost. It carries
  // the roll, who made it (Rytta or typed) and who sees it.
  const saved = result?.phase === 'saved' ? result.roll : undefined
  const spoken =
    result?.phase === 'rolling'
      ? t('roll.rollingShort')
      : saved
        ? announcement({
            name: rollName(result!.spec.kind, result!.spec.label),
            maths: ((m) => (m ? mathsText(m) : null))(rollMaths(saved.expression, saved.dice)),
            total: saved.total,
            source: t(`roll.source.${saved.source}`),
            seen: t(`roll.seen.${saved.visibility}`),
          })
        : ''
  return (
    <DiceContext.Provider value={value}>
      <RollResultContext.Provider value={shared}>
        {children}
        <p className="visually-hidden" role="status">
          {spoken}
        </p>
        <RecordDialog
          recording={recording}
          campaignId={campaignId}
          characterId={characterId}
          onClose={() => setRecording((current) => current && { ...current, open: false })}
          onSaved={(spec: RollSpec, saved: CampaignRoll) => {
            setRecording((current) => current && { ...current, open: false })
            show({
              seq: ++sequence.current,
              phase: 'saved',
              spec,
              requestId: saved.id,
              roll: saved,
            })
          }}
        />
      </RollResultContext.Provider>
    </DiceContext.Provider>
  )
}
