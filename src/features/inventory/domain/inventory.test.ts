import { describe, expect, it } from 'vitest'
import { armorClass, attacks, canEquip, equippedBySlot, slotsFor } from './equipment'
import { carriedTenths, encumbrance } from './encumbrance'
import {
  definitionSchema,
  undoRemainingMs,
  type InventoryEvent,
  type ItemDefinition,
  type ItemStack,
} from './item'
import { srdEquipment } from './srd-equipment'

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
  it('keeps every SRD template valid for the definition schema', () => {
    for (const template of srdEquipment)
      expect(
        definitionSchema.safeParse(
          definition({ ...template, name: template.key, rarity: 'common', description: '' }),
        ).success,
      ).toBe(true)
    expect(new Set(srdEquipment.map((t) => t.key)).size).toBe(srdEquipment.length)
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
