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
  useOwnRoll,
  attemptFor,
  checkSpec,
  failureReason,
  useAppRoll,
  useDiceMode,
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
  since,
  editing,
  pending,
  save,
  cancel,
}: {
  campaignId: string
  combatant: Combatant
  /** When the initiative phase opened (null when unknown): rolls since then count as this fight's. */
  since: string | null
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
  // One roll per fight, read from the Player's own roll log so it survives a reload or another
  // device: once Rytta has rolled it the Player cannot roll it again, only save that total; the DM
  // changes it from the console.
  const own = useOwnRoll(campaignId)
  const logged = appDice ? own.find(combatant.character_id ?? null, 'initiative', since) : undefined
  // What the combat state saved always wins over the roll log (the DM may have changed it).
  const standing = initiativeRollState(combatant.initiative, rolledTotal ?? logged?.total ?? null)
  const rolledAlready = appDice && standing.kind !== 'none'
  const settled = standing.kind === 'saved' || standing.kind === 'set'
  const logLoading = appDice && !rolledAlready && since !== null && own.status === 'loading'
  const logFailed = appDice && !rolledAlready && since !== null && own.status === 'failed'
  // What the d20 shows: with dice in the app the standing total, else what was typed.
  const amount: number | string = rolledAlready ? standing.total : typed
  const value = typeof amount === 'number' ? amount : Number.NaN
  const valid = isInitiativeTotal(value)
  const outOfRange = typeof amount === 'number' && !valid
  // RYT-126 J4-10: a total no d20 + bonus can reach is probably a slip: warned, never blocked.
  const unusual = valid && initiativeOutlier(value, bonus)
  // Dice in the app roll d20 plus the sheet's bonus: without the bonus there is nothing to roll.
  const needsSheet = appDice && !rolledAlready && bonus === null
  const rollForMe = async () => {
    if (rolling || bonus === null) return
    const spec = checkSpec('initiative', 'initiative', bonus)
    if (!spec) return
    setRolling(true)
    setRollFailure(null)
    // The server rolls and its dice and total are the only ones: a failure stops here, and the
    // retry repeats the same request so a roll that was made is returned, not made again.
    attempt.current = attemptFor(attempt.current, spec.expression, newRequestId)
    try {
      const roll = await appRoll(spec, combatant.character_id ?? null, attempt.current.id)
      attempt.current = null
      setAmount(roll.total)
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
                : t('combat.initiative.rollFailed')
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
                    : rolled
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
              {standing.kind === 'unsaved'
                ? t('combat.initiative.rolledUnsaved', { total: standing.total })
                : standing.kind === 'saved'
                  ? t('combat.initiative.alreadyRolled', { total: standing.total })
                  : t('combat.initiative.fixed', { total: standing.total })}
            </p>
          )}
          {logFailed && (
            <p className="combat-entry-note" role="alert">
              {t('combat.initiative.logFailed')}{' '}
              <Button variant="subtle" onClick={own.retry}>
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
              aria-disabled={rolling || needsSheet || logLoading || undefined}
              aria-busy={rolling || logLoading || undefined}
              onClick={() => {
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
            ) : (
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
