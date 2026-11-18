import type { DiceSettings, RollVisibility } from './settings'

/** From narrowest to widest: who reads a roll. The database applies the stricter of the setting
 * when the roll was made and the setting now (RYT-133). */
const visibilityRank: Record<RollVisibility, number> = { roller: 0, roller_dm: 1, table: 2 }

export type VisibilityChange = 'same' | 'wider' | 'narrower'

export function visibilityChange(from: RollVisibility, to: RollVisibility): VisibilityChange {
  const delta = visibilityRank[to] - visibilityRank[from]
  return delta === 0 ? 'same' : delta > 0 ? 'wider' : 'narrower'
}

export const sameDiceSettings = (a: DiceSettings, b: DiceSettings) =>
  a.dice_mode === b.dice_mode && a.roll_visibility === b.roll_visibility

const key = (settings: DiceSettings) => `${settings.dice_mode}/${settings.roll_visibility}`

/**
 * One request id per intent. An intent is the change from the settings the campaign holds now to
 * the settings asked for, so a retry after a failure repeats the same id (nothing is applied
 * twice), while a request made after the settings moved, or for other values, never replays an
 * older answer. `reset` drops every id (the question closed).
 */
export function createDiceRequestIds(newId: () => string) {
  const ids = new Map<string, string>()
  const intent = (from: DiceSettings, to: DiceSettings) => `${key(from)}>${key(to)}`
  return {
    idFor(from: DiceSettings, to: DiceSettings) {
      const k = intent(from, to)
      let id = ids.get(k)
      if (!id) {
        id = newId()
        ids.set(k, id)
      }
      return id
    },
    done(from: DiceSettings, to: DiceSettings) {
      ids.delete(intent(from, to))
    },
    reset() {
      ids.clear()
    },
  }
}
