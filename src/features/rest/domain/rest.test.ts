import { describe, expect, it } from 'vitest'
import {
  minutesLeft,
  restError,
  restStateSchema,
  rollValid,
  shortRestHeal,
  tally,
  voteMark,
  type RestState,
} from './rest'

const person = (over: Partial<RestState['participants'][number]> = {}) => ({
  id: crypto.randomUUID(),
  name: 'Kaela',
  own: false,
  dm_controlled: false,
  controlled: false,
  vote: null,
  dice_spent: 0,
  can_rest: true,
  shares: true,
  effect: null,
  ...over,
})
const state = (participants: ReturnType<typeof person>[]): RestState =>
  restStateSchema.parse({
    id: crypto.randomUUID(),
    kind: 'long',
    status: 'open',
    created_at: '2026-11-10T10:00:00Z',
    expires_at: '2026-11-10T10:10:00Z',
    resolved_at: null,
    revision: 1,
    requester_name: 'Kaela',
    mine: false,
    dm: false,
    can_cancel: false,
    participants,
  })!

describe('RYT-080 group rest domain', () => {
  it('counts voters with HP and lists who still has to vote', () => {
    const waiting = person({ name: 'Toro' })
    const s = state([person({ vote: 'yes' }), waiting, person({ name: 'Bruma', can_rest: false })])
    expect(tally(s)).toEqual({ total: 2, yes: 1, waiting: [waiting] })
    expect(s.participants.map(voteMark)).toEqual(['yes', 'wait', 'cannot'])
  })

  it('heals the roll plus CON per die, at least 1 per die, and validates the roll', () => {
    expect(shortRestHeal(2, 9, 2)).toBe(13)
    expect(shortRestHeal(2, 2, -3)).toBe(2)
    expect(shortRestHeal(0, 0, 4)).toBe(0)
    expect(rollValid({ spent: 0, roll: '' }, 8)).toBe(true)
    expect(rollValid({ spent: 2, roll: '16' }, 8)).toBe(true)
    for (const roll of ['', '1', '17', '2.5']) expect(rollValid({ spent: 2, roll }, 8)).toBe(false)
  })

  it('maps server messages and minutes left', () => {
    expect(restError('Rest open')).toBe('open')
    expect(restError('Character in combat')).toBe('combat')
    expect(restError('Rest closed')).toBe('closed')
    expect(restError('Invalid dice')).toBe('dice')
    expect(restError('Cannot rest')).toBe('cannotRest')
    expect(restError('Forbidden')).toBe('forbidden')
    expect(restError('boom')).toBe('unavailable')
    const s = state([])
    expect(minutesLeft(s, Date.parse('2026-11-10T10:01:30Z'))).toBe(9)
    expect(minutesLeft(s, Date.parse('2026-11-10T11:00:00Z'))).toBe(0)
  })

  it('accepts no request and rejects malformed effects', () => {
    expect(restStateSchema.parse(null)).toBeNull()
    expect(() => state([person({ effect: { can_rest: true } as never })])).toThrow()
  })
})
