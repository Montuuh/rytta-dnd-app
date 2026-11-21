/** RYT-013: what the app says about its connection. `live` shows nothing. */
export type ConnectionPhase = 'live' | 'offline' | 'reconnecting' | 'recovered' | 'failed'

/** How long "Connection back · up to date" stays before the line goes away. */
export const recoveredMs = 3000

/** The longest the line says "Reconnecting" before it settles on what it knows. */
export const refreshWaitMs = 6000

/** The phase once the refetch that follows a reconnection (or a retry) has settled. */
export function connectionPhaseAfterRefresh({
  online,
  failed,
}: {
  online: boolean
  failed: boolean
}): ConnectionPhase {
  if (!online) return 'offline'
  return failed ? 'failed' : 'recovered'
}
