/**
 * Polling stays the safety net behind realtime: fast while a channel is down, slow while it is
 * SUBSCRIBED. Callers report each channel's status and the query's refetchInterval reads it back.
 */

/** Safety poll while a realtime channel carries the changes (also the idle campaign poll). */
export const slowPollMs = 60_000
/** Safety poll for state that is actively changing (an open trade, a rest vote) under realtime. */
export const liveStatePollMs = 20_000

export const livePollInterval = (connected: boolean, fastMs: number, slowMs = slowPollMs) =>
  connected ? Math.max(fastMs, slowMs) : fastMs

const subscribed = new Map<string, number>()

export const liveChannelUp = (key: string) => (subscribed.get(key) ?? 0) > 0

/** One subscription's status in the shared registry; release when the subscription ends. */
export function trackLiveChannel(key: string) {
  let up = false
  const set = (next: boolean) => {
    if (next === up) return
    up = next
    const count = Math.max(0, (subscribed.get(key) ?? 0) + (next ? 1 : -1))
    if (count === 0) subscribed.delete(key)
    else subscribed.set(key, count)
  }
  return { set, release: () => set(false) }
}
