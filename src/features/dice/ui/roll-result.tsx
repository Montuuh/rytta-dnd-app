import { useEffect, useRef } from 'react'
import { ActionIcon, Alert, Button, Loader } from '@mantine/core'
import { TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formulaOf, mathsText, rollMaths } from '../domain/roll'
import { useRollResult } from './dice-context'
import { useDiceMode } from './use-dice-mode'
import { useRollName } from './roll-name'
import './dice.css'

/**
 * RYT-133: the roll that just happened, where the Player is looking: under the abilities on the
 * sheet, or at the foot of the open block (skills, attacks), so it never hides behind a sheet. It
 * shows the dice, the modifier and the total, says whether the table has it, and who reads it. A
 * failed save keeps the roll and offers to try again with the same request.
 */
export function RollResultSlot({
  where,
  campaignId,
}: {
  where: 'page' | 'sheet'
  campaignId: string
}) {
  const { t } = useTranslation()
  const shared = useRollResult()
  const { visibility } = useDiceMode(campaignId)
  const rollName = useRollName()
  const alert = useRef<HTMLDivElement>(null)
  const result = shared?.result ?? null
  const failedSeq = result?.phase === 'failed' ? result.seq : 0
  useEffect(() => {
    if (failedSeq) alert.current?.focus()
  }, [failedSeq])
  if (!shared || !result) return null
  const { spec } = result
  const name = rollName(spec.kind, spec.label)
  const formula = formulaOf(spec.expression)
  const maths = result.phase === 'rolling' ? null : rollMaths(spec.expression, result.dice)
  const spoken =
    result.phase === 'rolling'
      ? t('roll.rolling', { name, formula })
      : maths
        ? t('roll.spoken', { name, maths: mathsText(maths), total: result.total })
        : t('roll.spokenTotal', { name, total: result.total })
  return (
    <section
      className="roll-result"
      data-where={where}
      data-phase={result.phase}
      aria-label={t('roll.resultLabel')}
    >
      <p className="visually-hidden" role="status">
        {spoken}
      </p>
      <div className="roll-result-main" aria-hidden="true">
        <span className="roll-result-total">
          {result.phase === 'rolling' ? <Loader size={22} /> : result.total}
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
            {result.phase === 'saving' && t('roll.saving')}
            {result.phase === 'saved' && t(`roll.saved.${visibility}`)}
            {result.phase === 'failed' && t('roll.notSaved')}
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
          {t(
            `roll.error.${
              result.reason === 'forbidden' ||
              result.reason === 'invalid' ||
              result.reason === 'character-unavailable' ||
              result.reason === 'roll-limit' ||
              result.reason === 'request-mismatch'
                ? result.reason
                : 'unavailable'
            }`,
          )}
          <div className="roll-result-retry">
            <Button size="sm" variant="default" onClick={shared.retry}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      )}
    </section>
  )
}
