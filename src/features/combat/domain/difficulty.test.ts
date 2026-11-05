import { describe, expect, it } from 'vitest'
import {
  bandRoom,
  characterBudget,
  difficultyBand,
  encounterBalance,
  partyBudget,
  pickSuggestions,
  seededRandom,
  suggestEncounters,
  suggestionCandidates,
  type BalanceCreature,
  type SuggestionCreature,
} from './difficulty'

const four = (level: number) => ['A', 'B', 'C', 'D'].map((name) => ({ id: name, name, level }))
const enemy = (key: string, name: string, cr: string, xp: number, extra = {}): BalanceCreature => ({
  key,
  name,
  side: 'enemy',
  cr,
  xp,
  ...extra,
})

describe('SRD 5.2.1 XP budget', () => {
  it('reads the XP Budget per Character table', () => {
    expect(characterBudget(1)).toEqual({ low: 50, moderate: 75, high: 100 })
    expect(characterBudget(5)).toEqual({ low: 500, moderate: 750, high: 1100 })
    expect(characterBudget(20)).toEqual({ low: 6400, moderate: 13200, high: 22000 })
    expect(characterBudget(0)).toEqual(characterBudget(1))
    expect(characterBudget(25)).toEqual(characterBudget(20))
  })

  it('multiplies by the party and adds mixed levels character by character', () => {
    // SRD examples: four level 1 characters (Low 200) and five level 3 (Moderate 1,125).
    expect(partyBudget([1, 1, 1, 1]).low).toBe(200)
    expect(partyBudget([3, 3, 3, 3, 3]).moderate).toBe(1125)
    expect(partyBudget([15, 15, 15, 15, 15, 15]).high).toBe(46800)
    expect(partyBudget([2, 4])).toEqual({ low: 350, moderate: 525, high: 700 })
  })

  it('places spent XP in the smallest budget that holds it', () => {
    const budget = partyBudget([1, 1, 1, 1])
    expect(difficultyBand(0, budget)).toBe('none')
    // SRD example 1: six Giant Rats (150 XP) are a low-difficulty build for four level 1 characters.
    expect(difficultyBand(150, budget)).toBe('low')
    expect(difficultyBand(200, budget)).toBe('low')
    expect(difficultyBand(201, budget)).toBe('moderate')
    expect(difficultyBand(400, budget)).toBe('high')
    expect(difficultyBand(401, budget)).toBe('aboveHigh')
    expect(bandRoom(150, budget)).toBe(50)
    expect(bandRoom(450, budget)).toBe(-50)
    expect(bandRoom(0, budget)).toBe(200)
  })
})

describe('encounterBalance', () => {
  it('groups creatures, spends enemy XP and lists allies and unrated creatures apart', () => {
    const balance = encounterBalance(four(3), [
      enemy('srd:wight', 'Wight', '3', 700),
      enemy('srd:skeleton', 'Skeleton', '1/4', 50),
      enemy('srd:skeleton', 'Skeleton', '1/4', 50, { hidden: true }),
      { key: 'Bandit', name: 'Bandit', side: 'enemy', cr: null, xp: null },
      { key: 'srd:mastiff', name: 'Mastiff', side: 'ally', cr: '1/8', xp: 25 },
    ])
    expect(balance.budget).toEqual({ low: 600, moderate: 900, high: 1600 })
    expect(balance.xp).toBe(800)
    expect(balance.band).toBe('moderate')
    expect(balance.room).toBe(100)
    expect(balance.enemies).toBe(4)
    expect(balance.mainType).toBeNull()
    expect(balance.groups.map((g) => [g.name, g.count, g.xp, g.excluded, g.hidden])).toEqual([
      ['Wight', 1, 700, null, 0],
      ['Skeleton', 2, 100, null, 1],
      ['Bandit', 1, 0, 'unrated', 0],
      ['Mastiff', 1, 0, 'ally', 0],
    ])
  })

  it('names the most common type of the rated enemies', () => {
    const balance = encounterBalance(four(3), [
      enemy('srd:wight', 'Wight', '3', 700, { type: 'undead' }),
      enemy('srd:zombie', 'Zombie', '1/4', 50, { type: 'undead' }),
      enemy('srd:wolf', 'Wolf', '1/4', 50, { type: 'beast' }),
      { key: 'x', name: 'Cultist', side: 'enemy', cr: null, xp: null, type: 'humanoid' },
    ])
    expect(balance.mainType).toBe('undead')
  })

  it('counts characters without a sheet as level 1 and says who they are', () => {
    const balance = encounterBalance(
      [
        { id: 'a', name: 'Arin', level: 5 },
        { id: 'b', name: 'Bea', level: null },
      ],
      [],
    )
    expect(balance.budget.low).toBe(550)
    expect(balance.assumed).toEqual(['Bea'])
    expect(balance.level).toBe(3)
    expect(balance.band).toBe('none')
  })

  it('writes the SRD troubleshooting notes the draft triggers', () => {
    const rats = Array.from({ length: 9 }, () => enemy('srd:rat', 'Rat', '0', 10))
    const balance = encounterBalance(four(1), [
      ...rats,
      enemy('srd:ogre', 'Ogre', '2', 450),
      enemy('srd:goblin', 'Goblin', '1/4', 50),
      enemy('srd:wolf', 'Wolf', '1/4', 50),
    ])
    expect(balance.notes).toEqual([
      { kind: 'many', creatures: 12, party: 4, lowLevel: true },
      { kind: 'statBlocks', count: 4 },
      { kind: 'powerful', names: ['Ogre'], level: 1 },
      { kind: 'cr0', names: ['Rat'] },
    ])
    expect(
      encounterBalance(four(1), [enemy('srd:rats', 'Swarm of Rats', '0', 10, { swarm: true })])
        .notes,
    ).toEqual([])
  })

  it('needs a party for the notes about the party', () => {
    expect(encounterBalance([], [enemy('srd:ogre', 'Ogre', '2', 450)]).notes).toEqual([])
  })
})

describe('suggestEncounters', () => {
  const pool: SuggestionCreature[] = [
    { key: 'srd:bugbear', name: 'Bugbear Warrior', cr: '1', xp: 200, type: 'humanoid' },
    { key: 'srd:goblin', name: 'Goblin Warrior', cr: '1/4', xp: 50, type: 'humanoid' },
    { key: 'srd:wasp', name: 'Giant Wasp', cr: '1/2', xp: 100, type: 'beast' },
    { key: 'srd:rat', name: 'Giant Rat', cr: '1/8', xp: 25, type: 'beast' },
    { key: 'srd:ogre', name: 'Ogre', cr: '2', xp: 450, type: 'giant' },
    { key: 'srd:frog', name: 'Frog', cr: '0', xp: 10, type: 'beast' },
    { key: 'srd:ravens', name: 'Swarm of Ravens', cr: '1/4', xp: 50, type: 'beast', swarm: true },
  ]
  const base = { pool, remaining: 200, party: 4, level: 1, enemies: 0, random: seededRandom(7) }

  it('spends the XP left without going over and keeps the SRD limits', () => {
    for (const kinds of [1, 2] as const) {
      const ideas = suggestEncounters({ ...base, kinds })
      expect(ideas.length).toBeGreaterThan(0)
      for (const idea of ideas) {
        expect(idea.xp).toBeLessThanOrEqual(200)
        expect(idea.groups).toHaveLength(kinds)
        const creatures = idea.groups.reduce((s, g) => s + g.count, 0)
        expect(creatures).toBeLessThanOrEqual(8)
        for (const g of idea.groups) {
          expect(g.creature.key).not.toBe('srd:ogre')
          expect(g.creature.key).not.toBe('srd:frog')
        }
      }
    }
  })

  it('finds the SRD example builds for 200 XP', () => {
    const keys = suggestEncounters({ ...base, kinds: 1, count: 10 }).map((s) => s.key)
    expect(keys).toContain('1xsrd:bugbear')
    expect(keys).toContain('2xsrd:wasp')
  })

  it('pairs one leader with at least two lower-XP creatures of the same type', () => {
    const ideas = suggestEncounters({ ...base, kinds: 2, remaining: 300, level: 2, count: 10 })
    expect(ideas.length).toBeGreaterThan(0)
    for (const idea of ideas) {
      const [lead, band] = idea.groups
      expect(lead!.count).toBe(1)
      expect(band!.count).toBeGreaterThanOrEqual(2)
      expect(lead!.creature.xp).toBeGreaterThan(band!.creature.xp)
      expect(lead!.creature.type).toBe(band!.creature.type)
    }
  })

  it('honours the creature type, the two creatures per character and an empty budget', () => {
    const beasts = suggestEncounters({ ...base, kinds: 1, type: 'beast', count: 10 })
    expect(beasts.every((s) => s.groups.every((g) => g.creature.type === 'beast'))).toBe(true)
    const crowded = suggestEncounters({ ...base, kinds: 1, enemies: 7, count: 10 })
    expect(crowded.every((s) => s.groups[0]!.count === 1)).toBe(true)
    // The draft already has two creatures per character: nothing more is suggested.
    expect(suggestEncounters({ ...base, kinds: 1, enemies: 8 })).toEqual([])
    expect(suggestEncounters({ ...base, kinds: 2, enemies: 6 })).toEqual([])
    expect(suggestEncounters({ ...base, kinds: 1, remaining: 0 })).toEqual([])
    expect(suggestEncounters({ ...base, kinds: 1, party: 0 })).toEqual([])
  })

  it('draws new ideas first and says when none are left', () => {
    const candidates = suggestionCandidates({ ...base, kinds: 1, remaining: 300, level: 2 })
    expect(candidates.map((s) => s.key).sort()).toEqual([
      '3xsrd:wasp',
      '6xsrd:goblin',
      '6xsrd:ravens',
    ])
    const first = pickSuggestions(candidates, { count: 2, random: seededRandom(3) })
    expect(first.fresh).toBe(2)
    const again = pickSuggestions(candidates, {
      count: 2,
      avoid: new Set(first.ideas.map((s) => s.key)),
      random: seededRandom(5),
    })
    expect(again.fresh).toBe(1)
    const none = pickSuggestions(candidates, {
      count: 2,
      avoid: new Set(candidates.map((s) => s.key)),
    })
    expect(none.fresh).toBe(0)
    expect(none.ideas).toHaveLength(2)
  })
})
