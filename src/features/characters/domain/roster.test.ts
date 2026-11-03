import { describe, expect, it } from 'vitest'
import {
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
const entry = (user: string | null, name: string, active: boolean): RosterEntry =>
  rosterEntrySchema.parse({
    id: newRequestId(),
    campaign_id: campaign,
    user_id: user,
    name,
    is_active: active,
    created_at: '2026-11-03T00:00:00Z',
  })

describe('RYT-044 roster domain', () => {
  const entries = [
    entry(ana, 'Vex', false),
    entry(ana, 'Bram', true),
    entry(bo, 'Pip', true),
    entry(null, 'Hireling', true),
  ]

  it('splits one Player roster into entries, the active one and free slots', () => {
    const roster = rosterOf(entries, ana)
    expect(roster.entries.map((e) => e.name)).toEqual(['Vex', 'Bram'])
    expect(roster.active?.name).toBe('Bram')
    expect(roster.free).toBe(rosterLimit - 2)
    expect(rosterOf([], ana)).toMatchObject({ entries: [], active: null, free: rosterLimit })
  })

  it('groups assigned characters by Player and ignores unassigned ones', () => {
    const groups = rostersByPlayer(entries, [
      { user_id: bo, display_name: 'Bo' },
      { user_id: ana, display_name: 'Ana' },
    ])
    expect(groups.map((g) => [g.player.display_name, g.entries.length])).toEqual([
      ['Bo', 1],
      ['Ana', 2],
    ])
  })

  it('offers only Players below the limit for DM assignment', () => {
    const full = [1, 2, 3, 4].map((n) => entry(bo, `Pip ${n}`, n === 1))
    expect(
      playersWithFreeSlots([{ user_id: ana }, { user_id: bo }], [...entries, ...full]).map(
        (p) => p.user_id,
      ),
    ).toEqual([ana])
  })

  it('maps server errors to user-facing kinds', () => {
    expect(rosterError('Character limit')).toBe('limit')
    expect(rosterError('Trade busy')).toBe('trading')
    expect(rosterError('Character in combat')).toBe('combat')
    expect(rosterError('Forbidden')).toBe('unavailable')
  })
})
