import { Group, Stack, Text, Timeline } from '@mantine/core'
import { Coins, HeartPulse, Radio, ScrollText, UserRound, UsersRound } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { AuditEvent } from '../domain/campaign'
import {
  activeChanged,
  auditCharacterNames,
  auditDayRelation,
  auditFamily,
  groupAuditByDay,
  sharingChanged,
} from '../domain/audit'
import './audit.css'

type Numeric = { key: string; label: string }
const resourceKeys = ['gold', 'water_units', 'rations', 'exhaustion'] as const
const vitalsKeys = ['current_hp', 'temp_hp', 'hit_dice_spent'] as const
const sheetKeys = ['level', 'max_hp', 'armor_class'] as const

function numericDiffs(event: AuditEvent, fields: Numeric[], language: string) {
  return fields.flatMap(({ key, label }) => {
    const after = typeof event.after_value[key] === 'number' ? event.after_value[key] : null
    const before =
      event.before_value && typeof event.before_value[key] === 'number'
        ? event.before_value[key]
        : null
    if (after === null) return []
    if (before !== null && before === after) return []
    if (before === null && after === 0) return []
    const delta = before !== null ? after - before : after
    const sign = delta > 0 ? `+${delta}` : `${delta}`
    const text =
      before !== null
        ? `${label}: ${before.toLocaleString(language)} → ${after.toLocaleString(language)} (${sign})`
        : `${label}: ${after.toLocaleString(language)}`
    return [{ key, text }]
  })
}

function conditionDiffs(event: AuditEvent, t: TFunction) {
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const before = new Set(list(event.before_value?.conditions))
  const after = new Set(list(event.after_value.conditions))
  const label = (key: string) => t(`srd.condition.${key}` as 'srd.condition.poisoned')
  return [
    ...[...after]
      .filter((key) => !before.has(key))
      .map((key) => ({ key: `+${key}`, text: `+ ${label(key)}` })),
    ...[...before]
      .filter((key) => !after.has(key))
      .map((key) => ({ key: `-${key}`, text: `− ${label(key)}` })),
  ]
}

/**
 * Shared DM audit timeline (Command Center and per-character sheet drawer, RYT-031). RYT-180: the
 * events sit under their calendar day, each with its time; a character's name is a link to its
 * sheet when `characterHref` says where the sheet is.
 */
export function AuditTimeline({
  events,
  memberNames,
  now,
  showCharacter = true,
  context,
  characterHref,
}: {
  events: AuditEvent[]
  /** Unfiltered events used to resolve character names (resource rows carry none). */
  context?: AuditEvent[]
  memberNames: ReadonlyMap<string, string>
  now: number
  showCharacter?: boolean
  characterHref?: (characterId: string) => string
}) {
  const { t, i18n } = useTranslation()
  const characterNames = auditCharacterNames(context ?? events)
  const today = new Date(now)
  const dayLabel = (date: Date) => {
    const relation = auditDayRelation(date, today)
    if (relation !== 'date') return t(relation === 'today' ? 'dm.auditToday' : 'dm.auditYesterday')
    return new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'long',
      ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
    }).format(date)
  }
  const timeFormat = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const label = (key: string) => t(`audit.field.${key}` as 'audit.field.level')
  const fields = (keys: readonly string[]) => keys.map((key) => ({ key, label: label(key) }))
  return (
    <div className="audit-days">
      {groupAuditByDay(events).map((day) => (
        <div key={day.key} className="audit-day">
          <h3 className="audit-day-heading">{dayLabel(day.date)}</h3>
          <Timeline bulletSize={30} lineWidth={2} className="audit-timeline">
            {day.events.map((event) => {
              const family = auditFamily(event)
              const sharing = sharingChanged(event)
              const switched = activeChanged(event)
              const labelKey = sharing
                ? 'audit.liveSharingChanged'
                : switched
                  ? 'audit.activeChanged'
                  : (`dm.auditEvent.${event.kind.replace(':', '_')}` as 'dm.auditEvent.characters_INSERT')
              const characterName = showCharacter
                ? ((typeof event.after_value.name === 'string' ? event.after_value.name : null) ??
                  characterNames.get(event.character_id) ??
                  null)
                : null
              const actorName = event.actor_id ? (memberNames.get(event.actor_id) ?? null) : null
              const assignment =
                !sharing &&
                (event.kind === 'character_assigned' ||
                  event.kind === 'character_unassigned' ||
                  (event.kind === 'characters:UPDATE' &&
                    (event.before_value?.user_id ?? null) !== (event.after_value.user_id ?? null)))
              const linkedUserId =
                typeof event.after_value.user_id === 'string' ? event.after_value.user_id : null
              const linkedPlayerName = linkedUserId
                ? (memberNames.get(linkedUserId) ?? linkedUserId)
                : null
              const diffs =
                family === 'resources'
                  ? numericDiffs(
                      event,
                      resourceKeys.map((key) => ({ key, label: t(`characters.${key}`) })),
                      i18n.language,
                    )
                  : family === 'vitals'
                    ? [
                        ...numericDiffs(event, fields(vitalsKeys), i18n.language),
                        ...conditionDiffs(event, t),
                      ]
                    : family === 'sheet'
                      ? numericDiffs(event, fields(sheetKeys), i18n.language)
                      : []
              const Bullet = sharing
                ? Radio
                : switched
                  ? UsersRound
                  : family === 'resources'
                    ? Coins
                    : family === 'vitals'
                      ? HeartPulse
                      : family === 'sheet'
                        ? ScrollText
                        : UserRound
              const created = new Date(event.created_at)
              return (
                <Timeline.Item
                  key={event.id}
                  bullet={<Bullet size={15} aria-hidden="true" />}
                  className="audit-event"
                >
                  <Stack gap={4}>
                    <Group justify="space-between" align="flex-start" gap="xs">
                      <Group gap="xs">
                        <Text fw={700} size="sm">
                          {t(labelKey)}
                        </Text>
                        {characterName &&
                          (characterHref ? (
                            <Link
                              className="audit-character user-copy"
                              to={characterHref(event.character_id)}
                            >
                              {characterName}
                            </Link>
                          ) : (
                            <Text size="sm" className="user-copy">
                              {characterName}
                            </Text>
                          ))}
                      </Group>
                      <Text
                        size="xs"
                        c="dimmed"
                        component="time"
                        dateTime={event.created_at}
                        title={created.toLocaleString(i18n.language)}
                      >
                        {timeFormat.format(created)}
                      </Text>
                    </Group>
                    {sharing && (
                      <Text size="sm">
                        {t(
                          event.after_value.shares_live
                            ? 'audit.liveSharingOn'
                            : 'audit.liveSharingOff',
                        )}
                      </Text>
                    )}
                    {switched && (
                      <Text size="sm">
                        {t(event.after_value.is_active ? 'audit.activeOn' : 'audit.activeOff')}
                      </Text>
                    )}
                    {assignment && (
                      <Text size="sm" className="user-copy">
                        {linkedPlayerName
                          ? t('dm.auditLinkedTo', { player: linkedPlayerName })
                          : t('dm.auditUnlinked')}
                      </Text>
                    )}
                    {family !== 'character' &&
                      (diffs.length > 0 ? (
                        <ul className="audit-diffs">
                          {diffs.map((diff) => (
                            <li key={diff.key}>{diff.text}</li>
                          ))}
                        </ul>
                      ) : (
                        family === 'resources' && (
                          <Text size="xs" c="dimmed">
                            {t('dm.auditNoChanges')}
                          </Text>
                        )
                      ))}
                    {actorName && (
                      <Text size="xs" c="dimmed" className="user-copy">
                        {t('dm.auditBy', { actor: actorName })}
                      </Text>
                    )}
                  </Stack>
                </Timeline.Item>
              )
            })}
          </Timeline>
        </div>
      ))}
    </div>
  )
}
