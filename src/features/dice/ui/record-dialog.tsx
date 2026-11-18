import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core'
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CampaignRoll } from '@/features/campaigns'
import { newRequestId } from '@/shared/lib/request-id'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { Modal } from '@/shared/ui/overlays'
import { useRecordRoll } from '../api'
import {
  attemptFor,
  diceSlots,
  formulaOf,
  mathsText,
  maxTypedDice,
  rollMaths,
  payloadKey,
  type Attempt,
  totalRange,
  typedDice,
  typedTotal,
  type RollSpec,
} from '../domain/roll'
import { failureReason } from './failure-reason'
import { useRollName } from './roll-name'
import './dice.css'

export type Recording = { spec: RollSpec; opener: HTMLElement | null; open: boolean }

const digits = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 3)

/**
 * RYT-133, physical dice: the Player rolled their own dice and types what they read. The dice are
 * checked against the expression and added up here, so what is recorded is what the sheet said to
 * roll. Big pools are typed as one total. The same request id is kept while the answer is
 * unchanged, so retrying after a failure never records a roll twice. The form mounts when the
 * dialog opens, so every question starts empty.
 */
export function RecordDialog({
  recording,
  campaignId,
  characterId,
  onClose,
  onSaved,
}: {
  recording: Recording | null
  campaignId: string
  characterId: string | null
  onClose: () => void
  onSaved: (spec: RollSpec, roll: CampaignRoll) => void
}) {
  const { t } = useTranslation()
  const rollName = useRollName()
  const [pending, setPending] = useState(false)
  if (!recording) return null
  const { spec } = recording
  // Focus goes back to the line that was tapped. The block under this dialog (a drawer with its
  // own focus trap) may take it first, so the return starts as this dialog closes and keeps
  // trying until it is gone (focusWhenReady with the closing dialog as `leaving`).
  const leave = (then: () => void) => {
    const leaving = document.activeElement?.closest('[role="dialog"]') ?? null
    const opener = recording.opener
    then()
    if (opener?.isConnected) focusWhenReady(() => opener, { from: document.activeElement, leaving })
  }
  return (
    <Modal
      opened={recording.open}
      onClose={() => !pending && leave(onClose)}
      title={t('roll.recordTitle', { name: rollName(spec.kind, spec.label) })}
      closeOnEscape={!pending}
      closeOnClickOutside={!pending}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44, disabled: pending }}
    >
      <RecordForm
        spec={spec}
        campaignId={campaignId}
        characterId={characterId}
        pending={pending}
        setPending={setPending}
        onClose={() => leave(onClose)}
        onSaved={(saved) => leave(() => onSaved(spec, saved))}
      />
    </Modal>
  )
}

function RecordForm({
  spec,
  campaignId,
  characterId,
  pending,
  setPending,
  onClose,
  onSaved,
}: {
  spec: RollSpec
  campaignId: string
  characterId: string | null
  pending: boolean
  setPending: (next: boolean) => void
  onClose: () => void
  onSaved: (saved: CampaignRoll) => void
}) {
  const { t } = useTranslation()
  const { record } = useRecordRoll(campaignId)
  const slots = diceSlots(spec.expression)
  const perDie = slots.length > 0 && slots.length <= maxTypedDice
  const [values, setValues] = useState<string[]>(() => slots.map(() => ''))
  const [total, setTotal] = useState('')
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const attempt = useRef<Attempt | null>(null)
  const alert = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (failure) alert.current?.focus()
  }, [failure])
  const range = totalRange(spec.expression)
  const typed = perDie ? typedDice(spec.expression, values) : null
  const typedSum = !perDie ? typedTotal(spec.expression, total) : null
  const sum = typed?.ok
    ? { dice: typed.dice, total: typed.total }
    : typedSum?.ok
      ? { dice: [] as number[], total: typedSum.total }
      : null
  const maths = typed?.ok ? rollMaths(spec.expression, typed.dice) : null
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (!sum) {
      setTouched(true)
      first.current?.focus()
      return
    }
    // One id per attempt: a retry of this same payload repeats it, other numbers start over.
    const current = attemptFor(
      attempt.current,
      payloadKey(characterId, spec, sum.dice, sum.total),
      newRequestId,
    )
    attempt.current = current
    setPending(true)
    setFailure(null)
    try {
      const saved = await record({
        source: 'recorded',
        campaignId,
        characterId,
        label: spec.label,
        expression: spec.expression,
        kind: spec.kind,
        dice: sum.dice,
        total: sum.total,
        requestId: current.id,
      })
      attempt.current = null
      onSaved(saved)
    } catch (error) {
      setFailure(failureReason(error))
    } finally {
      setPending(false)
    }
  }
  const failureKey =
    failure === 'forbidden' ||
    failure === 'invalid' ||
    failure === 'dice-mode' ||
    failure === 'request-mismatch' ||
    failure === 'character-unavailable' ||
    failure === 'roll-limit'
      ? failure
      : 'unavailable'
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <Stack>
        <Text className="roll-record-formula">
          {t('roll.recordFormula', { formula: formulaOf(spec.expression) })}
        </Text>
        {perDie ? (
          <div className="roll-record-dice">
            {slots.map((slot, index) => {
              const value = values[index] ?? ''
              const bad =
                touched && (value === '' || Number(value) < 1 || Number(value) > slot.sides)
              return (
                <TextInput
                  key={index}
                  ref={index === 0 ? first : undefined}
                  data-autofocus={index === 0 || undefined}
                  className="roll-record-die"
                  label={
                    slots.length === 1
                      ? t('roll.dieSingle', { sides: slot.sides })
                      : t('roll.dieN', { n: index + 1, sides: slot.sides })
                  }
                  description={t('roll.dieRange', { max: slot.sides })}
                  inputMode="numeric"
                  autoComplete="off"
                  value={value}
                  error={bad ? t('roll.dieError', { max: slot.sides }) : undefined}
                  onChange={(event) => {
                    const next = digits(event.currentTarget.value)
                    setValues((current) => current.map((item, i) => (i === index ? next : item)))
                  }}
                />
              )
            })}
          </div>
        ) : (
          <TextInput
            ref={first}
            data-autofocus
            className="roll-record-die"
            label={t('roll.totalLabel')}
            description={range ? t('roll.totalRange', range) : undefined}
            inputMode="numeric"
            autoComplete="off"
            value={total}
            error={
              touched && typedSum && !typedSum.ok
                ? typedSum.reason === 'range'
                  ? t('roll.totalOutOfRange', { min: typedSum.min ?? 0, max: typedSum.max ?? 0 })
                  : t('roll.totalError')
                : undefined
            }
            onChange={(event) => setTotal(event.currentTarget.value.slice(0, 5))}
          />
        )}
        <p className="roll-record-sum" role="status">
          {maths
            ? t('roll.sum', { maths: mathsText(maths), total: maths.total })
            : sum && !perDie
              ? t('roll.sumTotal', { total: sum.total })
              : ''}
        </p>
        {failure && (
          <Alert
            ref={alert}
            tabIndex={-1}
            color="red"
            role="alert"
            icon={<TriangleAlert size={18} aria-hidden="true" />}
            title={t('roll.errorTitle')}
          >
            {t(`roll.error.${failureKey}`)}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={() => !pending && onClose()}
            aria-disabled={pending || undefined}
          >
            {t('action.cancel')}
          </Button>
          <Button
            type="submit"
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            leftSection={pending ? <Loader size={16} aria-hidden="true" /> : undefined}
          >
            {failure === 'unavailable' ? t('common.retry') : t('roll.record')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
