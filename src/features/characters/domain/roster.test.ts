import { describe, expect, it } from 'vitest'
import {
  canRestore,
  claimError,
  claimableCharacterSchema,
  playersWithFreeSlots,
  rosterEntrySchema,
  rosterError,
  rosterLimit,
  rosterOf,
  rostersByPlayer,
  type RosterEntry,
} from './roster'
import { newRequestId } from '@/shared/lib/request-id'

const campaign = newRequestId()
const ana = newRequestId()
const bo = newRequestId()
const entry = (user: string | null, name: string, active: boolean, archived = false): RosterEntry =>
  rosterEntrySchema.parse({
    id: newRequestId(),
    campaign_id: campaign,
    user_id: user,
    name,
    is_active: active,
    archived_at: archived ? '2026-11-03T01:00:00Z' : null,
    created_at: '2026-11-03T00:00:00Z',
  })

describe('RYT-044 roster domain', () => {
  const entries = [
    entry(ana, 'Vex', false),
    entry(ana, 'Bram', true),
    entry(ana, 'Old', false, true),
    entry(bo, 'Pip', true),
    entry(null, 'Hireling', true),
  ]

  it('splits one Player roster into entries, archived ones, the active one and free slots', () => {
    const roster = rosterOf(entries, ana)
    expect(roster.entries.map((e) => e.name)).toEqual(['Vex', 'Bram'])
    expect(roster.archived.map((e) => e.name)).toEqual(['Old'])
    expect(roster.active?.name).toBe('Bram')
    expect(roster.free).toBe(rosterLimit - 2)
    expect(rosterOf([], ana)).toMatchObject({ entries: [], active: null, free: rosterLimit })
  })

  it('groups assigned characters by Player, active first, ignoring unassigned ones', () => {
    const groups = rostersByPlayer(entries, [
      { user_id: bo, display_name: 'Bo' },
      { user_id: ana, display_name: 'Ana' },
    ])
    expect(groups.map((g) => [g.player.display_name, g.entries.map((e) => e.name)])).toEqual([
      ['Bo', ['Pip']],
      ['Ana', ['Bram', 'Vex']],
    ])
  })

  it('counts only characters in the roster towards the limit', () => {
    const full = [1, 2, 3, 4].map((n) => entry(bo, `Pip ${n}`, n === 1))
    expect(
      playersWithFreeSlots([{ user_id: ana }, { user_id: bo }], [...entries, ...full]).map(
        (p) => p.user_id,
      ),
    ).toEqual([ana])
    const archivedBo = entry(bo, 'Gone', false, true)
    expect(canRestore(archivedBo, [...full, archivedBo])).toBe(false)
    expect(canRestore(archivedBo, [...full.slice(1), archivedBo])).toBe(true)
    expect(canRestore(entry(null, 'Npc', false, true), full)).toBe(true)
  })

  it('maps server errors to user-facing kinds', () => {
    expect(rosterError('Character limit')).toBe('limit')
    expect(rosterError('Trade busy')).toBe('trading')
    expect(rosterError('Character in combat')).toBe('combat')
    expect(rosterError('Active character')).toBe('active')
    expect(rosterError('Forbidden')).toBe('unavailable')
  })

  it('RYT-096 maps claim errors and parses the free characters', () => {
    expect(claimError('Character unavailable')).toBe('unavailable')
    expect(claimError('Character limit')).toBe('limit')
    expect(claimError('Forbidden')).toBe('forbidden')
    expect(claimError('Failed to fetch')).toBe('failed')
    const free = {
      id: newRequestId(),
      name: 'Mirabel',
      sheet_status: 'complete',
      class_key: 'bard',
      class_label: 'Bardo',
      level: 5,
      portrait_path: null,
    }
    expect(claimableCharacterSchema.parse(free)).toEqual(free)
    expect(
      claimableCharacterSchema.parse({
        ...free,
        sheet_status: null,
        class_key: null,
        class_label: null,
        level: null,
      }).sheet_status,
    ).toBeNull()
    expect(claimableCharacterSchema.safeParse({ ...free, sheet_status: 'lost' }).success).toBe(
      false,
    )
  })
})
