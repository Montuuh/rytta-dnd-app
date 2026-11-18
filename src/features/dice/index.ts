// RYT-133: dice. The campaign's dice mode and roll visibility live in features/campaigns; this
// feature turns them into what the sheet, the initiative entry and the short rest do.
export { DiceProvider } from './ui/dice-provider'
export { RollPoint } from './ui/roll-point'
export { RollHint } from './ui/roll-hint'
export { RollResultSlot } from './ui/roll-result'
export { RecentRolls } from './ui/recent-rolls'
export { DiceModeChoice } from './ui/mode-choice'
export { useDiceMode } from './ui/use-dice-mode'
export { useDice } from './ui/dice-context'
export { useAppRoll } from './ui/use-app-roll'
export { useOwnRoll } from './ui/use-own-roll'
export { failureReason } from './ui/failure-reason'
export {
  attackSpecs,
  checkSpec,
  damageExpression,
  formulaOf,
  hitDiceExpression,
  d20Expression,
} from './domain/roll'
export { attemptFor } from './domain/roll'
export type { Attempt, RollSpec } from './domain/roll'
export type { DiceBehaviour } from './domain/mode'
