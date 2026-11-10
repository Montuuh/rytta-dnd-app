/** RYT-078: "Later" on the username dialog lasts until the session ends. */
const laterPrefix = 'rytta-username-later-'
export const laterKey = (userId: string) => `${laterPrefix}${userId}`
export function readLater(userId: string) {
  try {
    return sessionStorage.getItem(laterKey(userId)) === '1'
  } catch {
    return false
  }
}
/** Forget every "Later": the next sign-in asks again (called when the session ends). */
export function forgetUsernameLater() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(laterPrefix)) sessionStorage.removeItem(key)
  } catch {
    /* Nothing stored. */
  }
}
