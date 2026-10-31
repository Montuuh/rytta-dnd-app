import type { EquipmentSlot, ItemDefinition, ItemStack, SlotKind } from './item'

export type Abilities = { str: number; dex: number }
const modifier = (score: number) => Math.floor((score - 10) / 2)
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)

/** Slots an item of this kind may occupy. */
export function slotsFor(kind: SlotKind): EquipmentSlot[] {
  switch (kind) {
    case 'ring':
      return ['ring_1', 'ring_2']
    case 'one_hand':
      return ['main_hand', 'off_hand']
    case 'two_hands':
      return ['main_hand']
    case 'shield':
      return ['off_hand']
    case 'none':
      return []
    default:
      return [kind]
  }
}

export type Equipped = { stack: ItemStack; definition: ItemDefinition }
export function equippedBySlot(stacks: ItemStack[], definitions: Map<string, ItemDefinition>) {
  const map = new Map<EquipmentSlot, Equipped>()
  for (const stack of stacks)
    if (stack.equipped_slot && stack.quantity > 0) {
      const definition = definitions.get(stack.definition_id)
      if (definition) map.set(stack.equipped_slot, { stack, definition })
    }
  return map
}

/** Mirrors the server: occupied slots, and the off hand beside a two-handed weapon. */
export function canEquip(
  kind: SlotKind,
  slot: EquipmentSlot,
  equipped: Map<EquipmentSlot, Equipped>,
) {
  if (!slotsFor(kind).includes(slot) || equipped.has(slot)) return false
  if (kind === 'two_hands' && equipped.has('off_hand')) return false
  if (slot === 'off_hand' && equipped.get('main_hand')?.definition.slot_kind === 'two_hands')
    return false
  return true
}

/** Same formula as private.recompute_armor_class. */
export function armorClass(dex: number, equipped: Map<EquipmentSlot, Equipped>) {
  const mod = modifier(dex)
  const body = equipped.get('body')?.definition
  const shield = equipped.get('off_hand')?.definition
  const armor = body?.category === 'armor' ? body.properties : null
  let ac = armor
    ? (armor.base ?? 10) + (typeof armor.dexCap === 'number' ? Math.min(mod, armor.dexCap) : mod)
    : 10 + mod
  if (shield?.category === 'shield') ac += shield.properties.acBonus ?? 2
  return Math.max(0, Math.min(99, ac))
}

export type Attack = {
  stackId: string
  name: string
  attack: number
  dice: string
  damageBonus: number
  damageType: 'bludgeoning' | 'piercing' | 'slashing' | null
  versatileDice: string | null
  range: string | null
}
/** Attack lines for equipped weapons, assuming proficiency (homebrew tables decide otherwise). */
export function attacks(
  abilities: Abilities,
  proficiency: number,
  equipped: Map<EquipmentSlot, Equipped>,
): Attack[] {
  const result: Attack[] = []
  for (const slot of ['main_hand', 'off_hand'] as const) {
    const entry = equipped.get(slot)
    if (!entry || entry.definition.category !== 'weapon' || !entry.definition.properties.dice)
      continue
    const props = entry.definition.properties
    const str = modifier(abilities.str)
    const dex = modifier(abilities.dex)
    const mod = props.ranged ? dex : props.finesse ? Math.max(str, dex) : str
    result.push({
      stackId: entry.stack.id,
      name: entry.definition.name,
      attack: mod + proficiency,
      dice: props.dice!,
      damageBonus: mod,
      damageType: props.damageType ?? null,
      versatileDice:
        entry.definition.slot_kind === 'one_hand' && !equipped.has('off_hand')
          ? (props.versatileDice ?? null)
          : null,
      range: props.range ?? null,
    })
  }
  return result
}
