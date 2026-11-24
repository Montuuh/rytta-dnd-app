import { describe, expect, it } from 'vitest'
import { srdClass, srdClassRows, srdClasses } from '../../../../tests/fixtures/srd/classes'
import {
  buildClassCatalog,
  classDefFor,
  offeredClasses,
  subclassesFor,
  type ClassRowLike,
} from './class-catalog'
import { chooseClass, classSkillChoices } from './creation'
import { levelUpRequirements } from './level-up'
import { emptyBuild } from './rules'

const rune: ClassRowLike = {
  cat: 'class',
  key: 'b00c5000--rune-knight',
  en: 'Rune Knight',
  es: 'Caballero rúnico',
  data: {
    hitDie: 10,
    saves: ['str', 'con'],
    skillCount: 2,
    skills: ['athletics', 'arcana'],
    caster: 'half',
    spellAbility: 'int',
    subclassLevel: 2,
    improvementLevels: [4, 8, 12],
    prepared: [0, 2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15],
  },
  pack: { title_en: 'Owner books', title_es: 'Libros' },
}
const giant: ClassRowLike = {
  cat: 'subclass',
  key: 'b00c5000--giant-blood',
  en: 'Giant Blood',
  es: 'Sangre de gigante',
  data: { class: 'fighter' },
}

describe('class catalog (RYT-168, RYT-167)', () => {
  it('reads the 12 SRD classes and their subclasses as the library publishes them', () => {
    expect(srdClasses.classes.map((item) => item.key)).toHaveLength(12)
    expect(srdClass('fighter')).toMatchObject({
      srd: true,
      name: null,
      hitDie: 10,
      improvementLevels: [4, 6, 8, 12, 14, 16, 19],
      cantrips: false,
    })
    expect(subclassesFor(srdClasses, 'fighter').map((item) => item.key)).toEqual(['champion'])
  })

  it('has no class without packs, and adds pack classes and subclasses beside the SRD ones', () => {
    expect(buildClassCatalog([]).classes).toEqual([])
    expect(classDefFor(null, 'wizard')).toBeNull()
    const catalog = buildClassCatalog([...srdClassRows, rune, giant])
    expect(catalog.classes.at(-1)!.key).toBe('b00c5000--rune-knight')
    expect(subclassesFor(catalog, 'fighter').map((item) => item.key)).toEqual([
      'champion',
      'b00c5000--giant-blood',
    ])
    expect(classDefFor(catalog, 'b00c5000--rune-knight')).toMatchObject({
      srd: false,
      name: { en: 'Rune Knight', es: 'Caballero rúnico' },
      improvementLevels: [4, 8, 12],
      cantrips: false,
    })
  })

  it('leaves hidden classes out of new choices and keeps them readable', () => {
    const catalog = buildClassCatalog(
      srdClassRows.map((row) => (row.key === 'monk' ? { ...row, hidden: true } : row)),
    )
    expect(offeredClasses(catalog).map((item) => item.key)).not.toContain('monk')
    expect(classDefFor(catalog, 'monk')).toMatchObject({ hitDie: 8, hidden: true })
  })

  it('creates and levels a pack class from its definition', () => {
    const def = classDefFor(buildClassCatalog([rune]), 'b00c5000--rune-knight')!
    const build = chooseClass(emptyBuild(), def.key, 'Caballero rúnico', def)
    expect(build).toMatchObject({
      classKey: 'b00c5000--rune-knight',
      classLabel: 'Caballero rúnico',
      hitDie: 10,
      saves: ['str', 'con'],
      casterKind: 'half',
      spellAbility: 'int',
    })
    expect(classSkillChoices(build, def)).toMatchObject({
      count: 2,
      options: ['athletics', 'arcana'],
    })
    expect(levelUpRequirements(build, 2, def)).toMatchObject({
      subclass: true,
      spells: 2,
      cantrips: 0,
    })
    expect(levelUpRequirements(build, 4, def)).toMatchObject({ improvement: true })
    expect(levelUpRequirements(build, 6, def)).toMatchObject({ improvement: false })
    // Without its definition, a class behaves as one typed by hand.
    expect(chooseClass(emptyBuild(), def.key, 'Caballero rúnico', null).classKey).toBe('custom')
  })

  it('applies the SRD tables of SRD classes', () => {
    const fighter = srdClass('fighter')
    const build = chooseClass(emptyBuild(), 'fighter', 'Guerrero', fighter)
    expect(levelUpRequirements(build, 6, fighter)).toMatchObject({ improvement: true })
    const wizard = srdClass('wizard')
    const mage = chooseClass(emptyBuild(), 'wizard', 'Mago', wizard)
    expect(levelUpRequirements(mage, 4, wizard)).toMatchObject({
      cantrips: 1,
      spells: 1,
      spellbook: 2,
    })
    expect(levelUpRequirements(mage, 3, wizard)).toMatchObject({ subclass: true })
  })
})
