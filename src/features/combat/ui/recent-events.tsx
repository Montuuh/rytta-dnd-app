import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CombatEvent } from '../domain/combat'
import { eventText } from './helpers'

/** Event kinds that are bookkeeping rather than something that happened at the table. */
const quiet = new Set(['status', 'undo', 'initiative', 'join', 'leave'])
const shown = 8

/**
 * RYT-126 J4-07: a collapsed "Recent events" strip from the events the Player projection already
 * carries (visible ones only; the server filters them). Closed by default so it never pushes the
 * order down; newest first.
 */
export function RecentEvents({ events }: { events: readonly CombatEvent[] }) {
  const { t } = useTranslation()
  const id = useId()
  const recent = events.filter((e) => !e.undone && !quiet.has(e.kind)).slice(0, shown)
  if (recent.length === 0) return null
  return (
    <details className="combat-recent">
      <summary>
        <span id={id}>{t('combat.recent.title')}</span>
        <span className="combat-recent-count">
          {t('combat.recent.count', { count: recent.length })}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <ol aria-labelledby={id}>
        {recent.map((event) => (
          <li key={event.id}>
            <span className="combat-recent-round">
              {t('combat.recent.round', { round: event.round })}
            </span>
            {eventText(t, event)}
          </li>
        ))}
      </ol>
    </details>
  )
}
