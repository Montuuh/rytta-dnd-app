import { useTranslation } from 'react-i18next'
import type { RestEffect } from '../domain/rest'

/** What a rest gives back, in a shape both the sheet preview and the panel can fill. */
export type RecoveryView = {
  hp?: { before: number; after: number; max: number }
  /** Hit dice left before and after; `spend` marks dice spent on a short rest. */
  dice?: { before: number; after: number; die: number; spend?: boolean }
  trackers: { id: string; label: string; before: number; after: number }[]
  slots: { level: number; count: number }[]
  /** Sheet preview of a short rest: hit dice the character may spend to heal in the panel. */
  healDice?: { left: number; die: number }
}

export const isEmptyRecovery = (view: RecoveryView) =>
  !view.hp && !view.dice && !view.healDice && view.trackers.length === 0 && view.slots.length === 0

/** Maps the server preview of one character to the view; resource names use the class key. */
export function useEffectView() {
  const { t } = useTranslation()
  return (effect: RestEffect): RecoveryView => ({
    hp:
      effect.hp_after !== effect.hp_before
        ? { before: effect.hp_before, after: effect.hp_after, max: effect.max_hp }
        : undefined,
    dice:
      effect.hit_die > 0 && effect.dice_left_after !== effect.dice_left_before
        ? {
            before: effect.dice_left_before,
            after: effect.dice_left_after,
            die: effect.hit_die,
            spend: effect.dice_left_after < effect.dice_left_before,
          }
        : undefined,
    trackers: effect.trackers.map((tracker) => ({
      id: tracker.id,
      label: tracker.key
        ? t(`panel.resource.${tracker.key}` as 'panel.resource.monk-focus', {
            defaultValue: tracker.name ?? tracker.key,
          })
        : (tracker.name ?? tracker.id),
      before: tracker.before,
      after: tracker.after,
    })),
    slots: effect.slots
      .map((count, index) => ({ level: index + 1, count }))
      .filter((slot) => slot.count > 0),
  })
}
