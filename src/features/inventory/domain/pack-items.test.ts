import { describe, expect, it } from 'vitest'
import catalogue from '../../../../tests/fixtures/srd/items/basic-items.json'
import en from '../../../../tests/fixtures/srd/items/basic-items.en.json'
import es from '../../../../tests/fixtures/srd/items/basic-items.es.json'
import { basicItemCatalogueSchema, type BasicItem, type BasicItemDescriptions } from './basic-items'
import { toImportItem } from './catalogue'
import {
  buildItemCatalogue,
  entryKeyOf,
  itemDifferences,
  itemReference,
  type ItemPack,
} from './pack-items'

/** A test catalogue item as the published SRD and Rytta basics packs hold it. */
function bundledItemEntry(
  item: BasicItem,
  descriptions: Record<'en' | 'es', BasicItemDescriptions>,
) {
  const description = (language: 'en' | 'es') => {
    const text = descriptions[language][item.key]
    return text ? { description: text } : undefined
  }
  const en = description('en')
  const es = description('es')
  return {
    kind: 'item',
    key: entryKeyOf(item.key),
    name_en: item.name.en,
    name_es: item.name.es,
    data: {
      index: {
        key: item.key,
        category: item.category,
        icon: item.icon,
        slot_kind: item.slot_kind,
        weightLb: item.weightLb,
        costCp: item.costCp,
        properties: item.properties,
        ...(item.pack ? { pack: item.pack } : {}),
      },
      ...(en ? { en } : {}),
      ...(es ? { es } : {}),
    },
  }
}

const items = basicItemCatalogueSchema.parse(catalogue).items
const descriptions = { en, es } as Record<'en' | 'es', Record<string, string>>
const pack = (over: Partial<ItemPack> = {}): ItemPack => ({
  id: '00000000-0000-4000-8000-000000000001',
  ref: '00000000',
  slug: 'srd-5-2-1',
  title_en: 'SRD',
  title_es: 'SRD',
  srd: true,
  version: 2,
  enabled: true,
  hidden: [],
  ...over,
})

describe('items as pack entries (RYT-166)', () => {
  it('turns every bundled item into a valid, unique pack entry', () => {
    const entries = items.map((item) => bundledItemEntry(item, descriptions))
    const keys = entries.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(items.length)
    for (const key of keys) expect(key).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(entryKeyOf('chainMail')).toBe('chain-mail')
    expect(entryKeyOf('masterExplorersPack')).toBe('master-explorers-pack')
  })

  it('reads the bundled items back exactly as the old catalogue, keys included', () => {
    const srd = items.filter((item) => item.source === 'srd')
    const rytta = items.filter((item) => item.source === 'rytta')
    const result = buildItemCatalogue([
      { pack: pack(), entries: srd.map((item) => bundledItemEntry(item, descriptions)) },
      {
        pack: pack({
          id: '00000000-0000-4000-8000-000000000002',
          ref: 'abcdef12',
          slug: 'rytta-basics',
          srd: false,
        }),
        entries: rytta.map((item) => bundledItemEntry(item, descriptions)),
      },
    ])
    expect(result.unreadable).toBe(0)
    expect(result.items).toHaveLength(items.length)
    for (const item of items) {
      const read = result.items.find((other) => other.key === item.key)!
      expect(read, item.key).toBeTruthy()
      // The storeroom receives the same import payload as from the bundled catalogue.
      expect(toImportItem(read, 'es', result.descriptions)).toEqual(
        toImportItem(item, 'es', descriptions),
      )
      expect(toImportItem(read, 'en', result.descriptions)).toEqual(
        toImportItem(item, 'en', descriptions),
      )
    }
  })

  it('references other packs by ref, leaves hidden items and turned-off packs out', () => {
    const other = pack({
      id: '00000000-0000-4000-8000-000000000003',
      ref: '1234abcd',
      slug: 'books',
      srd: false,
      hidden: ['hidden-blade'],
    })
    const entry = (key: string) => ({
      key,
      name_en: 'Moon Blade',
      name_es: '',
      data: { index: { category: 'weapon', slot_kind: 'one_hand', costCp: 40000 } },
    })
    const result = buildItemCatalogue([
      {
        pack: other,
        entries: [
          entry('moon-blade'),
          entry('hidden-blade'),
          { key: 'bad', name_en: 'Bad', name_es: '', data: { index: {} } },
        ],
      },
      { pack: pack({ enabled: false }), entries: [entry('longsword')] },
    ])
    expect(result.items.map((item) => item.key)).toEqual(['1234abcd--moon-blade'])
    expect(result.items[0]).toMatchObject({
      icon: 'sword',
      name: { en: 'Moon Blade', es: 'Moon Blade' },
      source: 'rytta',
    })
    expect(result.unreadable).toBe(1)
    expect(result.packs.map((p) => p.id)).toEqual([other.id])
    expect(itemReference(other, 'x', 'legacyKey')).toBe('1234abcd--x')
  })

  it('lists what Update would change in a storeroom item', () => {
    const longsword = items.find((item) => item.key === 'longsword')!
    const imported = toImportItem(longsword, 'es', descriptions)
    const definition = {
      name: imported.name,
      description: imported.description,
      translations: imported.translations,
      category: imported.category,
      icon: imported.icon,
      slot_kind: imported.slot_kind,
      weight_lb: imported.weight_lb,
      weight_tenths: Math.round(imported.weight_lb * 10),
      properties: imported.properties as Record<string, unknown>,
    }
    expect(itemDifferences(longsword, descriptions, definition)).toEqual([])
    expect(
      itemDifferences(longsword, descriptions, { ...definition, weight_lb: 4, properties: {} }),
    ).toEqual(['weight', 'details'])
    expect(
      itemDifferences(longsword, descriptions, {
        ...definition,
        translations: {
          ...definition.translations,
          es: { name: 'Espada vieja', description: 'Otra' },
        },
      }),
    ).toEqual(['name', 'description'])
  })
})
