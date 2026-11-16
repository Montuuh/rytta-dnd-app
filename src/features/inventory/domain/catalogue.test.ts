import { describe, expect, it } from 'vitest'
import catalogue from '../content/basic-items.json'
import en from '../content/basic-items.en.json'
import es from '../content/basic-items.es.json'
import { basicItemCatalogueSchema, basicItemDescriptionsSchema } from './basic-items'
import {
  importBatches,
  importGroups,
  proposalSchema,
  proposalToDraft,
  rankStartingPoints,
  searchItemSchema,
  sortProposals,
  toImportItem,
  type CatalogueItem,
  type ItemProposal,
} from './catalogue'

const { items } = basicItemCatalogueSchema.parse(catalogue)
const descriptions = {
  en: basicItemDescriptionsSchema.parse(en),
  es: basicItemDescriptionsSchema.parse(es),
}
const find = (key: string) => items.find((item) => item.key === key)!
let n = 0
const uuid = () => `70000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const row = (partial: Partial<CatalogueItem>): CatalogueItem =>
  searchItemSchema.parse({
    id: uuid(),
    name: 'Item',
    description: '',
    translations: null,
    category: 'gear',
    icon: 'package',
    image_path: null,
    rarity: 'common',
    weight_lb: 1,
    slot_kind: 'none',
    properties: {},
    origin: 'dm',
    basic_key: null,
    is_template: false,
    value_gp: null,
    revision: 0,
    created_by_you: false,
    ...partial,
  })

describe('basic catalogue import', () => {
  it('sends the reader language as the base, both languages as translations and cents', () => {
    const item = toImportItem(find('arrows'), 'es', descriptions)
    expect(item).toMatchObject({
      key: 'arrows',
      name: find('arrows').name.es,
      description: descriptions.es.arrows,
      weight_lb: 0.05,
      value_gp: 0.05,
      rarity: 'common',
    })
    expect(item.translations.en).toEqual({ name: 'Arrow', description: descriptions.en.arrows })
    expect(toImportItem(find('backpack'), 'en', descriptions).name).toBe('Backpack')
    // The server stores lb with three decimals; a missing description is sent empty.
    const third = { ...find('backpack'), key: 'third', weightLb: 0.33333 }
    expect(toImportItem(third, 'en', descriptions)).toMatchObject({
      weight_lb: 0.333,
      description: '',
    })
  })
  it('keeps the catalogue properties the server validates within its limits', () => {
    for (const item of items) {
      const sent = toImportItem(item, 'en', descriptions).properties as {
        rations?: number
        water?: number
        container?: { loadReductionPercent: number }
      }
      if (sent.rations !== undefined) expect(sent.rations, item.key).toBeLessThanOrEqual(100)
      if (sent.water !== undefined) expect(sent.water, item.key).toBeLessThanOrEqual(100)
      if (sent.container)
        expect(sent.container.loadReductionPercent, item.key).toBeLessThanOrEqual(90)
    }
  })
  it('counts imported items per category and batches only what is missing', () => {
    const imported = new Set(['club', 'dagger', 'backpack'])
    const groups = importGroups(items, imported)
    const weapons = groups.find((group) => group.category === 'weapon')!
    expect(weapons.done).toBe(2)
    expect(weapons.total).toBe(items.filter((item) => item.category === 'weapon').length)
    const batches = importBatches(items, new Set(['weapon', 'gear'] as const), imported, 50)
    const keys = batches.flat().map((item) => item.key)
    expect(keys).not.toContain('club')
    expect(keys).not.toContain('backpack')
    expect(keys).not.toContain('plate')
    expect(batches.every((batch) => batch.length <= 50)).toBe(true)
    expect(importBatches(items, new Set(), imported)).toEqual([])
  })
})

describe('starting points and proposals', () => {
  it('offers templates first, then basic items, by localized name', () => {
    const own = row({ name: 'Aguja' })
    const basic = row({ name: 'Zurrón', basic_key: 'pouch' })
    const template = row({
      name: 'Yelmo',
      is_template: true,
      translations: { en: { name: 'Helm' } },
    })
    expect(rankStartingPoints([own, basic, template], 'es').map((i) => i.name)).toEqual([
      'Yelmo',
      'Zurrón',
      'Aguja',
    ])
  })
  it('reads numeric strings and refuses fractions of a cent', () => {
    expect(
      row({ value_gp: '12.5' as unknown as number, weight_lb: '0.125' as unknown as number }),
    ).toMatchObject({ value_gp: 12.5, weight_lb: 0.125 })
    expect(() => row({ value_gp: 0.001 })).toThrow()
  })
  const proposal = (partial: Partial<ItemProposal>): ItemProposal =>
    proposalSchema.parse({
      id: uuid(),
      character_id: uuid(),
      character_name: 'Arin',
      proposed_by_you: true,
      draft: { name: 'Laúd', category: 'tool', weight_lb: 2, suggested_value_gp: 35 },
      quantity: 1,
      status: 'pending',
      dm_note: '',
      resolved_definition_id: null,
      revision: 0,
      created_at: '2026-11-15T10:00:00Z',
      updated_at: '2026-11-15T10:00:00Z',
      resolved_at: null,
      ...partial,
    })
  it('puts pending proposals first, oldest first, then the latest answers', () => {
    const late = proposal({ created_at: '2026-11-15T12:00:00Z' })
    const early = proposal({ created_at: '2026-11-15T09:00:00Z' })
    const old = proposal({ status: 'rejected', updated_at: '2026-11-14T10:00:00Z' })
    const recent = proposal({ status: 'accepted', updated_at: '2026-11-15T11:00:00Z' })
    expect(sortProposals([old, late, recent, early])).toEqual([early, late, recent, old])
  })
  it('turns a proposal into a forge draft; only the DM sees the suggested price as the value', () => {
    const draft = proposal({}).draft
    expect(proposalToDraft(draft, true)).toMatchObject({
      name: 'Laúd',
      category: 'tool',
      weight_lb: 2,
      value_gp: 35,
      icon: 'package',
      rarity: 'common',
    })
    expect(proposalToDraft(draft, false).value_gp).toBeNull()
  })
})
