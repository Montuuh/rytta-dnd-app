import { describe, expect, it } from 'vitest'
import type { CampaignRoll } from '@/features/campaigns'
import { identityChanged } from '@/shared/lib/identity-scope'
import { madeRoll, madeRollKey, rememberMadeRoll } from './made-rolls'

const roll = { id: 'roll-1', dice: [6, 3] } as unknown as CampaignRoll

describe('RYT-135 hit dice rolled on this screen while the roll log is down', () => {
  it('returns the server roll for the same account and rest and nothing for another', () => {
    const key = madeRollKey('u1', 'campaign', 'character', '2026-11-18T10:00:00Z')
    expect(madeRoll(key)).toBeUndefined()
    rememberMadeRoll(key, roll)
    expect(madeRoll(key)).toBe(roll)
    expect(
      madeRoll(madeRollKey('u1', 'campaign', 'character', '2026-11-18T11:00:00Z')),
    ).toBeUndefined()
    expect(madeRoll(madeRollKey('u1', 'campaign', 'other', '2026-11-18T10:00:00Z'))).toBeUndefined()
    // Another account on the same device never reads it.
    expect(
      madeRoll(madeRollKey('u2', 'campaign', 'character', '2026-11-18T10:00:00Z')),
    ).toBeUndefined()
  })
  it('is emptied when the account changes or signs out', () => {
    const key = madeRollKey('u1', 'campaign', 'character', 'rest')
    identityChanged('u1')
    rememberMadeRoll(key, roll)
    identityChanged(null)
    expect(madeRoll(key)).toBeUndefined()
    rememberMadeRoll(key, roll)
    identityChanged('u2')
    expect(madeRoll(key)).toBeUndefined()
  })
})
