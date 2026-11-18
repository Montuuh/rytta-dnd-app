import { describe, expect, it } from 'vitest'
import { readMarker, vitalsSchema, type Vitals } from './sheet'

const vitals = (concentration: unknown) => ({
  current_hp: 10,
  temp_hp: 0,
  hit_dice_spent: 0,
  death_successes: 0,
  death_failures: 0,
  heroic_inspiration: false,
  conditions: [],
  slots_used: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  tracker_uses: {},
  concentration,
  revision: 3,
})
const crystal = '\u{1f52e}'

// RYT-134: a sheet never fails to load over its concentration marker.
describe('reading a marker back', () => {
  it('keeps what the server stores, counting code points like the server does', () => {
    // 100 astral characters are 200 UTF-16 units: valid for the server, so valid to read.
    const astral = crystal.repeat(100)
    expect(vitalsSchema.parse(vitals(astral)).concentration).toBe(astral)
    expect(vitalsSchema.parse(vitals('Bless')).concentration).toBe('Bless')
    expect(vitalsSchema.parse(vitals(null)).concentration).toBeNull()
    const { concentration: _omitted, ...without } = vitals(null)
    expect(vitalsSchema.parse(without).concentration).toBeNull()
  })
  it('degrades anything unexpected to something safe to show instead of throwing', () => {
    expect(readMarker(crystal.repeat(150))).toBe(crystal.repeat(100))
    expect(readMarker('Ho​ld')).toBe('Hold')
    expect(readMarker('​  ')).toBeNull()
    expect(readMarker(42)).toBeNull()
    expect(readMarker({})).toBeNull()
    expect(vitalsSchema.safeParse(vitals('a'.repeat(500))).success).toBe(true)
    const parsed: Vitals = vitalsSchema.parse(vitals(42))
    expect(parsed.concentration).toBeNull()
  })
})
