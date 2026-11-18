import { useSyncExternalStore } from 'react'

/**
 * Rolls that exist on the server but are not revealed yet: a roll the server made while its
 * tumble is still playing. The strip leaves them out (whichever way they arrived: the answer, the
 * realtime signal or a poll) so the total shows once, with the card.
 */
let held: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
const set = (next: Set<string>) => {
  held = next
  for (const notify of listeners) notify()
}

export const holdRoll = (id: string) => set(new Set(held).add(id))
export const releaseRoll = (id: string) => {
  if (!held.has(id)) return
  const next = new Set(held)
  next.delete(id)
  set(next)
}
export const useHeldRolls = () =>
  useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => void listeners.delete(notify)
    },
    () => held,
  )
