/**
 * RYT-013: whether the backend answers at all. A light request to the Auth health endpoint,
 * used only after a refetch failed, to tell a connection problem from one screen's own error.
 * Without a backend (demo builds) there is nothing to reach and the answer is yes.
 */
export async function backendReachable(
  url: string | undefined,
  publishableKey: string | undefined,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!url || !publishableKey) return true
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  } catch {
    return false
  }
}
