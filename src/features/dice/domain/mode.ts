import type { DiceMode } from '@/features/campaigns'

/** What the table does with dice on this device: physical dice (the app says what to roll and
 * can record the result) or 3D dice in the app. */
export type DiceBehaviour = 'physical' | 'app'

/** The Player's own choice when the DM left it to each Player. It lives on the device: it carries
 * no authorization and is never sent to the server. */
export type DiceChoice = DiceBehaviour | null

/** One behaviour for initiative, hit dice and the sheet alike: the campaign's mode, or the
 * device's choice when the DM left it to each Player (physical until the Player chooses). */
export function diceBehaviour(mode: DiceMode, choice: DiceChoice): DiceBehaviour {
  return mode === 'player' ? (choice ?? 'physical') : mode
}

export const diceChoiceKey = (userId: string, campaignId: string) =>
  `rytta-dice-choice:${userId}:${campaignId}`

export function readDiceChoice(raw: string | null): DiceChoice {
  return raw === 'physical' || raw === 'app' ? raw : null
}
