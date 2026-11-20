import { createContext } from 'react'

/** RYT-150: the current round and turn. A confirmed health change stays beside the figure until
 * the next change on that row or until this key changes (the turn moves on). */
export const TurnKey = createContext('')
export const turnKey = (round: number, active: string | null | undefined) =>
  `${round}:${active ?? ''}`
