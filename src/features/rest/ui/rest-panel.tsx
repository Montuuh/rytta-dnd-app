import { useCallback, useEffect, useRef, useState } from 'react'
import { Accordion, Alert, Button, Modal } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { Ban, Check, Hourglass, Moon, Sunset, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CharacterPortrait, useCampaignPortraits } from '@/features/inventory'
import { useRestAction } from '../api'
import {
  minutesLeft,
  rollValid,
  shortRestHeal,
  tally,
  voteMark,
  type DiceChoice,
  type RestParticipant,
  type RestState,
} from '../domain/rest'
import { Campfire } from './campfire'
import { DiceChooser } from './dice-chooser'
import { RecoveryLines } from './recovery'
import { isEmptyRecovery, useEffectView, type RecoveryView } from './recovery-view'
import './rest.css'

/** Minutes left refresh every 20 s while the panel is open. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    // Fresh as soon as the panel opens (it stays mounted while closed), then every 20 s.
    const first = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [active])
  return now
}

const listFormat = (language: string, names: string[]) => {
  try {
    return new Intl.ListFormat(language, { type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}

/**
 * RYT-080 group rest panel, direction "Hoguera" (ADR 037): the table around the fire with each
 * vote, what every character gets back, the short-rest dice and the vote or DM actions.
 */
export function RestPanel({
  opened,
  state,
  campaignId,
  onClose,
}: {
  opened: boolean
  state: RestState
  campaignId: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const phone = useMediaQuery('(max-width: 36em)')
  const action = useRestAction(campaignId)
  const toView = useEffectView()
  const portraits = useCampaignPortraits(campaignId)
  const now = useNow(opened)
  const open = state.status === 'open'
  const short = state.kind === 'short'
  const count = tally(state)
  const [choices, setChoices] = useState<Record<string, DiceChoice>>({})
  const [diceError, setDiceError] = useState(false)
  const outcomeRef = useRef<HTMLDivElement>(null)
  // The dock's measured height pads the modal's scrolling so focus is never under it (R80-4).
  // A callback ref: the modal mounts its content after this component's effects run.
  const observer = useRef<ResizeObserver | null>(null)
  const dockRef = useCallback((dock: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    const content = dock?.closest<HTMLElement>('.rest-modal')
    if (!dock || !content) return
    const sync = () => content.style.setProperty('--rest-dock-h', `${dock.offsetHeight}px`)
    sync()
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(sync)
    observer.current.observe(dock)
  }, [])
  // A new request starts with fresh dice; a settled one moves focus to its outcome.
  const [seen, setSeen] = useState(state.id)
  if (seen !== state.id) {
    setSeen(state.id)
    setChoices({})
    setDiceError(false)
  }
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current && !open && opened) outcomeRef.current?.focus()
    wasOpen.current = open
  }, [open, opened])
  const choiceOf = (person: RestParticipant): DiceChoice =>
    choices[person.id] ?? {
      spent: person.dice_spent,
      roll: person.dice_roll != null ? String(person.dice_roll) : '',
    }
  // Own and DM-controlled characters preview the dice chosen here, before voting.
  const viewOf = (person: RestParticipant): RecoveryView | null => {
    if (!person.effect) return null
    const view = toView(person.effect)
    if (!open || !short || !person.controlled || !person.effect.can_rest) return view
    const choice = choiceOf(person)
    const effect = person.effect
    const heal = rollValid(choice, effect.hit_die)
      ? shortRestHeal(choice.spent, Number(choice.roll), effect.con_mod)
      : 0
    const after = Math.min(effect.max_hp, effect.hp_before + heal)
    return {
      ...view,
      hp:
        after > effect.hp_before
          ? { before: effect.hp_before, after, max: effect.max_hp }
          : undefined,
      dice:
        choice.spent > 0
          ? {
              before: effect.dice_left_before,
              after: effect.dice_left_before - choice.spent,
              die: effect.hit_die,
              spend: true,
            }
          : undefined,
    }
  }
  const vote = (person: RestParticipant, value: 'yes' | 'no') => {
    const choice = choiceOf(person)
    const die = person.effect?.hit_die ?? 0
    if (value === 'yes' && short && !rollValid(choice, die)) {
      setDiceError(true)
      return
    }
    setDiceError(false)
    const withDice = value === 'yes' && short
    action.mutate({
      kind: 'vote',
      requestId: state.id,
      characterId: person.id,
      vote: value,
      spent: withDice ? choice.spent : null,
      roll: withDice && choice.spent > 0 ? Number(choice.roll) : null,
    })
  }
  const mine = state.participants.find((person) => person.own && person.controlled)
  const waiting = listFormat(
    i18n.language,
    count.waiting.map((person) => (person.own ? t('rest.youInList') : person.name)),
  )
  const KindIcon = short ? Sunset : Moon
  const requested = state.requester_name
    ? t('rest.requestedBy', { name: state.requester_name })
    : t('rest.requestedByDm')
  const voteButtons = (person: RestParticipant) => {
    const choice = choiceOf(person)
    const changedDice =
      short &&
      person.vote === 'yes' &&
      (choice.spent !== person.dice_spent ||
        (choice.spent > 0 && Number(choice.roll) !== person.dice_roll))
    const busy = action.isPending
    return (
      <div
        className="rest-vote"
        role="group"
        aria-label={t('rest.votesFor', { name: person.name })}
      >
        <Button
          variant="default"
          className="rest-vote-no"
          leftSection={person.vote === 'no' ? <Check size={18} aria-hidden="true" /> : undefined}
          aria-pressed={person.vote === 'no'}
          aria-disabled={busy || undefined}
          onClick={() => !busy && vote(person, 'no')}
        >
          {t('rest.notNow')}
        </Button>
        <Button
          className="rest-vote-yes"
          leftSection={
            person.vote === 'yes' && !changedDice ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <KindIcon size={18} aria-hidden="true" />
            )
          }
          aria-pressed={person.vote === 'yes' && !changedDice}
          aria-disabled={busy || undefined}
          onClick={() => !busy && vote(person, 'yes')}
        >
          {changedDice ? t('rest.updateDice') : t('rest.rest')}
        </Button>
      </div>
    )
  }
  const block = (person: RestParticipant) => {
    const view = viewOf(person)
    const effect = person.effect
    return (
      <Accordion.Item key={person.id} value={person.id} className="rest-person">
        <Accordion.Control
          icon={
            <CharacterPortrait
              campaignId={campaignId}
              characterId={person.id}
              name={person.name}
              path={portraits.get(person.id) ?? null}
              size={36}
            />
          }
        >
          <span className="rest-person-name user-copy">
            {person.own
              ? t(open ? 'rest.yourRecovery' : person.rested ? 'rest.yourOutcome' : 'rest.you')
              : person.name}
          </span>
          {!open && (
            <span className="rest-person-vote" data-mark={person.rested ? 'yes' : 'wait'}>
              {t(
                person.own
                  ? person.rested
                    ? 'rest.outcome.youRested'
                    : 'rest.outcome.youNotRested'
                  : person.rested
                    ? 'rest.outcome.rested'
                    : 'rest.outcome.notRested',
              )}
            </span>
          )}
          {open && (
            <span className="rest-person-vote" data-mark={voteMark(person)}>
              {t(`rest.vote.${voteMark(person)}`)}
            </span>
          )}
        </Accordion.Control>
        <Accordion.Panel>
          {!open && !person.rested ? (
            <p className="rest-none">
              {t(person.own ? 'rest.outcome.yourUnchanged' : 'rest.outcome.unchanged')}
            </p>
          ) : person.can_rest === false || (effect && !effect.can_rest) ? (
            <p className="rest-none">{t('rest.cannotRest', { name: person.name })}</p>
          ) : !person.shares || !view ? (
            <p className="rest-none">{t('rest.private', { name: person.name })}</p>
          ) : open && short && person.controlled && isEmptyRecovery(view) ? null : (
            <RecoveryLines view={view} />
          )}
          {open && short && person.controlled && effect?.can_rest && (
            <DiceChooser
              die={effect.hit_die}
              left={effect.dice_left_before}
              conMod={effect.con_mod}
              value={choiceOf(person)}
              showError={diceError}
              onChange={(next) => {
                setDiceError(false)
                setChoices((current) => ({ ...current, [person.id]: next }))
              }}
            />
          )}
          {open && person.dm_controlled && person.controlled && person.can_rest !== false && (
            <div className="rest-dm-vote">{voteButtons(person)}</div>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    )
  }
  const closed = (
    <div
      className="rest-outcome"
      data-status={state.status}
      ref={outcomeRef}
      tabIndex={-1}
      role="status"
    >
      {state.status === 'done' ? (
        <Check className="rest-outcome-icon" size={22} aria-hidden="true" />
      ) : state.status === 'rejected' ? (
        <X className="rest-outcome-icon" size={22} aria-hidden="true" />
      ) : state.status === 'expired' ? (
        <Hourglass className="rest-outcome-icon" size={22} aria-hidden="true" />
      ) : (
        <Ban className="rest-outcome-icon" size={22} aria-hidden="true" />
      )}
      <div>
        <h2 className="rest-outcome-title">
          {t(
            state.status === 'done'
              ? 'rest.done.title'
              : state.status === 'rejected'
                ? 'rest.rejected.title'
                : state.status === 'expired'
                  ? 'rest.expired.title'
                  : 'rest.cancelled.title',
          )}
        </h2>
        <p>
          {state.status === 'rejected'
            ? t('rest.rejected.body', {
                names: listFormat(
                  i18n.language,
                  state.participants
                    .filter((person) => person.vote === 'no')
                    .map((person) => (person.own ? t('rest.youInList') : person.name)),
                ),
              })
            : t(
                state.status === 'done'
                  ? 'rest.done.body'
                  : state.status === 'expired'
                    ? 'rest.expired.body'
                    : 'rest.cancelled.body',
              )}
        </p>
      </div>
    </div>
  )
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen={phone}
      size="lg"
      title={t('rest.panelTitle')}
      closeButtonProps={{ 'aria-label': t('rest.close'), size: 44 }}
      classNames={{ body: 'rest-modal-body', content: phone ? 'rest-modal is-full' : 'rest-modal' }}
    >
      <div className="rest-panel">
        <div className="rest-head">
          <span className="rest-head-icon" aria-hidden="true">
            <KindIcon size={22} />
          </span>
          <div className="rest-head-text">
            <h2 className="rest-kind">{t(short ? 'rest.short' : 'rest.long')}</h2>
            <p className="rest-meta">
              {requested}
              {open && <> {t('rest.expiresIn', { count: minutesLeft(state, now) })}</>}
            </p>
          </div>
        </div>
        {action.isError && (
          <Alert color="red" role="alert">
            {t(`rest.error.${action.error.message}` as 'rest.error.unavailable', {
              defaultValue: t('rest.error.unavailable'),
            })}
          </Alert>
        )}
        {open ? (
          <>
            <Campfire
              campaignId={campaignId}
              participants={state.participants}
              yes={count.yes}
              total={count.total}
            />
            <p className="rest-waiting" role="status">
              <span className="visually-hidden">
                {t('rest.status', { yes: count.yes, total: count.total })}{' '}
              </span>
              {count.waiting.length > 0 && t('rest.waitingFor', { names: waiting })}
            </p>
          </>
        ) : (
          closed
        )}
        <Accordion
          multiple
          variant="separated"
          chevronSize={20}
          className="rest-people"
          defaultValue={state.participants
            .filter((person) => person.own || (person.dm_controlled && person.controlled))
            .map((person) => person.id)}
        >
          {state.participants.map(block)}
        </Accordion>
      </div>
      <div className="rest-dock" ref={dockRef}>
        {open && state.dm ? (
          <>
            <div className="rest-vote">
              {state.can_cancel && (
                <Button
                  variant="default"
                  className="panel-danger-button"
                  aria-disabled={action.isPending || undefined}
                  onClick={() =>
                    !action.isPending && action.mutate({ kind: 'cancel', requestId: state.id })
                  }
                >
                  {t('rest.cancelRequest')}
                </Button>
              )}
              <Button
                leftSection={<KindIcon size={18} aria-hidden="true" />}
                aria-disabled={action.isPending || undefined}
                onClick={() =>
                  !action.isPending && action.mutate({ kind: 'now', requestId: state.id })
                }
              >
                {t('rest.restNow')}
              </Button>
            </div>
            <p className="rest-dock-note">{t('rest.dmHint')}</p>
          </>
        ) : open && ((mine && mine.can_rest !== false) || (state.mine && state.can_cancel)) ? (
          <>
            {mine && mine.can_rest !== false && voteButtons(mine)}
            <p className="rest-dock-note">
              {state.mine ? t('rest.requesterHint') : t('rest.changeHint')}
            </p>
            {state.mine && state.can_cancel && (
              <Button
                variant="subtle"
                className="rest-cancel-link"
                aria-disabled={action.isPending || undefined}
                onClick={() =>
                  !action.isPending && action.mutate({ kind: 'cancel', requestId: state.id })
                }
              >
                {t('rest.cancelRequest')}
              </Button>
            )}
          </>
        ) : (
          <Button variant="default" onClick={onClose}>
            {t('rest.close')}
          </Button>
        )}
      </div>
    </Modal>
  )
}
