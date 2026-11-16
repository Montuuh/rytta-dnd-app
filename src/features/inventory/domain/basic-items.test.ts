import { describe, expect, it } from 'vitest'
import catalogue from '../content/basic-items.json'
import en from '../content/basic-items.en.json'
import es from '../content/basic-items.es.json'
import { iconKeys } from '../ui/icons'
import {
  basicItemCatalogueSchema,
  basicItemDescriptionsSchema,
  basicItemsByKey,
  findBasicItem,
  loadBasicItemDescriptions,
  loadBasicItems,
  searchBasicItems,
  toDefinitionDraft,
} from './basic-items'
import { itemPropertiesSchema } from './item'

const { items } = basicItemCatalogueSchema.parse(catalogue)
const descriptions = {
  en: basicItemDescriptionsSchema.parse(en),
  es: basicItemDescriptionsSchema.parse(es),
}
const byKey = basicItemsByKey(items)
const get = (key: string) => {
  const item = findBasicItem(items, key)
  if (!item) throw new Error(`Missing basic item ${key}`)
  return item
}

describe('basic items catalogue', () => {
  it('has unique keys', () => {
    expect(byKey.size).toBe(items.length)
  })

  it('keeps every item valid as a definition draft', () => {
    for (const item of items) {
      const draft = toDefinitionDraft(item, 'en', '')
      expect(itemPropertiesSchema.safeParse(draft.properties).success, item.key).toBe(true)
      expect(draft.weight_lb, item.key).toBe(item.weightLb)
    }
  })

  it('uses only icons the app can render', () => {
    expect(items.filter((item) => !iconKeys.includes(item.icon)).map((item) => item.key)).toEqual(
      [],
    )
  })

  it('names and describes every item in English and Spanish', () => {
    for (const language of ['en', 'es'] as const) {
      expect(Object.keys(descriptions[language]).sort()).toEqual([...byKey.keys()].sort())
      for (const item of items) expect(item.name[language].trim(), item.key).not.toBe('')
    }
  })

  it('has non-negative weights and whole, non-negative prices', () => {
    for (const item of items) {
      expect(item.weightLb, item.key).toBeGreaterThanOrEqual(0)
      expect(item.costCp, item.key).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(item.costCp), item.key).toBe(true)
    }
  })

  it('encodes the SRD numbers', () => {
    expect(get('arrows')).toMatchObject({ weightLb: 0.05, costCp: 5 })
    expect(get('bolts').weightLb).toBe(0.075)
    expect(get('slingBullets')).toMatchObject({
      weightLb: 0.075,
      pack: { quantity: 20, costCp: 4 },
    })
    expect(get('needles').weightLb).toBe(0.02)
    expect(get('plate')).toMatchObject({ weightLb: 65, costCp: 150_000 })
    expect(get('club').costCp).toBe(10)
    expect(get('longsword').properties).toMatchObject({ dice: '1d8', mastery: 'sap' })
    expect(get('rations').properties.rations).toBe(1)
    expect(get('waterskin').properties.water).toBe(4)
  })

  it('points weapon ammunition at ammunition items', () => {
    for (const item of items) {
      const ammunition = item.properties.ammunition
      if (ammunition) expect(byKey.get(ammunition)?.category, item.key).toBe('ammo')
    }
    for (const item of items.filter((entry) => entry.category === 'ammo'))
      expect(item.pack, item.key).toBeDefined()
  })

  it('gives every weapon a mastery and every armor a base Armor Class', () => {
    for (const item of items) {
      if (item.category === 'weapon') expect(item.properties.mastery, item.key).toBeDefined()
      if (item.category === 'armor') expect(item.properties.base, item.key).toBeDefined()
    }
  })

  it('labels the homebrew backpack tiers apart from SRD content', () => {
    const homebrew = items.filter((item) => item.source === 'rytta')
    expect(homebrew.map((item) => item.properties.container?.loadReductionPercent)).toEqual([
      10, 20, 30,
    ])
    expect(homebrew.every((item) => item.descriptionSource === 'rytta')).toBe(true)
    expect(get('backpack').properties.container).toEqual({
      capacityLb: 30,
      loadReductionPercent: 0,
    })
    expect(toDefinitionDraft(homebrew[0]!, 'es', '').origin).toBe('dm')
  })
})

describe('basic items helpers', () => {
  it('searches localized names ignoring case and accents', () => {
    expect(searchBasicItems(items, 'baston', 'es')[0]?.key).toBe('quarterstaff')
    expect(searchBasicItems(items, 'LONG', 'en').map((item) => item.key)).toEqual([
      'longbow',
      'longsword',
    ])
    expect(searchBasicItems(items, 'armadura placas', 'es').map((item) => item.key)).toEqual([
      'plate',
    ])
    expect(searchBasicItems(items, '', 'en')).toHaveLength(items.length)
    expect(searchBasicItems(items, 'zzz', 'en')).toEqual([])
  })

  it('builds a definition draft with exact weight, cents and every property', () => {
    const draft = toDefinitionDraft(get('longbow'), 'es', descriptions.es.longbow!)
    expect(draft).toMatchObject({
      name: 'Arco largo',
      slot_kind: 'two_hands',
      weight_lb: 2,
      value_gp: 50,
      origin: 'srd',
      properties: { dice: '1d8', ranged: true, range: '150/600', mastery: 'slow' },
    })
    expect(toDefinitionDraft(get('arrows'), 'en', '')).toMatchObject({
      weight_lb: 0.05,
      value_gp: 0.05,
    })
  })

  it('loads the catalogue and descriptions lazily', async () => {
    expect(await loadBasicItems()).toHaveLength(items.length)
    expect((await loadBasicItemDescriptions('es')).potionOfHealing).toContain('2d4 + 2')
    expect((await loadBasicItemDescriptions('en')).potionOfHealing).toContain('2d4 + 2')
  })
})
