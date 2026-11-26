/** J1-17: the page a visitor was on when they tapped "Continue with Google", restored after the callback. */
const returnKey = 'rytta-return-to'
/** In-app routes only (RYT-186: paths under the base): a leading slash, no scheme, no `//`. */
const safeRoute = /^\/(?!\/)[\w\-./?=&%~]{0,300}$/

export function rememberReturnTo(route: string) {
  try {
    if (route.length > 1 && safeRoute.test(route)) sessionStorage.setItem(returnKey, route)
    else sessionStorage.removeItem(returnKey)
  } catch {
    /* The visitor then lands on the home screen. */
  }
}

/** The remembered route, once; nothing when it is missing or not a plain in-app route. */
export function takeReturnTo(): string | null {
  try {
    const route = sessionStorage.getItem(returnKey)
    sessionStorage.removeItem(returnKey)
    return route && safeRoute.test(route) ? route : null
  } catch {
    return null
  }
}
