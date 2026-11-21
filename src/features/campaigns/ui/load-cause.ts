import { CampaignAccessError } from '../domain/errors'

export type Cause = 'offline' | 'forbidden' | 'notFound' | 'unknown'

/** The known causes of a failed load. Anything else keeps the generic line. */
export function causeOf(error: unknown): Cause {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const message = error instanceof Error ? error.message : ''
  if (
    (error instanceof CampaignAccessError && error.code === 'unavailable') ||
    message === 'forbidden'
  )
    return 'forbidden'
  if (message === 'gone' || message === 'not-found') return 'notFound'
  return 'unknown'
}

/**
 * RYT-013: whether a screen keeps showing what it already had after a refetch failed. A lost
 * connection or a server hiccup keeps it (the connection line says it may be out of date); losing
 * access or the thing itself does not.
 */
export function keepsStaleData(data: unknown, error: unknown) {
  if (data === undefined || data === null) return false
  const kind = causeOf(error)
  return kind === 'offline' || kind === 'unknown'
}

/**
 * Whether a failed load shows its error. Offline or with the backend unreachable, and with data on
 * screen, it does not: the connection line already says so. Any other failure is shown, above the data the screen keeps.
 */
export function showsLoadError(
  isError: boolean,
  data: unknown,
  error: unknown,
  connectionLost = false,
) {
  if (!isError) return false
  if (data === undefined || data === null) return true
  return !connectionLost && causeOf(error) !== 'offline'
}
