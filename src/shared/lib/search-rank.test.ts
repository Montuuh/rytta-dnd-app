import { describe, expect, it } from 'vitest'
import { foldSearch, matchRank, rankSearch } from './search-rank'

describe('search ranking', () => {
  it('folds case, accents and punctuation', () => {
    expect(foldSearch('  Poción  de Curación! ')).toBe('pocion de curacion')
    expect(foldSearch("Hobgoblin's")).toBe('hobgoblins')
  })

  it('ranks a start, a word start and anything else', () => {
    expect(matchRank('gob', ['Goblin'])).toBe(0)
    expect(matchRank('gob', ['Capitán hobgoblin'])).toBe(2)
    expect(matchRank('gob', ['Guerrero goblin'])).toBe(1)
    expect(matchRank('gob', ['Capitán hobgoblin gob'])).toBe(1)
    expect(matchRank('zzz', ['Goblin'])).toBeNull()
  })

  it('takes the best rank over the labels and ignores accents', () => {
    expect(matchRank('pocion', ['Antídoto', 'Poción de curación'])).toBe(0)
    expect(matchRank('CURACION', ['Poción de curación'])).toBe(1)
    expect(matchRank('goblin', ['Capitán hobgoblin', 'Goblin warrior'])).toBe(0)
  })

  it('puts starts first, then word starts, then other matches, keeping the incoming order', () => {
    const names = ['Capitán hobgoblin', 'Guerrero goblin', 'Goblin', 'Arquero goblin', 'Trasgo']
    expect(rankSearch(names, 'goblin', (name) => [name])).toEqual([
      'Goblin',
      'Guerrero goblin',
      'Arquero goblin',
      'Capitán hobgoblin',
    ])
  })

  it('returns everything for an empty query and nothing for no match', () => {
    const names = ['b', 'a']
    expect(rankSearch(names, '  ', (name) => [name])).toEqual(['b', 'a'])
    expect(rankSearch(names, 'q', (name) => [name])).toEqual([])
  })
})
