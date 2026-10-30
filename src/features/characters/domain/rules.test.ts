import { describe, expect, it } from 'vitest'
import {
  applyHp,
  applyRest,
  bonusesValid,
  emptyBuild,
  modifier,
  passivePerception,
  pointBuySpent,
  proficiencyBonus,
  saveBonus,
  skillBonus,
  slotsFor,
  spellcasting,
  standardArrayValid,
  suggestedMaxHp,
} from './rules'
import {
  chooseBackground,
  chooseClass,
  chooseSpecies,
  classSkillChoices,
  initialDraft,
  validateStep,
} from './creation'
import { buildSchema, sheetRowSchema, vitalsSchema, type Vitals } from './sheet'

const name = (kind: string, key: string) => `${kind}:${key}`
const vitals: Vitals = {
  current_hp: 10,
  temp_hp: 4,
  hit_dice_spent: 3,
  death_successes: 1,
  death_failures: 2,
  heroic_inspiration: false,
  conditions: [],
  slots_used: [2, 1, 0, 0, 0, 0, 0, 0, 0],
  tracker_uses: { short: 1, long: 2, none: 1 },
  revision: 4,
}

describe('5.5e derived values', () => {
  it('computes modifiers and proficiency by level', () => {
    expect([1, 8, 9, 10, 11, 20, 30].map(modifier)).toEqual([-5, -1, -1, 0, 0, 5, 10])
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ])
  })
  it('applies saves, proficiency, expertise and passive perception', () => {
    const build = {
      ...emptyBuild(),
      baseAbilities: { str: 10, dex: 14, con: 12, int: 10, wis: 15, cha: 16 },
      bonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 1, cha: 2 },
      saves: ['dex', 'cha'] as const,
      skills: { perception: 'expertise', persuasion: 'proficient' } as const,
    }
    const b = { ...build, saves: [...build.saves] }
    expect(saveBonus(b, 5, 'cha')).toBe(4 + 3)
    expect(saveBonus(b, 5, 'wis')).toBe(3)
    expect(skillBonus(b, 5, 'perception')).toBe(3 + 6)
    expect(skillBonus(b, 5, 'persuasion')).toBe(4 + 3)
    expect(skillBonus(b, 5, 'stealth')).toBe(2)
    expect(passivePerception(b, 5)).toBe(19)
    expect(spellcasting({ ...b, casterKind: 'full', spellAbility: 'cha' }, 5)).toEqual({
      ability: 'cha',
      saveDc: 15,
      attack: 7,
    })
    expect(spellcasting(b, 5)).toBeNull()
  })
  it('follows full, 2024 half and pact slot progressions', () => {
    expect(slotsFor('full', 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('full', 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1])
    expect(slotsFor('half', 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('half', 5)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('half', 17)).toEqual([4, 3, 3, 3, 1, 0, 0, 0, 0])
    expect(slotsFor('pact', 1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('pact', 5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0])
    expect(slotsFor('pact', 20)).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0])
    expect(slotsFor('none', 20)).toEqual(Array(9).fill(0))
  })
  it('suggests max HP with at least one point per level', () => {
    expect(suggestedMaxHp(8, 1, 14)).toBe(10)
    expect(suggestedMaxHp(8, 5, 14)).toBe(10 + 4 * 7)
    expect(suggestedMaxHp(6, 3, 1)).toBe(1 + 2 * 1)
  })
  it('validates point buy, standard array and background increases', () => {
    expect(pointBuySpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27)
    expect(pointBuySpent({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeNull()
    expect(standardArrayValid({ str: 8, dex: 15, con: 14, int: 13, wis: 12, cha: 10 })).toBe(true)
    expect(standardArrayValid({ str: 15, dex: 15, con: 14, int: 13, wis: 12, cha: 10 })).toBe(false)
    const bonuses = { str: 0, dex: 0, con: 0, int: 0, wis: 2, cha: 1 }
    expect(bonusesValid({ backgroundKey: 'acolyte', bonuses })).toBe(true)
    expect(bonusesValid({ backgroundKey: 'soldier', bonuses })).toBe(false)
    expect(bonusesValid({ backgroundKey: 'custom', bonuses })).toBe(true)
    expect(bonusesValid({ backgroundKey: 'acolyte', bonuses: { ...bonuses, int: 1 } })).toBe(false)
  })
})

describe('play state', () => {
  it('spends temporary HP first and caps healing', () => {
    expect(applyHp(vitals, 20, 'damage', 6)).toMatchObject({ temp_hp: 0, current_hp: 8 })
    expect(applyHp(vitals, 20, 'damage', 99)).toMatchObject({ current_hp: 0 })
    expect(applyHp(vitals, 12, 'heal', 9)).toMatchObject({ current_hp: 12, death_failures: 0 })
  })
  it('resets the right resources on short and long rests', () => {
    const build = {
      ...emptyBuild(),
      casterKind: 'pact' as const,
      trackers: [
        { id: 'short', name: 'S', max: 2, reset: 'short' as const },
        { id: 'long', name: 'L', max: 2, reset: 'long' as const },
        { id: 'none', name: 'N', max: 2, reset: 'none' as const },
      ],
    }
    const short = applyRest(vitals, build, 20, 'short')
    expect(short.tracker_uses).toEqual({ long: 2, none: 1 })
    expect(short.slots_used).toEqual(Array(9).fill(0))
    expect(short.current_hp).toBe(10)
    const long = applyRest(vitals, { ...build, casterKind: 'full' }, 20, 'long')
    expect(long).toMatchObject({ current_hp: 20, temp_hp: 0, hit_dice_spent: 0 })
    expect(long.tracker_uses).toEqual({ none: 1 })
  })
})

describe('creation wizard', () => {
  it('applies class, species and background choices and keeps background skills', () => {
    let build = initialDraft().build
    build = chooseBackground(build, 'acolyte', 'Acólito', name)
    build = chooseClass(build, 'wizard', 'Mago')
    build = { ...build, skills: { ...build.skills, arcana: 'proficient', medicine: 'proficient' } }
    build = chooseClass(build, 'barbarian', 'Bárbaro')
    expect(build).toMatchObject({ hitDie: 12, saves: ['str', 'con'], casterKind: 'none' })
    expect(Object.keys(build.skills).sort()).toEqual(['insight', 'religion'])
    build = chooseSpecies(build, 'goliath', 'Goliat', name)
    build = chooseSpecies(build, 'elf', 'Elfo', name)
    expect(build.speed).toBe(30)
    expect(build.features.filter((f) => f.source === 'species').map((f) => f.name)).toEqual([
      'trait:darkvision',
      'trait:elvenLineage',
      'trait:feyAncestry',
      'trait:keenSenses',
      'trait:trance',
    ])
    expect(build.features.find((f) => f.source === 'feat')?.name).toBe('feat:magicInitiateCleric')
    expect(classSkillChoices(build)).toMatchObject({ fixed: ['insight', 'religion'], count: 2 })
  })
  it('reports blocking issues per step', () => {
    const draft = initialDraft()
    expect(validateStep('class', draft)).toEqual(['chooseClass'])
    expect(validateStep('origin', draft)).toEqual(['chooseSpecies', 'chooseBackground'])
    expect(validateStep('abilities', draft)).toEqual([])
    const pointBuy = {
      ...draft,
      build: {
        ...draft.build,
        abilityMethod: 'pointBuy' as const,
        baseAbilities: { str: 15, dex: 15, con: 15, int: 15, wis: 8, cha: 8 },
      },
    }
    expect(validateStep('abilities', pointBuy)).toEqual(['pointBuy'])
    const custom = { ...draft, build: { ...draft.build, classKey: 'custom' } }
    expect(validateStep('class', custom)).toEqual(['nameClass'])
    const huge = {
      ...draft,
      build: { ...draft.build, notes: 'x'.repeat(4000), appearance: 'y'.repeat(2000) },
    }
    huge.build.features = Array.from({ length: 60 }, (_, i) => ({
      id: `f${i}`,
      name: 'n'.repeat(100),
      source: 'other' as const,
      description: 'd'.repeat(2000),
    }))
    expect(validateStep('details', huge)).toContain('tooLarge')
  })
})

describe('sheet boundaries', () => {
  const row = {
    character_id: '10000000-0000-4000-8000-000000000001',
    campaign_id: '20000000-0000-4000-8000-000000000001',
    status: 'draft',
    level: 1,
    max_hp: 1,
    armor_class: 10,
    build: {},
    revision: 0,
  }
  it('treats a never-saved build as empty and validates a stored one', () => {
    expect(sheetRowSchema.parse(row).build).toBeNull()
    expect(sheetRowSchema.parse({ ...row, build: emptyBuild() }).build).toEqual(emptyBuild())
    expect(sheetRowSchema.safeParse({ ...row, build: { classKey: 1 } }).success).toBe(false)
    expect(buildSchema.safeParse({ ...emptyBuild(), hitDie: 7 }).success).toBe(false)
  })
  it('fails closed on malformed play state', () => {
    expect(vitalsSchema.safeParse(vitals).success).toBe(true)
    for (const bad of [
      { slots_used: [0] },
      { conditions: ['exhaustion'] },
      { current_hp: -1 },
      { death_failures: 4 },
    ])
      expect(vitalsSchema.safeParse({ ...vitals, ...bad }).success).toBe(false)
  })
})
