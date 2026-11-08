import { describe, expect, it } from 'vitest'
import { mapKinds, mapThemes } from '../domain/generator'
import { decalArt, effectArt, floorArt, wallArt } from './map-art'
import { artUrls, materialsOf, sampleOf } from './materials'

describe('map art (RYT-068)', () => {
  // The files shipped in public/, listed without loading them.
  const shipped = new Set(
    Object.keys(import.meta.glob('/public/tabletop/**/*.webp')).map((path) =>
      path.replace('/public/', ''),
    ),
  )

  it('ships every listed tile and decal sheet, and lists every one shipped', () => {
    const listed = [
      ...Object.keys(floorArt).map((n) => `tabletop/textures/floors/${n}.webp`),
      ...Object.keys(wallArt).map((n) => `tabletop/textures/walls/${n}.webp`),
      ...Object.keys(effectArt).map((n) => `tabletop/textures/effects/${n}.webp`),
      ...Object.keys(decalArt).map((n) => `tabletop/decals/${n}.webp`),
    ]
    for (const file of listed) expect(shipped.has(file), file).toBe(true)
    const art = [...shipped].filter(
      (f) => !f.startsWith('tabletop/props/') && !f.startsWith('tabletop/textures/thumbs/'),
    )
    expect(art.sort()).toEqual(listed.sort())
    // Every floor and wall has the small copy the generator's samples use.
    for (const n of Object.keys(floorArt))
      expect(shipped.has(`tabletop/textures/thumbs/floors/${n}.webp`), n).toBe(true)
    for (const n of Object.keys(wallArt))
      expect(shipped.has(`tabletop/textures/thumbs/walls/${n}.webp`), n).toBe(true)
  })

  it('paints every theme of every kind with shipped pictures only', () => {
    for (const kind of mapKinds)
      for (const theme of mapThemes[kind]) {
        const urls = artUrls({ options: { kind, theme } })
        expect(urls.length, `${kind} ${theme}`).toBeGreaterThan(3)
        for (const url of urls)
          expect(shipped.has(url.replace(/^.*?tabletop\//, 'tabletop/')), url).toBe(true)
      }
  })

  it('keeps the damage types of spell areas painted', () => {
    for (const damage of [
      'fire',
      'cold',
      'lightning',
      'thunder',
      'acid',
      'poison',
      'necrotic',
      'radiant',
      'force',
    ])
      expect(damage in effectArt, damage).toBe(true)
  })

  it('samples every theme with shipped thumbnails', () => {
    for (const kind of mapKinds)
      for (const theme of mapThemes[kind]) {
        const sample = sampleOf({ options: { kind, theme } })
        for (const url of [sample.floor, sample.wall, sample.pool, sample.ground])
          if (url) expect(shipped.has(url.replace(/^.*?tabletop\//, 'tabletop/')), url).toBe(true)
        expect(sample.tone, `${kind} ${theme}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    // A tavern's sample shows its hall, not the grass outside.
    expect(sampleOf({ options: { kind: 'tavern', theme: 'oak' } }).floor).toMatch(
      /planks-oak\.webp$/,
    )
  })

  it('gives themes their own look and a kind default for unknown themes', () => {
    expect(materialsOf({ options: { kind: 'cave', theme: 'ice' } }).floor).toBe('ice')
    expect(materialsOf({ options: { kind: 'cave', theme: 'oak' } }).floor).toBe('cave-rock')
    expect(materialsOf({ options: { kind: 'dungeon' } }).wall).toBe('wall-dungeon-stone')
    // Underground maps keep the outside dark: no texture is ever listed for it.
    for (const kind of ['dungeon', 'crypt', 'cave'] as const)
      for (const theme of mapThemes[kind]) {
        const { rock } = materialsOf({ options: { kind, theme } })
        const lum = (hex: string) => {
          const n = parseInt(hex.slice(1), 16)
          return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
        }
        expect(lum(rock.base), `${kind} ${theme}`).toBeLessThan(30)
        expect(lum(rock.light), `${kind} ${theme}`).toBeLessThan(60)
      }
  })
})
