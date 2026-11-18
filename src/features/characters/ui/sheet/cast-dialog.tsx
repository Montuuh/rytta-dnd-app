import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Alert, Button, Group, Loader, Text } from '@mantine/core'
import { Check, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { Modal } from '@/shared/ui/overlays'
import {
  castAvailability,
  concentrationName,
  planCast,
  slotChoices,
  type CastMode,
  type CastPlan,
} from '../../domain/casting'
import type { Build, Spell, Vitals } from '../../domain/sheet'
import { useSubmitGuard } from '../use-submit-guard'

export type CastTarget = { spell: Spell; name: string }
/** One write of a cast: what it sends, on which revision, under which request id, and the play
 * state it was planned from. A retry after a failure that may have been applied sends exactly
 * this again, so the server can replay it instead of spending a second slot. */
export type CastSubmission = {
  plan: CastPlan
  base: Vitals
  revision: number
  requestId: string
}
export type CastHeld = MutableRefObject<CastSubmission | null>
/** What the sheet answers with when it refuses or fails a cast; `null` means it was saved. */
export type CastFailure =
  'unavailable' | 'busy' | 'stale' | 'forbidden' | 'absent' | 'concentration'

const failureOf = (message: string): CastFailure =>
  message === 'stale' ||
  message === 'busy' ||
  message === 'forbidden' ||
  message === 'absent' ||
  message === 'concentration'
    ? message
    : 'unavailable'
/** A refusal the Player cannot fix by repeating the cast: only a way out is offered. */
const refusal = (failure: CastFailure | null) =>
  failure === 'forbidden' || failure === 'absent' || failure === 'concentration'

const ritualValue = 'ritual'

/**
 * RYT-134: "Lanzar" for one spell. A levelled spell asks which slot to spend (only levels from the
 * spell's own up that still have one) or, for a ritual, offers casting it without one. A
 * concentration spell says it will be marked on the sheet and which marker it replaces. The cast
 * is one write that spends the slot and sets the marker together. A failure that may have been
 * applied keeps the exact submission: the confirm becomes a retry that resends it, never a second
 * cast, and the slot counters keep showing the state it was planned from. A new opening of the
 * dialog starts clean (the sheet gives each its own key).
 */
export function CastDialog({
  opened,
  target,
  build,
  level,
  vitals,
  inEncounter,
  onClose,
  apply,
  returnTo,
}: {
  opened: boolean
  target: CastTarget
  build: Build
  level: number
  vitals: Vitals
  /** The character fights a live encounter: the DM's own concentration tracker is separate. */
  inEncounter: boolean
  onClose: () => void
  /** Writes the cast; rejects with an Error whose message names the failure. */
  apply: (
    plan: CastPlan,
    held: CastHeld,
    /** Builds the plan again on a fresher play state, after waiting for another write. */
    replan: (fresh: Vitals) => CastPlan | null,
  ) => Promise<void>
  /** Where focus goes when the dialog closes. */
  returnTo: () => HTMLElement | null | undefined
}) {
  const { t } = useTranslation()
  const guard = useSubmitGuard()
  const { spell, name } = target
  const held: CastHeld = useRef(null)
  const [frozen, setFrozen] = useState<Vitals | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<CastFailure | null>(null)
  const [failedAt, setFailedAt] = useState(0)
  const alert = useRef<HTMLDivElement>(null)
  // The state this cast is planned from: while a retry is waiting it is the one the failed
  // attempt started from, never the sheet as it reloads (the server may have applied it).
  const basis = frozen ?? vitals
  // A name that leaves nothing once cleaned still casts, under a generic marker.
  const markerName = concentrationName(name) ? name : t('cast.unnamed')

  const slots = useMemo(
    () => slotChoices(build, level, basis, spell.level),
    [build, level, basis, spell.level],
  )
  const ritual = spell.ritual && spell.level > 0
  const cantrip = spell.level === 0
  const values = [...slots.map((slot) => String(slot.level)), ...(ritual ? [ritualValue] : [])]
  // The first slot (the cheapest) is preselected; a ritual with no slot left, the ritual.
  const choice = picked !== null && values.includes(picked) ? picked : (values[0] ?? null)
  const mode: CastMode | null = cantrip
    ? { kind: 'cantrip' }
    : choice === null
      ? null
      : choice === ritualValue
        ? { kind: 'ritual' }
        : { kind: 'slot', level: Number(choice) }
  const noOption = !cantrip && mode === null
  const replaced = spell.concentration ? basis.concentration : null
  const availability = castAvailability(spell, build, level, basis)
  const retryable = failure === 'unavailable' || failure === 'busy'
  const refused = refusal(failure)

  // A failure is brought into view and focused, so the reason is never off-screen.
  useEffect(() => {
    if (!failedAt) return
    alert.current?.scrollIntoView({ block: 'nearest' })
    alert.current?.focus({ preventScroll: true })
  }, [failedAt])

  const close = () => {
    if (pending) return
    onClose()
  }
  const choose = (value: string) => {
    // Another slot is another cast: nothing held from the failed one applies to it.
    held.current = null
    setFrozen(null)
    setPicked(value)
    if (!refused) setFailure(null)
  }
  const confirm = async () => {
    if (!mode || pending || refused) return
    const plan = planCast(spell, mode, build, level, basis, markerName)
    if (!plan) {
      setFailure('stale')
      setFailedAt((count) => count + 1)
      return
    }
    // The guard is a ref: a double tap in one frame cannot send a second request.
    const outcome = await guard.run(async () => {
      setPending(true)
      setFailure(null)
      try {
        await apply(plan, held, (fresh) => planCast(spell, mode, build, level, fresh, markerName))
        return 'saved' as const
      } catch (error) {
        const next = failureOf(error instanceof Error ? error.message : '')
        // Only a failure that may have reached the server keeps its submission for the retry.
        if (next === 'unavailable' && held.current) setFrozen(held.current.base)
        else {
          held.current = null
          setFrozen(null)
        }
        setFailure(next)
        setFailedAt((count) => count + 1)
        return 'failed' as const
      } finally {
        setPending(false)
      }
    })
    if (outcome === 'saved') onClose()
  }

  const failureText = failure
    ? availability === 'blocked' && failure === 'stale'
      ? t('cast.error.noSlot')
      : t(`cast.error.${failure}`)
    : ''

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={<span className="user-copy">{t('cast.title', { name })}</span>}
      closeOnEscape={!pending}
      closeOnClickOutside={false}
      returnFocus={false}
      onExitTransitionEnd={() => focusWhenReady(returnTo)}
      closeButtonProps={{ 'aria-label': t('panel.close'), size: 44, disabled: pending }}
      classNames={{ body: 'cast-body' }}
    >
      <div className="cast-form">
        {ritual && (
          <Text size="sm" c="dimmed">
            {t('sheet.ritual')}
          </Text>
        )}
        {cantrip ? (
          <Text>{t('cast.cantripFree')}</Text>
        ) : noOption ? (
          <Text>
            {spell.level > 1 ? t('cast.noSlotsFrom', { level: spell.level }) : t('cast.noSlots')}
          </Text>
        ) : (
          <fieldset className="cast-choices">
            <legend className="cast-legend">
              {t(ritual ? 'cast.howHeading' : 'cast.slotHeading')}
            </legend>
            {slots.map((slot, index) => (
              <label
                key={slot.level}
                className="cast-option"
                data-checked={choice === String(slot.level) || undefined}
              >
                <input
                  type="radio"
                  name="cast-slot"
                  className="cast-option-input"
                  checked={choice === String(slot.level)}
                  data-autofocus={index === 0 || undefined}
                  onChange={() => choose(String(slot.level))}
                />
                <span className="cast-option-copy">
                  <span className="cast-option-label">
                    {t(slot.pact ? 'cast.slotPact' : 'cast.slotLevel', { level: slot.level })}
                  </span>
                  <span className="cast-option-detail">
                    {t('cast.slotLeft', { left: slot.left, max: slot.max })}
                  </span>
                </span>
                <Check size={18} className="cast-option-check" aria-hidden="true" />
              </label>
            ))}
            {ritual && (
              <label className="cast-option" data-checked={choice === ritualValue || undefined}>
                <input
                  type="radio"
                  name="cast-slot"
                  className="cast-option-input"
                  checked={choice === ritualValue}
                  data-autofocus={slots.length === 0 || undefined}
                  onChange={() => choose(ritualValue)}
                />
                <span className="cast-option-copy">
                  <span className="cast-option-label">{t('cast.ritual')}</span>
                  <span className="cast-option-detail">{t('cast.ritualHint')}</span>
                </span>
                <Check size={18} className="cast-option-check" aria-hidden="true" />
              </label>
            )}
          </fieldset>
        )}
        {spell.concentration && (
          <Text size="sm" className="cast-concentrates">
            {replaced
              ? `${t('cast.replaces', { next: name, current: replaced })} ${t('cast.willMark')}`
              : t('cast.concentrates')}
          </Text>
        )}
        {spell.concentration && inEncounter && (
          <Text size="sm" c="dimmed" className="cast-combat">
            {t('cast.combatNote')}
          </Text>
        )}
        {failure && (
          <Alert
            ref={alert}
            tabIndex={-1}
            role="alert"
            color="red"
            icon={<TriangleAlert size={18} aria-hidden="true" />}
            title={t('cast.error.title')}
            className="cast-alert"
          >
            {failureText}
            {/* After a lost reply it is not known whether it was saved: no claim either way. */}
            {failure !== 'unavailable' && ` ${t('cast.error.unchanged')}`}
          </Alert>
        )}
        <Group justify="flex-end" gap="sm" className="cast-footer">
          <Button variant="default" aria-disabled={pending || undefined} onClick={close}>
            {refused ? t('cast.error.close') : t('action.cancel')}
          </Button>
          {!refused && (
            <Button
              data-autofocus={cantrip || undefined}
              aria-disabled={!mode || pending || undefined}
              aria-busy={pending || undefined}
              leftSection={
                pending ? (
                  <Loader size={16} aria-hidden="true" />
                ) : (
                  <Check size={18} aria-hidden="true" />
                )
              }
              onClick={() => void confirm()}
            >
              {pending
                ? t('cast.saving')
                : retryable
                  ? t('common.retry')
                  : replaced
                    ? t('cast.confirmReplace')
                    : t('cast.confirm')}
            </Button>
          )}
        </Group>
      </div>
    </Modal>
  )
}
