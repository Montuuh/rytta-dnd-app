import { useEffect, useState } from 'react'
import { ActionIcon, Group, Stack, Text, Title, VisuallyHidden } from '@mantine/core'
import { Hourglass, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  canEnterInitiative,
  initiativeProgress,
  nextUp,
  turnsUntil,
  type CombatState,
  type Combatant,
} from '../domain/combat'
import { CombatSummary } from './combat-summary'
import { useRunner } from './helpers'
import { InitiativeEntry } from './initiative-entry'
import { InitiativeRail } from './initiative-rail'
import { NetworkState, Pips, RunnerError } from './parts'

/**
 * The table view (RYT-038, RYT-042): the one combat screen Players have, and the DM's default.
 * Large type for a shared screen. The DM and the shared screen get the table projection (as_table,
 * never DM secrets); a Player gets the own Player projection, whose only extra is the own
 * character. Its one write is the own initiative while it is collected; the server enforces it.
 */
export function TableDisplay({
  campaignId,
  state,
  stale,
  connected,
  retry,
}: {
  campaignId: string
  state: CombatState
  stale: boolean
  connected: boolean
  retry: () => void
}) {
  const { t } = useTranslation()
  const encounter = state.encounter!
  const status = encounter.status
  const combatants = state.combatants
  const active = combatants.find((c) => c.is_active) ?? null
  const upNext = nextUp(combatants)
  const own = combatants.filter((c) => c.is_own)
  const ownInOrder = own.find((c) => c.in_turn_order) ?? null
  const until = ownInOrder ? turnsUntil(combatants, ownInOrder.id) : null
  const yours = status === 'active' && active?.is_own === true
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const announcement = useTurnAnnouncement(state)
  // Rows reopened over a saved total, and the last save to announce.
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const [saved, setSaved] = useState('')
  const entryOpen = (c: Combatant) =>
    canEnterInitiative(status, c) && (c.initiative === undefined || editing.has(c.id))
  const stopEditing = (id: string) =>
    setEditing((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  const focusLater = (selector: string, preventScroll = false) =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll }),
    )
  const progress = initiativeProgress(combatants)
  return (
    <Stack gap="lg" className={`combat-table-view${yours ? ' is-your-turn' : ''}`}>
      <VisuallyHidden aria-live="polite">{announcement.text}</VisuallyHidden>
      <VisuallyHidden aria-live="polite">{saved}</VisuallyHidden>
      <header>
        <Title order={1} className="combat-table-title">
          {encounter.name}
        </Title>
        <Group gap="sm" mt={4}>
          <Text fw={700} className="combat-table-round">
            {status === 'active'
              ? t('combat.round', { round: encounter.round })
              : t(`combat.status.${status}`)}
          </Text>
          {status !== 'ended' && <NetworkState stale={stale} connected={connected} retry={retry} />}
        </Group>
      </header>
      <RunnerError error={error} trigger={trigger} onClose={clear} />

      {status === 'initiative' && (
        <div className="combat-table-now is-rolling" role="status">
          <div>
            <Text className="combat-table-label">{t('combat.table.rolling')}</Text>
            <Text className="combat-table-active">
              {t('combat.table.ready', { ready: progress.ready, total: progress.total })}
            </Text>
          </div>
          {/* The count above already says it; the pips repeat it visually. */}
          <div aria-hidden="true">
            <Pips filled={progress.ready} total={progress.total} label="" />
          </div>
        </div>
      )}

      {status === 'active' && (
        // The Player's own status is the dominant line (RYT-042 F3): on the own turn "Your turn!"
        // replaces the (already known) own name at display size; while waiting, the countdown
        // has its own full-width band, not a line under "Up next".
        <div className={`combat-table-now${yours ? ' is-yours' : ''}`}>
          <div>
            <Text className="combat-table-label">{t('combat.turn.now')}</Text>
            <Text className="combat-table-active">
              {yours ? t('combat.turn.yours') : (active?.name ?? '—')}
            </Text>
          </div>
          <div>
            <Text className="combat-table-label">{t('combat.turn.upNext')}</Text>
            <Text className="combat-table-next">{upNext?.name ?? '—'}</Text>
          </div>
          {ownInOrder && !yours && until !== null && (
            <p className="combat-table-countdown">
              <Hourglass size={28} aria-hidden="true" />
              <span>{t('combat.turn.in', { count: until })}</span>
            </p>
          )}
        </div>
      )}

      {status === 'ended' ? (
        <CombatSummary encounter={encounter} large />
      ) : (
        <section aria-labelledby="combat-table-order">
          <Title order={2} id="combat-table-order" className="combat-section-title" tabIndex={-1}>
            {t('combat.order.title')}
          </Title>
          <InitiativeRail
            combatants={combatants}
            mode={{ kind: 'read' }}
            large
            rowAction={(c) =>
              canEnterInitiative(status, c) && !entryOpen(c) ? (
                <ActionIcon
                  variant="subtle"
                  size={44}
                  id={`initiative-edit-${c.id}`}
                  aria-label={t('combat.initiative.edit', { name: c.name })}
                  onClick={() => {
                    setEditing((current) => new Set(current).add(c.id))
                    // The entry scrolls itself fully into view when it opens.
                    focusLater(`[data-entry-for="${c.id}"] h3`, true)
                  }}
                >
                  <Pencil size={20} aria-hidden="true" />
                </ActionIcon>
              ) : null
            }
            rowExtra={(c) =>
              entryOpen(c) ? (
                <InitiativeEntry
                  campaignId={campaignId}
                  combatant={c}
                  editing={c.initiative !== undefined}
                  pending={pending}
                  cancel={() => {
                    stopEditing(c.id)
                    focusLater(`#initiative-edit-${c.id}`)
                  }}
                  save={async (total, bonus) => {
                    if (await run({ kind: 'initiative', combatantId: c.id, total, bonus })) {
                      stopEditing(c.id)
                      setSaved(t('combat.initiative.savedValue', { name: c.name, total }))
                      // While initiative is collected the row keeps a way back in; later it
                      // has none, so the order's heading takes focus.
                      focusLater(
                        status === 'initiative'
                          ? `#initiative-edit-${c.id}`
                          : '#combat-table-order',
                      )
                    }
                  }}
                />
              ) : null
            }
          />
        </section>
      )}
    </Stack>
  )
}

/** Announces turn changes to assistive tech and buzzes the device on the Player's own turn. */
function useTurnAnnouncement(state: CombatState) {
  const { t } = useTranslation()
  const encounter = state.encounter
  const activeId = encounter?.status === 'active' ? (encounter.active_combatant ?? null) : null
  const [seen, setSeen] = useState(activeId)
  const [message, setMessage] = useState({ text: '', yours: false, turn: 0 })
  if (seen !== activeId) {
    setSeen(activeId)
    const active = state.combatants.find((c) => c.id === activeId)
    // The first state after mounting is not a change; only later turns are announced.
    if (active && seen !== null && encounter) {
      const yours = active.is_own
      setMessage((previous) => ({
        text: yours
          ? t('combat.turn.announceYours', { name: active.name, round: encounter.round })
          : t('combat.turn.announce', { name: active.name, round: encounter.round }),
        yours,
        turn: previous.turn + 1,
      }))
    }
  }
  useEffect(() => {
    if (message.yours && 'vibrate' in navigator) navigator.vibrate?.([120, 60, 120])
  }, [message])
  return message
}
