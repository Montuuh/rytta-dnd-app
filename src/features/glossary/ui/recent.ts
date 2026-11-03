/** Recently opened entries: a per-device convenience only (storage may be blocked). */
const key = 'rytta-glossary-recent'
const limit = 8

export function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string').slice(0, limit)
      : []
  } catch {
    return []
  }
}
export function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, limit)))
  } catch {
    // Blocked storage: keep the list in memory only.
  }
}
export const pushRecent = (list: string[], id: string) =>
  [id, ...list.filter((item) => item !== id)].slice(0, limit)
