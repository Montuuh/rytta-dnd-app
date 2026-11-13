import { describe, expect, it } from 'vitest'
import { leaveBlock } from './campaign'

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
