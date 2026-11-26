/**
 * RYT-186: the app's routes are plain paths under the deploy base (`/` on rytta.app,
 * `/rytta-dnd-app/` in the browser tests). These helpers turn routes into addresses and back.
 */

/** The deploy base without its trailing slash: '' at the site root. */
export function baseOf(base: string) {
  return base.replace(/\/+$/, '')
}

/** The router's basename: the base with its trailing slash, so the home link keeps it too. */
export const routerBasename = (base: string) => `${baseOf(base)}/`

/** The route (`/campaign/x?tab=y`) of a same-origin address under the base; null otherwise. */
export function routeOf(href: string | URL, origin: string, base: string): string | null {
  const url = new URL(href, origin)
  if (url.origin !== origin) return null
  const root = baseOf(base)
  if (url.pathname !== root && !url.pathname.startsWith(`${root}/`)) return null
  return `${url.pathname.slice(root.length) || '/'}${url.search}`
}

/** The address of a route, for raw links outside the router (new tabs, error screens). */
export const hrefOf = (route: string, base: string) =>
  `${baseOf(base)}/${route.replace(/^\/+/, '')}`

/**
 * An old hash address (`/#/campaign/x?tab=y`, from invitations, bookmarks or the previous host)
 * as the same route under the base; null when the address has no `#/` route. Parameters of the
 * real query that the hash route does not set are kept.
 */
export function legacyHashAddress(href: string, base: string): string | null {
  const url = new URL(href)
  // The base without its trailing slash (`/rytta-dnd-app`) is outside the router's basename.
  if (!url.hash.startsWith('#/'))
    return baseOf(base) && url.pathname === baseOf(base)
      ? `${baseOf(base)}/${url.search}${url.hash}`
      : null
  const route = new URL(url.hash.slice(1), 'http://route.invalid')
  for (const [key, value] of url.searchParams)
    if (!route.searchParams.has(key)) route.searchParams.append(key, value)
  const path = route.pathname.replace(/^\/+/, '')
  return `${baseOf(base)}/${path}${route.search}`
}
