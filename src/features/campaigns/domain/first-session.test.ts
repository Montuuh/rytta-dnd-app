import { describe, expect, it } from 'vitest'
import { firstSessionSteps } from './first-session'

const dm = { user_id: 'dm', role: 'dm' }
const arin = { user_id: 'arin', role: 'player' }
const bea = { user_id: 'bea', role: 'player' }
const character = (
  user_id: string | null,
  extra: { archived?: boolean; absent?: boolean } = {},
) => ({
  user_id,
  archived_at: extra.archived ? '2026-11-01T00:00:00Z' : null,
  absent: extra.absent ?? false,
})
const implemented = new Set(['party', 'combat'])
const steps = (input: Partial<Parameters<typeof firstSessionSteps>[0]>) =>
  firstSessionSteps({
    members: [dm],
    pendingInvitations: 0,
    roster: [],
    modules: [],
    implemented,
    ...input,
  })

describe('RYT-179 first-session steps', () => {
  it('starts with nothing done', () => {
    expect(steps({})).toMatchObject({
      joined: false,
      pending: 0,
      modules: false,
      linked: false,
      available: false,
      unlinked: [],
      nextMember: undefined,
      complete: false,
    })
  })

  it('counts only shipped modules as a choice', () => {
    expect(steps({ modules: ['atlas'] }).modules).toBe(false)
    expect(steps({ modules: ['atlas', 'party'] }).modules).toBe(true)
  })

  it('lists the joined players without a current character, archived ones do not count', () => {
    const result = steps({
      members: [dm, arin, bea],
      roster: [character('arin'), character('bea', { archived: true })],
    })
    expect(result.joined).toBe(true)
    expect(result.linked).toBe(false)
    expect(result.unlinked).toEqual([bea])
    expect(result.nextMember).toBe(bea)
  })

  it('offers a free character only when it is neither archived nor benched', () => {
    expect(steps({ roster: [character(null, { absent: true })] }).available).toBe(false)
    expect(steps({ roster: [character(null, { archived: true })] }).available).toBe(false)
    expect(steps({ roster: [character(null)] }).available).toBe(true)
  })

  it('a pending invitation is not a joined player', () => {
    expect(steps({ pendingInvitations: 2 })).toMatchObject({ joined: false, pending: 2 })
  })

  it('is complete once a player joined, modules are chosen and every player has a character', () => {
    expect(
      steps({ members: [dm, arin], roster: [character('arin')], modules: ['party'] }).complete,
    ).toBe(true)
    expect(steps({ members: [dm, arin], roster: [character('arin')] }).complete).toBe(false)
  })
})
