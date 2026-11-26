import { describe, expect, it } from 'vitest'
import type { ContentCategory, ContentPack } from '../domain/content'
import { entryLine, packParts } from './summary'

const category = (
  name: ContentCategory,
  enabled: boolean,
  entries: number,
  kinds: Record<string, number> = {},
) => ({ category: name, enabled, pinned_version: 1, entries, hidden: 0, kinds })
const pack = (categories: ContentPack['categories']): ContentPack => ({
  id: '80000000-0000-4000-8000-000000000001',
  slug: 'base',
  title_en: 'Base',
  title_es: 'Base',
  offered: true,
  srd: true,
  version: 1,
  cover: null,
  categories,
})

describe('packParts', () => {
  it('numbers creatures, spells and classes, and names rules and items', () => {
    const result = packParts(
      pack([
        category('creatures', true, 400, { creature: 330, 'creature-trait': 70 }),
        category('spells', true, 339, { spell: 339 }),
        category('classes', true, 60, { class: 12, subclass: 12, feature: 36 }),
        category('rules', true, 90, { rule: 90 }),
        category('items', true, 200, { item: 200 }),
      ]),
    )
    expect(result.partial).toBe(false)
    expect(result.parts).toEqual([
      { category: 'creatures', count: 330 },
      { category: 'spells', count: 339 },
      { category: 'classes', count: 12 },
      { category: 'rules', count: null },
      { category: 'items', count: null },
    ])
  })

  it('names only what is in use and says the pack is partly used', () => {
    const result = packParts(
      pack([
        category('creatures', true, 3, { creature: 3 }),
        category('spells', true, 5, { spell: 5 }),
        category('items', false, 9, { item: 9 }),
      ]),
    )
    expect(result.partial).toBe(true)
    expect(result.parts.map((part) => part.category)).toEqual(['creatures', 'spells'])
  })

  it('numbers a pack of one thing even when it is an item list', () => {
    expect(packParts(pack([category('items', true, 42, { item: 42 })])).parts).toEqual([
      { category: 'items', count: 42 },
    ])
  })

  it('describes an unused pack by everything it has', () => {
    const result = packParts(pack([category('creatures', false, 18, { creature: 18 })]), true)
    expect(result).toEqual({ parts: [{ category: 'creatures', count: 18 }], partial: false })
  })

  it('leaves out empty categories and counts without a breakdown', () => {
    const result = packParts(
      pack([
        category('creatures', true, 7),
        category('classes', true, 4),
        category('spells', true, 0),
      ]),
    )
    expect(result.parts).toEqual([
      { category: 'creatures', count: 7 },
      { category: 'classes', count: null },
    ])
  })
})

describe('entryLine', () => {
  it('reads a creature, a spell and an item from their index', () => {
    expect(entryLine('creature', { type: 'dragon', cr: '17' })).toEqual({
      kind: 'creature',
      type: 'dragon',
      cr: '17',
    })
    expect(entryLine('spell', { lv: 0, sc: 'evocation' })).toEqual({
      kind: 'spell',
      level: 0,
      school: 'evocation',
    })
    expect(entryLine('item', { category: 'weapon' })).toEqual({ kind: 'item', category: 'weapon' })
  })

  it('has no line for other kinds or an empty index', () => {
    expect(entryLine('rule', { cat: 'rule' })).toBeNull()
    expect(entryLine('creature', {})).toBeNull()
    expect(entryLine('item', { category: 3 })).toBeNull()
  })
})
