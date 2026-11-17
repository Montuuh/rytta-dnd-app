import { describe, expect, it } from 'vitest'
import {
  campaignSettingsReason,
  campaignSettingsSchema,
  isBelowPartyLevel,
  rollExpressionSchema,
} from './settings'

describe('RYT-130 / RYT-133 campaign settings', () => {
  it('parses the settings with the database defaults', () => {
    expect(campaignSettingsSchema.parse({})).toEqual({
      party_level: null,
      dice_mode: 'physical',
      roll_visibility: 'roller_dm',
    })
    expect(() => campaignSettingsSchema.parse({ party_level: 21 })).toThrow()
  })

  it('prompts only below a set party level', () => {
    expect(isBelowPartyLevel(2, 3)).toBe(true)
    expect(isBelowPartyLevel(3, 3)).toBe(false)
    expect(isBelowPartyLevel(1, null)).toBe(false)
    expect(isBelowPartyLevel(null, 3)).toBe(false)
  })

  it('accepts the same expressions as the server', () => {
    for (const ok of ['d20', 'd20+5', '2d6-1', '2d20kh1+3', '1d8+1d6+2', 'd100'])
      expect(rollExpressionSchema.safeParse(ok).success, ok).toBe(true)
    for (const bad of ['d7', '20', 'd20+', '0d6', 'd20 + 5', '2d6*2', 'x'.repeat(41)])
      expect(rollExpressionSchema.safeParse(bad).success, bad).toBe(false)
  })

  it('maps messages to reasons', () => {
    expect(campaignSettingsReason('Invalid roll')).toBe('invalid')
    expect(campaignSettingsReason('Request mismatch')).toBe('request-mismatch')
    expect(campaignSettingsReason('Sheet incomplete')).toBe('sheet-incomplete')
    expect(campaignSettingsReason('other')).toBe('unavailable')
  })
})
