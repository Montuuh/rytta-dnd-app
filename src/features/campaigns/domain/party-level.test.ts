import { describe, expect, it } from 'vitest'
import {
  createPartyRequestIds,
  orderPartyCharacters,
  partyBelow,
  partyStanding,
  partySuggested,
  raiseTarget,
} from './party-level'

const row = (level: number | null, status: 'draft' | 'complete' | null, below?: boolean) => ({
  level,
  sheet_status: status,
  below_party_level: below,
})

describe('RYT-130 party level helpers', () => {
  it('counts the finished characters below the party level, once the list is there', () => {
    expect(partyBelow(undefined)).toBeUndefined()
    expect(partyBelow([])).toBe(0)
    expect(partyBelow([row(3, 'complete', true), row(5, 'complete', false), row(1, 'draft')])).toBe(
      1,
    )
  })

  it('suggests the highest finished level and nothing without one', () => {
    expect(partySuggested(undefined)).toBeUndefined()
    expect(partySuggested([])).toBeUndefined()
    expect(partySuggested([row(9, 'draft'), row(null, null)])).toBeUndefined()
    expect(partySuggested([row(3, 'complete'), row(6, 'complete'), row(9, 'draft')])).toBe(6)
  })
})

describe('RYT-130 party level request ids', () => {
  const ids = () => {
    let n = 0
    return createPartyRequestIds(() => `id-${++n}`)
  }

  it('repeats the id of the same change until it succeeds', () => {
    const registry = ids()
    const first = registry.idFor(null, 5)
    expect(registry.idFor(null, 5)).toBe(first)
    registry.done(null, 5)
    expect(registry.idFor(null, 5)).not.toBe(first)
  })

  it('never replays an old id once the level moved: set 5 (reply lost), set 6, set 5 again', () => {
    const registry = ids()
    const lost = registry.idFor(null, 5)
    const six = registry.idFor(null, 6)
    registry.done(null, 6)
    // The campaign holds 6 now; asking for 5 is a new change with a new id.
    const back = registry.idFor(6, 5)
    expect(new Set([lost, six, back]).size).toBe(3)
  })

  it('forgets every id when asked to reset', () => {
    const registry = ids()
    const first = registry.idFor(3, 4)
    registry.reset()
    expect(registry.idFor(3, 4)).not.toBe(first)
  })

  it('tells clearing apart from setting', () => {
    const registry = ids()
    expect(registry.idFor(4, null)).not.toBe(registry.idFor(4, 3))
  })
})

describe('RYT-180 party level panel helpers', () => {
  const character = (name: string, below: boolean, draft = false) => ({
    id: name,
    name,
    level: draft ? null : 4,
    below,
    draft,
    href: `/${name}`,
  })

  it('lists the characters below the party level first, then by name', () => {
    const ordered = orderPartyCharacters([
      character('Bea', false),
      character('Cato', true),
      character('Arin', false),
      character('Dora', true),
    ])
    expect(ordered.map((entry) => entry.name)).toEqual(['Cato', 'Dora', 'Arin', 'Bea'])
  })

  it('counts only finished sheets, and those below the level among them', () => {
    expect(partyStanding([])).toEqual({ below: 0, total: 0 })
    expect(
      partyStanding([character('A', true), character('B', false), character('C', false, true)]),
    ).toEqual({ below: 1, total: 2 })
  })

  it('raises by one, starts at the suggestion while unset and stops at the highest level', () => {
    expect(raiseTarget(6, undefined)).toBe(7)
    expect(raiseTarget(19, undefined)).toBe(20)
    expect(raiseTarget(20, undefined)).toBeNull()
    expect(raiseTarget(null, 5)).toBe(5)
    expect(raiseTarget(null, undefined)).toBe(1)
  })
})
