/**
 * RYT-013: what the app says about its connection. `live` shows nothing. `back` (RYT-161) is the
 * network answering while something on screen has not refreshed yet: it never says "up to date".
 */
export type ConnectionPhase = 'live' | 'offline' | 'reconnecting' | 'back' | 'recovered' | 'failed'

/** How long "Connection back · up to date" (or a settled "Connection back") stays. */
export const recoveredMs = 3000

/** The longest the line says "Reconnecting" before it settles on what it knows. */
export const refreshWaitMs = 6000

/** The longest "Connection back" waits for slow screens before the line goes away. */
export const backHoldMs = 30000

/**
 * The phase once the refetch that follows a reconnection (or a retry) has settled or hit its wait.
 * "Up to date" only when every query on screen refreshed without error (RYT-161).
 */
export function connectionPhaseAfterRefresh({
  online,
  failed,
  settled = true,
  errored = false,
}: {
  online: boolean
  failed: boolean
  settled?: boolean
  errored?: boolean
}): ConnectionPhase {
  if (!online) return 'offline'
  if (failed) return 'failed'
  return settled && !errored ? 'recovered' : 'back'
}
