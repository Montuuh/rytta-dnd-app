import { describe, expect, it } from 'vitest'
import { srdClasses } from '../../../../tests/fixtures/srd/classes'
import { srdOrigins } from '../../../../tests/fixtures/srd/origins'
import {
  planLevelUp,
  chooseClass,
  chooseSpecies,
  chooseBackground,
} from '../../../../tests/fixtures/srd/with-classes'
import { originFeat } from './creation'
import { classDefFor, subclassesFor } from './class-catalog'
import { levelUpGrants, levelUpRequirements, noChoices } from './level-up'
import { featRef, improvementFeats, traitRef } from './origin-catalog'
import { classFeaturesFor, syncProgression, type LibraryFeature } from './progression'
import { emptyBuild, slotsFor } from './rules'
import { buildSchema } from './sheet'
import { classKeys } from './srd'

type Row = { id: string; cat: string; es: string; lv?: number; fc?: string; sb?: string }
const [index] = Object.values(
  import.meta.glob<Row[]>('../../../../tests/fixtures/srd/glossary/index.json', {
    eager: true,
    import: 'default',
  }),
)
const indexRows = index!
const indexIds = new Set(indexRows.map((row) => row.id))
const library: LibraryFeature[] = indexRows
  .filter((row) => row.cat === 'feature' && row.fc)
  .map((row) => ({
    id: row.id,
    name: row.es,
    classKey: row.fc!,
    level: row.lv!,
    subclass: row.sb ?? null,
  }))
const names = { resource: (key: string) => `res:${key}` }

describe('exhaustive SRD progression matrix', () => {
  it('syncs all 12 classes x 12 SRD subclasses x levels 1-20 cleanly', () => {
    for (const classKey of classKeys) {
      const def = classDefFor(srdClasses, classKey)!
      expect(def).not.toBeNull()
      const subs = subclassesFor(srdClasses, classKey)
      expect(subs.length).toBeGreaterThanOrEqual(1)

      for (const sub of subs) {
        const base = chooseClass(emptyBuild(), classKey, classKey)
        const withSub = { ...base, subclassKey: sub.key, subclass: sub.key }
        for (let level = 1; level <= 20; level += 1) {
          const synced = syncProgression(withSub, level, library, names)
          expect(() => buildSchema.parse(synced)).not.toThrow()
          const expected = classFeaturesFor(withSub, level, library)
          const refs = new Set(synced.features.map((f) => f.ref))
          expect(refs.size).toBe(synced.features.length)
          for (const row of expected) {
            expect(refs.has(row.id)).toBe(true)
          }
          for (const f of synced.features) {
            if (f.level) expect(f.level).toBeLessThanOrEqual(level)
          }
        }
      }
    }
  })

  it('steps level-by-level 1 -> 20 for all 12 classes with valid grants', () => {
    for (const classKey of classKeys) {
      const def = classDefFor(srdClasses, classKey)!
      const sub = subclassesFor(srdClasses, classKey)[0]!
      let build = syncProgression(chooseClass(emptyBuild(), classKey, classKey), 1, library, names)
      let maxHp = def.hitDie + 1
      for (let toLevel = 2; toLevel <= 20; toLevel += 1) {
        const req = levelUpRequirements(build, toLevel, def)
        const previewGrants = levelUpGrants(build, toLevel - 1, toLevel, library, names)
        const expectedFeatures = classFeaturesFor(build, toLevel, library).filter(
          (row) => row.level === toLevel,
        )
        for (const row of expectedFeatures) {
          expect(previewGrants.features.some((f) => f.ref === row.id)).toBe(true)
        }
        const plan = planLevelUp(
          {
            build,
            level: toLevel - 1,
            maxHp,
            hitPoints: { kind: 'average' },
            choices: {
              ...noChoices,
              ...(req.subclass ? { subclass: { key: sub.key, name: sub.key } } : {}),
              ...(req.improvement
                ? { improvement: { kind: 'feat', name: 'Alert', ref: 'feature.feat-alert' } }
                : {}),
              spells: Array.from({ length: req.spells }, (_, i) => ({
                id: `sp-${toLevel}-${i}`,
                name: `Spell ${toLevel}-${i}`,
                level: Math.max(1, req.maxSpellLevel),
                concentration: false,
                ritual: false,
              })),
              cantrips: Array.from({ length: req.cantrips }, (_, i) => ({
                id: `can-${toLevel}-${i}`,
                name: `Cantrip ${toLevel}-${i}`,
                level: 0,
                concentration: false,
                ritual: false,
              })),
              spellbook: Array.from({ length: req.spellbook }, (_, i) => ({
                id: `book-${toLevel}-${i}`,
                name: `Book ${toLevel}-${i}`,
                level: Math.max(1, req.maxSpellLevel),
                concentration: false,
                ritual: false,
              })),
            },
          },
          library,
          names,
        )
        expect(plan).not.toBeNull()
        expect(plan!.missing).toEqual([])
        build = plan!.build
        maxHp = plan!.maxHp
      }
      expect(build.subclassKey).toBe(sub.key)
    }
  })

  it('supports third-caster slots and activates casting when picking a third-caster subclass', () => {
    expect(slotsFor('third', 2)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('third', 3)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('third', 7)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('third', 13)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('third', 19)).toEqual([4, 3, 3, 1, 0, 0, 0, 0, 0])

    const fighter2 = syncProgression(
      chooseClass(emptyBuild(), 'fighter', 'Guerrero'),
      2,
      library,
      names,
    )
    const plan3 = planLevelUp(
      {
        build: fighter2,
        level: 2,
        maxHp: 20,
        hitPoints: { kind: 'average' },
        choices: {
          ...noChoices,
          subclass: {
            key: 'a1b2c3d4--rune-blade',
            name: 'Filo rúnico',
            caster: 'third',
            spellAbility: 'int',
          },
        },
      },
      library,
      names,
    )
    expect(plan3?.build.casterKind).toBe('third')
    expect(plan3?.build.spellAbility).toBe('int')
    expect(slotsFor(plan3!.build.casterKind, 3)[0]).toBe(2)
  })

  it('resolves all 9 SRD species, 4 SRD backgrounds, and 17 SRD feats in index.json', () => {
    expect(srdOrigins.species).toHaveLength(9)
    expect(srdOrigins.backgrounds).toHaveLength(4)
    expect(srdOrigins.feats).toHaveLength(17)

    for (const species of srdOrigins.species) {
      let build = chooseSpecies(emptyBuild(), species.key, species.name.es, 'es')
      for (const trait of species.traits) {
        expect(indexIds.has(traitRef(species.key, trait.key))).toBe(true)
      }
      for (const choice of species.choices) {
        for (const opt of choice.options) {
          build = { ...build, choices: { ...build.choices, [choice.trait]: opt.key } }
          const synced = syncProgression(build, 5, library, names)
          expect(() => buildSchema.parse(synced)).not.toThrow()
        }
      }
    }

    for (const bg of srdOrigins.backgrounds) {
      const feat = originFeat(
        bg,
        srdOrigins.feats.find((f) => f.key === bg.feat) ?? null,
        'es',
        (list) => list,
      )
      const build = chooseBackground(emptyBuild(), bg.key, bg.name.es, feat)
      expect(build.backgroundSkills).toEqual([...bg.skills])
      if (bg.feat) expect(indexIds.has(featRef(bg.feat))).toBe(true)
    }

    for (const feat of srdOrigins.feats) {
      expect(indexIds.has(featRef(feat.key))).toBe(true)
    }
    expect(improvementFeats(srdOrigins, 4).length).toBe(1)
    expect(improvementFeats(srdOrigins, 19).length).toBe(8)
  })
})
