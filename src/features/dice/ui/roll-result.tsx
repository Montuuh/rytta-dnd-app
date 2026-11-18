import { useEffect, useRef } from 'react'
import { ActionIcon, Alert, Button, Loader } from '@mantine/core'
import { TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formulaOf, rollMaths } from '../domain/roll'
import { useRollResult } from './dice-context'
import { useRollName } from './roll-name'
import './dice.css'

/** Failures worth another try with the same request; the rest need something else to change. */
const retryable = new Set(['unavailable', 'roll-limit'])
const known = [
  'unavailable',
  'forbidden',
  'invalid',
  'request-mismatch',
  'character-unavailable',
  'roll-limit',
  'dice-mode',
] as const
const knownReason = (reason: string | undefined) =>
  known.find((item) => item === reason) ?? 'unavailable'

/**
 * RYT-133: the roll that just happened, where the Player is looking: under the abilities on the
 * sheet, or at the foot of the open block (skills, attacks), so it never hides behind a sheet. It
 * shows the dice, the modifier and the total exactly as the database stored them, says whether
 * Rytta rolled them or they were typed, and who reads the roll (the visibility the roll was stored
 * with). A failed roll shows nothing rolled and offers the same request again. The announcement for
 * assistive technology lives in the provider, in a region that is always mounted.
 */
export function RollResultSlot({ where }: { where: 'page' | 'sheet' }) {
  const { t } = useTranslation()
  const shared = useRollResult()
  const rollName = useRollName()
  const alert = useRef<HTMLDivElement>(null)
  const result = shared?.result ?? null
  const failedSeq = result?.phase === 'failed' ? result.seq : 0
  useEffect(() => {
    // The card stays at its top (the roll's name and the way to retry): focus does not scroll it.
    if (failedSeq) alert.current?.focus({ preventScroll: true })
  }, [failedSeq])
  if (!shared || !result) return null
  const { spec } = result
  const name = rollName(spec.kind, spec.label)
  const formula = formulaOf(spec.expression)
  const stored = result.phase === 'saved' ? result.roll : undefined
  const maths = stored ? rollMaths(stored.expression, stored.dice) : null
  const reason = knownReason(result.reason)
  return (
    <section
      className="roll-result"
      data-where={where}
      data-phase={result.phase}
      aria-label={t('roll.resultLabel')}
    >
      <div className="roll-result-main">
        <span className="roll-result-total">
          {result.phase === 'saved' && stored ? (
            stored.total
          ) : result.phase === 'rolling' ? (
            <Loader size={22} aria-hidden="true" />
          ) : (
            '–'
          )}
        </span>
        <div className="roll-result-body">
          <p className="roll-result-name">{name}</p>
          <p className="roll-result-maths">
            {maths
              ? maths.parts.map((part, index) => (
                  <span key={index} className="roll-result-part" data-kind={part.kind}>
                    {index > 0 && (part.value < 0 ? '− ' : '+ ')}
                    <span className={part.kind === 'die' ? 'roll-die' : undefined}>
                      {Math.abs(part.value)}
                    </span>
                  </span>
                ))
              : null}
            <span className="roll-result-formula">{formula}</span>
          </p>
          <p className="roll-result-state">
            {result.phase === 'rolling' && t('roll.rollingShort')}
            {result.phase === 'failed' && t('roll.notRolled')}
            {stored &&
              `${t(`roll.source.${stored.source}`)}. ${t(`roll.seen.${stored.visibility}`)}`}
          </p>
        </div>
      </div>
      <ActionIcon
        variant="subtle"
        size={44}
        className="roll-result-close"
        aria-label={t('roll.dismiss')}
        onClick={shared.dismiss}
      >
        <X size={18} aria-hidden="true" />
      </ActionIcon>
      {result.phase === 'failed' && (
        <Alert
          ref={alert}
          tabIndex={-1}
          color="red"
          role="alert"
          className="roll-result-alert"
          icon={<TriangleAlert size={18} aria-hidden="true" />}
          title={t('roll.errorTitle')}
        >
          {t(`roll.error.${reason}`)}
          {retryable.has(reason) && (
            <div className="roll-result-retry">
              <Button size="sm" variant="default" onClick={shared.retry}>
                {t('common.retry')}
              </Button>
            </div>
          )}
        </Alert>
      )}
    </section>
  )
}
