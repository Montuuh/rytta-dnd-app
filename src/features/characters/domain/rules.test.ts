import { describe, expect, it } from 'vitest'
import type { EquipmentSlot, Equipped, ItemDefinition, ItemStack } from '@/features/inventory'
import {
  acBreakdown,
  applyHp,
  applyRest,
  bonusesValid,
  emptyBuild,
  initiativeBreakdown,
  modifier,
  passivePerception,
  pointBuySpent,
  proficiencyBonus,
  restRecovery,
  saveBonus,
  skillBonus,
  slotsFor,
  speedBreakdown,
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
import { blankDraft, quickDraft } from './quick'
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
  it('previews what a rest gives back before asking the group (RYT-080)', () => {
    const build = {
      ...emptyBuild(),
      hitDie: 10 as const,
      trackers: [
        { id: 'short', name: 'S', max: 2, reset: 'short' as const },
        { id: 'long', name: 'L', max: 3, reset: 'long' as const },
      ],
    }
    const hurt = {
      ...vitals,
      current_hp: 8,
      hit_dice_spent: 1,
      tracker_uses: { short: 2, long: 1 },
    }
    const long = restRecovery(hurt, build, 20, 3, 'long')
    expect(long).toMatchObject({
      canRest: true,
      hp: { before: 8, after: 20, max: 20 },
      dice: { before: 2, after: 3, die: 10 },
    })
    expect(long.trackers.map((t) => [t.id, t.before, t.after])).toEqual([
      ['short', 0, 2],
      ['long', 2, 3],
    ])
    const short = restRecovery(hurt, build, 20, 3, 'short')
    expect(short.hp).toBeUndefined()
    expect(short.healDice).toEqual({ left: 2, die: 10 })
    expect(short.trackers.map((t) => t.id)).toEqual(['short'])
    // At 0 HP nothing comes back.
    const down = restRecovery({ ...hurt, current_hp: 0 }, build, 20, 3, 'long')
    expect(down).toMatchObject({ canRest: false, trackers: [], slots: [] })
    expect(down.hp).toBeUndefined()
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

function equipItem(partial: Partial<ItemDefinition>, slot: EquipmentSlot): Equipped {
  const defId = `90000000-0000-4000-8000-000000000001`
  const definition: ItemDefinition = {
    id: defId,
    campaign_id: '20000000-0000-4000-8000-000000000001',
    name: 'Item',
    category: 'gear',
    icon: 'package',
    rarity: 'common',
    weight_tenths: 10,
    value_gp: null,
    description: '',
    slot_kind:
      slot === 'ring_1' || slot === 'ring_2'
        ? 'ring'
        : slot === 'main_hand' || slot === 'off_hand'
          ? 'one_hand'
          : slot,
    properties: {},
    origin: 'dm',
    archived: false,
    created_by: null,
    revision: 0,
    ...partial,
  }
  const stack: ItemStack = {
    id: `91000000-0000-4000-8000-000000000001`,
    campaign_id: definition.campaign_id,
    character_id: '40000000-0000-4000-8000-000000000001',
    definition_id: defId,
    quantity: 1,
    equipped_slot: slot,
    source: 'dm',
    notes: '',
    revision: 0,
  }
  return { stack, definition }
}

describe('stat breakdowns and origin drafts', () => {
  it('computes AC breakdowns across unarmored features, gear, feats, bonuses and overrides', () => {
    const monk = {
      ...emptyBuild(),
      classKey: 'monk',
      baseAbilities: { str: 10, dex: 16, con: 12, int: 10, wis: 16, cha: 10 },
    }
    const monkAc = acBreakdown(monk)
    expect(monkAc).toMatchObject({ total: 16, base: 10, formula: '10+3+3', modified: true })
    expect(monkAc.parts.map((p) => p.labelKey)).toEqual([
      'panel.mod.base',
      'panel.mod.dex',
      'panel.mod.monkUnarmored',
    ])

    const shield = equipItem(
      { name: 'Shield', category: 'shield', slot_kind: 'shield', properties: { acBonus: 2 } },
      'off_hand',
    )
    const monkWithShield = acBreakdown(monk, new Map([['off_hand', shield]]))
    expect(monkWithShield).toMatchObject({ total: 15, formula: '10+3+2', modified: true })

    const barbarian = {
      ...emptyBuild(),
      classKey: 'barbarian',
      baseAbilities: { str: 16, dex: 14, con: 16, int: 8, wis: 10, cha: 10 },
    }
    const barbWithShield = acBreakdown(barbarian, new Map([['off_hand', shield]]))
    expect(barbWithShield).toMatchObject({ total: 17, formula: '10+2+3+2', modified: true })

    const draconic = {
      ...emptyBuild(),
      classKey: 'sorcerer',
      subclassKey: 'draconic',
      baseAbilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 18 },
    }
    expect(acBreakdown(draconic, undefined, 3)).toMatchObject({ total: 16, formula: '10+2+4' })

    const fighter = {
      ...emptyBuild(),
      classKey: 'fighter',
      baseAbilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
      features: [
        { id: 'f1', name: 'Fighting Style: Defense', source: 'class' as const, description: '' },
      ],
    }
    const chainPlus1 = equipItem(
      {
        name: 'Chain Mail +1',
        category: 'armor',
        slot_kind: 'body',
        properties: { base: 16, dexCap: 0, acBonus: 1 },
      },
      'body',
    )
    const ring = equipItem(
      {
        name: 'Ring of Protection',
        category: 'gear',
        slot_kind: 'ring',
        properties: { acBonus: 1 },
      },
      'ring_1',
    )
    const fighterAc = acBreakdown(
      { ...fighter, acBonus: 2 },
      new Map([
        ['body', chainPlus1],
        ['off_hand', shield],
        ['ring_1', ring],
      ]),
    )
    expect(fighterAc).toMatchObject({ total: 23, formula: '16+1+2+1+1+2', modified: true })

    const dualWielder = {
      ...emptyBuild(),
      features: [{ id: 'f2', name: 'Dual Wielder', source: 'feat' as const, description: '' }],
    }
    const swordA = equipItem(
      {
        name: 'Shortsword',
        category: 'weapon',
        slot_kind: 'one_hand',
        properties: { dice: '1d6' },
      },
      'main_hand',
    )
    const swordB = equipItem(
      { name: 'Scimitar', category: 'weapon', slot_kind: 'one_hand', properties: { dice: '1d6' } },
      'off_hand',
    )
    expect(
      acBreakdown(
        dualWielder,
        new Map([
          ['main_hand', swordA],
          ['off_hand', swordB],
        ]),
      ),
    ).toMatchObject({ total: 11, formula: '10+1', modified: true })

    const overridden = acBreakdown(
      { ...fighter, acOverride: 25 },
      new Map([
        ['body', chainPlus1],
        ['off_hand', shield],
      ]),
    )
    expect(overridden).toMatchObject({
      total: 25,
      autoTotal: 20,
      overridden: true,
      modified: true,
    })
  })

  it('computes speed breakdown with class features, feats, gear and inventory encumbrance', () => {
    const monk = {
      ...emptyBuild(),
      classKey: 'monk',
      speed: 30,
      baseAbilities: { str: 10, dex: 14, con: 10, int: 10, wis: 14, cha: 10 },
      features: [{ id: 's1', name: 'Speedy', source: 'feat' as const, description: '' }],
    }
    const boots = equipItem(
      {
        name: 'Boots of Striding',
        category: 'gear',
        slot_kind: 'feet',
        properties: { speedBonus: 10 },
      },
      'feet',
    )
    const light = speedBreakdown(monk, 5, {
      equipped: new Map([['feet', boots]]),
      carriedTenths: 400,
    })
    expect(light).toMatchObject({ total: 60, formula: '30+10+10+10', modified: true })

    const armor = equipItem(
      { name: 'Leather Armor', category: 'armor', slot_kind: 'body', properties: { base: 11 } },
      'body',
    )
    expect(
      speedBreakdown(monk, 5, { equipped: new Map([['body', armor]]), carriedTenths: 600 }),
    ).toMatchObject({ total: 30, formula: '30+10−10' })

    const heavyBarb = {
      ...emptyBuild(),
      classKey: 'barbarian',
      speed: 30,
      baseAbilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
    }
    expect(speedBreakdown(heavyBarb, 5, { carriedTenths: 1100 })).toMatchObject({
      total: 20,
      formula: '30+10−20',
    })
    expect(speedBreakdown(heavyBarb, 5, { carriedTenths: 1600 })).toMatchObject({
      total: 5,
      formula: '30+10−35',
    })

    const plate = equipItem(
      {
        name: 'Plate Armor',
        category: 'armor',
        slot_kind: 'body',
        properties: { base: 18, dexCap: 0 },
      },
      'body',
    )
    expect(speedBreakdown(heavyBarb, 5, { equipped: new Map([['body', plate]]) })).toMatchObject({
      total: 30,
      modified: false,
    })
  })

  it('computes initiative breakdown with Dexterity and Alert proficiency', () => {
    const build = {
      ...emptyBuild(),
      baseAbilities: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
      features: [{ id: 'a1', name: 'Alert', source: 'feat' as const, description: '' }],
    }
    expect(initiativeBreakdown(build, 5)).toMatchObject({
      total: 6,
      base: 3,
      formula: '+3+3',
      modified: true,
    })
    expect(initiativeBreakdown({ ...build, features: [] }, 5)).toMatchObject({
      total: 3,
      formula: '',
      modified: false,
    })
  })

  it('supports optional origin on blankDraft and keeps unarmored quickDraft unlocked', () => {
    const names = { resource: (key: string) => key }
    const blankPlain = blankDraft({
      classKey: 'fighter',
      classLabel: 'Fighter',
      level: 1,
      library: [],
      names,
    })
    expect(blankPlain.build.speciesKey).toBe('')
    expect(blankPlain.build.backgroundKey).toBe('')

    const blankOrigin = blankDraft({
      classKey: 'fighter',
      classLabel: 'Fighter',
      level: 1,
      speciesKey: 'elf',
      speciesLabel: 'Elf',
      backgroundKey: 'acolyte',
      backgroundLabel: 'Acolyte',
      name,
      library: [],
      names,
    })
    expect(blankOrigin.build.speciesKey).toBe('elf')
    expect(blankOrigin.build.backgroundKey).toBe('acolyte')
    expect(blankOrigin.build.features.some((f) => f.source === 'feat')).toBe(true)

    for (const classKey of ['monk', 'barbarian'] as const) {
      const quick = quickDraft({
        classKey,
        classLabel: classKey,
        speciesKey: 'human',
        speciesLabel: 'Human',
        backgroundLabel: (key) => key,
        name,
        library: [],
        names,
      })
      expect(quick.build.acOverride).toBeNull()
    }
  })
})
