import { describe, expect, it } from 'vitest'
import { hpTone, partyMemberSchema, sharedTeammates, type PartyMember } from './party'

const row = (patch: Partial<PartyMember>): PartyMember =>
  partyMemberSchema.parse({
    id: crypto.randomUUID(),
    name: 'Bea',
    is_own: false,
    is_assigned: true,
    shares_live: true,
    sheet_status: 'complete',
    class_key: 'bard',
    class_label: null,
    level: 3,
    current_hp: 10,
    max_hp: 20,
    temp_hp: 0,
    armor_class: 14,
    exhaustion: 0,
    conditions: [],
    ...patch,
  })

describe('party live sharing', () => {
  it('keeps only assigned, shared teammates other than the viewer', () => {
    const own = row({ is_own: true })
    const preview = row({})
    const hidden = row({ shares_live: false })
    const npc = row({ is_assigned: false })
    const mate = row({})
    expect(sharedTeammates([own, preview, hidden, npc, mate], new Set([preview.id]))).toEqual([
      mate,
    ])
  })
  it('rejects unknown conditions; economic fields are not part of the contract', () => {
    expect(() => row({ conditions: ['exhaustion' as never] })).toThrow()
    expect(Object.keys(row({}))).not.toContain('gold')
  })
  it('derives HP tone with clamping', () => {
    expect(hpTone(20, 20)).toEqual({ ratio: 100, tone: 'healthy' })
    expect(hpTone(8, 20)).toEqual({ ratio: 40, tone: 'wounded' })
    expect(hpTone(0, 0)).toEqual({ ratio: 0, tone: 'critical' })
  })
})
