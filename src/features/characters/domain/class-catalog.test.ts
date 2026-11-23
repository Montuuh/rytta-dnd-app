import { describe, expect, it } from 'vitest'
import {
  buildClassCatalog,
  classDefFor,
  classIndexOf,
  classIndexSchema,
  offeredClasses,
  srdClassDefs,
  srdSubclassDefs,
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

describe('class catalog (RYT-168)', () => {
  it('every SRD class round-trips through its library index', () => {
    for (const def of srdClassDefs) {
      const parsed = classIndexSchema.parse(classIndexOf(def))
      expect(parsed).toMatchObject({
        hitDie: def.hitDie,
        caster: def.caster,
        subclassLevel: 3,
        cantrips: def.cantrips,
      })
    }
  })

  it('keeps the app SRD classes while the packs have none, and adds pack classes beside them', () => {
    const catalog = buildClassCatalog([rune, giant])
    expect(catalog.classes.map((item) => item.key)).toEqual([
      ...srdClassDefs.map((item) => item.key),
      'b00c5000--rune-knight',
    ])
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

  it('reads SRD class rows from the pack, leaving hidden ones out of new choices', () => {
    const rows: ClassRowLike[] = srdClassDefs.map((def) => ({
      cat: 'class',
      key: def.key,
      en: def.key,
      es: def.key,
      data: classIndexOf(def),
      ...(def.key === 'monk' ? { hidden: true } : {}),
    }))
    const catalog = buildClassCatalog([
      ...rows,
      ...srdSubclassDefs.map((def) => ({
        cat: 'subclass' as const,
        key: def.key,
        en: def.key,
        es: def.key,
        data: { class: def.classKey },
      })),
    ])
    expect(catalog.classes).toHaveLength(12)
    expect(offeredClasses(catalog).map((item) => item.key)).not.toContain('monk')
    // A character that already is a Monk keeps its class's data.
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
    // Without its definition, a pack class behaves as one typed by hand.
    expect(chooseClass(emptyBuild(), def.key, 'Caballero rúnico', null).classKey).toBe('custom')
  })

  it('keeps the SRD tables for SRD classes', () => {
    const build = chooseClass(emptyBuild(), 'fighter', 'Guerrero')
    expect(levelUpRequirements(build, 6)).toMatchObject({ improvement: true })
    const wizard = chooseClass(emptyBuild(), 'wizard', 'Mago')
    expect(levelUpRequirements(wizard, 4)).toMatchObject({ cantrips: 1, spells: 1, spellbook: 2 })
    expect(levelUpRequirements(wizard, 3)).toMatchObject({ subclass: true })
  })
})
