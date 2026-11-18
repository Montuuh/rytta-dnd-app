/**
 * Session-only state that belongs to the signed-in account (a roll kept in memory, say) registers a
 * callback here; the auth provider calls `identityChanged` when the account changes or signs out,
 * the same moments the query cache is cleared, so nothing leaks to the next person on a device.
 */
const listeners = new Set<() => void>()
let current: string | null | undefined

/** Registers a callback that runs when the signed-in account changes. Returns its unregister. */
export const onIdentityChange = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Called with the signed-in user id (null when signed out); runs the callbacks on a change. */
export const identityChanged = (userId: string | null) => {
  if (current === userId) return
  const first = current === undefined
  current = userId
  if (!first) for (const listener of listeners) listener()
}
