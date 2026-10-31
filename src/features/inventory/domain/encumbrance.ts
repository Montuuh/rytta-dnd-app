import type { ItemDefinition, ItemStack } from './item'

export type EncumbranceStatus = 'light' | 'encumbered' | 'heavy' | 'over'
/** Weight in tenths of a pound for every stack, equipped or not. */
export function carriedTenths(stacks: ItemStack[], definitions: Map<string, ItemDefinition>) {
  return stacks.reduce(
    (sum, stack) =>
      sum + stack.quantity * (definitions.get(stack.definition_id)?.weight_tenths ?? 0),
    0,
  )
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
export const formatPounds = (pounds: number, language: string) =>
  pounds.toLocaleString(language, { maximumFractionDigits: 1 })
