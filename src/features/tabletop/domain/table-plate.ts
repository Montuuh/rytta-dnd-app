// The turn plate of the table screen (RYT-131): which corner of the map it sits in and whether it is
// shrunk. The choice belongs to the device (the TV on the table, a tablet), so it lives in local
// storage and falls back to the defaults when storage is missing, blocked or holds something else.

export const plateCorners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const
export type PlateCorner = (typeof plateCorners)[number]
export type PlateSize = 'full' | 'small'
export type PlatePrefs = { corner: PlateCorner; size: PlateSize }

export const defaultPlate: PlatePrefs = { corner: 'top-left', size: 'full' }
export const plateStorageKey = 'rytta-table-plate'

type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem'>

/** `localStorage`, or null where touching it throws (blocked storage, private modes). */
export function deviceStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function parsePlate(raw: string | null | undefined): PlatePrefs {
  if (!raw) return defaultPlate
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return defaultPlate
    const { corner, size } = value as Record<string, unknown>
    return {
      corner: plateCorners.find((c) => c === corner) ?? defaultPlate.corner,
      size: size === 'small' ? 'small' : 'full',
    }
  } catch {
    return defaultPlate
  }
}

export function readPlate(storage: Reader | null = deviceStorage()): PlatePrefs {
  try {
    return parsePlate(storage?.getItem(plateStorageKey))
  } catch {
    return defaultPlate
  }
}

/** True when the choice was stored; a blocked store keeps it for this visit only. */
export function writePlate(prefs: PlatePrefs, storage: Writer | null = deviceStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(plateStorageKey, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}

/** The corner nearest to a point of a `width` x `height` screen (where a drag was released). */
export function cornerFromPoint(x: number, y: number, width: number, height: number): PlateCorner {
  const top = y < height / 2
  const left = x < width / 2
  return top ? (left ? 'top-left' : 'top-right') : left ? 'bottom-left' : 'bottom-right'
}

/** Arrow keys: the corner on that side, keeping the other axis. */
export function cornerToward(
  corner: PlateCorner,
  direction: 'left' | 'right' | 'up' | 'down',
): PlateCorner {
  const [vertical, horizontal] = corner.split('-') as ['top' | 'bottom', 'left' | 'right']
  const v = direction === 'up' ? 'top' : direction === 'down' ? 'bottom' : vertical
  const h = direction === 'left' ? 'left' : direction === 'right' ? 'right' : horizontal
  return `${v}-${h}` as PlateCorner
}

/** The corner a rotated screen shows where `corner` is in the plate's own frame (and back). */
export function mirrorCorner(corner: PlateCorner): PlateCorner {
  const [vertical, horizontal] = corner.split('-') as ['top' | 'bottom', 'left' | 'right']
  return `${vertical === 'top' ? 'bottom' : 'top'}-${horizontal === 'left' ? 'right' : 'left'}`
}

export type PlateDirection = 'left' | 'right' | 'up' | 'down'
const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' } as const
/** An arrow key on a screen turned 180 degrees moves the plate the other way in its own frame. */
export const mirrorDirection = (direction: PlateDirection): PlateDirection => opposite[direction]

/** The next corner clockwise: one press is enough for anyone who cannot drag. */
export function nextCorner(corner: PlateCorner): PlateCorner {
  return plateCorners[(plateCorners.indexOf(corner) + 1) % plateCorners.length]!
}
