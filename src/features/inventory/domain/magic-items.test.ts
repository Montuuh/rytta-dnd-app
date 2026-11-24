import { describe, expect, it } from 'vitest'
import basics from '../../../../tests/fixtures/srd/items/basic-items.json'
import magic from '../../../../tests/fixtures/srd/items/magic-items.json'
import { descriptionLimit } from '@/shared/lib/translations'
import { iconKeys } from '../ui/icons'
import { toDefinitionDraft } from './basic-items'
import { toImportItem } from './catalogue'
import { itemPropertiesSchema, rarities } from './item'
import { buildItemCatalogue, entryKeyOf, type ItemPack } from './pack-items'

// RYT-176: the magic items of the SRD 5.2.1 as the base pack holds them (the test copy that
// scripts/items/build-magic-items.mjs writes).
const pack: ItemPack = {
  id: '00000000-0000-4000-8000-000000000001',
  ref: '00000000',
  slug: 'srd-5-2-1',
  title_en: 'Rytta',
  title_es: 'Rytta',
  srd: true,
  version: 4,
  enabled: true,
  hidden: [],
}
const rope = {
  key: 'rope',
  name_en: 'Rope',
  name_es: 'Cuerda',
  data: { index: { key: 'rope', category: 'gear' }, en: { description: 'A rope.' } },
}
const catalogue = buildItemCatalogue([{ pack, entries: [rope, ...magic.entries] }])
const find = (key: string) => catalogue.items.find((item) => item.key === key)!

describe('SRD magic items', () => {
  it('reads every entry: 268 items from the 258 headings of the chapter', () => {
    expect(magic.entries).toHaveLength(268)
    expect(catalogue.unreadable).toBe(0)
    expect(catalogue.items).toHaveLength(269)
    expect(new Set(magic.entries.map((entry) => entry.key)).size).toBe(268)
  })

  it('shares no key with the mundane items of the pack', () => {
    const mundane = new Set(basics.items.map((item) => item.key))
    for (const entry of magic.entries) {
      expect(mundane.has(entry.data.index.key), entry.key).toBe(false)
      expect(entryKeyOf(entry.data.index.key), entry.key).toBe(entry.key)
    }
  })

  it('gives each one a rarity, a known icon, valid properties and both texts whole', () => {
    const seen = new Set<string>()
    for (const entry of magic.entries) {
      const item = find(entry.data.index.key)
      seen.add(item.rarity ?? 'common')
      expect(iconKeys, entry.key).toContain(item.icon)
      expect(itemPropertiesSchema.safeParse(item.properties).success, entry.key).toBe(true)
      for (const language of ['en', 'es'] as const) {
        const text = catalogue.descriptions[language][item.key]!
        expect(text, entry.key).toBe(entry.data[language].description)
        expect(text.length, entry.key).toBeLessThanOrEqual(descriptionLimit)
      }
    }
    expect([...seen].sort()).toEqual([...rarities].sort())
  })

  it('takes the rarity and the whole text into a campaign; a mundane item stays common', () => {
    const deck = find('mysteriousDeck')
    const sent = toImportItem(deck, 'es', catalogue.descriptions)
    expect(sent.rarity).toBe('legendary')
    expect(sent.description.length).toBeGreaterThan(8000)
    expect(sent.description.startsWith('Objeto maravilloso, legendario')).toBe(true)
    expect(sent.translations.en.name).toBe('Mysterious Deck')
    expect(toDefinitionDraft(deck, 'en', 'text').rarity).toBe('legendary')
    expect(find('rope').rarity).toBeUndefined()
    expect(toImportItem(find('rope'), 'en', catalogue.descriptions).rarity).toBe('common')
  })

  it('prices by rarity: a potion at half, ammunition by the piece, a made item plus its base', () => {
    expect(find('ringOfProtection').costCp).toBe(400_000)
    expect(find('potionOfFlying').costCp).toBe(2_000_000)
    expect(find('ammunitionPlus1').costCp).toBe(2_000)
    expect(find('dwarvenThrower')).toMatchObject({ costCp: 4_001_500, slot_kind: 'one_hand' })
    // The rarity depends on the variant: the lowest one, and no price.
    expect(find('potionOfGiantStrength')).toMatchObject({ rarity: 'uncommon', costCp: 0 })
    expect(find('weaponPlus3')).toMatchObject({ rarity: 'very_rare', costCp: 4_000_000 })
  })
})
