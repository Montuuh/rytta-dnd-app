import { describe, expect, it } from 'vitest'
import { describeHistory, familyOf } from './history'
import type { HistoryItem } from './sheet'

const item = (kind: string, changes: HistoryItem['changes']): HistoryItem => ({
  id: '00000000-0000-4000-8000-000000000001',
  at: '2026-11-18T10:00:00Z',
  kind,
  actor: 'self',
  actor_name: null,
  changes,
})

describe('RYT-130 history of a level-up', () => {
  const levelUp = item('level_up', [
    { field: 'level', before: 4, after: 5 },
    { field: 'max_hp', before: 38, after: 45 },
  ])

  it('is its own family, apart from a manual edit of the sheet', () => {
    expect(familyOf(levelUp)).toBe('levelUp')
    expect(familyOf(item('character_sheets:UPDATE', levelUp.changes))).toBe('sheet')
  })

  it('says the level and the maximum hit points before and after', () => {
    expect(describeHistory(levelUp)).toEqual([
      { key: 'number', field: 'level', before: 4, after: 5 },
      { key: 'number', field: 'max_hp', before: 38, after: 45 },
    ])
  })
})
