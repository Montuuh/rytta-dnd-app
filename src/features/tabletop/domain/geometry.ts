import type { AreaData, CreatureSize, FogOp, Item, Room } from './model'

export type Point = readonly [number, number]
export const feetPerSquare = 5

/** The square that holds a point. */
export const cellOf = (p: Point): [number, number] => [Math.floor(p[0]), Math.floor(p[1])]
export const cellCenter = (p: Point): [number, number] => [
  Math.floor(p[0]) + 0.5,
  Math.floor(p[1]) + 0.5,
]

/**
 * SRD 5.2.1 "Playing on a Grid": entering an orthogonally or diagonally adjacent square costs one
 * square, so the shortest route between two squares costs the larger of the two offsets.
 */
export function squaresBetween(a: Point, b: Point) {
  const [ax, ay] = cellOf(a)
  const [bx, by] = cellOf(b)
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

export function measurePath(points: readonly Point[]) {
  const segments: number[] = []
  for (let i = 1; i < points.length; i++) segments.push(squaresBetween(points[i - 1]!, points[i]!))
  const squares = segments.reduce((sum, value) => sum + value, 0)
  return { segments, squares, feet: squares * feetPerSquare }
}

/** The squares a measured route steps through, for the tape's marks (one per counted square). */
export function routeMarks(points: readonly Point[]) {
  const marks: [number, number][] = []
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = cellCenter(points[i - 1]!)
    const [bx, by] = cellCenter(points[i]!)
    const steps = squaresBetween(points[i - 1]!, points[i]!)
    for (let s = 1; s <= steps; s++)
      marks.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps])
  }
  return marks
}

/** SRD 5.2.1 Creature Size and Space: Tiny shares a square (four per square). */
export const sizeSquares: Record<CreatureSize, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
}

/** The squares an item's space covers. */
export function itemCells(item: Pick<Item, 'x' | 'y' | 'w' | 'h'>) {
  const cells: [number, number][] = []
  if (item.w < 1 || item.h < 1) {
    cells.push(cellOf([item.x + item.w / 2, item.y + item.h / 2]))
    return cells
  }
  for (let x = Math.floor(item.x); x < Math.ceil(item.x + item.w - 0.001); x++)
    for (let y = Math.floor(item.y); y < Math.ceil(item.y + item.h - 0.001); y++) cells.push([x, y])
  return cells
}

export interface AreaPlacement {
  data: AreaData
  /** The point of origin (squares). For an emanation, the centre of the creature. */
  x: number
  y: number
  /** Emanation: the creature's space (squares). */
  w?: number
  h?: number
}

const rad = (degrees: number) => (degrees * Math.PI) / 180

/**
 * Whether a point is inside an area (SRD 5.2.1 Rules Glossary shapes). Cones widen by their
 * distance from the origin; lines and cubes extend from the origin along the angle.
 */
export function inArea(area: AreaPlacement, px: number, py: number) {
  const size = area.data.size_ft / feetPerSquare
  const dx = px - area.x
  const dy = py - area.y
  const angle = rad(area.data.angle ?? 0)
  const along = dx * Math.cos(angle) + dy * Math.sin(angle)
  const across = -dx * Math.sin(angle) + dy * Math.cos(angle)
  switch (area.data.shape) {
    case 'sphere':
    case 'cylinder':
      return Math.hypot(dx, dy) <= size + 1e-9
    case 'cube':
      return along >= 0 && along <= size + 1e-9 && Math.abs(across) <= size / 2 + 1e-9
    case 'cone':
      return along > 0 && along <= size + 1e-9 && Math.abs(across) <= along / 2 + 1e-9
    case 'line': {
      const width = (area.data.width_ft ?? feetPerSquare) / feetPerSquare
      return along >= 0 && along <= size + 1e-9 && Math.abs(across) <= width / 2 + 1e-9
    }
    case 'emanation': {
      // Distance from the creature's space; the creature itself is not included.
      const w = area.w ?? 1
      const h = area.h ?? 1
      const left = area.x - w / 2
      const top = area.y - h / 2
      const ox = Math.max(left - px, 0, px - (left + w))
      const oy = Math.max(top - py, 0, py - (top + h))
      if (ox === 0 && oy === 0) return false
      return Math.hypot(ox, oy) <= size + 1e-9
    }
  }
}

/**
 * Rytta's table convention (not an SRD rule): a square is in the area when its centre is.
 * Returns the squares within the scene bounds.
 */
export function areaCells(area: AreaPlacement, cols: number, rows: number) {
  const reach = area.data.size_ft / feetPerSquare + 4
  const cells: [number, number][] = []
  const minX = Math.max(0, Math.floor(area.x - reach))
  const maxX = Math.min(cols - 1, Math.ceil(area.x + reach))
  const minY = Math.max(0, Math.floor(area.y - reach))
  const maxY = Math.min(rows - 1, Math.ceil(area.y + reach))
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++) if (inArea(area, x + 0.5, y + 0.5)) cells.push([x, y])
  return cells
}

/** Tokens with any square of their space in the area. */
export function caughtTokens<T extends Pick<Item, 'kind' | 'x' | 'y' | 'w' | 'h' | 'id'>>(
  cells: readonly (readonly [number, number])[],
  items: readonly T[],
  except?: string,
) {
  const covered = new Set(cells.map(([x, y]) => `${x}:${y}`))
  return items.filter(
    (item) =>
      item.kind === 'token' &&
      item.id !== except &&
      itemCells(item).some(([x, y]) => covered.has(`${x}:${y}`)),
  )
}

/** The outline of an area as an SVG path in squares. */
export function areaPath(area: AreaPlacement) {
  const size = area.data.size_ft / feetPerSquare
  const angle = rad(area.data.angle ?? 0)
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const at = (along: number, across: number) =>
    `${(area.x + along * ux - across * uy).toFixed(3)} ${(area.y + along * uy + across * ux).toFixed(3)}`
  switch (area.data.shape) {
    case 'sphere':
    case 'cylinder':
      return circlePath(area.x, area.y, size)
    case 'emanation': {
      const w = (area.w ?? 1) / 2 + size
      const h = (area.h ?? 1) / 2 + size
      const r = size
      const l = area.x - w
      const t = area.y - h
      return `M ${l + r} ${t} H ${area.x + w - r} A ${r} ${r} 0 0 1 ${area.x + w} ${t + r} V ${area.y + h - r} A ${r} ${r} 0 0 1 ${area.x + w - r} ${area.y + h} H ${l + r} A ${r} ${r} 0 0 1 ${l} ${area.y + h - r} V ${t + r} A ${r} ${r} 0 0 1 ${l + r} ${t} Z`
    }
    case 'cube':
      return `M ${at(0, -size / 2)} L ${at(size, -size / 2)} L ${at(size, size / 2)} L ${at(0, size / 2)} Z`
    case 'cone':
      return `M ${at(0, 0)} L ${at(size, -size / 2)} L ${at(size, size / 2)} Z`
    case 'line': {
      const width = (area.data.width_ft ?? feetPerSquare) / feetPerSquare / 2
      return `M ${at(0, -width)} L ${at(size, -width)} L ${at(size, width)} L ${at(0, width)} Z`
    }
  }
}

export const circlePath = (x: number, y: number, r: number) =>
  `M ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} Z`

/** The angle in degrees from one point to another. */
export const angleTo = (from: Point, to: Point) =>
  (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI

/**
 * The edge between squares nearest to a point, as a door position: the midpoint of the edge and
 * its rotation (0 for an edge running east–west, 90 north–south).
 */
export function nearestEdge(p: Point) {
  const horizontal: [number, number] = [Math.floor(p[0]) + 0.5, Math.round(p[1])]
  const vertical: [number, number] = [Math.round(p[0]), Math.floor(p[1]) + 0.5]
  const dh = Math.abs(p[1] - horizontal[1])
  const dv = Math.abs(p[0] - vertical[0])
  return dh <= dv
    ? { x: horizontal[0], y: horizontal[1], rotation: 0 }
    : { x: vertical[0], y: vertical[1], rotation: 90 }
}

export const roomAt = (rooms: readonly Room[], p: Point) =>
  rooms.find((room) =>
    room.rects.some(([x, y, w, h]) => p[0] >= x && p[0] < x + w && p[1] >= y && p[1] < y + h),
  )

/**
 * RYT-075: where the table frame goes. Its edges sit on whole squares and it stays inside the map;
 * along a side where the map is smaller than the table, it centres on the map.
 */
export function placeFrame(
  center: Point,
  frame: { cols: number; rows: number },
  map: { cols: number; rows: number },
): [number, number] {
  const axis = (c: number, size: number, total: number) => {
    if (size >= total) return total / 2
    const left = clamp(Math.round(c - size / 2), 0, total - size)
    return left + size / 2
  }
  return [axis(center[0], frame.cols, map.cols), axis(center[1], frame.rows, map.rows)]
}

/**
 * RYT-077: the squares a prop of w × h takes when centred under a point, turned a quarter or not,
 * and kept inside the map.
 */
export function propFootprint(
  point: Point,
  size: { w: number; h: number },
  turn: number,
  map: { cols: number; rows: number },
) {
  const turned = turn % 180 !== 0
  const w = turned ? size.h : size.w
  const h = turned ? size.w : size.h
  return {
    x: clamp(Math.round(point[0] - w / 2), 0, Math.max(0, map.cols - w)),
    y: clamp(Math.round(point[1] - h / 2), 0, Math.max(0, map.rows - h)),
    w,
    h,
  }
}

/** The two squares a door on a square's edge joins (a flat door: above and below it). */
export function doorSquares(door: { x: number; y: number; rotation: number }) {
  const flat = door.rotation % 180 === 0
  return flat
    ? ([
        [Math.floor(door.x), Math.round(door.y) - 1],
        [Math.floor(door.x), Math.round(door.y)],
      ] as const)
    : ([
        [Math.round(door.x) - 1, Math.floor(door.y)],
        [Math.round(door.x), Math.floor(door.y)],
      ] as const)
}

/**
 * RYT-068: whether a room op left an area revealed: the last op on its squares decides, else the
 * fog's base.
 */
export function areaRevealed(fog: { base: string; ops: readonly FogOp[] }, room: Room) {
  const key = JSON.stringify(room.rects)
  for (let i = fog.ops.length - 1; i >= 0; i--) {
    const op = fog.ops[i]!
    if (op.shape === 'rects' && JSON.stringify(op.rects) === key) return op.mode === 'reveal'
  }
  return fog.base === 'revealed'
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Snaps an item's top-left corner so its space sits on whole squares. */
export function snapItem(x: number, y: number, w: number, h: number) {
  if (w < 1 || h < 1) {
    const step = 0.5
    return [Math.round(x / step) * step, Math.round(y / step) * step] as const
  }
  return [Math.round(x), Math.round(y)] as const
}

type RoomsOp = Extract<FogOp, { shape: 'rects' }>
const sameRooms = (a: RoomsOp, b: RoomsOp) => JSON.stringify(a.rects) === JSON.stringify(b.rects)

/**
 * RYT-068: room reveals still in force after a later room was hidden again. A revealed room shows a
 * margin past its squares (its walls), so hiding a room also covers that margin of a revealed
 * neighbour; the board reveals these rooms' own squares once more. A reveal is in force when no
 * later hide covers it (the same room hidden, or any hide drawn by hand).
 */
export function stillRevealed(ops: readonly FogOp[]): RoomsOp[] {
  const out: RoomsOp[] = []
  ops.forEach((op, i) => {
    if (op.shape !== 'rects' || op.mode !== 'reveal') return
    const later = ops.slice(i + 1)
    const covered = later.some(
      (o) => o.mode === 'hide' && (o.shape !== 'rects' || sameRooms(o, op)),
    )
    const roomHidden = later.some((o) => o.mode === 'hide' && o.shape === 'rects')
    if (!covered && roomHidden) out.push(op)
  })
  return out
}

/**
 * Room hides still in force: no later reveal can have opened them again (the same room revealed, or
 * any hand-drawn reveal). The board covers these rooms' own squares again after restoring their
 * revealed neighbours with their margin, so the shared wall stays in view and nothing behind it.
 */
export function stillHidden(ops: readonly FogOp[]): RoomsOp[] {
  const out: RoomsOp[] = []
  ops.forEach((op, i) => {
    if (op.shape !== 'rects' || op.mode !== 'hide') return
    const reopened = ops
      .slice(i + 1)
      .some((o) => o.mode === 'reveal' && (o.shape !== 'rects' || sameRooms(o, op)))
    if (!reopened) out.push(op)
  })
  return out
}
