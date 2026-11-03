import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button, NumberInput, Text } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { initiativeBonus, sheetQuery } from '@/features/characters'
import { isInitiativeTotal, type Combatant } from '../domain/combat'
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
          <Text component="h3" id={titleId} tabIndex={-1} className="combat-entry-title">
            {t('combat.initiative.yours')}
          </Text>
          <div className="combat-d20">
            <D20 />
            <NumberInput
              hideControls
              variant="unstyled"
              aria-label={t('combat.initiative.totalFor', { name: combatant.name })}
              min={-20}
              max={99}
              allowDecimal={false}
              inputMode="numeric"
              placeholder="?"
              value={amount}
              onChange={setAmount}
              className="combat-d20-input"
            />
          </div>
          <Text className="combat-entry-formula">
            {bonus === null
              ? t('combat.initiative.rollPlain')
              : t('combat.initiative.roll', { bonus: bonus >= 0 ? `+ ${bonus}` : `− ${-bonus}` })}
          </Text>
        </div>
        <div className="combat-entry-keys">
          <InitiativeKeypad onChange={setAmount} />
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
function D20() {
  return (
    <svg className="combat-d20-shape" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <polygon className="combat-d20-outline" points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5" />
      <polygon className="combat-d20-face" points="50,24 77,70 23,70" />
      <path
        className="combat-d20-edges"
        d="M50 3 50 24M9 26.5 50 24 91 26.5M9 26.5 23 70M91 26.5 77 70M9 73.5 23 70 50 97 77 70 91 73.5"
      />
    </svg>
  )
}
