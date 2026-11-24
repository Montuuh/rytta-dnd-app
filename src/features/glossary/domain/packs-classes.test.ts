import { describe, expect, it } from 'vitest'
import { localizeIndexes, parseRuleIndex, type RulePack } from './packs'

const pack = (over: Partial<RulePack>): RulePack => ({
  id: '00000000-0000-4000-8000-000000000001',
  ref: 'b00c5000',
  title_en: 'Books',
  title_es: 'Libros',
  srd: false,
  category: 'classes',
  version: 1,
  enabled: true,
  hidden: [],
  ...over,
})

describe('pack classes in the glossary index (RYT-168)', () => {
  it('keeps class rows apart and gives a pack its own classes by reference', () => {
    const classes = parseRuleIndex({
      version: 1,
      rows: [
        {
          id: 'class.b00c5000--rune-knight',
          cat: 'class',
          en: 'Rune Knight',
          es: 'Caballero rúnico',
          hitDie: 10,
        },
        {
          id: 'subclass.b00c5000--giant',
          cat: 'subclass',
          en: 'Giant',
          es: 'Gigante',
          class: 'rune-knight',
        },
        { id: 'subclass.b00c5000--echo', cat: 'subclass', en: 'Echo', es: 'Eco', class: 'fighter' },
        {
          id: 'feature.b00c5000--runes',
          cat: 'feature',
          en: 'Runes',
          es: 'Runas',
          nl: 1,
          lv: 1,
          fc: 'rune-knight',
        },
        {
          id: 'feature.b00c5000--might',
          cat: 'feature',
          en: 'Might',
          es: 'Poder',
          nl: 1,
          lv: 3,
          fc: 'rune-knight',
          sb: 'giant',
        },
      ],
    })
    expect(classes.classRows.map((row) => row.key)).toEqual([
      'b00c5000--rune-knight',
      'b00c5000--giant',
      'b00c5000--echo',
    ])
    expect(classes.unreadable).toBe(0)
    const spells = parseRuleIndex({
      version: 1,
      rows: [
        {
          id: 'spell.b00c5000--rune-bolt',
          cat: 'spell',
          en: 'Rune Bolt',
          es: 'Rayo rúnico',
          lv: 1,
          sc: 'evocation',
          cl: ['rune-knight', 'wizard'],
        },
      ],
    })
    const packs = [pack({}), pack({ category: 'spells' })]
    const [own, spellsOwn] = localizeIndexes(packs, [classes, spells])
    expect(own!.rows.map((row) => [row.fc, row.sb ?? null])).toEqual([
      ['b00c5000--rune-knight', null],
      ['b00c5000--rune-knight', 'b00c5000--giant'],
    ])
    expect(own!.classRows.map((row) => row.data.class ?? null)).toEqual([
      null,
      'b00c5000--rune-knight',
      'fighter',
    ])
    expect(spellsOwn!.rows[0]!.cl).toEqual(['b00c5000--rune-knight', 'wizard'])
    // The SRD keeps its bare keys.
    const [srd] = localizeIndexes([pack({ srd: true })], [classes])
    expect(srd).toBe(classes)
  })

  it('RYT-171 keeps species, backgrounds and feats apart and gives a background its pack feat', () => {
    const index = parseRuleIndex({
      version: 1,
      rows: [
        { id: 'species.b00c5000--triton', cat: 'species', en: 'Triton', es: 'Tritón', speed: 30 },
        { id: 'feat.b00c5000--brawler', cat: 'feat', en: 'Brawler', es: 'Pendenciero' },
        {
          id: 'background.b00c5000--sailor',
          cat: 'background',
          en: 'Sailor',
          es: 'Marinero',
          feat: 'brawler',
        },
        {
          id: 'background.b00c5000--guard',
          cat: 'background',
          en: 'Guard',
          es: 'Guardia',
          feat: 'alert',
        },
        // A row whose id names another kind is not read as one.
        { id: 'class.b00c5000--odd', cat: 'feat', en: 'Odd', es: 'Raro' },
      ],
    })
    expect(index.classRows.map((row) => row.cat)).toEqual([
      'species',
      'feat',
      'background',
      'background',
    ])
    const [own] = localizeIndexes([pack({})], [index])
    expect(
      own!.classRows.filter((row) => row.cat === 'background').map((row) => row.data.feat),
    ).toEqual(['b00c5000--brawler', 'alert'])
  })
})
