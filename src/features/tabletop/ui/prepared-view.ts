/**
 * RYT-075: the table frame a DM prepared for a scene before putting it on the table, kept for this
 * browser tab so leaving the editor or using the library's "Put on the table" keeps it. Storage can
 * be refused (private windows): then the frame is simply not remembered.
 */
const key = (sceneId: string) => `rytta.tabletop.frame.${sceneId}`

export function preparedView(sceneId: string): [number, number] | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(sceneId)) ?? 'null')
    return Array.isArray(value) &&
      value.length === 2 &&
      value.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? [value[0] as number, value[1] as number]
      : null
  } catch {
    return null
  }
}

export function savePreparedView(sceneId: string, center: readonly [number, number]) {
  try {
    sessionStorage.setItem(key(sceneId), JSON.stringify(center))
  } catch {
    // Not remembered: the frame still applies while the editor stays open.
  }
}
