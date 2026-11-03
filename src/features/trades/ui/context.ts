import { createContext, useContext } from 'react'
import type { TradeState } from '../domain/trade'

export type TradeContextValue = {
  state: TradeState | undefined
  /** Sends an invitation from the acting character; resolves once the server answered. */
  invite: (partnerId: string, partnerName: string) => void
  inviting: string | null
  /** Re-opens the current invitation or trade window. */
  reopen: () => void
}

/** Present only where the viewer acts as a character (Player, or DM in Player preview). */
export const TradeContext = createContext<TradeContextValue | null>(null)
export const useTrades = () => useContext(TradeContext)
