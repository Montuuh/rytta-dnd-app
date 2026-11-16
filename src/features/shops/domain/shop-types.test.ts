import { describe, expect, it } from 'vitest'
import { findShopType, shopTypes } from './shop-types'

// Globbed rather than imported: the catalogue and the icon set belong to the inventory feature
// and are not on its public entrypoint.
const [catalogue] = Object.values(
  import.meta.glob<{ items: { key: string }[] }>('../../inventory/content/basic-items.json', {
    eager: true,
    import: 'default',
  }),
)
const [iconSource = ''] = Object.values(
  import.meta.glob<string>('../../inventory/ui/icons.ts', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
)
const itemKeys = new Set(catalogue?.items.map((item) => item.key))
const icons = [...iconSource.matchAll(/^ {2}'?([a-z-]+)'?: [A-Z]/gm)].map((match) => match[1])

describe('shop types', () => {
  it('offers ten to twelve archetypes with unique keys', () => {
    expect(shopTypes.length).toBeGreaterThanOrEqual(10)
    expect(shopTypes.length).toBeLessThanOrEqual(12)
    expect(new Set(shopTypes.map((type) => type.key)).size).toBe(shopTypes.length)
    expect(findShopType('tavern')?.stock).toContain('ale')
    expect(findShopType('unknown')).toBeUndefined()
  })

  it('names and describes every type in English and Spanish', () => {
    for (const type of shopTypes)
      for (const text of [type.name, type.description]) {
        expect(text.en.trim(), type.key).not.toBe('')
        expect(text.es.trim(), type.key).not.toBe('')
      }
  })

  it('uses icons from the item icon set', () => {
    expect(icons.length).toBeGreaterThan(40)
    expect(shopTypes.filter((type) => !icons.includes(type.icon)).map((type) => type.key)).toEqual(
      [],
    )
  })

  it('stocks only items that exist in the basic-items catalogue, without repeats', () => {
    for (const type of shopTypes) {
      expect(type.stock.length, type.key).toBeGreaterThan(0)
      expect(
        type.stock.filter((key) => !itemKeys.has(key)),
        type.key,
      ).toEqual([])
      expect(new Set(type.stock).size, type.key).toBe(type.stock.length)
    }
  })

  it('sells every catalogue item in at least one shop', () => {
    const stocked = new Set(shopTypes.flatMap((type) => type.stock))
    expect([...itemKeys].filter((key) => !stocked.has(key))).toEqual([])
  })
})
