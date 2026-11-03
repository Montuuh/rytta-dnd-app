import { useId, useRef, useState } from 'react'
import { Loader, UnstyledButton } from '@mantine/core'
import { Check, HeartPulse, Plus, Skull, Sparkles, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  canRollDeathSave,
  deathSaveThisRound,
  deathState,
  type CombatState,
  type Combatant,
  type DeathSaveOutcome,
} from '../domain/combat'
import type { Run } from './helpers'
import { D20 } from './initiative-entry'

type Track = 'success' | 'failure'
const natural: Record<Track, { outcome: DeathSaveOutcome; face: string }> = {
  success: { outcome: 'nat20', face: '20' },
  failure: { outcome: 'nat1', face: '1' },
}

/**
 * RYT-045: the Player's own death saves on the own turn, in the table banner. Two tracks of three
 * notches, like the boxes on a paper sheet: the next empty notch of each track is the control (the
 * d20 landed 10–19 or 2–9), and a die at the end of each track takes the naturals (20 revives
 * with 1 hit point, 1 counts two failures). One roll per round, no confirmation: the server
 * refuses a second roll and the DM can undo a mistaken one from the console log.
 */
export function DeathSaveTracker({
  state,
  combatant,
  run,
  pending,
  stale,
  afterRoll,
}: {
  state: CombatState
  combatant: Combatant
  run: Run
  pending: boolean
  stale: boolean
  /** Called after a recorded roll (the next step is ending the turn). */
  afterRoll: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const status = deathState(combatant)
  // A double tap inside one frame must not send two rolls: the pending flag arrives a render late.
  const lock = useRef(false)
  const [pressed, setPressed] = useState<DeathSaveOutcome | null>(null)
  // Only what changes while the tracker is on screen is stamped in (review F3): marks already
  // filled when it mounts (a reload, the next own turn) and a revival seen on arrival stay still.
  const counts = {
    success: combatant.death_saves?.successes ?? 0,
    failure: combatant.death_saves?.failures ?? 0,
  }
  const [baseline, setBaseline] = useState(counts)
  if (counts.success < baseline.success || counts.failure < baseline.failure)
    setBaseline({
      success: Math.min(counts.success, baseline.success),
      failure: Math.min(counts.failure, baseline.failure),
    })
  const [mountedAs] = useState(status)
  if (status === null) return null
  if (status === 'revived')
    return (
      <section
        className={`combat-saves is-revived${mountedAs === 'revived' ? '' : ' is-new'}`}
        aria-labelledby={titleId}
      >
        <Sparkles className="combat-saves-outcome-icon" size={32} aria-hidden="true" />
        <div>
          <h3 id={titleId} className="combat-saves-title">
            {t('combat.death.revived')}
          </h3>
          <p className="combat-saves-note">{t('combat.death.revivedHint')}</p>
        </div>
      </section>
    )
  const saves = combatant.death_saves ?? { successes: 0, failures: 0 }
  const rolled = deathSaveThisRound(state, combatant.id)
  const live = canRollDeathSave(state, combatant) && !stale
  const roll = async (outcome: DeathSaveOutcome) => {
    if (lock.current || pending) return
    lock.current = true
    setPressed(outcome)
    const ok = await run({ kind: 'deathSave', combatantId: combatant.id, outcome })
    lock.current = false
    setPressed(null)
    if (ok) afterRoll()
  }
  const busy = pending || pressed !== null
  const track = (kind: Track) => {
    const filled = Math.min(3, kind === 'success' ? saves.successes : saves.failures)
    const nat = natural[kind]
    return (
      <div
        className={`combat-saves-track is-${kind}`}
        role="group"
        aria-label={t(kind === 'success' ? 'combat.death.successes' : 'combat.death.failures', {
          count: filled,
        })}
      >
        <span className="combat-saves-name" aria-hidden="true">
          {t(`combat.death.track.${kind}`)}
          <span className="combat-saves-range">{t(`combat.death.range.${kind}`)}</span>
        </span>
        <span className="combat-saves-marks">
          {[0, 1, 2].map((index) => {
            if (index < filled)
              return (
                <span
                  key={index}
                  className={`combat-mark is-filled${index >= baseline[kind] ? ' is-new' : ''}`}
                  aria-hidden="true"
                >
                  {kind === 'success' ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
                </span>
              )
            if (index === filled && live)
              return (
                <UnstyledButton
                  key={index}
                  className="combat-mark is-next"
                  aria-label={t(`combat.death.mark.${kind}`)}
                  data-pending={pressed === kind || undefined}
                  aria-disabled={busy || undefined}
                  onClick={() => void roll(kind)}
                >
                  {pressed === kind ? (
                    <Loader size={18} color="currentColor" />
                  ) : (
                    <Plus strokeWidth={3} aria-hidden="true" />
                  )}
                </UnstyledButton>
              )
            return <span key={index} className="combat-mark" aria-hidden="true" />
          })}
        </span>
        {live && (
          <UnstyledButton
            className="combat-die"
            aria-label={t(`combat.death.mark.${nat.outcome}`)}
            data-pending={pressed === nat.outcome || undefined}
            aria-disabled={busy || undefined}
            onClick={() => void roll(nat.outcome)}
          >
            <D20 />
            <span className="combat-die-face" aria-hidden="true">
              {pressed === nat.outcome ? <Loader size={16} color="currentColor" /> : nat.face}
            </span>
          </UnstyledButton>
        )}
      </div>
    )
  }
  return (
    <section
      className={`combat-saves is-${status}${live ? ' is-live' : ''}`}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
    >
      <h3 id={titleId} className="combat-saves-title">
        {t('combat.death.title')}
      </h3>
      <div className="combat-saves-tracks">
        {track('success')}
        {track('failure')}
      </div>
      {status === 'stable' ? (
        <p className="combat-saves-outcome is-stable">
          <HeartPulse size={22} aria-hidden="true" />
          <span>
            <strong>{t('combat.stable')}</strong> {t('combat.death.stableHint')}
          </span>
        </p>
      ) : status === 'dead' ? (
        <p className="combat-saves-outcome is-dead">
          <Skull size={22} aria-hidden="true" />
          <strong>{t('combat.dead')}</strong>
        </p>
      ) : (
        rolled && (
          <p className="combat-saves-note is-recorded">
            {t('combat.death.recorded', {
              outcome: t(
                `combat.death.${(rolled.detail.outcome as DeathSaveOutcome | undefined) ?? 'success'}`,
              ),
            })}
          </p>
        )
      )}
    </section>
  )
}
