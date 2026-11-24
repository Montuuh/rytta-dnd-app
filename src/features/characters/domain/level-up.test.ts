import { describe, expect, it } from 'vitest'
import {
  chooseClass,
  levelUpRequirements,
  planLevelUp,
} from '../../../../tests/fixtures/srd/with-classes'
import {
  applyChoices,
  canRaise,
  capReason,
  hasChoices,
  hitDieAverage,
  hitPointGain,
  levelUpGrants,
  missingChoices,
  noChoices,
  retroactiveHitPoints,
  summarizeLevelUp,
  validRoll,
  type LevelUpChoices,
} from './level-up'
import { syncProgression, type LibraryFeature } from './progression'
import { emptyBuild } from './rules'
import { buildSchema, type Build } from './sheet'
import { classKeys, type ClassKey } from './srd'

type Row = { id: string; cat: string; es: string; lv?: number; fc?: string; sb?: string }
const [index] = Object.values(
  import.meta.glob<Row[]>('../../../../tests/fixtures/srd/glossary/index.json', {
    eager: true,
    import: 'default',
  }),
)
const library: LibraryFeature[] = index!
  .filter((row) => row.cat === 'feature' && row.fc)
  .map((row) => ({
    id: row.id,
    name: row.es,
    classKey: row.fc!,
    level: row.lv!,
    subclass: row.sb ?? null,
  }))
const names = { resource: (key: string) => `res:${key}` }

/** A character of a class at a level, with its class features, as a saved sheet holds them. */
function character(classKey: ClassKey, level: number, patch: Partial<Build> = {}): Build {
  const base = chooseClass(
    { ...emptyBuild(), baseAbilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 } },
    classKey,
    classKey,
  )
  return syncProgression({ ...base, ...patch }, level, library, names)
}

describe('RYT-130 hit points', () => {
  it('pre-fills the hit-die average plus the Constitution modifier', () => {
    expect([6, 8, 10, 12].map((die) => hitDieAverage(die as 6 | 8 | 10 | 12))).toEqual([4, 5, 6, 7])
    expect(hitPointGain(8, 2, { kind: 'average' })).toBe(7)
    expect(hitPointGain(12, -1, { kind: 'average' })).toBe(6)
    expect(hitPointGain(6, 0, { kind: 'average' })).toBe(4)
  })

  it('accepts a typed roll on the die and refuses one outside it', () => {
    expect(hitPointGain(10, 3, { kind: 'roll', roll: 1 })).toBe(4)
    expect(hitPointGain(10, 3, { kind: 'roll', roll: 10 })).toBe(13)
    for (const roll of [0, 11, 2.5, -4, null])
      expect(hitPointGain(10, 3, { kind: 'roll', roll })).toBeNull()
    expect(validRoll(6, 6)).toBe(true)
    expect(validRoll(6, 7)).toBe(false)
  })

  it('gives at least one point a level, however low the Constitution', () => {
    expect(hitPointGain(6, -5, { kind: 'roll', roll: 1 })).toBe(1)
    expect(hitPointGain(6, -5, { kind: 'average' })).toBe(1)
  })

  it('adds one point per level when the Constitution modifier rises', () => {
    const before = character('fighter', 7)
    const odd = { ...before, baseAbilities: { ...before.baseAbilities, con: 13 } }
    const raised = { ...odd, baseAbilities: { ...odd.baseAbilities, con: 15 } }
    expect(retroactiveHitPoints(odd, raised, 8)).toBe(8)
    // 14 to 16 is a rise of one modifier; 13 to 14 is none.
    expect(
      retroactiveHitPoints(
        before,
        { ...before, baseAbilities: { ...before.baseAbilities, con: 15 } },
        8,
      ),
    ).toBe(0)
    expect(retroactiveHitPoints(raised, odd, 8)).toBe(0)
  })
})

describe('RYT-130 choices by class and level', () => {
  it('asks for the subclass from level 3 until one is set, in every SRD class', () => {
    for (const key of classKeys) {
      expect(levelUpRequirements(character(key, 2), 3).subclass, key).toBe(true)
      expect(levelUpRequirements(character(key, 1), 2).subclass, key).toBe(false)
      expect(levelUpRequirements(character(key, 3, { subclass: 'Mine' }), 4).subclass, key).toBe(
        false,
      )
      // A sheet that skipped the choice is asked again at the next level.
      expect(levelUpRequirements(character(key, 5), 6).subclass, key).toBe(true)
    }
  })

  it('asks for an ability increase or a feat at the class levels', () => {
    const at = (key: ClassKey) =>
      Array.from({ length: 19 }, (_, i) => i + 2).filter(
        (level) => levelUpRequirements(character(key, level - 1), level).improvement,
      )
    expect(at('wizard')).toEqual([4, 8, 12, 16, 19])
    expect(at('barbarian')).toEqual([4, 8, 12, 16, 19])
    expect(at('fighter')).toEqual([4, 6, 8, 12, 14, 16, 19])
    expect(at('rogue')).toEqual([4, 8, 10, 12, 16, 19])
  })

  it('asks for the spells a class prepares or knows more of, and for none on a martial class', () => {
    const gained = (key: ClassKey) =>
      Array.from({ length: 19 }, (_, i) => i + 2).map(
        (level) => levelUpRequirements(character(key, level - 1), level).spells,
      )
    // Sums are the class table: bard 4 at level 1 to 22 at level 20.
    expect(gained('bard').reduce((sum, n) => sum + n, 4)).toBe(22)
    expect(gained('wizard').reduce((sum, n) => sum + n, 4)).toBe(25)
    expect(gained('warlock').reduce((sum, n) => sum + n, 2)).toBe(15)
    expect(gained('ranger').reduce((sum, n) => sum + n, 2)).toBe(15)
    for (const key of ['barbarian', 'fighter', 'monk', 'rogue'] as const)
      expect(
        gained(key).every((n) => n === 0),
        key,
      ).toBe(true)
    expect(levelUpRequirements(character('bard', 1), 2).spells).toBe(1)
    expect(levelUpRequirements(character('bard', 4), 5).spells).toBe(2)
  })

  it('reports the highest spell level the new level opens', () => {
    expect(levelUpRequirements(character('wizard', 4), 5).maxSpellLevel).toBe(3)
    expect(levelUpRequirements(character('paladin', 4), 5).maxSpellLevel).toBe(2)
    expect(levelUpRequirements(character('fighter', 4), 5).maxSpellLevel).toBe(0)
  })

  it('asks nothing of a homebrew class', () => {
    const custom = { ...character('bard', 3), classKey: 'custom', classLabel: 'Artificer' }
    const need = levelUpRequirements(custom, 4)
    expect(hasChoices(need)).toBe(false)
  })

  it('keeps the confirm blocked while a required choice is missing', () => {
    const build = character('bard', 3, { subclass: 'Lore', subclassKey: 'lore' })
    const need = levelUpRequirements(build, 4)
    expect(need).toMatchObject({ subclass: false, improvement: true, spells: 1, cantrips: 1 })
    expect(missingChoices(build, need, noChoices)).toEqual(['improvement', 'spells', 'cantrips'])
    const spell = {
      id: 'lib-sleep',
      ref: 'spell.sleep',
      name: 'Sleep',
      level: 1,
      concentration: true,
      ritual: false,
    }
    const done: LevelUpChoices = {
      ...noChoices,
      subclass: null,
      improvement: { kind: 'abilities', split: false, picks: ['cha'] },
      spells: [spell],
      cantrips: [{ ...spell, id: 'lib-light', ref: 'spell.light', name: 'Light', level: 0 }],
    }
    expect(missingChoices(build, need, done)).toEqual([])
    expect(missingChoices(build, need, { ...done, spells: [] })).toEqual(['spells'])
    expect(
      missingChoices(build, need, { ...done, spells: [spell, { ...spell, id: 'x' }] }),
    ).toEqual(['spells'])
  })

  it('validates the ability increase: +2 to one or +1 to two, never past 20', () => {
    const build = character('fighter', 3, {
      baseAbilities: { str: 19, dex: 14, con: 14, int: 8, wis: 10, cha: 10 },
      subclass: 'Champion',
    })
    const need = levelUpRequirements(build, 4)
    const check = (improvement: LevelUpChoices['improvement']) =>
      missingChoices(build, need, { ...noChoices, improvement })
    expect(check({ kind: 'abilities', split: false, picks: ['dex'] })).toEqual([])
    expect(check({ kind: 'abilities', split: false, picks: ['str'] })).toEqual(['improvement'])
    expect(check({ kind: 'abilities', split: false, picks: ['dex', 'con'] })).toEqual([
      'improvement',
    ])
    expect(check({ kind: 'abilities', split: true, picks: ['str', 'dex'] })).toEqual([])
    expect(check({ kind: 'abilities', split: true, picks: ['dex'] })).toEqual(['improvement'])
    expect(check({ kind: 'abilities', split: true, picks: ['dex', 'dex'] })).toEqual([
      'improvement',
    ])
    expect(check({ kind: 'feat', name: '   ' })).toEqual(['improvement'])
    expect(check({ kind: 'feat', name: 'Alert' })).toEqual([])
    expect(canRaise(build, 'str', 2)).toBe(false)
    expect(canRaise(build, 'str', 1)).toBe(true)
  })

  it('counts the background bonus toward the cap of 20', () => {
    const build = character('monk', 3, {
      baseAbilities: { str: 10, dex: 19, con: 10, int: 10, wis: 10, cha: 10 },
      bonuses: { str: 0, dex: 1, con: 0, int: 0, wis: 0, cha: 0 },
    })
    expect(canRaise(build, 'dex', 1)).toBe(false)
  })

  it('names the real limit: a 19 would pass 20, only a 20 is at the cap', () => {
    const build = character('wizard', 11, {
      baseAbilities: { str: 8, dex: 14, con: 14, int: 19, wis: 20, cha: 10 },
    })
    expect(capReason(build, 'int')).toBe('would-pass')
    expect(capReason(build, 'wis')).toBe('at-cap')
    expect(capReason(build, 'str')).toBe('would-pass')
  })
})

describe('RYT-130 the level-up written to the build', () => {
  it('writes the subclass, the increase and the spells, and keeps the build valid', () => {
    const build = character('wizard', 3, { subclass: 'Evoker', subclassKey: 'evoker' })
    const need = levelUpRequirements(build, 4)
    const next = applyChoices(build, 4, need, {
      ...noChoices,
      subclass: null,
      improvement: { kind: 'abilities', split: true, picks: ['int', 'con'] },
      spells: [
        {
          id: 'lib-shield',
          ref: 'spell.shield',
          name: 'Shield',
          level: 1,
          concentration: false,
          ritual: false,
        },
      ],
    })
    expect(next.baseAbilities).toMatchObject({ int: 11, con: 15 })
    expect(next.spells.find((spell) => spell.id === 'lib-shield')).toMatchObject({
      prepared: true,
      ref: 'spell.shield',
    })
    expect(() => buildSchema.parse(next)).not.toThrow()
  })

  it('writes a feat as a feature of the sheet and a subclass by key or by name', () => {
    const build = character('cleric', 3)
    const need = levelUpRequirements(build, 4)
    const next = applyChoices(build, 4, need, {
      ...noChoices,
      subclass: { key: 'life', name: 'Life Domain' },
      improvement: { kind: 'feat', name: ' Tough ' },
      spells: [],
    })
    expect(next.features.find((feature) => feature.source === 'feat')).toMatchObject({
      id: 'levelup-feat-4',
      name: 'Tough',
    })
    // The subclass is asked at level 3 only; level 4 with one set leaves it alone.
    const homebrew = applyChoices(
      character('cleric', 2),
      3,
      levelUpRequirements(character('cleric', 2), 3),
      {
        ...noChoices,
        subclass: { key: '', name: 'Storm Domain' },
      },
    )
    expect(homebrew).toMatchObject({ subclass: 'Storm Domain', subclassKey: '' })
  })

  it('ignores choices the level does not ask for', () => {
    const build = character('fighter', 4, { subclass: 'Champion' })
    const need = levelUpRequirements(build, 5)
    const next = applyChoices(build, 5, need, {
      ...noChoices,
      subclass: { key: 'champion', name: 'Other' },
      improvement: { kind: 'abilities', split: false, picks: ['str'] },
      spells: [],
    })
    expect(next).toBe(build)
  })
})

describe('RYT-130 what a level grants', () => {
  it('lists the new class features by glossary entry, the resources and the proficiency bonus', () => {
    const build = character('monk', 4)
    const grants = levelUpGrants(build, 4, 5, library, names)
    expect(grants.features.map((feature) => feature.ref)).toContain('feature.monk-stunning-strike')
    expect(grants.features.every((feature) => feature.ref && feature.level === 5)).toBe(true)
    expect(grants.proficiency).toEqual({ from: 2, to: 3 })
    expect(grants.resources.changed.map((item) => item.tracker.key)).toContain('monk-focus')
  })

  it('shows the new spell slots of a caster and none for a martial class', () => {
    expect(levelUpGrants(character('wizard', 4), 4, 5, library, names).slots).toEqual([
      { level: 3, from: 0, to: 2 },
    ])
    expect(levelUpGrants(character('fighter', 4), 4, 5, library, names).slots).toEqual([])
  })

  it('grants a feature at every level of every SRD class without a gap in the plan', () => {
    for (const key of classKeys) {
      for (let level = 1; level < 20; level += 1) {
        const build = character(key, level, { subclass: 'x' })
        const plan = planLevelUp(
          { build, level, maxHp: 10, hitPoints: { kind: 'average' }, choices: noChoices },
          library,
          names,
        )
        expect(plan?.level, `${key} ${level}`).toBe(level + 1)
        expect(plan?.build.features.length).toBeGreaterThanOrEqual(build.features.length)
      }
    }
  })
})

describe('RYT-130 the plan sent to the server', () => {
  const choices = (build: Build): LevelUpChoices => ({
    ...noChoices,
    subclass: null,
    improvement: levelUpRequirements(build, 4).improvement
      ? { kind: 'abilities', split: false, picks: ['con'] }
      : null,
    spells: [],
  })

  it('shows the new maximum before confirm and waits for a typed roll', () => {
    const build = character('fighter', 3, { subclass: 'Champion', subclassKey: 'champion' })
    const input = {
      build,
      level: 3,
      maxHp: 30,
      hitPoints: { kind: 'roll', roll: null } as const,
      choices: noChoices,
    }
    expect(planLevelUp(input, library, names)).toBeNull()
    const plan = planLevelUp({ ...input, hitPoints: { kind: 'roll', roll: 7 } }, library, names)
    // d10 + CON 14 (+2).
    expect(plan).toMatchObject({ level: 4, gain: 9, maxHp: 39, retroactive: 0 })
    expect(plan?.missing).toEqual(['improvement'])
  })

  it('counts the retroactive points of a Constitution increase in the new maximum', () => {
    const build = character('fighter', 3, {
      subclass: 'Champion',
      subclassKey: 'champion',
      baseAbilities: { str: 10, dex: 10, con: 15, int: 10, wis: 10, cha: 10 },
    })
    const plan = planLevelUp(
      { build, level: 3, maxHp: 30, hitPoints: { kind: 'average' }, choices: choices(build) },
      library,
      names,
    )
    // CON 15 to 17: +1 modifier, applied to 4 levels; the level adds 6 + 2.
    expect(plan).toMatchObject({ gain: 8, retroactive: 4, maxHp: 42, missing: [] })
    expect(plan?.build.baseAbilities.con).toBe(17)
    expect(() => buildSchema.parse(plan?.build)).not.toThrow()
  })

  it('keeps a Player within the 64 points the server allows a level', () => {
    const build = character('barbarian', 19, {
      subclass: 'x',
      baseAbilities: { str: 10, dex: 10, con: 19, int: 10, wis: 10, cha: 10 },
    })
    const plan = planLevelUp(
      { build, level: 19, maxHp: 200, hitPoints: { kind: 'roll', roll: 12 }, choices: noChoices },
      library,
      names,
    )
    expect(plan!.maxHp - 200).toBeLessThanOrEqual(64)
  })

  it('summarises what changed from the saved before and after', () => {
    const build = character('wizard', 4, { subclass: 'Evoker', subclassKey: 'evoker' })
    const plan = planLevelUp(
      {
        build,
        level: 4,
        maxHp: 24,
        hitPoints: { kind: 'average' },
        choices: {
          ...noChoices,
          subclass: null,
          improvement: null,
          spells: [
            {
              id: 'lib-fireball',
              ref: 'spell.fireball',
              name: 'Fireball',
              level: 3,
              concentration: false,
              ritual: false,
            },
            {
              id: 'lib-fly',
              ref: 'spell.fly',
              name: 'Fly',
              level: 3,
              concentration: true,
              ritual: false,
            },
          ],
          spellbook: [
            {
              id: 'lib-web',
              ref: 'spell.web',
              name: 'Web',
              level: 2,
              concentration: true,
              ritual: false,
            },
            {
              id: 'lib-haste',
              ref: 'spell.haste',
              name: 'Haste',
              level: 3,
              concentration: true,
              ritual: false,
            },
          ],
        },
      },
      library,
      names,
    )!
    expect(plan.missing).toEqual([])
    const summary = summarizeLevelUp(
      { level: 4, maxHp: 24, build },
      { level: plan.level, maxHp: plan.maxHp, build: plan.build },
    )
    expect(summary).toMatchObject({
      fromLevel: 4,
      toLevel: 5,
      spells: ['Fireball', 'Fly', 'Web', 'Haste'],
    })
    expect(summary.hp.to).toBeGreaterThan(24)
    expect(summary.grants.slots).toEqual([{ level: 3, from: 0, to: 2 }])
  })
})

describe('RYT-130 cantrips and the wizard spellbook', () => {
  const cantripsAt = (key: ClassKey) =>
    Array.from({ length: 19 }, (_, i) => i + 2).filter(
      (level) => levelUpRequirements(character(key, level - 1), level).cantrips > 0,
    )

  it('asks for one more cantrip at levels 4 and 10 of the casting classes only', () => {
    for (const key of ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'] as const)
      expect(cantripsAt(key), key).toEqual([4, 10])
    for (const key of ['barbarian', 'fighter', 'monk', 'rogue', 'paladin', 'ranger'] as const)
      expect(cantripsAt(key), key).toEqual([])
  })

  it('asks for two spellbook spells at every wizard level after the first, and for no one else', () => {
    const wizard = (level: number) => levelUpRequirements(character('wizard', level - 1), level)
    expect(wizard(2).spellbook).toBe(2)
    expect(wizard(12).spellbook).toBe(2)
    expect(wizard(12).spells).toBe(0)
    expect(wizard(20).spellbook).toBe(2)
    expect(levelUpRequirements(character('bard', 11), 12).spellbook).toBe(0)
  })

  it('blocks the confirm until the cantrip and the spellbook spells are chosen', () => {
    const build = character('wizard', 3, { subclass: 'Evoker', subclassKey: 'evoker' })
    const need = levelUpRequirements(build, 4)
    expect(hasChoices(need)).toBe(true)
    const pick = (id: string, level: number) => ({
      id,
      name: id,
      level,
      concentration: false,
      ritual: false,
    })
    const improvement = { kind: 'feat' as const, name: 'Alert' }
    const base = { ...noChoices, improvement, spells: [pick('a', 1)] }
    expect(missingChoices(build, need, base)).toEqual(['cantrips', 'spellbook'])
    const done = {
      ...base,
      cantrips: [pick('c', 0)],
      spellbook: [pick('s1', 1), pick('s2', 2)],
    }
    expect(missingChoices(build, need, done)).toEqual([])
    expect(missingChoices(build, need, { ...done, spellbook: [pick('s1', 1)] })).toEqual([
      'spellbook',
    ])
  })

  it('writes cantrips as prepared and spellbook spells as not prepared', () => {
    const build = character('wizard', 3, { subclass: 'Evoker', subclassKey: 'evoker' })
    const need = levelUpRequirements(build, 4)
    const pick = (id: string, level: number) => ({
      id,
      name: id,
      level,
      concentration: false,
      ritual: false,
    })
    const next = applyChoices(build, 4, need, {
      ...noChoices,
      improvement: { kind: 'feat', name: 'Alert' },
      spells: [pick('prep', 1)],
      cantrips: [pick('can', 0)],
      spellbook: [pick('book1', 1), pick('book2', 2)],
    })
    const by = (id: string) => next.spells.find((spell) => spell.id === id)
    expect(by('prep')).toMatchObject({ prepared: true, level: 1 })
    expect(by('can')).toMatchObject({ prepared: true, level: 0 })
    expect(by('book1')).toMatchObject({ prepared: false })
    expect(by('book2')).toMatchObject({ prepared: false })
    expect(() => buildSchema.parse(next)).not.toThrow()
    const summary = summarizeLevelUp(
      { level: 3, maxHp: 20, build },
      { level: 4, maxHp: 26, build: next },
    )
    expect(summary.spells).toEqual(['prep', 'can', 'book1', 'book2'])
  })

  it('reports resource die scaling and rest-reset changes on level up', () => {
    const rogue = character('rogue', 2)
    const rogueGrants = levelUpGrants(rogue, 2, 3, library, names)
    expect(rogueGrants.dieChanges).toEqual([expect.objectContaining({ from: '1d6', to: '2d6' })])

    const bard = character('bard', 4, { subclass: 'Lore', subclassKey: 'lore' })
    const bardGrants = levelUpGrants(bard, 4, 5, library, names)
    expect(bardGrants.dieChanges).toEqual([expect.objectContaining({ from: 'd6', to: 'd8' })])
    expect(bardGrants.resetChanges).toEqual([
      expect.objectContaining({ from: 'long', to: 'short' }),
    ])
  })

  it('adds pack-prefixed subclass features at level 3 and later levels', () => {
    const packLib: LibraryFeature[] = [
      ...library,
      {
        id: 'feature.a1b2c3d4--barbarian-ember-heart-warmth',
        name: 'Warmth of the Ember',
        classKey: 'barbarian',
        level: 3,
        subclass: 'a1b2c3d4--ember-heart',
      },
      {
        id: 'feature.a1b2c3d4--barbarian-ember-heart-sparks',
        name: 'Sparks of the Ember',
        classKey: 'barbarian',
        level: 6,
        subclass: 'a1b2c3d4--ember-heart',
      },
    ]
    const lvl2 = character('barbarian', 2)
    const plan3 = planLevelUp(
      {
        build: lvl2,
        level: 2,
        maxHp: 22,
        hitPoints: { kind: 'average' },
        choices: {
          ...noChoices,
          subclass: { key: 'a1b2c3d4--ember-heart', name: 'Path of the Ember Heart' },
        },
      },
      packLib,
      names,
    )
    expect(plan3?.missing).toEqual([])
    expect(plan3?.build.features.map((f) => f.ref)).toContain(
      'feature.a1b2c3d4--barbarian-ember-heart-warmth',
    )
    expect(plan3?.build.features.map((f) => f.ref)).not.toContain(
      'feature.a1b2c3d4--barbarian-ember-heart-sparks',
    )

    const lvl5 = syncProgression(plan3!.build, 5, packLib, names)
    const plan6 = planLevelUp(
      {
        build: lvl5,
        level: 5,
        maxHp: 50,
        hitPoints: { kind: 'average' },
        choices: noChoices,
      },
      packLib,
      names,
    )
    expect(plan6?.build.features.map((f) => f.ref)).toContain(
      'feature.a1b2c3d4--barbarian-ember-heart-sparks',
    )
  })
})
