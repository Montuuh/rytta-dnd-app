import { Badge, Button, Group, Text, Title } from '@mantine/core'
import { Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CombatEvent } from '../domain/combat'
import { eventText, type Run } from './helpers'

export function CombatLog({
  events,
  run,
  pending,
  canUndo,
  present,
}: {
  events: CombatEvent[]
  run: Run
  pending: boolean
  canUndo: boolean
  /** Combatants still in the encounter: changes to one that left cannot be undone (RYT-041). */
  present?: ReadonlySet<string>
}) {
  const { t } = useTranslation()
  return (
    <section className="combat-log" aria-labelledby="combat-log-title">
      <Title order={3} id="combat-log-title" className="combat-section-title">
        {t('combat.log.title')}
      </Title>
      {events.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t('combat.log.empty')}
        </Text>
      ) : (
        // Scrollable: keyboard users reach it as a named, focusable region.
        <div
          className="combat-log-scroll"
          role="region"
          tabIndex={0}
          aria-labelledby="combat-log-title"
        >
          <ol className="combat-log-list">
            {events.map((event) => {
              const text = eventText(t, event)
              const dc = event.detail.concentration_dc
              return (
                <li key={event.id} className={event.undone ? 'is-undone' : undefined}>
                  <span className="combat-log-round">
                    {event.round > 0
                      ? t('combat.log.round', { round: event.round })
                      : t('combat.log.prep')}
                  </span>
                  <div className="combat-log-text">
                    <Text size="sm" td={event.undone ? 'line-through' : undefined}>
                      {text}
                    </Text>
                    <Group gap={6}>
                      {event.source_name && event.kind === 'damage' && (
                        <Text size="xs" c="dimmed">
                          {t('combat.event.by', { name: event.source_name })}
                        </Text>
                      )}
                      {typeof dc === 'number' && !event.undone && (
                        <Text size="xs" className="combat-dc">
                          {t('combat.concentration.dc', {
                            name: event.target_name ?? '',
                            dc,
                            spell: String(event.detail.concentration ?? ''),
                          })}
                        </Text>
                      )}
                      {event.detail.concentration_lost === true && (
                        <Text size="xs" className="combat-dc">
                          {t('combat.concentration.lost', { name: event.target_name ?? '' })}
                        </Text>
                      )}
                      {event.undone && (
                        <Badge size="xs" variant="outline">
                          {t('combat.log.undone')}
                        </Badge>
                      )}
                      {event.visible === false && (
                        <Badge size="xs" variant="outline" color="gray">
                          {t('combat.log.private')}
                        </Badge>
                      )}
                    </Group>
                  </div>
                  {canUndo &&
                    event.undoable &&
                    (!present ||
                      !event.target_combatant ||
                      present.has(event.target_combatant)) && (
                      <Button
                        size="compact-md"
                        variant="subtle"
                        className="combat-undo"
                        leftSection={<Undo2 size={16} aria-hidden="true" />}
                        disabled={pending}
                        aria-label={t('combat.log.undoLabel', { text })}
                        onClick={() => void run({ kind: 'undo', eventId: event.id })}
                      >
                        {t('combat.log.undo')}
                      </Button>
                    )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
