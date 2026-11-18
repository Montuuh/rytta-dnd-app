import { describe, expect, it } from 'vitest'
import { describeHistory, familyOf, foldLevelUps } from './history'
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

describe('RYT-130 one level-up, one history entry', () => {
  const at = '2026-11-18T10:00:00Z'
  const trio = (): HistoryItem[] => [
    {
      ...item('character_vitals:UPDATE', [{ field: 'current_hp', before: 30, after: 37 }]),
      id: '00000000-0000-4000-8000-000000000003',
      at,
    },
    {
      ...item('character_sheets:UPDATE', [
        { field: 'level', before: 4, after: 5 },
        { field: 'max_hp', before: 38, after: 45 },
        {
          field: 'build.features',
          before: [],
          after: [{ id: 'srd-bard-font', name: 'Font of Inspiration' }],
        },
        {
          field: 'build.trackers',
          before: [],
          after: [
            { id: 'class-feat', key: 'feat-magic-initiate', name: 'feat-magic-initiate', max: 1 },
          ],
        },
      ]),
      id: '00000000-0000-4000-8000-000000000002',
      at,
    },
    {
      ...item('level_up', [
        { field: 'level', before: 4, after: 5 },
        { field: 'max_hp', before: 38, after: 45 },
      ]),
      at,
    },
    {
      ...item('character_resources:UPDATE', [{ field: 'gold', before: 1, after: 2 }]),
      at: '2026-11-01T00:00:00Z',
    },
  ]

  it('folds the rows of the same transaction into the level-up entry', () => {
    const folded = foldLevelUps(trio())
    expect(folded.map((entry) => entry.kind)).toEqual(['level_up', 'character_resources:UPDATE'])
    const lines = describeHistory(folded[0]!)
    // The level and the maximum are said once; the sheet's choices follow.
    expect(lines.filter((line) => line.key === 'number')).toHaveLength(2)
    expect(lines).toContainEqual({ key: 'added', field: 'features', name: 'Font of Inspiration' })
    expect(lines).toContainEqual({
      key: 'added',
      field: 'trackers',
      name: 'feat-magic-initiate',
      ref: 'feat-magic-initiate',
    })
  })

  it('leaves entries alone when no level-up shares their time', () => {
    const edit = [item('character_sheets:UPDATE', [{ field: 'level', before: 4, after: 5 }])]
    expect(foldLevelUps(edit)).toBe(edit)
    const elsewhere = [...trio().slice(0, 2), { ...trio()[2]!, at: '2026-11-19T00:00:00Z' }]
    expect(foldLevelUps(elsewhere)).toHaveLength(3)
  })
})
