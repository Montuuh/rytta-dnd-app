import { z } from 'zod'
import { runsOf } from './generator/core'
import type { ItemPatch, Room } from './model'

// RYT-065: Universal VTT import (.dd2vtt from Dungeon Alchemist and Dungeondraft, .uvtt, .df2vtt).
// The file carries the map picture (base64 PNG), the grid (squares and pixels per square), walls
// as polylines, portals (doors and windows) and lights, all in squares. Rytta keeps the picture and
// the grid, turns doors into door items, and splits the floor into reveal areas along the walls
// so fog can be lifted room by room. Lights are already painted into the picture.

const num = z.number().finite()
const point = z.object({ x: num, y: num })

/** Largest file Rytta reads (Dungeon Alchemist exports of big maps run to tens of MB). */
export const uvttMaxBytes = 120 * 1024 * 1024

export const uvttSchema = z.object({
  format: num.optional(),
  resolution: z.object({
    map_origin: point.optional(),
    map_size: point,
    pixels_per_grid: num.positive().max(1000),
  }),
  line_of_sight: z.array(z.array(point).max(20000)).max(40000).optional().default([]),
  objects_line_of_sight: z.array(z.array(point).max(20000)).max(40000).optional().default([]),
  portals: z
    .array(
      z.object({
        position: point,
        bounds: z.array(point).min(2),
        rotation: num.optional(),
        closed: z.boolean().optional(),
        freestanding: z.boolean().optional(),
      }),
    )
    .max(5000)
    .optional()
    .default([]),
  lights: z
    .array(z.object({ position: point }).passthrough())
    .max(5000)
    .optional()
    .default([]),
  image: z.string().min(16).max(uvttMaxBytes),
})

/** The squares a file describes, checked before any work: Rytta takes 4 to 120 a side. */
export function uvttSize(file: Uvtt) {
  const cols = Math.floor(file.resolution.map_size.x + 1e-6)
  const rows = Math.floor(file.resolution.map_size.y + 1e-6)
  return { cols, rows, fits: cols >= 4 && rows >= 4 && cols <= 120 && rows <= 120 }
}
export type Uvtt = z.infer<typeof uvttSchema>

/** File names a Universal VTT export may carry. */
export const uvttExtensions = ['.dd2vtt', '.uvtt', '.df2vtt'] as const
export const isUvttName = (name: string) =>
  uvttExtensions.some((ext) => name.toLowerCase().endsWith(ext))

export function parseUvtt(text: string): Uvtt {
  return uvttSchema.parse(JSON.parse(text))
}

type Segment = [number, number, number, number]

/** Do segments ab and cd cross or touch? */
function crosses([ax, ay, bx, by]: Segment, [cx, cy, dx, dy]: Segment) {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px))
  const o1 = o(ax, ay, bx, by, cx, cy)
  const o2 = o(ax, ay, bx, by, dx, dy)
  const o3 = o(cx, cy, dx, dy, ax, ay)
  const o4 = o(cx, cy, dx, dy, bx, by)
  if (o1 !== o2 && o3 !== o4) return true
  // Collinear overlaps (a wall lying exactly on the line between two centres).
  const on = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.min(px, qx) - 1e-9 <= rx &&
    rx <= Math.max(px, qx) + 1e-9 &&
    Math.min(py, qy) - 1e-9 <= ry &&
    ry <= Math.max(py, qy) + 1e-9
  return (
    (o1 === 0 && on(ax, ay, bx, by, cx, cy)) ||
    (o2 === 0 && on(ax, ay, bx, by, dx, dy)) ||
    (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) ||
    (o4 === 0 && on(cx, cy, dx, dy, bx, by))
  )
}

export interface UvttLayout {
  cols: number
  rows: number
  pixelsPerSquare: number
  rooms: Room[]
  /** Areas left out by the scene's limits (400 areas of at most 400 rectangles). */
  dropped: number
  doors: ItemPatch[]
  windows: number
  lights: number
}

/** The scene a Universal VTT file describes: grid, reveal areas from the walls, door items. */
export function uvttLayout(file: Uvtt): UvttLayout {
  const ox = file.resolution.map_origin?.x ?? 0
  const oy = file.resolution.map_origin?.y ?? 0
  const { cols, rows, fits } = uvttSize(file)
  if (!fits) throw new Error('size')
  const walls: Segment[] = []
  // Walls only: sight lines of furniture (objects_line_of_sight) would carve slivers.
  for (const line of file.line_of_sight)
    for (let i = 0; i < line.length - 1; i++)
      walls.push([line[i]!.x - ox, line[i]!.y - oy, line[i + 1]!.x - ox, line[i + 1]!.y - oy])
  const portals = file.portals.map((p) => {
    const [a, b] = [p.bounds[0]!, p.bounds[p.bounds.length - 1]!]
    return {
      door: p.closed !== false,
      x: p.position.x - ox,
      y: p.position.y - oy,
      segment: [a.x - ox, a.y - oy, b.x - ox, b.y - oy] as Segment,
    }
  })
  // Doors and windows close the gap they sit in, so each room is its own area.
  const barriers = [...walls, ...portals.map((p) => p.segment)]

  // Edges between neighbouring squares that a barrier crosses (centre to centre).
  const right = new Uint8Array(cols * rows)
  const down = new Uint8Array(cols * rows)
  for (const seg of barriers) {
    const x0 = Math.max(0, Math.floor(Math.min(seg[0], seg[2]) - 1))
    const x1 = Math.min(cols - 1, Math.ceil(Math.max(seg[0], seg[2]) + 1))
    const y0 = Math.max(0, Math.floor(Math.min(seg[1], seg[3]) - 1))
    const y1 = Math.min(rows - 1, Math.ceil(Math.max(seg[1], seg[3]) + 1))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * cols + x
        const cx = x + 0.5 + 0.0137
        const cy = y + 0.5 + 0.0071
        if (x + 1 < cols && !right[i] && crosses(seg, [cx, cy, cx + 1, cy])) right[i] = 1
        if (y + 1 < rows && !down[i] && crosses(seg, [cx, cy, cx, cy + 1])) down[i] = 1
      }
  }
  // Areas: squares joined without crossing a barrier.
  const owner = new Int32Array(cols * rows).fill(-1)
  const sizes: number[] = []
  for (let start = 0; start < cols * rows; start++) {
    if (owner[start] !== -1) continue
    const id = sizes.length
    owner[start] = id
    const stack = [start]
    let size = 0
    while (stack.length) {
      const i = stack.pop()!
      size++
      const x = i % cols
      const next: number[] = []
      if (x + 1 < cols && !right[i]) next.push(i + 1)
      if (x > 0 && !right[i - 1]) next.push(i - 1)
      if (i + cols < cols * rows && !down[i]) next.push(i + cols)
      if (i - cols >= 0 && !down[i - cols]) next.push(i - cols)
      for (const n of next)
        if (owner[n] === -1) {
          owner[n] = id
          stack.push(n)
        }
    }
    sizes.push(size)
  }
  // Keep areas of two squares or more (a pillar's inside is not a room), up to the scene's limits.
  const rooms: Room[] = []
  const roomOf = new Map<number, string>()
  // The biggest areas first, so the scene's limits leave out only the smallest.
  const order = sizes
    .map((size, id) => ({ size, id }))
    .filter((a) => a.size >= 2)
    .sort((a, b) => b.size - a.size)
  let dropped = 0
  for (const { id } of order) {
    if (rooms.length >= 400) {
      dropped++
      continue
    }
    const rects = runsOf(cols, rows, (x, y) => owner[y * cols + x] === id)
    if (!rects.length || rects.length > 400) {
      dropped++
      continue
    }
    const room = `a${rooms.length + 1}`
    roomOf.set(id, room)
    rooms.push({ id: room, rects })
  }
  const areaAt = (x: number, y: number) => {
    const cx = Math.floor(x)
    const cy = Math.floor(y)
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return undefined
    return roomOf.get(owner[cy * cols + cx]!)
  }
  const doors: ItemPatch[] = []
  for (const p of portals) {
    if (!p.door) continue
    const [ax, ay, bx, by] = p.segment
    const length = Math.hypot(bx - ax, by - ay)
    if (length < 0.2 || p.x < 0 || p.y < 0 || p.x > cols || p.y > rows) continue
    const angle = Math.round((Math.atan2(by - ay, bx - ax) * 180) / Math.PI)
    const rotation = ((angle % 180) + 180) % 180
    // The areas on either side of the leaf.
    const nx = -(by - ay) / length
    const ny = (bx - ax) / length
    const sides = [areaAt(p.x + nx * 0.5, p.y + ny * 0.5), areaAt(p.x - nx * 0.5, p.y - ny * 0.5)]
    const joins = [...new Set(sides.filter((s): s is string => Boolean(s)))]
    doors.push({
      kind: 'door',
      x: Number(p.x.toFixed(3)),
      y: Number(p.y.toFixed(3)),
      w: Number(Math.min(4, Math.max(0.5, length)).toFixed(3)),
      h: 0.25,
      rotation,
      data: { state: 'closed', ...(joins.length ? { rooms: joins } : {}) },
    })
  }
  return {
    cols,
    rows,
    pixelsPerSquare: file.resolution.pixels_per_grid,
    rooms,
    dropped,
    doors: doors.slice(0, 600),
    windows: portals.filter((p) => !p.door).length,
    lights: file.lights.length,
  }
}

/** Squares across from a file name such as "Crypt_30x20" or "[20 x 30]", matched to the picture. */
export function gridFromName(name: string, width: number, height: number) {
  const m = name.match(/(\d{1,3})\s*(?:x|×|by)\s*(\d{1,3})/i)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!a || !b) return null
  const ratio = width / height
  // "20x30" on a landscape picture still means 30 across.
  const across = Math.abs(a / b - ratio) <= Math.abs(b / a - ratio) ? a : b
  return across >= 4 && across <= 120 ? across : null
}
