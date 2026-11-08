import {
  hash01,
  smoothLoop,
  T,
  traceLoops,
  type GeneratedMap,
  type Tile,
} from '../domain/generator'

// Drawing helpers shared by the ink and painted looks (painter.ts) and the textured painting
// (painted.ts, RYT-068). Drawing happens in squares: the context is scaled by the square size.

export type Ctx = CanvasRenderingContext2D

/**
 * Shapes grouped by colour, filled once per colour. Paths are split every few hundred shapes:
 * one huge path fills far slower than several small ones.
 */
export function buckets(colors: readonly string[]) {
  const paths = colors.map(() => [new Path2D()])
  const counts = colors.map(() => 0)
  return {
    at: (i: number) => {
      const k = Math.max(0, Math.min(paths.length - 1, i))
      if (++counts[k]! % 400 === 0) paths[k]!.push(new Path2D())
      return paths[k]!.at(-1)!
    },
    fill(ctx: Ctx) {
      colors.forEach((c, i) => {
        ctx.fillStyle = c
        for (const p of paths[i]!) ctx.fill(p)
      })
    },
  }
}

export function rounded(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof p.roundRect === 'function') p.roundRect(x, y, w, h, r)
  else p.rect(x, y, w, h)
}

export function ellipse(p: Path2D, x: number, y: number, rx: number, ry: number, a = 0) {
  p.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx)
  p.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
}

/** The traced outline of a region as one path (nonzero fill paints exactly the region). */
export function outline(
  map: GeneratedMap,
  inside: (t: Tile) => boolean,
  jitter: number,
  soft: (i: number) => boolean,
  relax = 3,
) {
  const { cols, rows, seed } = map.options
  const loops = traceLoops(
    cols,
    rows,
    (x, y) => inside(map.tiles[y * cols + x] as Tile),
    (x, y) => soft(y * cols + x),
  )
  const path = new Path2D()
  const smoothed: number[][] = []
  for (const loop of loops) {
    const pts = smoothLoop(loop, 2, jitter, seed, relax)
    smoothed.push(pts)
    path.moveTo(pts[0]!, pts[1]!)
    for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i]!, pts[i + 1]!)
    path.closePath()
  }
  return Object.assign(path, { loops: smoothed })
}

/** Torches in brackets along room walls, a few squares apart, never beside a doorway. */
export function torchSpots(map: GeneratedMap, tile: (x: number, y: number) => Tile) {
  const { cols, rows, seed } = map.options
  const placed: [number, number, number, number][] = []
  for (let y = 1; y < rows - 1; y++)
    for (let x = 1; x < cols - 1; x++) {
      if (tile(x, y) !== T.floor || map.soft[y * cols + x]) continue
      if (hash01(x, y, seed + 51) > 0.16) continue
      const sides: [number, number][] = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]
      const side = sides.find(
        ([dx, dy]) =>
          tile(x + dx, y + dy) === T.rock &&
          tile(x + dx - dy, y + dy + dx) === T.rock &&
          tile(x + dx + dy, y + dy - dx) === T.rock,
      )
      if (!side) continue
      const [dx, dy] = side
      const wx = x + 0.5 + dx * 0.5
      const wy = y + 0.5 + dy * 0.5
      if (map.doors.some((d) => Math.abs(d.x - wx) < 1.6 && Math.abs(d.y - wy) < 1.6)) continue
      if (placed.some(([px2, py2]) => Math.abs(px2 - wx) + Math.abs(py2 - wy) < 5)) continue
      placed.push([wx, wy, -dx, -dy])
    }
  return placed
}

/** The light a wall torch throws on the floor (the caller clips to the floor). */
export function torchLight(ctx: Ctx, x: number, y: number, nx: number, ny: number) {
  const fx = x + nx * 0.3
  const fy = y + ny * 0.3
  const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 2.4)
  g.addColorStop(0, 'rgba(255, 176, 92, 0.3)')
  g.addColorStop(0.45, 'rgba(255, 150, 70, 0.11)')
  g.addColorStop(1, 'rgba(255, 130, 50, 0)')
  ctx.fillStyle = g
  ctx.fillRect(fx - 2.4, fy - 2.4, 4.8, 4.8)
}

/** The torch itself: an iron bracket on the masonry and its flame. */
export function wallTorch(ctx: Ctx, x: number, y: number, nx: number, ny: number) {
  const fx = x + nx * 0.22
  const fy = y + ny * 0.22
  ctx.fillStyle = '#2b2622'
  ctx.fillRect(x - 0.08 + nx * 0.02, y - 0.08 + ny * 0.02, 0.16, 0.16)
  ctx.strokeStyle = '#5a3820'
  ctx.lineWidth = 0.07
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(fx, fy)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 190, 110, 0.35)'
  ctx.beginPath()
  ctx.arc(fx, fy, 0.24, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8752b'
  ctx.beginPath()
  ctx.arc(fx, fy, 0.13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd36b'
  ctx.beginPath()
  ctx.arc(fx, fy, 0.065, 0, Math.PI * 2)
  ctx.fill()
}

/** Round rooms of a built map: groups of soft squares, as a centre and a radius. */
export function softRooms(map: GeneratedMap) {
  const { cols, rows } = map.options
  const seen = new Uint8Array(cols * rows)
  const rooms: { cx: number; cy: number; r: number }[] = []
  for (let i = 0; i < cols * rows; i++) {
    if (!map.soft[i] || seen[i]) continue
    let [x0, y0, x1, y1] = [cols, rows, 0, 0]
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const c = stack.pop()!
      const x = c % cols
      const y = (c - x) / cols
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x + 1)
      y1 = Math.max(y1, y + 1)
      for (const n of [c - 1, c + 1, c - cols, c + cols])
        if (n >= 0 && n < cols * rows && !seen[n] && map.soft[n] && Math.abs((n % cols) - x) <= 1) {
          seen[n] = 1
          stack.push(n)
        }
    }
    rooms.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.min(x1 - x0, y1 - y0) / 2 })
  }
  return rooms
}

/** A quiet vignette on painted maps. */
export function vignette(ctx: Ctx, cols: number, rows: number) {
  const g = ctx.createRadialGradient(
    cols / 2,
    rows / 2,
    Math.min(cols, rows) * 0.3,
    cols / 2,
    rows / 2,
    Math.max(cols, rows) * 0.75,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.28)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, cols, rows)
}
