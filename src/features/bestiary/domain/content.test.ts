import { describe, expect, it } from 'vitest'
import index from '../content/index.json'
import en from '../content/en.json'
import es from '../content/es.json'
import art from '../content/art.json'
import { trackersOf } from './trackers'
import { xpForCr } from './stats'
import {
  baselineSchema,
  challengeRatings,
  creatureArtCatalogSchema,
  libraryTraitSchema,
  monsterRowSchema,
  statBlockSchema,
  type StatBlock,
} from './types'

const rows = monsterRowSchema.array().parse(index.monsters)
const baselines = baselineSchema.array().parse(index.baselines)
const bodies = {
  en: en as unknown as { monsters: Record<string, unknown>; traits: unknown[] },
  es: es as unknown as { monsters: Record<string, unknown>; traits: unknown[] },
}
// The glossary's spell ids (read as data: features only import each other's public entrypoint).
const glossaryIndex = Object.values(
  import.meta.glob<{ default: { id: string; cat: string }[] }>(
    '../../glossary/content/index.json',
    {
      eager: true,
    },
  ),
)[0]!.default
const spellIds = new Set(glossaryIndex.filter((e) => e.cat === 'spell').map((e) => e.id))
const textOf = (block: StatBlock) =>
  [
    block.name,
    block.meta,
    block.speed,
    ...Object.values(block.details),
    ...block.sections.flatMap((s) => [
      s.intro ?? '',
      ...s.entries.flatMap((e) => [e.name, ...e.text]),
    ]),
  ].join('\n')

describe('ADR 028 bundled SRD 5.2.1 monsters', () => {
  it('covers every SRD 5.2.1 stat block in both languages', () => {
    expect(rows).toHaveLength(330)
    expect(new Set(rows.map((r) => r.id)).size).toBe(330)
    expect(rows.filter((r) => r.animal)).toHaveLength(rows.filter((r) => r.animal).length)
    for (const lang of ['en', 'es'] as const)
      expect(Object.keys(bodies[lang].monsters).sort()).toEqual(rows.map((r) => r.id).sort())
    for (const id of ['aboleth', 'goblin-warrior', 'adult-red-dragon', 'wolf', 'lich', 'zombie'])
      expect(rows.some((r) => r.id === id)).toBe(true)
  })

  it('validates every stat block, pairs keys and usages, and keeps numbers in the index', () => {
    for (const row of rows) {
      const blocks = (['en', 'es'] as const).map((lang) =>
        statBlockSchema.parse(bodies[lang].monsters[row.id]),
      )
      const [a, b] = blocks as [StatBlock, StatBlock]
      // Same entries in both languages (Spanish may order them differently).
      const entries = (block: StatBlock) =>
        block.sections
          .flatMap((s) =>
            s.entries.map((e) => `${s.kind}:${e.key}:${JSON.stringify(e.usage ?? null)}`),
          )
          .sort()
      expect(entries(b)).toEqual(entries(a))
      expect(b.sections.map((s) => s.kind)).toEqual(a.sections.map((s) => s.kind))
      expect(b.abilities).toEqual(a.abilities)
      expect(Number(a.hp.match(/^\d+/)?.[0])).toBe(row.hp)
      expect(Number(a.ac.match(/^\d+/)?.[0])).toBe(row.ac)
      expect(row.xp === xpForCr(row.cr) || (row.cr === '0' && row.xp === 0)).toBe(true)
      expect(challengeRatings).toContain(row.cr)
      // Trackers are language-neutral: the same keys in both languages.
      const keys = (block: StatBlock) =>
        trackersOf(block, (id) => id)
          .map((tr) => tr.key)
          .sort()
      expect(keys(b)).toEqual(keys(a))
      for (const s of a.sections)
        for (const e of s.entries)
          for (const list of e.spells ?? [])
            for (const spell of list.spells) expect(spellIds.has(spell)).toBe(true)
    }
  })

  it('contains no PDF artefacts or markup other than Rytta inline emphasis', () => {
    for (const lang of ['en', 'es'] as const)
      for (const [id, raw] of Object.entries(bodies[lang].monsters)) {
        const text = textOf(raw as StatBlock)
        expect(text, `${lang}/${id}`).not.toMatch(/[<>~\t]|\*\*\*|\b\w+- [a-z]/)
        for (const line of text.split('\n'))
          expect((line.match(/\*\*/g) ?? []).length % 2, `${lang}/${id}: ${line}`).toBe(0)
      }
  })

  it('ships CR medians and a reusable trait library in both languages', () => {
    expect(baselines.map((b) => b.cr)).toEqual(
      challengeRatings.filter((cr) => rows.some((r) => r.cr === cr)),
    )
    for (const b of baselines) {
      expect(b.hp).toBeGreaterThan(0)
      expect(b.ac).toBeGreaterThanOrEqual(5)
    }
    const traits = {
      en: libraryTraitSchema.array().parse(bodies.en.traits),
      es: libraryTraitSchema.array().parse(bodies.es.traits),
    }
    expect(traits.en.length).toBeGreaterThan(30)
    expect(traits.es.map((t) => t.key)).toEqual(traits.en.map((t) => t.key))
    expect(traits.en.find((t) => t.key === 'pack-tactics')?.text.join(' ')).toMatch(/the creature/i)
  })
})

// RYT-053: bundled art. The images are static files (public/bestiary); credits live in art.json.
const artFiles = Object.keys(
  import.meta.glob('../../../../public/bestiary/{art,thumbs}/*.webp', { eager: false }),
)
describe('ADR 030 bundled creature art', () => {
  it('credits an openly licensed image and a thumbnail for every SRD creature', () => {
    const credits = creatureArtCatalogSchema.parse(art)
    expect(Object.keys(credits).sort()).toEqual(rows.map((r) => r.id).sort())
    const named = (folder: string) =>
      new Set(
        artFiles
          .filter((f) => f.includes(`/bestiary/${folder}/`))
          .map((f) => f.split('/').at(-1)!.replace('.webp', '')),
      )
    expect(named('art')).toEqual(new Set(rows.map((r) => r.id)))
    expect(named('thumbs')).toEqual(new Set(rows.map((r) => r.id)))
    for (const [id, credit] of Object.entries(credits)) {
      // No non-commercial, no-derivatives or unfree licences; images fit the 720px rendition.
      expect(credit.license, id).not.toMatch(/\b(NC|ND)\b|non-?free|fair use/i)
      expect(Math.max(credit.width, credit.height), id).toBeLessThanOrEqual(720)
      expect(credit.author.trim(), id).not.toBe('')
      if (credit.origin === 'commons')
        expect(credit.source, id).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
      if (credit.origin === 'wesnoth') expect(credit.license).toBe('GPL-2.0-or-later')
      if (credit.origin === 'game-icons') expect(credit.license).toBe('CC BY 3.0')
    }
  })
})
