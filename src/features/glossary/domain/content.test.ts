import { describe, expect, it } from 'vitest'
import index from '../content/index.json'
import en from '../content/en.json'
import es from '../content/es.json'
import { entryBodySchema, indexRowSchema, type Block, type EntryBody } from './types'

const rows = indexRowSchema.array().parse(index)
const bodies = { en: en as Record<string, unknown>, es: es as Record<string, unknown> }

const blockText = (blocks: Block[]) =>
  blocks
    .flatMap((b) =>
      b.t === 'p'
        ? [b.lead ?? '', b.x]
        : b.t === 'ul'
          ? b.items
          : [b.caption ?? '', ...(b.head ?? []), ...b.rows.flat()],
    )
    .join(' ')

describe('RYT-008 bundled SRD content contract', () => {
  it('covers the SRD 5.2.1 rules glossary, rules terms and every spell', () => {
    const count = (cat: string) => rows.filter((r) => r.cat === cat).length
    expect(rows.length).toBe(782)
    expect(count('condition')).toBe(15)
    expect(count('action')).toBe(12)
    expect(count('spell')).toBe(339)
    expect(count('skill')).toBe(18)
    expect(count('ability')).toBe(6)
    expect(count('damage')).toBe(13)
    expect(count('property')).toBe(10)
    expect(count('mastery')).toBe(8)
    expect(count('feature')).toBe(232)
  })

  it('RYT-071 class features: every class and SRD subclass, levels 1–20, never auto-linked', () => {
    const features = rows.filter((r) => r.cat === 'feature')
    expect(new Set(features.map((r) => r.fc)).size).toBe(12)
    expect(new Set(features.filter((r) => r.sb).map((r) => r.sb)).size).toBe(12)
    for (const row of features) {
      expect(row.nl, row.id).toBe(1)
      expect(row.fc, row.id).toBeDefined()
      expect(row.lv! >= 1 && row.lv! <= 20, row.id).toBe(true)
    }
    for (const row of rows.filter((r) => r.cat !== 'feature'))
      expect(row.fc === undefined && row.sb === undefined && (row.lv ?? 0) <= 9, row.id).toBe(true)
  })

  it('has a valid body for every id in both languages and nothing else', () => {
    for (const language of ['en', 'es'] as const) {
      const body = bodies[language]
      expect(Object.keys(body).sort()).toEqual(rows.map((r) => r.id).sort())
      for (const row of rows) {
        const parsed = entryBodySchema.safeParse(body[row.id])
        expect(parsed.success, `${language} ${row.id}`).toBe(true)
        const entry = parsed.data as EntryBody
        if (row.cat === 'spell') expect(entry.spell, row.id).toBeDefined()
      }
    }
  })

  it('keeps auto-linked names unique per language so links are unambiguous', () => {
    // The SRD reuses a few words (Reach, Alcance, Fuerza, Fuego); those are never auto-linked.
    for (const language of ['en', 'es'] as const) {
      const seen = new Map<string, string>()
      for (const row of rows.filter((r) => r.cat !== 'feature')) {
        const key = `${row.cat === 'spell' ? 'spell' : 'term'}:${row[language].toLocaleLowerCase()}`
        const previous = seen.get(key)
        if (previous)
          expect(
            row.nl === 1 && rows.find((r) => r.id === previous)?.nl === 1,
            `${language} ${row[language]}`,
          ).toBe(true)
        seen.set(key, row.id)
      }
    }
  })

  it('contains plain text only: no HTML, no stray markup or extraction artefacts', () => {
    for (const language of ['en', 'es'] as const)
      for (const [id, value] of Object.entries(bodies[language])) {
        const entry = value as EntryBody
        const text = [
          entry.summary,
          blockText(entry.blocks),
          entry.legacy ? blockText(entry.legacy.blocks) : '',
          ...(entry.facts ?? []).map((f) => f[1]),
        ].join(' ')
        expect(text, id).not.toMatch(/<[a-z/!]/i)
        expect(text, id).not.toMatch(/�|­|‑/)
        // Balanced emphasis markers.
        expect((text.match(/\*/g) ?? []).length % 2, id).toBe(0)
      }
  })

  it('offers quick facts for every condition and action, and 2014 rules where they differ', () => {
    for (const row of rows.filter((r) => r.cat === 'condition' || r.cat === 'action'))
      for (const language of ['en', 'es'] as const)
        expect((bodies[language][row.id] as EntryBody).facts?.length, row.id).toBeGreaterThan(0)
    const grappled = bodies.es['condition.grappled'] as EntryBody
    expect(grappled.facts?.map((f) => f[0])).toEqual(['cause', 'speed', 'attack', 'escape', 'ends'])
    expect(grappled.legacy?.blocks.length).toBeGreaterThan(0)
    expect(rows.find((r) => r.id === 'rule.two-weapon-fighting')?.ed).toBe('2014')
  })

  it('pairs official English and Spanish names', () => {
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get('condition.grappled')).toMatchObject({ en: 'Grappled', es: 'Agarrado' })
    expect(byId.get('condition.exhaustion')).toMatchObject({ en: 'Exhaustion', es: 'Cansancio' })
    expect(byId.get('condition.exhaustion')?.sa).toContain('Agotamiento')
    expect(byId.get('spell.fireball')).toMatchObject({
      es: 'Bola de fuego',
      lv: 3,
      sc: 'evocation',
    })
    expect(byId.get('action.disengage')).toMatchObject({ es: 'Destrabarse' })
  })
})
