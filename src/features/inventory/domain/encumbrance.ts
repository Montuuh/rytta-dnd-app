import { unitPounds, type ItemDefinition, type ItemStack } from './item'

export type EncumbranceStatus = 'light' | 'encumbered' | 'heavy' | 'over'

/** The container that lightens the load: the single one that takes the most weight off. */
export type LoadRelief = {
  definitionId: string
  name: string
  percent: number
  /** Most weight, in lb, the container lightens. */
  capacityLb: number
  /** Weight, in lb, taken off the load. */
  savedPounds: number
}

export type CarriedLoad = {
  /** Every stack at full weight, equipped or not. */
  rawPounds: number
  /** The weight that counts toward encumbrance once the relief applies. */
  pounds: number
  relief: LoadRelief | null
  /** A weight-saving container the Player added on their own, when nothing else lightens the load. */
  unearned: { definitionId: string; name: string } | null
}

const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

/**
 * RYT-104: weight carried, in lb. A container works while carried (it has no equip slot). Its
 * `loadReductionPercent` applies to the other unequipped items, up to its `capacityLb`:
 * saved = percent × min(loose weight without the container, capacity). Equipped armor and weapons
 * and the container's own weight are never reduced, and only the container that saves the most
 * applies. Like supplies, the saving needs a container given by the DM or bought in a shop: one a
 * Player added on their own carries its weight and lightens nothing.
 */
export function carriedLoad(
  stacks: ItemStack[],
  definitions: Map<string, ItemDefinition>,
): CarriedLoad {
  let rawPounds = 0
  let loosePounds = 0
  const containers: ItemDefinition[] = []
  let selfAdded: ItemDefinition | null = null
  for (const stack of stacks) {
    if (stack.quantity <= 0) continue
    const definition = definitions.get(stack.definition_id)
    if (!definition) continue
    const weight = stack.quantity * unitPounds(definition)
    rawPounds += weight
    if (stack.equipped_slot !== null) continue
    loosePounds += weight
    const container = definition.properties.container
    if (!container || container.loadReductionPercent <= 0 || container.capacityLb <= 0) continue
    if (stack.source === 'player') selfAdded ??= definition
    else containers.push(definition)
  }
  let relief: LoadRelief | null = null
  for (const definition of containers) {
    const { loadReductionPercent: percent, capacityLb } = definition.properties.container!
    const contents = Math.max(0, loosePounds - unitPounds(definition))
    const savedPounds = round3((percent / 100) * Math.min(contents, capacityLb))
    if (savedPounds > (relief?.savedPounds ?? 0))
      relief = {
        definitionId: definition.id,
        name: definition.name,
        percent,
        capacityLb,
        savedPounds,
      }
  }
  return {
    rawPounds: round3(rawPounds),
    pounds: round3(rawPounds - (relief?.savedPounds ?? 0)),
    relief,
    unearned: relief || !selfAdded ? null : { definitionId: selfAdded.id, name: selfAdded.name },
  }
}

/** The weight that counts toward encumbrance, in tenths of a pound (legacy callers). */
export function carriedTenths(stacks: ItemStack[], definitions: Map<string, ItemDefinition>) {
  return Math.round(carriedLoad(stacks, definitions).pounds * 10)
}

/** 5e variant encumbrance: STR×5 encumbered (−10 ft), STR×10 heavily (−20 ft), STR×15 maximum. */
export function encumbrance(tenths: number, strength: number) {
  const pounds = tenths / 10
  const thresholds = { encumbered: strength * 5, heavy: strength * 10, max: strength * 15 }
  const status: EncumbranceStatus =
    pounds > thresholds.max
      ? 'over'
      : pounds > thresholds.heavy
        ? 'heavy'
        : pounds > thresholds.encumbered
          ? 'encumbered'
          : 'light'
  const speedPenalty = status === 'encumbered' ? 10 : status === 'heavy' ? 20 : 0
  return { pounds, thresholds, status, speedPenalty }
}
