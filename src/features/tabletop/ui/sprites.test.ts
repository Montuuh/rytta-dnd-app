import { describe, expect, it } from 'vitest'
import { propById } from '../domain/props'
import { propPictures } from './prop-pictures'
import { propSprite, variantOf } from './sprites'

describe('painted prop pictures (RYT-066)', () => {
  // The pictures shipped in public/, listed without loading them.
  const shipped = new Set(
    Object.keys(import.meta.glob('/public/tabletop/props/*.webp')).map((path) =>
      path.split('/').pop(),
    ),
  )

  it('ships every listed picture and nothing else, for library props at their own proportions', () => {
    const listed: string[] = []
    for (const [prop, picture] of Object.entries(propPictures)) {
      const definition = propById.get(prop)
      expect(definition, prop).toBeDefined()
      for (const [size, count] of Object.entries(picture.sizes)) {
        expect(count, `${prop} ${size}`).toBeGreaterThan(0)
        for (let v = 0; v < count; v++) listed.push(`${prop}-${v}-${size}.webp`)
      }
      // The library footprint itself has a picture (long props may add other lengths).
      const own = Object.keys(picture.sizes).some((size) => {
        const [w, h] = size.split('x').map(Number)
        return w! * definition!.h === h! * definition!.w
      })
      expect(own, prop).toBe(true)
    }
    for (const name of listed) expect(shipped.has(name), name).toBe(true)
    expect(shipped.size).toBe(listed.length)
  })

  it('picks the picture for the size and scales the margin with the prop', () => {
    expect(propSprite('bar', 1, 4, 0)?.url).toMatch(/tabletop\/props\/bar-0-1x4\.webp$/)
    const scaled = propSprite('table', 2, 2, 0)
    expect(scaled?.url.endsWith('/tabletop/props/table-0-1x1.webp')).toBe(true)
    expect(scaled?.pad).toBeCloseTo(propPictures.table!.pad * 2)
    expect(propSprite('bar', 1, 3)?.pad).toBe(propPictures.bar!.pad)
  })

  it('spreads variants over pictures, mirror images and quarter turns', () => {
    const count = propPictures.table!.sizes['1x1']!
    const seen = new Set<string>()
    for (let n = 0; n < 60; n++) {
      const sprite = propSprite('table', 1, 1, n)!
      expect(sprite.url.endsWith(`/table-${n % count}-1x1.webp`)).toBe(true)
      seen.add(`${sprite.url}|${sprite.flip}|${sprite.turn}`)
    }
    // Every picture shows mirrored and unmirrored, in all four turns.
    expect(seen.size).toBe(count * 2 * 4)
    // No turn for a prop with a front (a chair) or a long one (a bed); both may still be mirrored.
    for (let n = 0; n < 60; n++) {
      expect(propSprite('chair', 1, 1, n)?.turn).toBe(0)
      expect(propSprite('bed', 1, 2, n)?.turn).toBe(0)
    }
    const ids = Array.from({ length: 500 }, (_, i) => variantOf(`item-${i}`))
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ids)).toBeLessThan(60)
  })

  it('falls back to the drawing when no picture has those proportions', () => {
    // Without a document (Node) the drawing cannot be made, so the fallback is visible as null.
    expect(propSprite('table', 2, 1, 0)).toBeNull()
    expect(propSprite('altar', 2, 1, 0)).toBeNull()
  })
})
