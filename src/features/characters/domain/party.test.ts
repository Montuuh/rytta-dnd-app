import { describe, expect, it } from 'vitest'
import { hpTone, partyMemberSchema, partyTeammates, teammateLive, type PartyMember } from './party'
import { newRequestId } from '@/shared/lib/request-id'

const row = (patch: Partial<PartyMember>): PartyMember =>
  partyMemberSchema.parse({
    id: newRequestId(),
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
/** What get_party_overview returns to a Player for a teammate the DM does not share. */
const unshared = (patch: Partial<PartyMember> = {}) =>
  row({
    shares_live: false,
    current_hp: null,
    max_hp: null,
    temp_hp: null,
    armor_class: null,
    exhaustion: null,
    conditions: null,
    ...patch,
  })

describe('party teammates', () => {
  it('keeps every assigned teammate other than the viewer, shared or not', () => {
    const own = row({ is_own: true })
    const preview = row({})
    const hidden = unshared()
    const npc = row({ is_assigned: false })
    const mate = row({})
    expect(partyTeammates([own, preview, hidden, npc, mate], new Set([preview.id]))).toEqual([
      hidden,
      mate,
    ])
  })
  it('gives live state only for shared, finished sheets', () => {
    expect(teammateLive(row({ current_hp: 9, max_hp: 24, temp_hp: 3, exhaustion: 2 }))).toEqual({
      current: 9,
      max: 24,
      temp: 3,
      armorClass: 14,
      exhaustion: 2,
      conditions: [],
      ratio: 38,
      tone: 'wounded',
    })
    expect(teammateLive(unshared())).toBeNull()
    expect(teammateLive(row({ sheet_status: 'draft' }))).toBeNull()
    expect(teammateLive(row({ sheet_status: null }))).toBeNull()
    expect(teammateLive(row({ current_hp: null }))).toBeNull()
  })
  it('hides the live state of an unshared teammate even when the data is present', () => {
    // A DM previewing a Player receives every field; sharing still decides what is shown.
    expect(teammateLive(row({ shares_live: false }))).toBeNull()
  })
  it('accepts unshared rows with null live fields and keeps their identity', () => {
    const hidden = unshared({ name: 'Cato', class_key: 'fighter', level: 4 })
    expect(hidden).toMatchObject({ name: 'Cato', class_key: 'fighter', level: 4 })
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
