import { createContext, useContext } from 'react'
import type { CampaignRoll } from '@/features/campaigns'
import type { DiceBehaviour } from '../domain/mode'
import type { RollSpec } from '../domain/roll'

export type DiceContextValue = {
  /** How this device rolls: what the campaign says, or the Player's own choice. */
  behaviour: DiceBehaviour
  /** The viewer may roll or record for this character (the database decides what it accepts). */
  canRoll: boolean
  /** App dice: roll the dice of the spec and record the result. */
  roll: (spec: RollSpec) => void
  /** Physical dice: open the dialog where the result is typed. */
  record: (spec: RollSpec, opener: HTMLElement | null) => void
  /** A roll is on the table: its dice are still rolling. */
  rolling: boolean
}

/** Outside a provider (equipment view, other people's sheets) nothing is rollable and the sheet
 * reads as before. */
export const noDice: DiceContextValue = {
  behaviour: 'physical',
  canRoll: false,
  roll: () => undefined,
  record: () => undefined,
  rolling: false,
}

export const DiceContext = createContext<DiceContextValue>(noDice)
export const useDice = () => useContext(DiceContext)

export type RollResultView = {
  seq: number
  /** 'rolling': the server is rolling (or recording); 'saved': `roll` is what the server stored;
   * 'failed': nothing was rolled or stored (retry with the same request id). */
  phase: 'rolling' | 'saved' | 'failed'
  spec: RollSpec
  /** The id of this roll: kept across retries, never derived from its content. */
  requestId: string
  roll?: CampaignRoll
  /** Why it failed (a CampaignSettingsReason). */
  reason?: string
}
export const RollResultContext = createContext<{
  result: RollResultView | null
  retry: () => void
  dismiss: () => void
} | null>(null)
export const useRollResult = () => useContext(RollResultContext)
