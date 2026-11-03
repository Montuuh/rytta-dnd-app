import { describe, expect, it } from 'vitest'
import index from '../content/index.json'
import { buildCatalog, glossaryIds, indexLetter } from './catalog'
import {
  emptyDraft,
  glossaryError,
  homebrewParagraphs,
  parseAliases,
  type HomebrewEntry,
} from './homebrew'
import { parseInline } from './inline'
import { createLinker } from './linker'
import { fold, searchKey } from './normalize'
import { searchGlossary } from './search'
import { indexRowSchema } from './types'

const rows = indexRowSchema.array().parse(index)
const es = buildCatalog(rows, 'es')
const en = buildCatalog(rows, 'en')
const homebrew: HomebrewEntry = {
  id: '9b2f7c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b',
  campaign_id: '1b2f7c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b',
  category: 'rule',
  name: 'Descanso duro',
  aliases: ['Gritty rest'],
  summary: 'Un descanso largo dura una semana.',
  body: 'Primer párrafo.\n\nSegundo\npárrafo.',
  facts: [],
  srd_ref: 'rule.long-rest',
  revision: 1,
  created_by: null,
  updated_by: null,
  updated_at: '2026-11-03T00:00:00Z',
}
const ids = (hits: ReturnType<typeof searchGlossary>) => hits.map((h) => h.entry.id)

describe('RYT-008 glossary search', () => {
  it('folds accents and case without changing offsets', () => {
    expect(fold('Ágil Señal')).toBe('agil senal')
    expect(fold('Ágil Señal')).toHaveLength('Ágil Señal'.length)
    expect(searchKey('  Tirada-de   SALVACIÓN ')).toBe('tirada de salvacion')
  })

  it('ranks exact names first, then prefixes and aliases', () => {
    expect(ids(searchGlossary(es, 'agarrado'))[0]).toBe('condition.grappled')
    expect(ids(searchGlossary(es, 'agarr')).slice(0, 3)).toContain('rule.grappling')
    expect(ids(searchGlossary(es, 'agotamiento'))[0]).toBe('condition.exhaustion')
  })

  it('finds entries by their name in the other language', () => {
    const hit = searchGlossary(es, 'grappled')[0]!
    expect(hit.entry.id).toBe('condition.grappled')
    expect(hit.matched).toBe('Grappled')
    expect(ids(searchGlossary(en, 'bola de fuego'))[0]).toBe('spell.fireball')
  })

  it('tolerates one typo in longer words and filters by category', () => {
    expect(ids(searchGlossary(en, 'fireblal'))).toContain('spell.fireball')
    const conditions = searchGlossary(es, 'a', { category: 'condition' })
    expect(conditions.every((h) => h.entry.category === 'condition')).toBe(true)
  })

  it('returns nothing for blank queries and unknown words', () => {
    expect(searchGlossary(es, '   ')).toEqual([])
    expect(searchGlossary(es, 'zzzqqq')).toEqual([])
  })

  it('searches summaries only as a last resort', () => {
    const summaries = { 'rule.bloodied': 'Una criatura maltrecha tiene la mitad de sus puntos.' }
    expect(ids(searchGlossary(es, 'mitad de sus puntos', { summaries }))).toEqual(['rule.bloodied'])
  })
})

describe('RYT-008 automatic term links', () => {
  const linker = createLinker(es)
  const linked = (text: string, options = {}) =>
    linker
      .link(text, options)
      .filter((s) => s.id)
      .map((s) => [s.text, s.id])

  it('links conditions, gendered forms and the longest matching phrase', () => {
    expect(linked('Queda agarrada y derribado.')).toEqual([
      ['agarrada', 'condition.grappled'],
      ['derribado', 'condition.prone'],
    ])
    expect(linked('Haz una tirada de salvación de Destreza.')).toEqual([
      ['tirada de salvación', 'rule.saving-throw'],
      ['Destreza', 'ability.dexterity'],
    ])
  })

  it('respects word boundaries, generic exclusions and self links', () => {
    expect(linked('desagarradamente')).toEqual([])
    expect(linked('La criatura usa su acción.')).toEqual([])
    expect(linked('Agarrado: velocidad 0', { selfId: 'condition.grappled' })).toEqual([])
  })

  it('links each term once per block and keeps the original text', () => {
    const seen = new Set<string>()
    const segments = linker.link('Ventaja aquí y ventaja allí.', { seen })
    expect(segments.map((s) => s.text).join('')).toBe('Ventaja aquí y ventaja allí.')
    expect(segments.filter((s) => s.id)).toHaveLength(1)
    expect(linker.link('Otra ventaja.', { seen }).filter((s) => s.id)).toHaveLength(0)
  })

  it('links abbreviations only as written, never ordinary words', () => {
    expect(linked('Ataca con un arma: FUE o DES, CA 15.')).toEqual([
      ['FUE', 'ability.strength'],
      ['DES', 'ability.dexterity'],
      ['CA', 'rule.armor-class'],
    ])
  })

  it('links distinctive spell names only with their exact capitalization', () => {
    expect(linked('Lanza Bola de fuego.')).toEqual([['Bola de fuego', 'spell.fireball']])
    expect(linked('una bola de fuego de juguete')).toEqual([])
    expect(
      createLinker(en)
        .link('Hold the light shield.')
        .some((s) => s.id),
    ).toBe(false)
    expect(linker.lookup('bola de fuego')).toBe('spell.fireball')
  })

  it('prefers the campaign homebrew definition and attaches house rules', () => {
    const catalog = buildCatalog(rows, 'es', [homebrew])
    expect(catalog.houseRules.get('rule.long-rest')).toEqual([homebrew])
    const segments = createLinker(catalog).link('Tras un descanso duro…')
    expect(segments.find((s) => s.id)?.id).toBe(`homebrew.${homebrew.id}`)
    expect(searchGlossary(catalog, 'gritty')[0]?.entry.source).toBe('homebrew')
  })
})

describe('RYT-008 glossary helpers', () => {
  it('parses inline emphasis without HTML', () => {
    expect(parseInline('Lanza *bola de fuego* y **Velocidad 0.** <b>x</b>')).toEqual([
      { kind: 'text', text: 'Lanza ' },
      { kind: 'em', text: 'bola de fuego' },
      { kind: 'text', text: ' y ' },
      { kind: 'strong', text: 'Velocidad 0.' },
      { kind: 'text', text: ' <b>x</b>' },
    ])
  })

  it('maps typed app keys to glossary ids', () => {
    const known = new Set(rows.map((r) => r.id))
    for (const id of [
      glossaryIds.condition('grappled'),
      glossaryIds.ability('wis'),
      glossaryIds.skill('animalHandling'),
      glossaryIds.skill('sleightOfHand'),
      glossaryIds.damage('slashing'),
      glossaryIds.property('finesse'),
      glossaryIds.rule('armor-class'),
    ])
      expect(known.has(id), id).toBe(true)
  })

  it('groups names by accent-insensitive initial', () => {
    expect(indexLetter('Área de efecto')).toBe('A')
    expect(indexLetter('20 pies')).toBe('#')
  })

  it('normalizes aliases, paragraphs, drafts and server errors', () => {
    expect(parseAliases(' Uno, uno,\nDos ,, ')).toEqual(['Uno', 'Dos'])
    expect(homebrewParagraphs(homebrew.body)).toEqual(['Primer párrafo.', 'Segundo\npárrafo.'])
    expect(emptyDraft('rule.long-rest')).toMatchObject({
      category: 'rule',
      srd_ref: 'rule.long-rest',
    })
    expect(glossaryError('Stale revision').code).toBe('stale')
    expect(glossaryError('Duplicate name').code).toBe('duplicate')
    expect(glossaryError('Forbidden').code).toBe('forbidden')
  })
})
