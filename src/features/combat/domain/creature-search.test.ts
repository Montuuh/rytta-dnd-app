import { describe, expect, it } from 'vitest'
import { searchCreatures } from './creature-search'

const names = (items: readonly { name: string }[]) => items.map((item) => item.name)

describe('searchCreatures', () => {
  const creatures = [
    { name: 'Capitán hobgoblin', altName: 'Hobgoblin Captain' },
    { name: 'Goblin', altName: 'Goblin' },
    { name: 'Guerrero goblin', altName: 'Goblin Warrior' },
    { name: 'Hobgoblin', altName: 'Hobgoblin' },
    { name: 'Jefe goblin', altName: 'Goblin Boss' },
    { name: 'Lobo', altName: 'Wolf' },
  ]

  it('puts names that start with the query first, then names with a word that starts with it', () => {
    expect(names(searchCreatures(creatures, 'goblin'))).toEqual([
      'Goblin',
      'Guerrero goblin',
      'Jefe goblin',
      'Capitán hobgoblin',
      'Hobgoblin',
    ])
  })

  it('never lets a match inside a word beat a name or word that starts with the query', () => {
    expect(searchCreatures(creatures, 'goblin')[0]?.name).toBe('Goblin')
    const first = searchCreatures(creatures.slice(0, 1).concat(creatures.slice(2)), 'goblin')[0]
    expect(first?.name).toBe('Guerrero goblin')
  })

  it('ignores accents and case and finds the other language', () => {
    expect(names(searchCreatures(creatures, 'CAPITAN'))).toEqual(['Capitán hobgoblin'])
    expect(names(searchCreatures(creatures, 'wolf'))).toEqual(['Lobo'])
  })

  it('keeps every word of a longer query, in any order', () => {
    expect(names(searchCreatures(creatures, 'goblin guerrero'))).toEqual(['Guerrero goblin'])
  })

  it('keeps the incoming order inside a rank and returns a blank query untouched', () => {
    const sorted = [{ name: 'Ala' }, { name: 'Bala' }, { name: 'Cala' }]
    expect(names(searchCreatures(sorted, 'la'))).toEqual(['Ala', 'Bala', 'Cala'])
    expect(searchCreatures(sorted, '  ')).toEqual(sorted)
  })
})
