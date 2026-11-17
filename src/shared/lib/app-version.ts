/**
 * RYT-117: every build bakes an id into the bundle and writes the same id to `version.json` next
 * to index.html. An open tab compares the two; a difference means a newer deploy (for example a
 * paired database migration) and the user is offered a reload. Nothing here reloads by itself.
 */
declare const __APP_BUILD__: string | undefined

export const buildId: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev'
/** At most one check per this long, however often the tab regains focus. */
export const checkIntervalMs = 15 * 60 * 1000
/** Development and fixture servers never publish a version: a test forces one with this key. */
export const forcedBuildKey = 'rytta-force-build'

export function versionUrl(base: string, now: number) {
  return `${base.endsWith('/') ? base : `${base}/`}version.json?t=${now}`
}

/** The id inside a `version.json` body, or null when the body is not one. */
export function parseVersion(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const id = (body as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : null
}

/** A different published id is newer; an unknown one (offline, bad body) is never a reason to nag. */
export function isNewerBuild(current: string, published: string | null) {
  return published !== null && published !== current
}

export function checkDue(lastCheck: number | null, now: number) {
  return lastCheck === null || now - lastCheck >= checkIntervalMs || now < lastCheck
}

export async function fetchPublishedBuild(
  base: string,
  now: number,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(versionUrl(base, now), { cache: 'no-store' })
    if (!response.ok) return null
    return parseVersion(await response.json())
  } catch {
    return null
  }
}
