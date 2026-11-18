import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button, NumberInput, Text } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { Check, Dices } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { initiativeBonus, sheetQuery } from '@/features/characters'
import { DiceModeChoice, checkSpec, useDiceMode, useQuietRollLog } from '@/features/dice'
import { rollDice } from '@/shared/ui/dice/roll-dice'
import { initiativeOutlier, isInitiativeTotal, type Combatant } from '../domain/combat'
import { InitiativeKeypad } from './amount-dialog'

/**
 * RYT-042: the Player's own row in the table view opens into this entry while initiative is
 * collected. The total sits on a d20 face; the keypad avoids the phone keyboard and the field
 * still accepts typing. The sheet's initiative bonus is sent as the tiebreak (as before).
 */
export function InitiativeEntry({
  campaignId,
  combatant,
  editing,
  pending,
  save,
  cancel,
}: {
  campaignId: string
  combatant: Combatant
  /** Reopened over a saved total: Escape and Cancel keep that total. */
  editing: boolean
  pending: boolean
  save: (total: number, bonus: number | null) => void
  cancel: () => void
}) {
  const { t } = useTranslation()
  const { state: auth } = useAuth()
  const titleId = useId()
  const sheet = useQuery({
    ...sheetQuery(auth.user!.id, campaignId, combatant.character_id ?? 'none'),
    enabled: Boolean(combatant.character_id),
  })
  const build = sheet.data?.sheet.build
  const bonus = build ? initiativeBonus(build) : null
  const [amount, setAmount] = useState<number | string>(combatant.initiative ?? '')
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = isInitiativeTotal(value)
  const outOfRange = typeof amount === 'number' && !valid
  // RYT-126 J4-10: a total no d20 + bonus can reach is probably a slip: warned, never blocked.
  const unusual = valid && initiativeOutlier(value, bonus)
  const [rolling, setRolling] = useState(false)
  const [rolled, setRolled] = useState('')
  // RYT-133: the table's dice mode decides: physical dice are typed in, dice in the app are rolled
  // here and nothing is typed, so initiative never behaves unlike the sheet and the short rest.
  const { behaviour } = useDiceMode(campaignId)
  const appDice = behaviour === 'app'
  const logRoll = useQuietRollLog(campaignId, combatant.character_id ?? null)
  const rollForMe = async () => {
    if (rolling) return
    setRolling(true)
    try {
      const [die = 1] = await rollDice(1, 20)
      const modifier = bonus ?? 0
      const spec = checkSpec('initiative', 'initiative', modifier)
      if (spec) logRoll(spec, [die])
      setAmount(die + modifier)
      setRolled(
        t('combat.initiative.rolled', {
          die,
          bonus: modifier >= 0 ? `+ ${modifier}` : `− ${-modifier}`,
          total: die + modifier,
        }),
      )
    } finally {
      setRolling(false)
    }
  }
  const hintId = useId()
  // React leaves the attribute alone afterwards: Mantine's own value stays undefined.
  const describe = useCallback(
    (input: HTMLInputElement | null) => input?.setAttribute('aria-describedby', hintId),
    [hintId],
  )
  // Bring the whole entry into view once when it opens, above the phone's bottom bar. Focus is not
  // moved into the field (that would raise the phone keyboard over the keypad); a reopened entry
  // focuses its heading instead (the table view does that).
  const ref = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()
  const [smooth] = useState(!reduceMotion)
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' })
  }, [smooth])
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    if (editing) cancel()
    else setAmount('')
  }
  return (
    <section
      ref={ref}
      className="combat-entry"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      data-entry-for={combatant.id}
    >
      <form
        className="combat-entry-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid && !pending) save(value, bonus)
        }}
      >
        <div className="combat-entry-face">
          <DiceModeChoice campaignId={campaignId} />
          <Text component="h3" id={titleId} tabIndex={-1} className="combat-entry-title">
            {t('combat.initiative.yours')}
          </Text>
          <div className="combat-d20">
            <D20 />
            <NumberInput
              hideControls
              variant="unstyled"
              aria-label={t('combat.initiative.totalFor', { name: combatant.name })}
              // A boolean error marks the field invalid (aria-invalid) without Mantine's message;
              // the explanation is the hint under the die. Mantine replaces aria-describedby with
              // its own (empty) list, so the hint is linked on the element itself (RYT-042 R2-1).
              error={outOfRange}
              ref={describe}
              min={-20}
              max={99}
              // Out-of-range totals stay as typed and are explained below (RYT-042 F5).
              clampBehavior="none"
              allowDecimal={false}
              readOnly={appDice}
              inputMode={appDice ? 'none' : 'numeric'}
              placeholder="?"
              value={amount}
              onChange={setAmount}
              className="combat-d20-input"
              data-length={String(amount).length > 2 ? 'long' : undefined}
            />
          </div>
          <Text
            id={hintId}
            className={`combat-entry-formula${outOfRange ? ' is-invalid' : unusual ? ' is-unusual' : ''}`}
            aria-live="polite"
          >
            {outOfRange
              ? t('combat.initiative.range')
              : unusual
                ? t('combat.initiative.unusual', {
                    bonus: bonus! >= 0 ? `+ ${bonus}` : `− ${-bonus!}`,
                    min: bonus! + 1,
                    max: bonus! + 20,
                  })
                : rolled
                  ? rolled
                  : bonus === null
                    ? t('combat.initiative.rollPlain')
                    : t('combat.initiative.roll', {
                        bonus: bonus >= 0 ? `+ ${bonus}` : `− ${-bonus}`,
                      })}
          </Text>
        </div>
        <div className="combat-entry-keys">
          {appDice && (
            <Button
              variant="default"
              size="lg"
              className="combat-entry-roll"
              leftSection={<Dices size={20} aria-hidden="true" />}
              aria-disabled={rolling || undefined}
              aria-busy={rolling || undefined}
              onClick={() => void rollForMe()}
            >
              {t('combat.initiative.rollForMe')}
            </Button>
          )}
          {!appDice && (
            <InitiativeKeypad
              onChange={(next) => {
                setRolled('')
                setAmount(next)
              }}
            />
          )}
          <div className="combat-entry-actions">
            {editing && (
              <Button variant="subtle" size="lg" onClick={cancel}>
                {t('action.cancel')}
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              leftSection={<Check size={20} aria-hidden="true" />}
              disabled={!valid}
              loading={pending}
            >
              {t('combat.initiative.save')}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}

/** A d20 seen face-on: a hexagon around one triangular face. Decorative. */
export function D20() {
  return (
    <svg className="combat-d20-shape" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <polygon className="combat-d20-outline" points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5" />
      {/* A large face so a three-character total fits inside it. */}
      <polygon className="combat-d20-face" points="50,16 85,76 15,76" />
      <path
        className="combat-d20-edges"
        d="M50 3 50 16M9 26.5 50 16 91 26.5M9 26.5 15 76M91 26.5 85 76M9 73.5 15 76 50 97 85 76 91 73.5"
      />
    </svg>
  )
}
