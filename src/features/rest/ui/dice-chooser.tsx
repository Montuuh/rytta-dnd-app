import { useEffect, useId, useRef, useState } from 'react'
import { ActionIcon, Button, TextInput } from '@mantine/core'
import { Dices, Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { rollDice, type DieSides } from '@/shared/ui/dice/roll-dice'
import { rollValid, shortRestHeal, type DiceChoice } from '../domain/rest'

/**
 * RYT-080/082: how many hit dice a character spends on a short rest and what they rolled. The
 * Player types the physical dice total or lets Rytta roll 3D dice; CON is added per die.
 */
export function DiceChooser({
  die,
  left,
  conMod,
  value,
  showError = false,
  onChange,
}: {
  die: number
  left: number
  conMod: number
  value: DiceChoice
  /** A vote was refused for this roll: show the error on the field and move focus to it. */
  showError?: boolean
  onChange: (next: DiceChoice) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [rolling, setRolling] = useState(false)
  const rollInput = useRef<HTMLInputElement>(null)
  const valid = rollValid(value, die)
  useEffect(() => {
    if (showError) rollInput.current?.focus()
  }, [showError])
  const roll = Number(value.roll)
  const heal = valid && value.spent > 0 ? shortRestHeal(value.spent, roll, conMod) : 0
  const con = conMod >= 0 ? `+${conMod}` : `−${Math.abs(conMod)}`
  const step = (delta: number) => {
    const spent = Math.min(left, Math.max(0, value.spent + delta))
    if (spent !== value.spent) onChange({ spent, roll: spent === 0 ? '' : value.roll })
  }
  const autoRoll = async () => {
    if (rolling || value.spent === 0 || die === 0) return
    setRolling(true)
    try {
      const values = await rollDice(value.spent, die as DieSides)
      onChange({ spent: value.spent, roll: String(values.reduce((sum, item) => sum + item, 0)) })
    } finally {
      setRolling(false)
    }
  }
  return (
    <fieldset className="rest-dice">
      <legend className="rest-dice-title">{t('rest.diceTitle', { die, left })}</legend>
      <div className="rest-dice-row">
        <div className="rest-stepper" role="group" aria-label={t('rest.diceCount')}>
          <ActionIcon
            variant="default"
            size={44}
            aria-label={t('rest.diceFewer')}
            aria-disabled={value.spent <= 0 || undefined}
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
            aria-disabled={value.spent >= left || undefined}
            onClick={() => step(1)}
          >
            <Plus size={18} aria-hidden="true" />
          </ActionIcon>
        </div>
        {value.spent > 0 && (
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
      {value.spent > 0 && (
        <Button
          variant="default"
          className="rest-autoroll"
          leftSection={<Dices size={20} aria-hidden="true" />}
          aria-busy={rolling || undefined}
          aria-disabled={rolling || undefined}
          aria-describedby={`${id}-sum`}
          onClick={() => void autoRoll()}
        >
          {rolling ? t('rest.rolling') : t('rest.autoRoll')}
        </Button>
      )}
      <p className="rest-dice-sum" id={`${id}-sum`} role="status">
        {value.spent === 0 ? t('rest.noDice') : valid ? t('rest.heal', { roll, con, heal }) : null}
      </p>
    </fieldset>
  )
}
