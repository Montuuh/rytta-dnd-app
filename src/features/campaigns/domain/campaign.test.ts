import { describe, expect, it } from 'vitest'
import { leaveBlock, membershipReason } from './campaign'

describe('RYT-095 leaving a campaign', () => {
  it('blocks only the last DM, and waits for the member list', () => {
    expect(leaveBlock('player', undefined)).toBeNull()
    expect(leaveBlock('dm', undefined)).toBe('checking')
    expect(leaveBlock('dm', [{ role: 'dm' }, { role: 'player' }])).toBe('last-dm')
    expect(leaveBlock('dm', [{ role: 'dm' }, { role: 'dm' }])).toBeNull()
    // A list that failed to load leaves the decision to the server.
    expect(leaveBlock('dm', undefined, true)).toBeNull()
  })
})

describe('RYT-113 campaign quota errors', () => {
  it('maps every quota and invitation throttle message to its own reason', () => {
    expect(membershipReason('Campaign limit')).toBe('campaign-limit')
    expect(membershipReason('Member limit')).toBe('member-limit')
    expect(membershipReason('Too many invitations')).toBe('too-many-invitations')
    expect(membershipReason('Recipient invitation limit')).toBe('recipient-limit')
    expect(membershipReason('Invitation declined')).toBe('invitation-declined')
    expect(membershipReason('Keep at least one DM')).toBe('last-dm')
    expect(membershipReason('Already a member')).toBe('already-member')
    expect(membershipReason('Forbidden')).toBe('unavailable')
  })
})
