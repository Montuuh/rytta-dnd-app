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
  const armor = body?.category === 'armor' ? body.properties : null
  let ac = armor
    ? (armor.base ?? 10) +
      (typeof armor.dexCap === 'number' ? Math.min(mod, armor.dexCap) : mod) +
      (armor.acBonus ?? 0)
    : 10 + mod
  for (const [slot, entry] of equipped) {
    if (slot === 'body' && armor) continue
    const def = entry.definition
    if (slot === 'off_hand' && def.category === 'shield') ac += def.properties.acBonus ?? 2
    else if (def.properties.acBonus) ac += def.properties.acBonus
  }
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
  ability: 'str' | 'dex'
  abilityMod: number
  proficiency: number
  itemAttackBonus: number
  itemDamageBonus: number
  unarmed?: boolean
}

export type AttackOptions = {
  monkLevel?: number
  includeUnarmed?: boolean
  unarmedName?: string
}

export function martialArtsDie(level: number): string {
  if (level >= 17) return '1d12'
  if (level >= 11) return '1d10'
  if (level >= 5) return '1d8'
  return '1d6'
}

/** Attack lines for equipped weapons (plus optional unarmed strike), assuming proficiency. */
export function attacks(
  abilities: Abilities,
  proficiency: number,
  equipped: Map<EquipmentSlot, Equipped>,
  options?: AttackOptions,
): Attack[] {
  const result: Attack[] = []
  const str = modifier(abilities.str)
  const dex = modifier(abilities.dex)
  const monkUnarmored =
    (options?.monkLevel ?? 0) > 0 &&
    equipped.get('body')?.definition.category !== 'armor' &&
    equipped.get('off_hand')?.definition.category !== 'shield'

  let globalAttackBonus = 0
  let globalDamageBonus = 0
  for (const [, entry] of equipped) {
    if (entry.definition.category !== 'weapon') {
      globalAttackBonus += entry.definition.properties.attackBonus ?? 0
      globalDamageBonus += entry.definition.properties.damageBonus ?? 0
    }
  }

  for (const slot of ['main_hand', 'off_hand'] as const) {
    const entry = equipped.get(slot)
    if (!entry || entry.definition.category !== 'weapon' || !entry.definition.properties.dice)
      continue
    const props = entry.definition.properties
    const martialWeapon =
      monkUnarmored && !props.ranged && entry.definition.slot_kind === 'one_hand'
    const useDex = props.ranged || ((props.finesse || martialWeapon) && dex > str)
    const ability: 'str' | 'dex' = useDex ? 'dex' : 'str'
    const abilityMod = useDex ? dex : str
    const itemAttackBonus = (props.attackBonus ?? 0) + globalAttackBonus
    const itemDamageBonus = (props.damageBonus ?? 0) + globalDamageBonus
    result.push({
      stackId: entry.stack.id,
      name: entry.definition.name,
      attack: abilityMod + proficiency + itemAttackBonus,
      dice: props.dice!,
      damageBonus: abilityMod + itemDamageBonus,
      damageType: props.damageType ?? null,
      versatileDice:
        entry.definition.slot_kind === 'one_hand' && !equipped.has('off_hand')
          ? (props.versatileDice ?? null)
          : null,
      range: props.range ?? null,
      ability,
      abilityMod,
      proficiency,
      itemAttackBonus,
      itemDamageBonus,
    })
  }

  if (options?.includeUnarmed) {
    const useDex = monkUnarmored && dex > str
    const ability: 'str' | 'dex' = useDex ? 'dex' : 'str'
    const abilityMod = useDex ? dex : str
    result.push({
      stackId: 'unarmed',
      name: options.unarmedName ?? 'Unarmed Strike',
      attack: abilityMod + proficiency + globalAttackBonus,
      dice: monkUnarmored ? martialArtsDie(options?.monkLevel ?? 1) : '1',
      damageBonus: abilityMod + globalDamageBonus,
      damageType: 'bludgeoning',
      versatileDice: null,
      range: null,
      ability,
      abilityMod,
      proficiency,
      itemAttackBonus: globalAttackBonus,
      itemDamageBonus: globalDamageBonus,
      unarmed: true,
    })
  }

  return result
}
