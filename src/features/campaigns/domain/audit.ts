import type { AuditEvent } from './campaign'

export type AuditEventFamily = 'resources' | 'vitals' | 'sheet' | 'character'
export function auditFamily(event: AuditEvent): AuditEventFamily {
  if (event.kind.startsWith('character_resources') || event.kind === 'resources_updated')
    return 'resources'
  if (event.kind.startsWith('character_vitals')) return 'vitals'
  // RYT-130: a level-up records the level and maximum hit points before and after.
  if (event.kind.startsWith('character_sheets') || event.kind === 'level_up') return 'sheet'
  return 'character'
}

/** True only when a characters:UPDATE row switched the RYT-044 active character flag
 * without a change of owner (linking and unlinking keep their own wording). */
export const activeChanged = (event: AuditEvent) =>
  event.kind === 'characters:UPDATE' &&
  typeof event.after_value.is_active === 'boolean' &&
  typeof event.before_value?.is_active === 'boolean' &&
  event.before_value.is_active !== event.after_value.is_active &&
  (event.before_value.user_id ?? null) === (event.after_value.user_id ?? null)

/** True only when a characters:UPDATE row flipped RYT-031 party live sharing. */
export const sharingChanged = (event: AuditEvent) =>
  event.kind === 'characters:UPDATE' &&
  typeof event.after_value.shares_live === 'boolean' &&
  typeof event.before_value?.shares_live === 'boolean' &&
  event.before_value.shares_live !== event.after_value.shares_live

export type AuditFilter = 'all' | 'characters' | 'resources'

/** The newest known name of each character that appears in the events (resource rows carry none,
 * so the names come from every event). Events arrive newest first. */
export function auditCharacterNames(events: readonly AuditEvent[]) {
  const names = new Map<string, string>()
  for (const item of [...events].reverse()) {
    if (typeof item.after_value.name === 'string')
      names.set(item.character_id, item.after_value.name)
    else if (typeof item.before_value?.name === 'string')
      names.set(item.character_id, item.before_value.name)
  }
  return names
}

/** Events of one kind of change and, optionally, of one character. */
export function filterAudit(
  events: readonly AuditEvent[],
  { family, characterId }: { family: AuditFilter; characterId: string | null },
) {
  return events.filter((event) => {
    if (characterId && event.character_id !== characterId) return false
    if (family === 'all') return true
    const resource = auditFamily(event) === 'resources'
    return family === 'resources' ? resource : !resource
  })
}

/** The calendar day of a moment in the viewer's time zone, as `YYYY-MM-DD`. */
export function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type AuditDay = { key: string; date: Date; events: AuditEvent[] }

/** Events grouped by local calendar day, in the order they arrive (newest first). */
export function groupAuditByDay(events: readonly AuditEvent[]) {
  const days: AuditDay[] = []
  for (const event of events) {
    const date = new Date(event.created_at)
    const key = dayKey(date)
    const last = days[days.length - 1]
    if (last?.key === key) last.events.push(event)
    else days.push({ key, date, events: [event] })
  }
  return days
}

/** Whether a day is today, yesterday or an earlier date, as seen from `now`. */
export function auditDayRelation(date: Date, now: Date): 'today' | 'yesterday' | 'date' {
  if (dayKey(date) === dayKey(now)) return 'today'
  const before = new Date(now)
  before.setDate(before.getDate() - 1)
  return dayKey(date) === dayKey(before) ? 'yesterday' : 'date'
}
