import { describe, expect, it } from 'vitest'
import type { CampaignRoll } from '@/features/campaigns'
import { madeRoll, madeRollKey, rememberMadeRoll } from './made-rolls'

const roll = { id: 'roll-1', dice: [6, 3] } as unknown as CampaignRoll

describe('RYT-135 hit dice rolled on this screen while the roll log is down', () => {
  it('returns the server roll for the same rest and nothing for another one', () => {
    const key = madeRollKey('campaign', 'character', '2026-11-18T10:00:00Z')
    expect(madeRoll(key)).toBeUndefined()
    rememberMadeRoll(key, roll)
    expect(madeRoll(key)).toBe(roll)
    expect(madeRoll(madeRollKey('campaign', 'character', '2026-11-18T11:00:00Z'))).toBeUndefined()
    expect(madeRoll(madeRollKey('campaign', 'other', '2026-11-18T10:00:00Z'))).toBeUndefined()
  })
})
