import { describe, expect, it } from 'vitest'
import {
  armorClass,
  attacks,
  canEquip,
  equippedBySlot,
  martialArtsDie,
  slotsFor,
} from './equipment'
import { carriedLoad, carriedTenths, encumbrance } from './encumbrance'
import {
  definitionSchema,
  undoRemainingMs,
  type InventoryEvent,
  type ItemDefinition,
  type ItemStack,
} from './item'
import catalogue from '../../../../tests/fixtures/srd/items/basic-items.json'
import { basicItemCatalogueSchema, toDefinitionDraft } from './basic-items'

const campaign = '20000000-0000-4000-8000-000000000001'
const character = '40000000-0000-4000-8000-000000000001'
let n = 0
const uuid = () => `70000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
function definition(partial: Partial<ItemDefinition>): ItemDefinition {
  return {
    id: uuid(),
    campaign_id: campaign,
    name: 'Item',
    category: 'gear',
    icon: 'package',
    rarity: 'common',
    weight_tenths: 10,
    value_gp: null,
    description: '',
    slot_kind: 'none',
    properties: {},
    origin: 'dm',
    archived: false,
    created_by: null,
    revision: 0,
    ...partial,
  }
}
const stack = (
  def: ItemDefinition,
  quantity = 1,
  slot: ItemStack['equipped_slot'] = null,
): ItemStack => ({
  id: uuid(),
  campaign_id: campaign,
  character_id: character,
  definition_id: def.id,
  quantity,
  equipped_slot: slot,
  source: 'dm',
  notes: '',
  revision: 0,
})

describe('encumbrance', () => {
  it('uses the 5e variant thresholds and speed penalties', () => {
    expect(encumbrance(500, 10)).toMatchObject({ status: 'light', speedPenalty: 0 })
    expect(encumbrance(510, 10)).toMatchObject({ status: 'encumbered', speedPenalty: 10 })
    expect(encumbrance(1010, 10)).toMatchObject({ status: 'heavy', speedPenalty: 20 })
    expect(encumbrance(1510, 10)).toMatchObject({ status: 'over' })
    expect(encumbrance(0, 12).thresholds).toEqual({ encumbered: 60, heavy: 120, max: 180 })
  })
  it('weighs every unit, equipped or not', () => {
    const rope = definition({ weight_tenths: 50 })
    const arrow = definition({ weight_tenths: 1 })
    const defs = new Map([rope, arrow].map((d) => [d.id, d]))
    expect(carriedTenths([stack(rope, 1, 'belt'), stack(arrow, 20)], defs)).toBe(70)
  })
  it('prefers the exact pounds over the legacy tenths', () => {
    const needle = definition({ weight_tenths: 0, weight_lb: 0.02 })
    const defs = new Map([[needle.id, needle]])
    expect(carriedLoad([stack(needle, 50)], defs)).toMatchObject({ rawPounds: 1, pounds: 1 })
  })
  const pack = (percent: number, lb: number, capacityLb = 30) =>
    definition({
      name: `Pack ${percent}`,
      weight_lb: lb,
      properties: { container: { capacityLb, loadReductionPercent: percent } },
    })
  it('applies only the best container, to loose weight up to its capacity', () => {
    const small = pack(10, 5)
    const large = pack(30, 6)
    const plain = pack(0, 5)
    const iron = definition({ name: 'Iron', weight_lb: 50 })
    const defs = new Map([small, large, plain, iron].map((d) => [d.id, d]))
    const load = carriedLoad([stack(small), stack(large), stack(plain), stack(iron)], defs)
    // 66 lb in all; without the 6 lb pack 60 lb are loose, but it only holds 30: 30 % of 30 = 9.
    expect(load).toMatchObject({ rawPounds: 66, pounds: 57 })
    expect(load.relief).toEqual({
      definitionId: large.id,
      name: 'Pack 30',
      percent: 30,
      capacityLb: 30,
      savedPounds: 9,
    })
    expect(carriedTenths([stack(small), stack(large), stack(plain), stack(iron)], defs)).toBe(570)
  })
  it('never reduces equipped gear or the container itself', () => {
    const backpack = pack(50, 5)
    const armor = definition({ name: 'Plate', weight_lb: 65, slot_kind: 'body' })
    const rope = definition({ name: 'Rope', weight_lb: 10 })
    const defs = new Map([backpack, armor, rope].map((d) => [d.id, d]))
    const load = carriedLoad([stack(backpack), stack(armor, 1, 'body'), stack(rope)], defs)
    // Only the 10 lb rope is loose: 50 % of 10 = 5.
    expect(load).toMatchObject({ rawPounds: 80, pounds: 75 })
    expect(load.relief?.savedPounds).toBe(5)
    // Nothing loose besides the pack: no relief at all.
    expect(carriedLoad([stack(backpack), stack(armor, 1, 'body')], defs).relief).toBeNull()
  })
  it('picks the container that saves the most, not the highest percent', () => {
    const pouch = pack(80, 1, 2)
    const sack = pack(40, 2, 40)
    const ore = definition({ name: 'Ore', weight_lb: 30 })
    const defs = new Map([pouch, sack, ore].map((d) => [d.id, d]))
    const load = carriedLoad([stack(pouch), stack(sack), stack(ore)], defs)
    // Pouch: 80 % of 2 = 1.6. Sack: 40 % of min(31, 40) = 12.4.
    expect(load.relief).toMatchObject({ definitionId: sack.id, savedPounds: 12.4 })
    expect(load).toMatchObject({ rawPounds: 33, pounds: 20.6 })
  })
  it('gives no relief for a container the Player added on their own', () => {
    const backpack = definition({
      weight_lb: 5,
      properties: { container: { capacityLb: 30, loadReductionPercent: 10 } },
    })
    const rope = definition({ weight_lb: 20 })
    const defs = new Map([backpack, rope].map((d) => [d.id, d]))
    const own = { ...stack(backpack), source: 'player' as const }
    expect(carriedLoad([own, stack(rope)], defs)).toMatchObject({
      rawPounds: 25,
      pounds: 25,
      relief: null,
      unearned: { definitionId: backpack.id },
    })
    // A bought or DM-given one beside it still works, and the note goes away.
    const load = carriedLoad([own, stack(backpack), stack(rope)], defs)
    expect(load.relief?.savedPounds).toBe(2.5)
    expect(load.unearned).toBeNull()
  })

  it('gives no relief without a reducing container', () => {
    const backpack = definition({
      weight_lb: 5,
      properties: { container: { capacityLb: 30, loadReductionPercent: 0 } },
    })
    const defs = new Map([[backpack.id, backpack]])
    expect(carriedLoad([stack(backpack, 2)], defs)).toEqual({
      rawPounds: 10,
      pounds: 10,
      relief: null,
      unearned: null,
    })
    expect(carriedLoad([stack(backpack, 0)], defs).relief).toBeNull()
  })
})

describe('equipment', () => {
  const longsword = definition({
    name: 'Longsword',
    category: 'weapon',
    slot_kind: 'one_hand',
    properties: { dice: '1d8', versatileDice: '1d10', damageType: 'slashing' },
  })
  const greatsword = definition({
    name: 'Greatsword',
    category: 'weapon',
    slot_kind: 'two_hands',
    properties: { dice: '2d6', damageType: 'slashing' },
  })
  const rapier = definition({
    name: 'Rapier',
    category: 'weapon',
    slot_kind: 'one_hand',
    properties: { dice: '1d8', finesse: true, damageType: 'piercing' },
  })
  const scale = definition({
    category: 'armor',
    slot_kind: 'body',
    properties: { base: 14, dexCap: 2 },
  })
  const shield = definition({ category: 'shield', slot_kind: 'shield', properties: { acBonus: 2 } })
  const defs = new Map([longsword, greatsword, rapier, scale, shield].map((d) => [d.id, d]))

  it('maps slot kinds to sockets and blocks the off hand beside two-handed weapons', () => {
    expect(slotsFor('ring')).toEqual(['ring_1', 'ring_2'])
    expect(slotsFor('none')).toEqual([])
    const twoHanded = equippedBySlot([stack(greatsword, 1, 'main_hand')], defs)
    expect(canEquip('shield', 'off_hand', twoHanded)).toBe(false)
    const shieldUp = equippedBySlot([stack(shield, 1, 'off_hand')], defs)
    expect(canEquip('two_hands', 'main_hand', shieldUp)).toBe(false)
    expect(canEquip('one_hand', 'main_hand', shieldUp)).toBe(true)
    expect(canEquip('one_hand', 'off_hand', shieldUp)).toBe(false)
  })
  it('computes AC like the server and attack lines from equipped weapons', () => {
    expect(armorClass(16, new Map())).toBe(13)
    const worn = equippedBySlot([stack(scale, 1, 'body'), stack(shield, 1, 'off_hand')], defs)
    expect(armorClass(16, worn)).toBe(18)
    expect(armorClass(8, worn)).toBe(15)
    const armed = equippedBySlot([stack(longsword, 1, 'main_hand')], defs)
    expect(attacks({ str: 16, dex: 12 }, 2, armed)).toMatchObject([
      { name: 'Longsword', attack: 5, dice: '1d8', damageBonus: 3, versatileDice: '1d10' },
    ])
    const finesse = equippedBySlot(
      [stack(rapier, 1, 'main_hand'), stack(shield, 1, 'off_hand')],
      defs,
    )
    expect(attacks({ str: 8, dex: 16 }, 3, finesse)).toMatchObject([
      { name: 'Rapier', attack: 6, damageBonus: 3, versatileDice: null },
    ])
  })
})

describe('boundaries', () => {
  it('keeps every basic catalogue item valid for the definition schema', () => {
    for (const item of basicItemCatalogueSchema.parse(catalogue).items) {
      const draft = toDefinitionDraft(item, 'es', '')
      const parsed = definitionSchema.safeParse(definition({ ...draft, origin: 'srd' }))
      expect(parsed.success, item.key).toBe(true)
      expect(parsed.data?.properties, item.key).toEqual(draft.properties)
    }
  })
  it('reads gold with cents and refuses more precision', () => {
    expect(definitionSchema.parse(definition({ value_gp: 0.05 })).value_gp).toBe(0.05)
    expect(definitionSchema.safeParse(definition({ value_gp: 0.005 })).success).toBe(false)
    expect(definitionSchema.safeParse(definition({ value_gp: -1 })).success).toBe(false)
  })
  it('mirrors the undo window: DMs always, Players own events for ten minutes', () => {
    const event: InventoryEvent = {
      id: uuid(),
      character_id: character,
      item_id: uuid(),
      actor_id: 'player',
      kind: 'use',
      quantity_delta: -1,
      after_value: {},
      undo_of: null,
      undone_by: null,
      created_at: '2026-10-31T10:00:00Z',
    }
    const at = (minutes: number) => Date.parse('2026-10-31T10:00:00Z') + minutes * 60_000
    expect(undoRemainingMs(event, at(4), false, 'player')).toBe(6 * 60_000)
    expect(undoRemainingMs(event, at(11), false, 'player')).toBe(0)
    expect(undoRemainingMs(event, at(4), false, 'other')).toBe(0)
    expect(undoRemainingMs(event, at(60), true, 'dm')).toBe(Number.POSITIVE_INFINITY)
    expect(undoRemainingMs({ ...event, kind: 'equip' }, at(1), true, 'dm')).toBe(0)
    expect(undoRemainingMs({ ...event, undone_by: uuid() }, at(1), true, 'dm')).toBe(0)
  })
})

describe('equipment bonuses and monk martial arts', () => {
  it('applies magic armor acBonus and non-armor item acBonus', () => {
    const leatherPlus1 = definition({
      name: 'Leather Armor +1',
      category: 'armor',
      slot_kind: 'body',
      properties: { base: 11, acBonus: 1 },
    })
    const ring = definition({
      name: 'Ring of Protection',
      category: 'gear',
      slot_kind: 'ring',
      properties: { acBonus: 1 },
    })
    const defs = new Map([leatherPlus1, ring].map((d) => [d.id, d]))
    const worn = equippedBySlot([stack(leatherPlus1, 1, 'body'), stack(ring, 1, 'ring_1')], defs)
    expect(armorClass(16, worn)).toBe(16)
  })

  it('adds weapon and global item bonuses to attacks and scales Monk martial arts', () => {
    const magicSword = definition({
      name: 'Longsword +2',
      category: 'weapon',
      slot_kind: 'one_hand',
      properties: {
        dice: '1d8',
        versatileDice: '1d10',
        damageType: 'slashing',
        attackBonus: 2,
        damageBonus: 1,
      },
    })
    const wraps = definition({
      name: 'Wraps of Unarmed Power',
      category: 'gear',
      slot_kind: 'hands',
      properties: { attackBonus: 1, damageBonus: 1 },
    })
    const defs = new Map([magicSword, wraps].map((d) => [d.id, d]))
    const equipped = equippedBySlot(
      [stack(magicSword, 1, 'main_hand'), stack(wraps, 1, 'hands')],
      defs,
    )

    expect([1, 5, 11, 17].map(martialArtsDie)).toEqual(['1d6', '1d8', '1d10', '1d12'])

    const monkLines = attacks({ str: 10, dex: 16 }, 3, equipped, {
      monkLevel: 5,
      includeUnarmed: true,
      unarmedName: 'Unarmed strike',
    })
    expect(monkLines).toMatchObject([
      {
        name: 'Longsword +2',
        ability: 'dex',
        abilityMod: 3,
        proficiency: 3,
        itemAttackBonus: 3,
        itemDamageBonus: 2,
        attack: 9,
        damageBonus: 5,
      },
      {
        name: 'Unarmed strike',
        unarmed: true,
        dice: '1d8',
        ability: 'dex',
        abilityMod: 3,
        proficiency: 3,
        itemAttackBonus: 1,
        itemDamageBonus: 1,
        attack: 7,
        damageBonus: 4,
      },
    ])

    const shield = definition({
      category: 'shield',
      slot_kind: 'shield',
      properties: { acBonus: 2 },
    })
    const defsWithShield = new Map([...defs, [shield.id, shield]])
    const armoredMonk = equippedBySlot(
      [stack(magicSword, 1, 'main_hand'), stack(shield, 1, 'off_hand')],
      defsWithShield,
    )
    const fallbackLines = attacks({ str: 10, dex: 16 }, 3, armoredMonk, {
      monkLevel: 5,
      includeUnarmed: true,
      unarmedName: 'Unarmed strike',
    })
    expect(fallbackLines[0]).toMatchObject({ ability: 'str', abilityMod: 0, attack: 5 })
    expect(fallbackLines[1]).toMatchObject({ dice: '1', ability: 'str', abilityMod: 0, attack: 3 })
  })
})
