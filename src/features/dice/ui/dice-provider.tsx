import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { CampaignSettingsError } from '@/features/campaigns'
import { newRequestId } from '@/shared/lib/request-id'
import { useRecordRoll } from '../api'
import { createRollRequestIds, rollMaths, rollPayloadKey, type RollSpec } from '../domain/roll'
import {
  DiceContext,
  RollResultContext,
  type DiceContextValue,
  type RollResultView,
} from './dice-context'
import { RecordDialog, type Recording } from './record-dialog'
import { rollExpressionDice } from './roll-engine'
import { useDiceMode } from './use-dice-mode'

/**
 * RYT-133: what the sheet's numbers do. With physical dice a tap opens the dialog where the
 * result is typed; with dice in the app it rolls the 3D dice, shows the maths and records the
 * roll. Both record through `log_roll`, so the recent rolls strip lists them alike. The faces the
 * 3D dice land on are the roll that is recorded (the engine cannot be told which faces to show,
 * so the dice and the database always agree). Mount it where the character's sheet is; `canRoll`
 * is presentation only, the database refuses a roll that is not the viewer's to make.
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
  const { behaviour } = useDiceMode(campaignId)
  const save = useRecordRoll(campaignId)
  const ids = useRef(createRollRequestIds(newRequestId))
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

  const persist = useCallback(
    async (entry: RollResultView) => {
      const key = rollPayloadKey(characterId, entry.spec, entry.dice, entry.total)
      patch(entry.seq, { phase: 'saving', reason: undefined })
      try {
        await save({
          source: 'recorded',
          campaignId,
          characterId,
          label: entry.spec.label,
          expression: entry.spec.expression,
          kind: entry.spec.kind,
          dice: entry.dice,
          total: entry.total,
          requestId: ids.current.idFor(key),
        })
        ids.current.done(key)
        patch(entry.seq, { phase: 'saved' })
      } catch (error) {
        patch(entry.seq, {
          phase: 'failed',
          reason:
            error instanceof CampaignSettingsError
              ? error.reason
              : error instanceof Error && error.name === 'ZodError'
                ? 'invalid'
                : 'unavailable',
        })
      }
    },
    [campaignId, characterId, patch, save],
  )

  const roll = useCallback(
    async (spec: RollSpec) => {
      if (!canRoll || rollingRef.current) return
      rollingRef.current = true
      setRolling(true)
      const seq = ++sequence.current
      show({ seq, phase: 'rolling', spec, dice: [], total: 0 })
      let entry: RollResultView | null = null
      try {
        const dice = await rollExpressionDice(spec.expression)
        const maths = dice && rollMaths(spec.expression, dice)
        if (dice && maths) entry = { seq, phase: 'saving', spec, dice, total: maths.total }
      } finally {
        rollingRef.current = false
        setRolling(false)
      }
      if (!entry) return show(null)
      show(entry)
      await persist(entry)
    },
    [canRoll, persist, show],
  )

  const record = useCallback(
    (spec: RollSpec, opener: HTMLElement | null) => {
      if (canRoll) setRecording({ spec, opener, open: true })
    },
    [canRoll],
  )

  const value = useMemo<DiceContextValue>(
    () => ({ behaviour, canRoll, roll: (spec) => void roll(spec), record, rolling }),
    [behaviour, canRoll, roll, record, rolling],
  )
  const shared = useMemo(
    () => ({
      result,
      retry: () => {
        const current = resultRef.current
        if (current?.phase === 'failed') void persist(current)
      },
      dismiss: () => show(null),
    }),
    [result, persist, show],
  )
  return (
    <DiceContext.Provider value={value}>
      <RollResultContext.Provider value={shared}>
        {children}
        <RecordDialog
          recording={recording}
          campaignId={campaignId}
          characterId={characterId}
          onClose={() => setRecording((current) => current && { ...current, open: false })}
          onSaved={(spec, dice, total) => {
            setRecording((current) => current && { ...current, open: false })
            show({ seq: ++sequence.current, phase: 'saved', spec, dice, total })
          }}
        />
      </RollResultContext.Provider>
    </DiceContext.Provider>
  )
}
