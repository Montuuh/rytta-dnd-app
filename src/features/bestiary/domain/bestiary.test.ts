import { describe, expect, it } from 'vitest'
import index from '../content/index.json'
import en from '../content/en.json'
import es from '../content/es.json'
import { archetypeDraft, archetypes, damagePerRound } from './archetypes'
import { emptyFilters, filterCreatures, searchKey, srdItems } from './catalog'
import { parseStatBlockText, statBlockToText } from './parser'
import {
  abilityModifier,
  averageDice,
  diceForHp,
  diceKey,
  estimateCr,
  parseDice,
  proficiencyForCr,
  xpForCr,
} from './stats'
import { trackersOf, usageFromName } from './trackers'
import { challengeRatings, statBlockSchema, type MonsterIndex, type StatBlock } from './types'

const catalog = index as unknown as MonsterIndex
const block = (lang: 'en' | 'es', id: string) =>
  (lang === 'en' ? en : es).monsters[id as keyof typeof en.monsters] as unknown as StatBlock

describe('stat block maths', () => {
  it('follows the SRD tables', () => {
    expect([1, 10, 11, 20, 30].map(abilityModifier)).toEqual([-5, 0, 0, 5, 10])
    expect(
      ['0', '1/4', '4', '5', '8', '9', '13', '17', '21', '25', '29', '30'].map(proficiencyForCr),
    ).toEqual([2, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 9])
    expect(xpForCr('10')).toBe(5900)
    expect(parseDice('20d10 + 40')).toEqual({ count: 20, faces: 10, bonus: 40 })
    expect(parseDice('1d4 − 1')).toEqual({ count: 1, faces: 4, bonus: -1 })
    expect(parseDice('3d7')).toBeNull()
    expect(averageDice({ count: 20, faces: 10, bonus: 40 })).toBe(150)
    expect(diceKey({ count: 1, faces: 4, bonus: -1 })).toBe('1d4-1')
    const dice = diceForHp(150, 'large', 15)
    expect(dice.faces).toBe(10)
    expect(Math.abs(averageDice(dice) - 150)).toBeLessThan(8)
  })

  it('estimates CR bands from the SRD medians', () => {
    const aboleth = catalog.monsters.find((m) => m.id === 'aboleth')!
    const estimate = estimateCr({ hp: aboleth.hp, ac: aboleth.ac, attack: 9 }, catalog.baselines)!
    const at = (cr: string) => challengeRatings.indexOf(cr)
    expect(at(estimate.low)).toBeLessThanOrEqual(at('10'))
    expect(at(estimate.high)).toBeGreaterThanOrEqual(at('7'))
    expect(estimateCr({ hp: 7, ac: 15, attack: 4 }, catalog.baselines)!.high).toMatch(
      /^(0|1\/8|1\/4|1\/2|1)$/,
    )
  })
})

describe('catalogue search', () => {
  it('finds creatures by either language, accents and word order, and filters', () => {
    const items = srdItems(catalog.monsters, 'es')
    const find = (query: string) =>
      filterCreatures(items, { ...emptyFilters, query }, new Set(), challengeRatings).map(
        (i) => i.id,
      )
    expect(find('dragon rojo adulto')[0]).toBe('adult-red-dragon')
    expect(find('Adult Red Dragon')[0]).toBe('adult-red-dragon')
    expect(find('lobo')).toContain('wolf')
    expect(searchKey('Dragón  Rojo')).toBe('dragon rojo')
    const undeadLow = filterCreatures(
      items,
      { ...emptyFilters, types: ['undead'], crRange: [0, challengeRatings.indexOf('1')] },
      new Set(),
      challengeRatings,
    )
    expect(undeadLow.length).toBeGreaterThan(0)
    expect(undeadLow.every((i) => i.type === 'undead')).toBe(true)
    const byCr = filterCreatures(
      items,
      { ...emptyFilters, sort: 'cr' },
      new Set(),
      challengeRatings,
    )
    expect(byCr[0]!.cr).toBe('0')
    expect(byCr.at(-1)!.cr).toBe('30')
    const favourites = filterCreatures(
      items,
      { ...emptyFilters, source: 'favorites' },
      new Set(['srd:wolf']),
      challengeRatings,
    )
    expect(favourites.map((i) => i.id)).toEqual(['wolf'])
  })
})

describe('trackers', () => {
  it('derives recharge, daily uses and per-day spells with language-neutral keys', () => {
    const dragon = trackersOf(block('en', 'adult-black-dragon'), (id, n) => `${id}/${n}`)
    expect(dragon.find((t) => t.kind === 'recharge')).toMatchObject({ min: 5 })
    expect(dragon.find((t) => t.key === 'legendary-resistance')).toMatchObject({
      kind: 'uses',
      max: 3,
    })
    expect(dragon.some((t) => t.key.startsWith('spellcasting:spell.'))).toBe(true)
    for (const t of dragon) expect(t.key).toMatch(/^[a-z0-9][a-z0-9:.-]{0,119}$/)
    expect(usageFromName('Fire Breath (Recharge 5–6)')).toEqual({ recharge: 5 })
    expect(usageFromName('Aliento gélido (recarga 6)')).toEqual({ recharge: 6 })
    expect(usageFromName('Dominar la mente (2/día)')).toEqual({ perDay: 2 })
  })
})

describe('archetypes', () => {
  it('builds valid drafts whose numbers land near the chosen CR', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
      `${key}${options ? JSON.stringify(options) : ''}`
    for (const archetype of archetypes)
      for (const cr of ['1/4', '3', '10']) {
        const { block: draft, core } = archetypeDraft({
          archetype,
          cr,
          name: 'Test',
          size: 'medium',
          type: 'humanoid',
          baselines: catalog.baselines,
          t,
        })
        expect(statBlockSchema.safeParse(draft).success).toBe(true)
        if (archetype === 'minion') expect(core.hp).toBe(1)
        else expect(core.hp).toBeGreaterThan(0)
        expect(core.ac).toBeGreaterThanOrEqual(5)
      }
    expect(damagePerRound('1/4')).toBe(5)
    expect(damagePerRound('5')).toBe(35)
  })
})

describe('pasted stat blocks', () => {
  it('reads back every SRD stat block printed as text (both languages)', () => {
    for (const lang of ['en', 'es'] as const)
      for (const row of catalog.monsters) {
        const source = block(lang, row.id)
        const parsed = parseStatBlockText(statBlockToText(source, lang))
        const where = `${lang}/${row.id}`
        expect(parsed.core.ac, where).toBe(row.ac)
        expect(parsed.core.hp, where).toBe(row.hp)
        expect(parsed.core.cr, where).toBe(row.cr)
        expect(parsed.core.type, where).toBe(row.type)
        expect(Object.keys(parsed.block.abilities), where).toHaveLength(6)
        expect(
          parsed.block.sections.map((s) => s.kind),
          where,
        ).toEqual(source.sections.map((s) => s.kind))
        const count = (b: StatBlock) => b.sections.reduce((n, s) => n + s.entries.length, 0)
        expect(count(parsed.block), where).toBe(count(source))
        expect(statBlockSchema.safeParse(parsed.block).success, where).toBe(true)
      }
  })

  it('reads a 2014-style block pasted from a book', () => {
    const parsed = parseStatBlockText(`Bandit Captain
Medium humanoid (any race), any non-lawful alignment
Armor Class 15 (studded leather)
Hit Points 65 (10d8 + 20)
Speed 30 ft.
STR DEX CON INT WIS CHA
15 (+2) 16 (+3) 14 (+2) 14 (+2) 11 (+0) 14 (+2)
Saving Throws Str +4, Dex +5, Wis +2
Skills Athletics +4, Deception +4
Senses passive Perception 10
Languages any two languages
Challenge 2 (450 XP)
Actions
Multiattack. The captain makes three melee attacks: two with its scimitar and one with its dagger.
Scimitar. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing
damage.
Reactions
Parry. The captain adds 2 to its AC against one melee attack that would hit it.`)
    expect(parsed.core).toMatchObject({ ac: 15, hp: 65, cr: '2', type: 'humanoid', size: 'medium' })
    expect(parsed.block.abilities.dex).toEqual({ score: 16, mod: 3, save: 5 })
    expect(parsed.block.sections.map((s) => [s.kind, s.entries.map((e) => e.name)])).toEqual([
      ['actions', ['Multiattack', 'Scimitar']],
      ['reactions', ['Parry']],
    ])
    expect(parsed.block.sections[0]!.entries[1]!.text[0]).toMatch(/slashing damage\.$/)
    expect(parsed.block.hpFormula).toBe('10d8+20')
    expect(parsed.unplaced).toEqual([])
  })
})
