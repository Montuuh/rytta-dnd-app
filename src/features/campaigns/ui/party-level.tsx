import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Loader, Text } from '@mantine/core'
import { ChevronDown, ChevronUp, Minus, Plus, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useLongPress } from '@/shared/ui/use-long-press'
import { useSetPartyLevel } from '../api'
import {
  createPartyRequestIds,
  orderPartyCharacters,
  partyStanding,
  raiseTarget,
  type PartyCharacter,
} from '../domain/party-level'
import { CampaignSettingsError } from '../domain/settings'
import './party-level.css'
import './settings-panels.css'

const minLevel = 1
const maxLevel = 20
const raiseRestMs = 1200

/** What the status line under the actions says after a save. `from` is the level to go back to. */
type Notice =
  | { kind: 'set'; level: number | null; from: number | null }
  | { kind: 'back'; level: number | null }

/**
 * RYT-130, RYT-180: the DM sets the party level here. Players whose finished character is below it
 * get the guided level-up on their sheet; no sheet changes until its Player confirms. A change
 * saves at once and leaves a status line with Undo; there is no confirmation. Every change and
 * every Undo is one idempotent request: retrying after a failure repeats the same request id, so
 * the level is never applied twice.
 */
export function PartyLevelControl({
  campaignId,
  current,
  suggested,
  characters,
  charactersFeedback,
  focusStepper,
  onStepperFocused,
}: {
  campaignId: string
  /** The level the campaign holds; null when the DM has not set one. */
  current: number | null
  /** Where the level starts while none is set: the highest level among finished sheets. */
  suggested?: number
  /** The party's characters, once the page has loaded them. */
  characters?: PartyCharacter[]
  /** Loading or failure of the characters, shown in the list's place. */
  charactersFeedback?: ReactNode
  /** `?do=set`: open "Another level" and focus its stepper once. */
  focusStepper?: boolean
  onStepperFocused?: () => void
}) {
  const { t, i18n } = useTranslation()
  const mutation = useSetPartyLevel(campaignId)
  const [edited, setEdited] = useState<number | null>(null)
  const [more, setMore] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [attempt, setAttempt] = useState<{ target: number | null; undo: boolean } | null>(null)
  const ids = useRef(createPartyRequestIds(newRequestId))
  const alert = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const raiseButton = useRef<HTMLButtonElement>(null)
  // After a save the raise action reads the next level under the same finger: it rests for a
  // moment, so a double tap is one level and not two.
  const rest = useRef(false)
  const [resting, setResting] = useState(false)
  useEffect(() => {
    if (!resting) return
    const timer = window.setTimeout(() => {
      rest.current = false
      setResting(false)
    }, raiseRestMs)
    return () => window.clearTimeout(timer)
  }, [resting])
  const start = current ?? suggested ?? minLevel
  const shown = edited ?? start
  const changed = shown !== current
  const pending = mutation.isPending
  const raiseTo = raiseTarget(current, suggested, maxLevel)
  const standing = characters ? partyStanding(characters) : null

  const move = (delta: number) => {
    setEdited((value) => {
      const next = Math.min(maxLevel, Math.max(minLevel, (value ?? start) + delta))
      return next === current ? null : next
    })
  }
  const lower = useLongPress(
    () => move(-1),
    () => move(-5),
  )
  const raise = useLongPress(
    () => move(1),
    () => move(5),
  )

  // One change, one request. The id belongs to the move from the level held now to the level
  // asked for, so a retry repeats it and a later request never replays an older answer.
  const run = (target: number | null, undo = false) => {
    if (mutation.isPending) return
    const from = current
    setNotice(null)
    setAttempt({ target, undo })
    mutation.mutate(
      { level: target, requestId: ids.current.idFor(from, target) },
      {
        onSuccess: () => {
          ids.current.done(from, target)
          setEdited(null)
          setAttempt(null)
          if (!undo) {
            rest.current = true
            setResting(true)
          }
          setNotice(undo ? { kind: 'back', level: target } : { kind: 'set', level: target, from })
        },
      },
    )
  }

  // The reason is where the keyboard is: focus moves to it, the retry is the next stop.
  const failedAt = mutation.isError ? mutation.submittedAt : 0
  useEffect(() => {
    if (failedAt) alert.current?.focus()
  }, [failedAt])

  // The control that was pressed can leave (no level above 20, no Undo after Undo): the main
  // action takes the focus, as it is visible on every screen; the heading (hidden on phones) is
  // the fallback when there is none, so focus never drops to the page.
  useEffect(() => {
    if (!notice) return
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected)
      (raiseButton.current ?? heading.current)?.focus()
  }, [notice, current])

  // `?do=set` asks once: the disclosure opens as part of the render that sees the request, and
  // focus follows when its stepper exists.
  const [asked, setAsked] = useState(false)
  if (focusStepper && !asked) {
    setAsked(true)
    setMore(true)
  } else if (!focusStepper && asked) setAsked(false)
  useEffect(() => {
    if (!focusStepper) return
    onStepperFocused?.()
    requestAnimationFrame(() => focusWhenReady('[data-party-step-up]'))
  }, [focusStepper, onStepperFocused])

  const reason = mutation.error instanceof CampaignSettingsError ? mutation.error.reason : null
  const errorKey =
    reason === 'forbidden' || reason === 'invalid' || reason === 'request-mismatch'
      ? reason
      : 'unavailable'
  const retryable = errorKey === 'unavailable' || errorKey === 'request-mismatch'
  const language = i18n.language
  const statusLine =
    current === null
      ? t('partyLevel.statusUnset')
      : standing && standing.total > 0
        ? standing.below > 0
          ? t('partyLevel.below', { count: standing.total, below: standing.below })
          : t('partyLevel.allUp')
        : null
  const noticeText = !notice
    ? ''
    : notice.kind === 'back'
      ? notice.level === null
        ? t('partyLevel.backUnset')
        : t('partyLevel.back', { level: notice.level })
      : notice.level === null
        ? t('partyLevel.cleared')
        : t('partyLevel.saved', { level: notice.level })

  return (
    <section aria-labelledby="party-level-title" className="party-level dm-settings-panel">
      <h2
        id="party-level-title"
        className="dm-subheading dm-panel-title party-level-title"
        ref={heading}
        tabIndex={-1}
      >
        {t('dm.panelLevel')}
        <span className="visually-hidden"> {current ?? t('partyLevel.unset')}</span>
      </h2>
      <div className="party-level-head">
        <span className="party-level-numeral" aria-hidden="true">
          {current ?? '–'}
        </span>
        {statusLine && <p className="party-level-status">{statusLine}</p>}
      </div>
      <div className="party-level-actions">
        {raiseTo !== null && (
          <Button
            ref={raiseButton}
            aria-disabled={pending || resting || undefined}
            aria-busy={pending || undefined}
            leftSection={pending ? <Loader size={16} aria-hidden="true" /> : undefined}
            // A held Enter repeats keydown, and each repeat is a click: only the first press counts.
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.repeat) event.preventDefault()
            }}
            onClick={() => {
              if (!rest.current) run(raiseTo)
            }}
          >
            {t(current === null ? 'partyLevel.set' : 'partyLevel.raise', { level: raiseTo })}
          </Button>
        )}
        <Button
          variant="subtle"
          aria-expanded={more}
          aria-controls="party-level-more"
          rightSection={
            more ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )
          }
          onClick={() => setMore((open) => !open)}
        >
          {t('partyLevel.another')}
        </Button>
      </div>
      <div className="party-level-notice">
        <span role="status">{noticeText}</span>
        {notice?.kind === 'set' && (
          <Button
            variant="subtle"
            size="compact-md"
            aria-disabled={pending || undefined}
            onClick={() => run(notice.from, true)}
          >
            {t('partyLevel.undo')}
          </Button>
        )}
      </div>
      {more && (
        <div id="party-level-more" className="party-level-more">
          <div className="party-level-stepper" role="group" aria-label={t('partyLevel.valueName')}>
            <button
              type="button"
              className="party-level-step"
              aria-label={t('partyLevel.decrease')}
              disabled={shown <= minLevel}
              {...lower}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <output className="party-level-value" aria-live="polite">
              {shown}
            </output>
            <button
              type="button"
              className="party-level-step"
              data-party-step-up
              aria-label={t('partyLevel.increase')}
              disabled={shown >= maxLevel}
              {...raise}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <Button
            variant="outline"
            disabled={!changed}
            aria-disabled={pending || undefined}
            onClick={() => run(shown)}
          >
            {t('partyLevel.set', { level: shown })}
          </Button>
          {current !== null && !changed && (
            <Button variant="subtle" aria-disabled={pending || undefined} onClick={() => run(null)}>
              {t('partyLevel.clear')}
            </Button>
          )}
        </div>
      )}
      <p className="party-level-hint">{t('partyLevel.hint')}</p>
      {mutation.isError && attempt && (
        <div className="party-level-error">
          <Alert
            ref={alert}
            tabIndex={-1}
            color="red"
            role="alert"
            icon={<TriangleAlert size={18} aria-hidden="true" />}
            title={t('partyLevel.errorTitle')}
          >
            {t(`partyLevel.error.${errorKey}`)}
          </Alert>
          {retryable && (
            <Button
              variant="light"
              onClick={() => {
                if (errorKey === 'request-mismatch') ids.current.reset()
                run(attempt.target, attempt.undo)
              }}
            >
              {t('common.retry')}
            </Button>
          )}
        </div>
      )}
      {characters
        ? characters.length > 0 && (
            <ul className="party-level-characters" aria-label={t('partyLevel.characters')}>
              {orderPartyCharacters(characters, language).map((character) => (
                <li
                  key={character.id}
                  className="party-level-character"
                  data-below={character.below || undefined}
                >
                  <Link to={character.href}>
                    <span className="party-level-who">
                      <strong className="user-copy">{character.name}</strong>
                      {character.ownerName !== undefined && (
                        <Text component="span" className="party-level-owner user-copy">
                          {character.ownerName ?? t('roster.unassigned')}
                        </Text>
                      )}
                    </span>
                    <span className="party-level-figure">
                      {character.below && (
                        <span className="visually-hidden">{t('partyLevel.belowSr')} </span>
                      )}
                      {character.draft || character.level === null
                        ? t('partyLevel.draft')
                        : t('partyLevel.levelOf', { level: character.level })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        : charactersFeedback}
    </section>
  )
}
