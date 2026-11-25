import { describe, expect, it } from 'vitest'
import type { AuditEvent } from './campaign'
import {
  auditCharacterNames,
  auditDayRelation,
  dayKey,
  filterAudit,
  groupAuditByDay,
} from './audit'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const event = (
  id: number,
  character: number,
  kind: string,
  at: Date,
  after: Record<string, unknown> = {},
): AuditEvent => ({
  id: uuid(id),
  campaign_id: uuid(900),
  character_id: uuid(character),
  actor_id: null,
  kind,
  before_value: null,
  after_value: after,
  created_at: at.toISOString(),
})

describe('RYT-180 audit helpers', () => {
  const events = [
    event(1, 1, 'character_resources:UPDATE', new Date(2026, 10, 25, 9, 30)),
    event(2, 2, 'characters:INSERT', new Date(2026, 10, 25, 8, 0), { name: 'Bea' }),
    event(3, 1, 'characters:INSERT', new Date(2026, 9, 28, 23, 59), { name: 'Arin' }),
  ]

  it('learns each character name from any of its events', () => {
    const names = auditCharacterNames(events)
    expect(names.get(uuid(1))).toBe('Arin')
    expect(names.get(uuid(2))).toBe('Bea')
  })

  it('filters by kind of change and by character together', () => {
    const family = (value: 'all' | 'characters' | 'resources', characterId: string | null) =>
      filterAudit(events, { family: value, characterId }).map((item) => item.id)
    expect(family('all', null)).toEqual([uuid(1), uuid(2), uuid(3)])
    expect(family('resources', null)).toEqual([uuid(1)])
    expect(family('characters', null)).toEqual([uuid(2), uuid(3)])
    expect(family('all', uuid(1))).toEqual([uuid(1), uuid(3)])
    expect(family('characters', uuid(1))).toEqual([uuid(3)])
  })

  it('groups by local calendar day, keeping the newest first', () => {
    const days = groupAuditByDay(events)
    expect(days.map((day) => day.key)).toEqual(['2026-11-25', '2026-10-28'])
    expect(days[0]!.events.map((item) => item.id)).toEqual([uuid(1), uuid(2)])
  })

  it('names today and yesterday, and a date for any other day', () => {
    const now = new Date(2026, 10, 25, 12, 0)
    expect(auditDayRelation(new Date(2026, 10, 25, 0, 1), now)).toBe('today')
    expect(auditDayRelation(new Date(2026, 10, 24, 23, 59), now)).toBe('yesterday')
    expect(auditDayRelation(new Date(2026, 9, 28), now)).toBe('date')
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
