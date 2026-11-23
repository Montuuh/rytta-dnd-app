import { describe, expect, it } from 'vitest'
import { srdOriginRows, srdOrigins } from '../../../../tests/fixtures/srd/origins'
import { chooseBackground, chooseSpecies, originFeat, withBackgroundFacts } from './creation'
import {
  buildOriginCatalog,
  featRef,
  improvementFeats,
  offeredSpecies,
  pickedOption,
  speciesDefFor,
  traitRef,
  type OriginRowLike,
} from './origin-catalog'
import { emptyBuild } from './rules'

const triton: OriginRowLike = {
  cat: 'species',
  key: 'b00c5000--triton',
  en: 'Triton',
  es: 'Tritón',
  data: {
    speed: 30,
    size: 'medium',
    traits: [
      { key: 'amphibious', en: 'Amphibious', es: 'Anfibio' },
      { key: 'emissary', en: 'Emissary of the Sea', es: 'Emisario del mar' },
    ],
    choices: [
      {
        trait: 'emissary',
        options: [
          { key: 'storm', en: 'Storm', es: 'Tormenta' },
          { key: 'tide', en: 'Tide', es: 'Marea' },
        ],
      },
    ],
  },
  pack: { title_en: 'Owner books', title_es: 'Libros' },
}
const sailor: OriginRowLike = {
  cat: 'background',
  key: 'b00c5000--sailor',
  en: 'Sailor',
  es: 'Marinero',
  data: {
    abilities: ['str', 'dex', 'wis'],
    skills: ['athletics', 'perception'],
    feat: 'b00c5000--brawler',
  },
}
const brawler: OriginRowLike = {
  cat: 'feat',
  key: 'b00c5000--brawler',
  en: 'Brawler',
  es: 'Pendenciero',
  data: { category: 'origin' },
}

describe('origin catalog (RYT-171)', () => {
  it('reads the SRD species, backgrounds and feats as the library publishes them', () => {
    expect(srdOrigins.species).toHaveLength(9)
    expect(srdOrigins.backgrounds).toHaveLength(4)
    expect(srdOrigins.feats).toHaveLength(17)
    expect(speciesDefFor(srdOrigins, 'goliath')).toMatchObject({ srd: true, speed: 35 })
    expect(speciesDefFor(srdOrigins, 'dragonborn')!.choices[0]!.options).toHaveLength(10)
    expect(improvementFeats(srdOrigins, 4).map((item) => item.key)).toEqual(['grappler'])
    expect(improvementFeats(srdOrigins, 19).length).toBe(8)
  })

  it('adds pack entries beside the SRD ones and skips rows it cannot read', () => {
    const broken: OriginRowLike = { ...triton, key: 'b00c5000--broken', data: { speed: 'fast' } }
    const catalog = buildOriginCatalog([...srdOriginRows, triton, broken, sailor, brawler])
    expect(catalog.species.map((item) => item.key)).toContain('b00c5000--triton')
    expect(catalog.species.map((item) => item.key)).not.toContain('b00c5000--broken')
    const hidden = buildOriginCatalog([{ ...triton, hidden: true }])
    expect(offeredSpecies(hidden)).toEqual([])
    expect(speciesDefFor(hidden, 'b00c5000--triton')).not.toBeNull()
  })

  it('links pack traits and feats to the pack features', () => {
    expect(traitRef('dwarf', 'dwarvenToughness')).toBe('feature.species-dwarf-dwarven-toughness')
    expect(traitRef('b00c5000--triton', 'amphibious')).toBe(
      'feature.b00c5000--species-triton-amphibious',
    )
    expect(featRef('alert')).toBe('feature.feat-alert')
    expect(featRef('b00c5000--brawler')).toBe('feature.b00c5000--feat-brawler')
  })

  it('creates a character with a pack species and background', () => {
    const catalog = buildOriginCatalog([triton, sailor, brawler])
    const species = catalog.species[0]!
    let build = chooseSpecies(emptyBuild(), species.key, 'Tritón', species, 'en')
    expect(build).toMatchObject({ speciesKey: 'b00c5000--triton', speed: 30 })
    expect(build.features.map((item) => [item.name, item.ref])).toEqual([
      ['Amphibious', 'feature.b00c5000--species-triton-amphibious'],
      ['Emissary of the Sea', 'feature.b00c5000--species-triton-emissary'],
    ])
    const background = catalog.backgrounds[0]!
    const feat = originFeat(background, catalog.feats[0]!, 'es', (list) => list)
    build = chooseBackground(build, background.key, 'Marinero', background, feat)
    expect(build.skills).toEqual({ athletics: 'proficient', perception: 'proficient' })
    expect(build.features.find((item) => item.source === 'feat')).toMatchObject({
      name: 'Pendenciero',
      ref: 'feature.b00c5000--feat-brawler',
    })
    // A species typed by hand keeps nothing of the pack's.
    expect(chooseSpecies(build, 'custom', 'Sirena', null, 'es').features).toHaveLength(1)
  })

  it('gives older builds the skills and abilities of their background', () => {
    const old = { ...emptyBuild(), backgroundKey: 'sage' }
    expect(withBackgroundFacts(old, srdOrigins)).toMatchObject({
      backgroundSkills: ['arcana', 'history'],
      backgroundAbilities: ['con', 'int', 'wis'],
    })
    expect(withBackgroundFacts(old, null)).toBe(old)
  })

  it('reads only the options a build picked, never inherited names', () => {
    const build = { ...emptyBuild(), choices: { elvenLineage: 'drow' } }
    expect(pickedOption(build, 'elvenLineage')).toBe('drow')
    expect(pickedOption(build, 'constructor')).toBeUndefined()
    expect(pickedOption(emptyBuild(), 'toString')).toBeUndefined()
  })
})
