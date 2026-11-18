import { useEffect, useId, useRef, useState } from 'react'
import { ActionIcon, Button, TextInput } from '@mantine/core'
import { Dices, Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DiceModeChoice,
  attemptFor,
  failureReason,
  hitDiceExpression,
  useAppRoll,
  useDiceMode,
  type Attempt,
} from '@/features/dice'
import { newRequestId } from '@/shared/lib/request-id'
import { rollValid, shortRestHeal, type DiceChoice } from '../domain/rest'

/**
 * RYT-080/082: how many hit dice a character spends on a short rest and what they rolled. The
 * Player types the physical dice total or lets Rytta roll 3D dice; CON is added per die.
 */
export function DiceChooser({
  campaignId,
  characterId,
  die,
  left,
  conMod,
  value,
  room,
  showError = false,
  onChange,
}: {
  campaignId: string
  /** The character that rests; its hit dice rolls are recorded with dice in the app. */
  characterId: string
  die: number
  left: number
  conMod: number
  value: DiceChoice
  /** Hit points the character can still get back (max minus current): more is lost. */
  room?: number
  /** A vote was refused for this roll: show the error on the field and move focus to it. */
  showError?: boolean
  onChange: (next: DiceChoice) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [rolling, setRolling] = useState(false)
  /** Each die of the last Rytta roll, shown in the dock once the dice leave the screen. */
  const [dice, setDice] = useState<{ values: number[]; roll: string } | null>(null)
  const rollInput = useRef<HTMLInputElement>(null)
  // RYT-133: the table's dice mode decides. Physical dice are typed in; dice in the app are rolled
  // here and the total is not typed, so the short rest behaves like initiative and the sheet.
  const { behaviour } = useDiceMode(campaignId)
  const appDice = behaviour === 'app'
  const appRoll = useAppRoll(campaignId)
  const attempt = useRef<Attempt | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const valid = rollValid(value, die)
  useEffect(() => {
    if (showError) rollInput.current?.focus()
  }, [showError])
  const roll = Number(value.roll)
  const heal = valid && value.spent > 0 ? shortRestHeal(value.spent, roll, conMod) : 0
  const con = conMod >= 0 ? `+${conMod}` : `−${Math.abs(conMod)}`
  // One roll per rest: once Rytta has rolled the hit dice the count and the roll are final.
  const rolledAlready =
    appDice && dice !== null && value.roll === dice.roll && value.spent === dice.values.length
  const step = (delta: number) => {
    if (rolledAlready) return
    const spent = Math.min(left, Math.max(0, value.spent + delta))
    if (spent !== value.spent) onChange({ spent, roll: spent === 0 ? '' : value.roll })
  }
  const autoRoll = async () => {
    if (rolling || value.spent === 0 || die === 0) return
    const expression = hitDiceExpression(value.spent, die, conMod)
    if (!expression) return
    setRolling(true)
    setFailure(null)
    // The server rolls and its dice are the only ones: a failure stops here, and the retry repeats
    // the same request so a roll that was made is returned, not made again.
    attempt.current = attemptFor(attempt.current, expression, newRequestId)
    try {
      const stored = await appRoll(
        { kind: 'hit_die', label: 'hit_die', expression },
        characterId,
        attempt.current.id,
      )
      attempt.current = null
      const total = String(stored.dice.reduce((sum, item) => sum + item, 0))
      setDice({ values: stored.dice, roll: total })
      onChange({ spent: value.spent, roll: total })
    } catch (error) {
      setFailure(failureReason(error))
    } finally {
      setRolling(false)
    }
  }
  return (
    <fieldset className="rest-dice">
      <legend className="rest-dice-title">{t('rest.diceTitle', { die, left })}</legend>
      <DiceModeChoice campaignId={campaignId} />
      <div className="rest-dice-row">
        <div className="rest-stepper" role="group" aria-label={t('rest.diceCount')}>
          <ActionIcon
            variant="default"
            size={44}
            aria-label={t('rest.diceFewer')}
            aria-disabled={value.spent <= 0 || rolledAlready || undefined}
            onClick={() => step(-1)}
          >
            <Minus size={18} aria-hidden="true" />
          </ActionIcon>
          <span className="rest-stepper-value" aria-live="polite" aria-atomic="true">
            {value.spent}
          </span>
          <ActionIcon
            variant="default"
            size={44}
            aria-label={t('rest.diceMore')}
            aria-disabled={value.spent >= left || rolledAlready || undefined}
            onClick={() => step(1)}
          >
            <Plus size={18} aria-hidden="true" />
          </ActionIcon>
        </div>
        {value.spent > 0 && appDice && (
          <div className="rest-roll-result">
            <span className="rest-roll-result-label">{t('rest.rollResult')}</span>
            <output className="rest-roll-result-value" data-rolled={rolledAlready || undefined}>
              {rolledAlready ? value.roll : t('rest.notRolled')}
            </output>
          </div>
        )}
        {value.spent > 0 && !appDice && (
          <TextInput
            id={`${id}-roll`}
            className="rest-roll"
            label={t('rest.roll')}
            inputMode="numeric"
            autoComplete="off"
            value={value.roll}
            onChange={(event) =>
              onChange({
                spent: value.spent,
                roll: event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 3),
              })
            }
            description={t('rest.rollHint', {
              count: value.spent,
              min: value.spent,
              max: value.spent * die,
            })}
            ref={rollInput}
            error={(value.roll !== '' || showError) && !valid ? t('rest.error.dice') : undefined}
          />
        )}
      </div>
      {value.spent > 0 && appDice && rolledAlready && (
        <p className="rest-dice-note">{t('rest.alreadyRolled', { roll: value.roll })}</p>
      )}
      {value.spent > 0 && appDice && !rolledAlready && (
        <Button
          variant="default"
          className="rest-autoroll"
          leftSection={<Dices size={20} aria-hidden="true" />}
          aria-busy={rolling || undefined}
          aria-disabled={rolling || undefined}
          aria-describedby={`${id}-sum`}
          onClick={() => void autoRoll()}
        >
          {rolling ? t('rest.rolling') : failure ? t('common.retry') : t('rest.autoRoll')}
        </Button>
      )}
      {failure && (
        <p className="rest-dice-error" role="alert">
          {failure === 'dice-mode' ? t('roll.error.dice-mode') : t('rest.rollFailed')}
        </p>
      )}
      <p className="rest-dice-sum" id={`${id}-sum`} role="status">
        {dice && value.spent === dice.values.length && value.roll === dice.roll && (
          <span className="rest-dice-faces">
            {`${t('rest.rolledDice', { dice: dice.values.join(' + ') })}. ${t('roll.source.app')}.`}
          </span>
        )}
        {value.spent === 0 ? t('rest.noDice') : valid ? t('rest.heal', { roll, con, heal }) : null}
        {/* RYT-126 J4-23: a die that heals past the maximum is spent for nothing: say so. */}
        {valid && room !== undefined && heal > room && (
          <span className="rest-overheal">{t('rest.overheal', { room: Math.max(0, room) })}</span>
        )}
      </p>
    </fieldset>
  )
}
