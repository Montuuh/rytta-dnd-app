import type { TFunction } from 'i18next'
import type { HpMode } from '../domain/combat'

/** RYT-150: one sentence for assistive technology once the server confirmed a health change. */
export function appliedText(
  t: TFunction,
  mode: HpMode,
  hits: readonly { combatant_id: string; amount: number }[],
  targets: readonly { id: string; name: string }[],
) {
  const list = hits
    .map((hit) => `${targets.find((c) => c.id === hit.combatant_id)?.name ?? ''}: ${hit.amount}`)
    .join(', ')
  return t(`combat.hp.applied.${mode}`, { list })
}
