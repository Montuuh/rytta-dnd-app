import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button, NumberInput, Text } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { Check, Dices } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { initiativeBonus, sheetQuery } from '@/features/characters'
import {
  DiceModeChoice,
  attemptFor,
  failureReason,
  initiativeExpression,
  useAppRoll,
  useDiceMode,
  useRollContext,
  type Attempt,
} from '@/features/dice'
import { newRequestId } from '@/shared/lib/request-id'
import {
  initiativeOutlier,
  initiativeRollState,
  isInitiativeTotal,
  type Combatant,
} from '../domain/combat'
import { InitiativeKeypad } from './amount-dialog'

/**
 * RYT-042: the Player's own row in the table view opens into this entry while initiative is
 * collected. The total sits on a d20 face; the keypad avoids the phone keyboard and the field
 * still accepts typing. The sheet's initiative bonus is sent as the tiebreak (as before).
 */
export function InitiativeEntry({
  campaignId,
  combatant,
  encounterId,
  editing,
  pending,
  save,
  cancel,
}: {
  campaignId: string
  combatant: Combatant
  /** The fight this entry belongs to: the server's one-roll state must name the same one. */
  encounterId: string
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
  const [typed, setAmount] = useState<number | string>(combatant.initiative ?? '')
  const [rolling, setRolling] = useState(false)
  const [rolled, setRolled] = useState('')
  // RYT-133: the table's dice mode decides: physical dice are typed in, dice in the app are rolled
  // here and nothing is typed, so initiative never behaves unlike the sheet and the short rest.
  const { behaviour } = useDiceMode(campaignId)
  const appDice = behaviour === 'app'
  const appRoll = useAppRoll(campaignId)
  const attempt = useRef<Attempt | null>(null)
  const [rollFailure, setRollFailure] = useState<string | null>(null)
  const [rolledTotal, setRolledTotal] = useState<number | null>(null)
  // One roll per fight, and the server decides: its one-roll state says whether this character
  // has rolled (also after a reload or on another device). Once it has, the Player cannot roll
  // again, only save that total; the DM clears or re-rolls it from the console.
  const context = useRollContext(campaignId, { enabled: appDice, expectEncounter: encounterId })
  const characterId = combatant.character_id ?? null
  const spent = appDice && context.spent(characterId, 'initiative')
  const logged = appDice ? context.roll(characterId, 'initiative') : undefined
  // What the combat state saved always wins over the server's roll (the DM may have changed it).
  // The total rolled on this screen counts only while the server's state cannot be read: once it
  // can, a roll the DM cleared is gone whatever this screen remembers.
  const remembered = context.status === 'ready' ? null : rolledTotal
  const standing = initiativeRollState(combatant.initiative, logged?.total ?? remembered ?? null)
  // Spent without a total to show: the DM made the roll and this account may not read it.
  const rolledHidden = spent && standing.kind === 'none'
  const rolledAlready = appDice && (standing.kind !== 'none' || rolledHidden)
  const settled = standing.kind === 'saved' || standing.kind === 'set'
  const logLoading = appDice && !rolledAlready && context.status === 'loading'
  const logFailed = appDice && !rolledAlready && context.status === 'failed'
  // The DM cleared or re-rolled this initiative (or the fight moved on): read the state again, so
  // a cleared Player is offered a roll without waiting for the next poll.
  const seenInitiative = useRef(combatant.initiative)
  const { refresh } = context
  useEffect(() => {
    if (seenInitiative.current === combatant.initiative) return
    seenInitiative.current = combatant.initiative
    setRolledTotal(null)
    setRolled('')
    void refresh()
  }, [combatant.initiative, refresh])
  // What the d20 shows: with dice in the app the standing total, else what was typed.
  // With dice in the app nothing is typed: the d20 shows only the standing roll or the saved
  // total, and is empty once the server no longer holds a roll (a DM clear), never an old total.
  const amount: number | string = appDice ? (standing.kind === 'none' ? '' : standing.total) : typed
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = isInitiativeTotal(value)
  const outOfRange = typeof amount === 'number' && !valid
  // RYT-126 J4-10: a total no d20 + bonus can reach is probably a slip: warned, never blocked.
  const unusual = valid && initiativeOutlier(value, bonus)
  // Dice in the app roll d20 plus the sheet's bonus: without the bonus there is nothing to roll.
  const needsSheet = appDice && !rolledAlready && bonus === null
  const badBonus =
    appDice && !rolledAlready && bonus !== null && initiativeExpression(bonus) === null
  const rollForMe = async () => {
    if (rolling || bonus === null) return
    // The server only rolls d20 with a bonus from -20 to +30: nothing is sent for another one.
    const expression = initiativeExpression(bonus)
    if (!expression) return
    const spec = { kind: 'initiative' as const, label: 'initiative', expression }
    setRolling(true)
    setRollFailure(null)
    // The server rolls and its dice and total are the only ones: a failure stops here, and the
    // retry repeats the same request so a roll that was made is returned, not made again.
    attempt.current = attemptFor(attempt.current, spec.expression, newRequestId)
    try {
      const roll = await appRoll(spec, combatant.character_id ?? null, attempt.current.id)
      attempt.current = null
      setRolledTotal(roll.total)
      setRolled(
        `${t('combat.initiative.rolled', {
          die: roll.dice[0] ?? 0,
          bonus: bonus >= 0 ? `+ ${bonus}` : `− ${-bonus}`,
          total: roll.total,
        })}. ${t('roll.source.app')}.`,
      )
    } catch (error) {
      setRollFailure(failureReason(error))
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
            {rollFailure
              ? rollFailure === 'dice-mode'
                ? t('roll.error.dice-mode')
                : rollFailure === 'already-rolled'
                  ? t('combat.initiative.refusedAlready')
                  : rollFailure === 'invalid'
                    ? t('combat.initiative.refusedInvalid')
                    : t('combat.initiative.rollFailed')
              : badBonus
                ? t('combat.initiative.bonusRange', {
                    bonus: bonus! > 0 ? `+${bonus}` : `${bonus}`,
                  })
                : needsSheet
                  ? sheet.isPending
                    ? t('combat.initiative.waitSheet')
                    : t('combat.initiative.noSheet')
                  : outOfRange
                    ? t('combat.initiative.range')
                    : unusual
                      ? t('combat.initiative.unusual', {
                          bonus: bonus! >= 0 ? `+ ${bonus}` : `− ${-bonus!}`,
                          min: bonus! + 1,
                          max: bonus! + 20,
                        })
                      : rolled && standing.kind !== 'none'
                        ? rolled
                        : rolledAlready
                          ? // Nothing is left to roll: no instruction to roll.
                            ''
                          : bonus === null
                            ? t('combat.initiative.rollPlain')
                            : t(appDice ? 'combat.initiative.rollApp' : 'combat.initiative.roll', {
                                bonus: bonus >= 0 ? `+ ${bonus}` : `− ${-bonus}`,
                              })}
          </Text>
        </div>
        <div className="combat-entry-keys">
          {rolledAlready && (
            <p className="combat-entry-note" role="status">
              {standing.kind === 'none'
                ? t('combat.initiative.rolledHidden')
                : standing.kind === 'unsaved'
                  ? t('combat.initiative.rolledUnsaved', { total: standing.total })
                  : standing.kind === 'saved'
                    ? t('combat.initiative.alreadyRolled', { total: standing.total })
                    : t('combat.initiative.fixed', { total: standing.total })}
            </p>
          )}
          {logFailed && (
            <p className="combat-entry-note" role="alert">
              {t('combat.initiative.logFailed')}{' '}
              <Button variant="subtle" onClick={context.retry}>
                {t('common.retry')}
              </Button>
            </p>
          )}
          {appDice && !rolledAlready && (
            <Button
              variant="default"
              size="lg"
              className="combat-entry-roll"
              leftSection={<Dices size={20} aria-hidden="true" />}
              aria-disabled={rolling || needsSheet || badBonus || logLoading || undefined}
              aria-busy={rolling || logLoading || undefined}
              onClick={() => {
                if (badBonus) return
                if (needsSheet) {
                  if (sheet.isError) void sheet.refetch()
                  return
                }
                void rollForMe()
              }}
            >
              {logLoading
                ? t('combat.initiative.checking')
                : rollFailure || (needsSheet && sheet.isError)
                  ? t('common.retry')
                  : t('combat.initiative.rollForMe')}
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
            {editing && !settled && (
              <Button variant="subtle" size="lg" onClick={cancel}>
                {t('action.cancel')}
              </Button>
            )}
            {editing && settled ? (
              // A total that is already saved (rolled, or set by the DM) cannot be saved again: the
              // way out says so instead of a disabled "Save".
              <Button type="button" size="lg" onClick={cancel}>
                {t('panel.close')}
              </Button>
            ) : rolledHidden ? null : (
              <Button
                type="submit"
                size="lg"
                leftSection={<Check size={20} aria-hidden="true" />}
                disabled={!valid || settled}
                loading={pending}
              >
                {t('combat.initiative.save')}
              </Button>
            )}
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
