import { describe, expect, it } from 'vitest'
import type { BasicItem } from '@/features/inventory'
import { newRequestId } from '@/shared/lib/request-id'
import { chunks, listingPlan, stockLanguage, typeItems } from './stocking'

const item = (key: string, over: Partial<BasicItem> = {}): BasicItem => ({
  key,
  source: 'srd',
  name: { en: `${key} en`, es: `${key} es` },
  descriptionSource: 'srd',
  category: 'gear',
  icon: 'package',
  slot_kind: 'none',
  weightLb: 1,
  costCp: 150,
  properties: {},
  ...over,
})

describe('shop type stocking plan', () => {
  it('keeps the type order and leaves out keys the catalogue lacks', () => {
    const catalogue = [item('rope'), item('torch'), item('lantern')]
    expect(typeItems({ stock: ['torch', 'missing', 'rope'] }, catalogue).map((i) => i.key)).toEqual(
      ['torch', 'rope'],
    )
  })

  it('reads the interface language', () => {
    expect(stockLanguage('en-GB')).toBe('en')
    expect(stockLanguage('fr')).toBe('es')
  })

  it('lists created and existing definitions once, at the catalogue price, and reports archived ones', () => {
    const [rope, torch, lantern, oil] = [
      item('rope', { costCp: 100 }),
      item('torch', { costCp: 1 }),
      item('lantern', { costCp: 500 }),
      item('oil', { costCp: 10 }),
    ]
    const ids = { rope: newRequestId(), torch: newRequestId(), lantern: newRequestId() }
    const result = {
      created: [{ key: 'rope', id: ids.rope }],
      updated: [],
      skipped: [
        { key: 'torch', id: ids.torch, archived: false },
        { key: 'lantern', id: ids.lantern, archived: true },
      ],
    }
    const plan = listingPlan([rope!, torch!, lantern!, oil!], [result])
    expect(plan.listings).toEqual([
      { definition_id: ids.rope, price: 1 },
      { definition_id: ids.torch, price: 0.01 },
    ])
    expect(plan.unavailable.map((i) => i.key)).toEqual(['lantern'])
  })

  it('is stable across retries: the same import yields the same listings', () => {
    const rope = item('rope')
    const id = newRequestId()
    const first = listingPlan(
      [rope],
      [{ created: [{ key: 'rope', id }], updated: [], skipped: [] }],
    )
    const retry = listingPlan(
      [rope],
      [{ created: [], updated: [], skipped: [{ key: 'rope', id, archived: false }] }],
    )
    expect(retry).toEqual(first)
  })

  it('splits requests to the server limits', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunks([], 200)).toEqual([])
  })
})
