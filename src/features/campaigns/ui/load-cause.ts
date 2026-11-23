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
 * RYT-161: whether a screen draws its data. True unless its last load failed for a reason that
 * takes the data away (access lost, the thing gone) or there is nothing loaded yet to keep.
 */
export function showsData(query: { isError: boolean; data: unknown; error: unknown }) {
  return !query.isError || keepsStaleData(query.data, query.error)
}
