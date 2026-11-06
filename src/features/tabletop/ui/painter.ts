import { crown } from './sprites'
import {
  hash01,
  noise,
  rng,
  smoothLoop,
  T,
  traceLoops,
  type GeneratedMap,
  type MapLook,
  type Tile,
} from '../domain/generator'

// RYT-056/063: paints a generated map on a 2D canvas in Rytta's two looks (design-flow.md, section 2;
// map-doctrine.md, "readable at the table"). Drawing happens in squares (ctx scaled by the square
// size), so line widths read as fractions of a square. Walls are one traced outline: straight for
// built rooms, curved for caves and round rooms. Many small shapes go into a few batched paths.

export const squarePixels = (cols: number, rows: number) =>
  Math.max(16, Math.min(64, Math.floor(4096 / Math.max(cols, rows))))

type Ctx = CanvasRenderingContext2D

/**
 * Shapes grouped by colour, filled once per colour. Paths are split every few hundred shapes:
 * one huge path fills far slower than several small ones.
 */
function buckets(colors: readonly string[]) {
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

function rounded(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof p.roundRect === 'function') p.roundRect(x, y, w, h, r)
  else p.rect(x, y, w, h)
}

function ellipse(p: Path2D, x: number, y: number, rx: number, ry: number, a = 0) {
  p.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx)
  p.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
}

/** The traced outline of a region as one path (nonzero fill paints exactly the region). */
function outline(
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

/**
 * Dressed stone in a 4 × 1 square tile: four staggered courses of blocks 0.3 to 0.8 squares long,
 * each its own tone, over dark mortar. Used for painted walls (RYT-064).
 */
function masonry(ctx: Ctx, px: number, crypt: boolean, seed: number) {
  const tile = document.createElement('canvas')
  const size = Math.max(8, Math.round(px))
  tile.width = size * 4
  tile.height = size
  const t = tile.getContext('2d')
  if (!t) return '#6f675b'
  t.scale(size, size)
  t.fillStyle = crypt ? '#3c3b42' : '#4a4339'
  t.fillRect(0, 0, 4, 1)
  const tones = crypt
    ? ['#85848d', '#8e8d96', '#97969f', '#7f7e87', '#8a8992']
    : ['#a0978a', '#a99f90', '#b2a898', '#978e80', '#ada392']
  // Four courses a square, blocks of 0.3 to 0.8 squares, each with its own tone.
  for (let r = 0; r < 4; r++) {
    let x = 0
    for (let k = 0; x < 3.98; k++) {
      // The first block of a course is short so courses stagger; the last ends at the seam.
      const want = k === 0 ? 0.15 + hash01(r, 1, seed) * 0.45 : 0.3 + hash01(k, r + 7, seed) * 0.5
      const len = 4 - (x + want) < 0.25 ? 4 - x : want
      const y = r * 0.25
      t.fillStyle = tones[Math.floor(hash01(k + 11, r, seed) * tones.length)]!
      t.beginPath()
      t.roundRect(x + 0.02, y + 0.02, len - 0.04, 0.21, 0.015)
      t.fill()
      t.fillStyle = 'rgba(255, 255, 255, 0.1)'
      t.fillRect(x + 0.03, y + 0.025, len - 0.06, 0.035)
      t.fillStyle = 'rgba(0, 0, 0, 0.14)'
      t.fillRect(x + 0.03, y + 0.19, len - 0.06, 0.03)
      x += len
    }
  }
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return tones[0]!
  pattern.setTransform(new DOMMatrix().scale(1 / size, 1 / size))
  return pattern
}

/** Torches in brackets along room walls, a few squares apart, never beside a doorway. */
function torchSpots(map: GeneratedMap, tile: (x: number, y: number) => Tile) {
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
function torchLight(ctx: Ctx, x: number, y: number, nx: number, ny: number) {
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
function wallTorch(ctx: Ctx, x: number, y: number, nx: number, ny: number) {
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

export function paintMap(
  map: GeneratedMap,
  look: MapLook,
  canvas = document.createElement('canvas'),
  /** Pixels per square: the stored map uses squarePixels; the live preview paints lighter. */
  px = squarePixels(map.options.cols, map.options.rows),
) {
  const { cols, rows, kind } = map.options
  canvas.width = cols * px
  canvas.height = rows * px
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.save()
  ctx.scale(px, px)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === 'forest') paintForest(ctx, map, look, px)
  else if (kind === 'tavern') paintTavern(ctx, map, look, px)
  else paintUnderground(ctx, map, look, px)
  if (look === 'painted') vignette(ctx, cols, rows)
  ctx.restore()
  return canvas
}

/* ------------------------------------------------------------------ underground */

interface Under {
  void: string
  /** Painted: the masonry rim outside the wall line. */
  rim: string
  mottle: [string, string]
  band: string
  hatch: string
  floor: string
  stones: readonly string[]
  joint: string
  wall: string
  wallWidth: number
  ao: string
  aoWidth: number
  water: string
  waterDeep: string
  waterLine: string
  shore: string
  moss: string
  dirt: string
}

const inkUnder: Under = {
  void: '#e8dabb',
  rim: 'rgba(0,0,0,0)',
  mottle: ['rgba(91, 65, 40, 0.025)', 'rgba(255, 250, 235, 0.1)'],
  band: '#efe3c6',
  hatch: 'rgba(66, 45, 26, 0.62)',
  floor: '#f5ebd3',
  stones: [],
  joint: 'rgba(91, 65, 40, 0.13)',
  wall: '#2e2014',
  wallWidth: 0.17,
  ao: 'rgba(91, 65, 40, 0.13)',
  aoWidth: 0.42,
  water: '#b0c8c0',
  waterDeep: 'rgba(40, 70, 72, 0.22)',
  waterLine: 'rgba(58, 40, 22, 0.42)',
  shore: 'rgba(91, 65, 40, 0.28)',
  moss: 'rgba(0,0,0,0)',
  dirt: 'rgba(91, 65, 40, 0.05)',
}

const paintedUnder = (kind: string): Under => {
  const crypt = kind === 'crypt'
  const cave = kind === 'cave'
  return {
    void: crypt ? '#141317' : cave ? '#18130f' : '#191511',
    rim: crypt ? '#3d3c44' : cave ? '#3b2f25' : '#3f382f',
    mottle: ['rgba(0, 0, 0, 0.13)', 'rgba(255, 240, 220, 0.025)'],
    band: 'rgba(255, 240, 220, 0.05)',
    hatch: 'rgba(0,0,0,0)',
    floor: crypt ? '#5c5f66' : cave ? '#4d3d2d' : '#665e54',
    stones: crypt
      ? ['#62656d', '#666970', '#6a6d74', '#6e7178', '#72757c']
      : cave
        ? ['#5a4734', '#5d4a37', '#604d3a', '#63503c', '#66533f']
        : ['#6c645a', '#70685d', '#746b60', '#786f63', '#7c7366'],
    joint: 'rgba(0, 0, 0, 0.3)',
    wall: '#211b15',
    wallWidth: 0.14,
    ao: 'rgba(0, 0, 0, 0.3)',
    aoWidth: 0.34,
    water: '#2f5a66',
    waterDeep: 'rgba(8, 22, 30, 0.5)',
    waterLine: 'rgba(205, 232, 236, 0.3)',
    shore: 'rgba(20, 15, 10, 0.55)',
    moss: cave ? 'rgba(96, 120, 60, 0.2)' : 'rgba(86, 104, 58, 0.16)',
    dirt: 'rgba(25, 18, 10, 0.13)',
  }
}

function paintUnderground(ctx: Ctx, map: GeneratedMap, look: MapLook, px: number) {
  const { cols, rows, seed, kind } = map.options
  const p = look === 'ink' ? inkUnder : paintedUnder(kind)
  const cave = kind === 'cave'
  const tile = (x: number, y: number): Tile =>
    x < 0 || y < 0 || x >= cols || y >= rows ? T.rock : (map.tiles[y * cols + x] as Tile)
  const open = (t: Tile) => t !== T.rock
  const floor = outline(map, open, cave ? 0.22 : 0, (i) => map.soft[i] === 1, cave ? 5 : 2)
  const outside = new Path2D()
  outside.rect(-1, -1, cols + 2, rows + 2)
  outside.addPath(floor)
  const grain = noise(seed + 17)

  // 1. Rock: a flat ground with large, faint mottling so wide rock never looks empty.
  ctx.fillStyle = p.void
  ctx.fillRect(0, 0, cols, rows)
  const mottle = buckets(p.mottle)
  for (let y = 0; y < rows; y += 2)
    for (let x = 0; x < cols; x += 2) {
      const v = grain(x / 5, y / 5)
      const jx = (hash01(x, y, seed + 2) - 0.5) * 1.6
      const jy = (hash01(y, x, seed + 2) - 0.5) * 1.6
      ellipse(mottle.at(v > 0.5 ? 1 : 0), x + 1 + jx, y + 1 + jy, 1.1 + v, 0.8 + v * 0.6, v * 3)
    }
  mottle.fill(ctx)

  // 2. Hatching (ink): clusters of short strokes hugging the walls, sparser further out.
  const near = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (open(tile(x, y))) continue
      let d = 0
      for (let r = 1; r <= 3 && !d; r++)
        for (let dy = -r; dy <= r && !d; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (open(tile(x + dx, y + dy))) {
              d = r
              break
            }
      near[y * cols + x] = d
    }
  ctx.save()
  ctx.clip(outside, 'evenodd')
  if (look === 'ink') {
    const hatch = new Path2D()
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const d = near[y * cols + x]!
        if (!d) continue
        const spots = d === 1 ? 4 : d === 2 ? 2 : 1
        for (let s = 0; s < spots; s++) {
          if (d > 1 && hash01(x * 4 + s, y, seed) > (d === 2 ? 0.75 : 0.4)) continue
          const cx =
            x +
            (spots === 4 ? (s % 2) * 0.5 + 0.25 : 0.5) +
            (hash01(x, y * 4 + s, seed) - 0.5) * 0.3
          const cy =
            y +
            (spots === 4 ? Math.floor(s / 2) * 0.5 + 0.25 : 0.5) +
            (hash01(y, x * 4 + s, seed) - 0.5) * 0.3
          const a = hash01(x + s * 31, y + 7, seed) * Math.PI
          const ux = Math.cos(a)
          const uy = Math.sin(a)
          for (let k = -1; k <= 1; k++) {
            const ox = -uy * k * 0.085
            const oy = ux * k * 0.085
            const len = 0.15 + hash01(x + k, y + s, seed + 3) * 0.06
            hatch.moveTo(cx + ox - ux * len, cy + oy - uy * len)
            hatch.lineTo(cx + ox + ux * len, cy + oy + uy * len)
          }
        }
      }
    ctx.strokeStyle = p.hatch
    ctx.lineWidth = 0.026
    ctx.stroke(hatch)
  } else if (cave) {
    // Painted caves: loose pebbles in the band of rock along the walls.
    const pebbles = buckets(['rgba(0,0,0,0.35)', 'rgba(255,235,210,0.06)'])
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (near[y * cols + x] !== 1) continue
        for (let s = 0; s < 3; s++) {
          const h = hash01(x * 3 + s, y, seed)
          ellipse(
            pebbles.at(s % 2),
            x + h,
            y + hash01(y, x * 3 + s, seed),
            0.06 + h * 0.08,
            0.05 + h * 0.06,
            h * 6,
          )
        }
      }
    pebbles.fill(ctx)
  }
  // A light band just outside the wall, so the hatching never touches the line.
  ctx.strokeStyle = p.band
  ctx.lineWidth = look === 'ink' ? 0.46 : 1.1
  ctx.stroke(floor)
  if (look === 'painted' && cave) {
    ctx.strokeStyle = p.rim
    ctx.lineWidth = 0.5
    ctx.stroke(floor)
  } else if (look === 'painted') {
    // Thick walls of dressed stone, as a battle map draws them: a dark edge, then the blocks.
    ctx.strokeStyle = '#1d1915'
    ctx.lineWidth = 1.32
    ctx.stroke(floor)
    ctx.strokeStyle = masonry(ctx, px, kind === 'crypt', seed)
    ctx.lineWidth = 1.2
    ctx.stroke(floor)
  }
  ctx.restore()

  // 3. Floors: stones by kind, decals, water, then the shadow along the walls.
  ctx.save()
  ctx.clip(floor)
  ctx.fillStyle = p.floor
  ctx.fillRect(0, 0, cols, rows)
  if (look === 'painted') {
    const stones = buckets(p.stones)
    const shade = (x: number, y: number, salt: number) =>
      Math.floor(
        hash01(x, y, seed + salt) * 0.6 * p.stones.length +
          grain(x / 4, y / 4) * 0.4 * p.stones.length,
      )
    if (!cave) {
      // Large flagstones in courses whose height and start never repeat the grid's period, with
      // narrow joints barely darker than the stone: the board's grid stays the darkest, most
      // regular line on the floor (map-doctrine.md, "a quiet grid").
      const crypt = kind === 'crypt'
      const course = crypt ? 1.17 : 0.83
      const lengths = crypt ? [1.3, 1.7, 2.1, 1.5] : [0.9, 1.15, 1.4, 1.7, 1.25]
      for (let band = -1; band * course < rows + 1; band++) {
        const y = band * course + 0.37
        let x = -hash01(band, 5, seed) * 1.6
        while (x < cols) {
          const len =
            lengths[Math.floor(hash01(Math.floor(x * 8), band, seed + 1) * lengths.length)]!
          const cx = Math.floor(x + len / 2)
          const cy = Math.floor(y + course / 2)
          const t = tile(cx, cy)
          if ((t === T.floor || t === T.corridor) && !map.soft[cy * cols + cx])
            rounded(
              stones.at(shade(Math.floor(x * 4), band, 2)),
              x + 0.0125,
              y + 0.0125,
              len - 0.025,
              course - 0.025,
              0.04,
            )
          x += len
        }
      }
    }
    if (cave)
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const t = tile(x, y)
          if (t !== T.floor && t !== T.corridor) continue
          // Cave floor: mottled plates instead of masonry.
          const h = hash01(x, y, seed + 4)
          ellipse(
            stones.at(shade(x, y, 6)),
            x + 0.3 + h * 0.4,
            y + 0.3 + hash01(y, x, seed) * 0.4,
            0.62 + h * 0.25,
            0.45 + h * 0.2,
            h * 3,
          )
        }
    if (!cave)
      for (const round of softRooms(map)) {
        // Concentric rings of curved stones round a medallion.
        const { cx, cy, r } = round
        for (let ring = 0, r0 = 0.45; r0 < r; ring++, r0 += 0.62) {
          const r1 = Math.min(r + 0.2, r0 + 0.62)
          const n = Math.max(6, Math.ceil((Math.PI * 2 * r1) / 0.85))
          const turn = hash01(ring, 3, seed) * Math.PI
          for (let k = 0; k < n; k++) {
            const a0 = turn + (k / n) * Math.PI * 2 + 0.02
            const a1 = turn + ((k + 1) / n) * Math.PI * 2 - 0.02
            const path = stones.at(shade(k, ring, 9))
            path.moveTo(cx + Math.cos(a0) * (r0 + 0.03), cy + Math.sin(a0) * (r0 + 0.03))
            path.arc(cx, cy, r1 - 0.03, a0, a1)
            path.arc(cx, cy, r0 + 0.03, a1, a0, true)
            path.closePath()
          }
        }
        ellipse(stones.at(shade(1, 1, 11)), cx, cy, 0.4, 0.4)
      }
    stones.fill(ctx)
    // Cave walls: clusters of loose stones and the odd boulder along the cavern edge, with gaps.
    if (cave) {
      const pebbles = buckets(['#857a6a', '#968a78', '#766b5d', '#a1957f', '#6c6255'])
      for (const pts of floor.loops) {
        const n = pts.length / 2
        let carry = 0.3
        for (let i = 0; i < n; i++) {
          const x1 = pts[i * 2]!
          const y1 = pts[i * 2 + 1]!
          const x2 = pts[((i + 1) % n) * 2]!
          const y2 = pts[((i + 1) % n) * 2 + 1]!
          const len = Math.hypot(x2 - x1, y2 - y1)
          if (!len) continue
          const ux = (x2 - x1) / len
          const uy = (y2 - y1) / len
          let next = carry - len
          for (let d = carry; d < len; d += 0.9) {
            const h = hash01(Math.floor(x1 * 9 + d * 7), Math.floor(y1 * 9), seed + 31)
            next = d + 0.9 - len
            if (h < 0.25) continue
            const count = 3 + Math.floor(h * 4)
            for (let k = 0; k < count; k++) {
              const hk = hash01(Math.floor(x1 * 13 + k), Math.floor(y1 * 13 + d * 5), seed + 33)
              const boulder = k === 0 && hk > 0.86
              const r = boulder ? 0.3 : 0.07 + hk * 0.13
              const along = d + (k - count / 2) * 0.2
              const off = r * 0.8 + hk * 0.12
              ellipse(
                pebbles.at(Math.floor(hk * 5)),
                x1 + ux * along - uy * off,
                y1 + uy * along + ux * off,
                r,
                r * (0.65 + hk * 0.25),
                hk * 6,
              )
            }
          }
          carry = next
        }
      }
      pebbles.fill(ctx)
    }
    // Cracks in a few stones, a puddle or two, cobwebs in the corners of rooms.
    const cracks = new Path2D()
    const webs = new Path2D()
    const puddles = buckets(['rgba(70, 100, 110, 0.4)', 'rgba(200, 225, 230, 0.25)'])
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const t = tile(x, y)
        if (t !== T.floor && t !== T.corridor) continue
        const h = hash01(x, y, seed + 41)
        if (h < 0.07) {
          let cx = x + 0.2 + hash01(y, x, seed + 42) * 0.6
          let cy = y + 0.2 + hash01(x, y, seed + 43) * 0.6
          cracks.moveTo(cx, cy)
          for (let k = 0; k < 3; k++) {
            cx += (hash01(x + k, y, seed + 44) - 0.5) * 0.35
            cy += (hash01(x, y + k, seed + 45) - 0.5) * 0.35
            cracks.lineTo(cx, cy)
          }
        } else if (h > 0.985 && !cave) {
          ellipse(puddles.at(0), x + 0.5, y + 0.5, 0.42, 0.26, h * 9)
          ellipse(puddles.at(1), x + 0.4, y + 0.44, 0.12, 0.05, h * 9)
        }
        // A corner: rock on two sides that meet.
        const up = tile(x, y - 1) === T.rock
        const down = tile(x, y + 1) === T.rock
        const left = tile(x - 1, y) === T.rock
        const right = tile(x + 1, y) === T.rock
        if (
          t === T.floor &&
          !cave &&
          hash01(x, y, seed + 47) < 0.35 &&
          (up || down) &&
          (left || right)
        ) {
          const ox = left ? x : x + 1
          const oy = up ? y : y + 1
          const sx = left ? 1 : -1
          const sy = up ? 1 : -1
          for (let k = 0; k <= 4; k++) {
            const a = (k / 4) * (Math.PI / 2)
            webs.moveTo(ox, oy)
            webs.lineTo(ox + sx * Math.cos(a) * 0.62, oy + sy * Math.sin(a) * 0.62)
          }
          for (const rr of [0.2, 0.36, 0.52]) {
            webs.moveTo(ox + sx * rr, oy)
            for (let k = 1; k <= 4; k++) {
              const a = (k / 4) * (Math.PI / 2)
              webs.lineTo(ox + sx * Math.cos(a) * rr * 0.92, oy + sy * Math.sin(a) * rr * 0.92)
            }
          }
        }
      }
    ctx.strokeStyle = 'rgba(20, 15, 10, 0.5)'
    ctx.lineWidth = 0.02
    ctx.stroke(cracks)
    puddles.fill(ctx)
    ctx.strokeStyle = 'rgba(235, 235, 228, 0.5)'
    ctx.lineWidth = 0.022
    ctx.stroke(webs)
    // Decals: dirt where the noise gathers it, moss and grime along the walls, bone specks.
    const decals = buckets([p.dirt, p.moss, 'rgba(225, 215, 190, 0.5)'])
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const t = tile(x, y)
        if (t !== T.floor && t !== T.corridor) continue
        const v = grain(x / 3 + 9, y / 3)
        if (v > 0.62) ellipse(decals.at(0), x + 0.5, y + 0.5, 0.5 + v * 0.5, 0.35 + v * 0.3, v * 5)
        const edge = [tile(x + 1, y), tile(x - 1, y), tile(x, y + 1), tile(x, y - 1)].includes(
          T.rock,
        )
        if (edge && hash01(x, y, seed + 11) < 0.4)
          ellipse(
            decals.at(1),
            x + hash01(x, y, seed + 12),
            y + hash01(y, x, seed + 12),
            0.3,
            0.2,
            v * 4,
          )
        if (kind === 'crypt' && hash01(x, y, seed + 13) < 0.12)
          ellipse(decals.at(2), x + hash01(x, y, 1), y + hash01(y, x, 1), 0.05, 0.03, v * 6)
      }
    decals.fill(ctx)
  } else {
    // Ink floors stay clean for the grid; crypts show faint slab joints, dungeons a little grit.
    const grit = new Path2D()
    const random = rng(seed + 991)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const t = tile(x, y)
        if (t !== T.floor && t !== T.corridor) continue
        for (let s = 0; s < 3; s++) {
          const gx = x + random.next()
          const gy = y + random.next()
          grit.moveTo(gx, gy)
          grit.arc(gx, gy, 0.012 + random.next() * 0.02, 0, Math.PI * 2)
        }
      }
    ctx.strokeStyle = p.joint
    ctx.lineWidth = 0.02
    ctx.stroke(grit)
  }
  paintWater(ctx, map, p, look)
  const torches = look === 'painted' && !cave ? torchSpots(map, tile) : []
  for (const [x, y, nx, ny] of torches) torchLight(ctx, x, y, nx, ny)
  ctx.strokeStyle = p.ao
  ctx.lineWidth = p.aoWidth
  ctx.stroke(floor)
  if (look === 'painted') {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)'
    ctx.lineWidth = 0.6
    ctx.stroke(floor)
  }
  ctx.restore()

  // 4. Walls: one line round every room, passage and cavern.
  ctx.strokeStyle = p.wall
  ctx.lineWidth = p.wallWidth
  ctx.stroke(floor)
  // Secret doors read as solid wall from inside the room.
  const sealed = new Path2D()
  for (const d of map.doors)
    if (d.secret) {
      if (d.rotation === 90) {
        sealed.moveTo(d.x, d.y - 0.5)
        sealed.lineTo(d.x, d.y + 0.5)
      } else {
        sealed.moveTo(d.x - 0.5, d.y)
        sealed.lineTo(d.x + 0.5, d.y)
      }
    }
  ctx.stroke(sealed)
  for (const [x, y, nx, ny] of torches) wallTorch(ctx, x, y, nx, ny)
}

/** Round rooms of a built map: groups of soft squares, as a centre and a radius. */
function softRooms(map: GeneratedMap) {
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

function paintWater(ctx: Ctx, map: GeneratedMap, p: Under, look: MapLook) {
  const { cols, rows, seed } = map.options
  if (!map.tiles.includes(T.water)) return
  const water = outline(
    map,
    (t) => t === T.water,
    0.18,
    () => true,
  )
  ctx.strokeStyle = p.shore
  ctx.lineWidth = 0.4
  ctx.stroke(water)
  ctx.fillStyle = p.water
  ctx.fill(water)
  ctx.save()
  ctx.clip(water)
  ctx.strokeStyle = p.waterDeep
  ctx.lineWidth = look === 'ink' ? 0.5 : 0.9
  ctx.stroke(water)
  const ripples = new Path2D()
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (map.tiles[y * cols + x] !== T.water || hash01(x, y, seed + 21) > 0.45) continue
      const cx = x + 0.2 + hash01(x, y, seed + 22) * 0.6
      const cy = y + 0.2 + hash01(y, x, seed + 23) * 0.6
      ripples.moveTo(cx + Math.cos(Math.PI * 1.15) * 0.2, cy + Math.sin(Math.PI * 1.15) * 0.2)
      ripples.arc(cx, cy, 0.2, Math.PI * 1.15, Math.PI * 1.85)
    }
  ctx.strokeStyle = p.waterLine
  ctx.lineWidth = 0.03
  ctx.stroke(ripples)
  ctx.restore()
  ctx.strokeStyle = look === 'ink' ? 'rgba(46, 32, 20, 0.55)' : 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 0.04
  ctx.stroke(water)
}

/* ------------------------------------------------------------------ forest */

function paintForest(ctx: Ctx, map: GeneratedMap, look: MapLook, px: number) {
  const detail = px >= 16
  const { cols, rows, seed } = map.options
  const ink = look === 'ink'
  const grain = noise(seed + 17)
  ctx.fillStyle = ink ? '#e4ddba' : '#4d6b33'
  ctx.fillRect(0, 0, cols, rows)
  // Ground: soft patches of light and shade, leaf litter.
  const ground = buckets(
    ink
      ? ['rgba(120, 130, 70, 0.06)', 'rgba(255, 252, 235, 0.12)', 'rgba(91, 65, 40, 0.18)']
      : ['rgba(20, 35, 10, 0.18)', 'rgba(170, 190, 110, 0.12)', 'rgba(110, 80, 40, 0.3)'],
  )
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const v = grain(x / 4, y / 4)
      ellipse(ground.at(v > 0.5 ? 1 : 0), x + 0.5, y + 0.5, 0.7 + v * 0.6, 0.55 + v * 0.4, v * 4)
      for (let s = 0; detail && s < 2; s++)
        ellipse(
          ground.at(2),
          x + hash01(x, y * 2 + s, seed),
          y + hash01(y, x * 2 + s, seed),
          0.05,
          0.025,
          hash01(x, y, s) * 6,
        )
    }
  ground.fill(ctx)
  // Trails: the worn ground, a darker rim and a lighter middle where feet go.
  const along = (kind: 'path' | 'water', width: (w: number) => number, color: string) => {
    ctx.strokeStyle = color
    for (const line of map.lines.filter((l) => l.kind === kind)) {
      ctx.lineWidth = width(line.width)
      ctx.beginPath()
      line.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
  }
  // Trails: a darker rim, the worn earth, a lighter middle where feet go.
  along('path', (w) => w * 1.05 + 0.18, ink ? 'rgba(70, 48, 28, 0.55)' : 'rgba(55, 40, 20, 0.5)')
  along('path', (w) => w * 1.05, ink ? '#d8c69d' : '#8a7150')
  along(
    'path',
    (w) => (w > 1 ? w * 0.35 : 0.2),
    ink ? 'rgba(255, 248, 230, 0.45)' : 'rgba(190, 165, 120, 0.3)',
  )
  // Streams: a muddy bank, the water, a darker channel; ponds are traced like cave pools.
  along('water', (w) => w * 1.1 + 0.4, ink ? 'rgba(91, 65, 40, 0.3)' : 'rgba(60, 45, 25, 0.6)')
  along('water', (w) => w * 1.1, ink ? '#b0c8c0' : '#2f5a66')
  along('water', (w) => w * 0.45, ink ? 'rgba(40, 70, 72, 0.18)' : 'rgba(8, 22, 30, 0.4)')
  if (!map.lines.some((l) => l.kind === 'water'))
    paintWater(ctx, map, ink ? inkUnder : paintedUnder('forest'), look)
  else {
    // Ponds apart from the stream: only the water squares far from its line.
    const stream = map.lines.filter((l) => l.kind === 'water').flatMap((l) => l.points)
    const pond = (i: number) => {
      const x = (i % cols) + 0.5
      const y = Math.floor(i / cols) + 0.5
      return !stream.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 < 4)
    }
    const tiles = map.tiles.map((t, i) => (t === T.water && !pond(i) ? T.grass : t))
    paintWater(ctx, { ...map, tiles }, ink ? inkUnder : paintedUnder('forest'), look)
  }
  if (!ink && detail) {
    // Grass tufts on open ground, blades along the edges of the trails.
    const tufts = new Path2D()
    const blade = (x: number, y: number, h: number) => {
      tufts.moveTo(x - 0.05, y)
      tufts.lineTo(x - 0.08, y - h)
      tufts.moveTo(x, y)
      tufts.lineTo(x, y - h * 1.2)
      tufts.moveTo(x + 0.05, y)
      tufts.lineTo(x + 0.08, y - h)
    }
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (map.tiles[y * cols + x] !== T.grass) continue
        for (let k = 0; k < 2; k++)
          if (hash01(x * 2 + k, y, seed + 61) < 0.55)
            blade(x + hash01(y, x * 2 + k, seed + 62), y + hash01(x, y * 2 + k, seed + 63), 0.12)
      }
    for (const line of map.lines.filter((l) => l.kind === 'path'))
      line.points.forEach(([x, y], i) => {
        const next = line.points[i + 1]
        if (!next || i % 2) return
        const len = Math.hypot(next[0] - x, next[1] - y) || 1
        const nx = -(next[1] - y) / len
        const ny = (next[0] - x) / len
        for (const side of [-1, 1])
          blade(
            x + nx * side * (line.width * 0.53 + 0.04),
            y + ny * side * (line.width * 0.53 + 0.04),
            0.1,
          )
      })
    ctx.strokeStyle = 'rgba(30, 55, 18, 0.55)'
    ctx.lineWidth = 0.022
    ctx.stroke(tufts)
  }
  // Trees: shadows first, then crowns from the top down so lower crowns overlap.
  const trees = [...map.trees].sort((a, b) => a.y - b.y)
  if (!ink) {
    for (const t of trees)
      crown(
        ctx,
        t.x,
        t.y,
        t.r,
        Math.floor(hash01(Math.floor(t.x * 3), Math.floor(t.y * 3), seed) * 1000),
        px,
        hash01(Math.floor(t.y), Math.floor(t.x), seed),
      )
    return
  }
  // Ink crowns: flat washes with an inked edge.
  const canopy = ['#bcc99c', '#c9d4ad', '#adbd8c']
  for (const t of trees) {
    const tone = Math.floor(hash01(Math.floor(t.x * 3), Math.floor(t.y * 3), seed) * canopy.length)
    const crown = new Path2D()
    const lobes = 7
    for (let k = 0; k < lobes; k++) {
      const a = (k / lobes) * Math.PI * 2 + hash01(k, Math.floor(t.x), seed) * 0.6
      ellipse(
        crown,
        t.x + Math.cos(a) * t.r * 0.55,
        t.y + Math.sin(a) * t.r * 0.55,
        t.r * 0.5,
        t.r * 0.5,
      )
    }
    ellipse(crown, t.x, t.y, t.r * 0.7, t.r * 0.7)
    // The fill covers the inner half of the stroke: only the crown's outer edge stays inked.
    ctx.strokeStyle = '#3a2816'
    ctx.lineWidth = 0.08
    ctx.stroke(crown)
    ctx.fillStyle = canopy[tone]!
    ctx.fill(crown)
    ctx.fillStyle = 'rgba(255, 252, 235, 0.45)'
    ctx.beginPath()
    ctx.ellipse(t.x - t.r * 0.25, t.y - t.r * 0.28, t.r * 0.38, t.r * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ------------------------------------------------------------------ tavern */

function paintTavern(ctx: Ctx, map: GeneratedMap, look: MapLook, px: number) {
  const { cols, rows, seed } = map.options
  const ink = look === 'ink'
  const tile = (x: number, y: number): Tile =>
    x < 0 || y < 0 || x >= cols || y >= rows ? T.rock : (map.tiles[y * cols + x] as Tile)
  const grain = noise(seed + 17)
  ctx.fillStyle = ink ? '#e3dcb9' : '#4e6b34'
  ctx.fillRect(0, 0, cols, rows)
  const ground = buckets(ink ? ['rgba(120,130,70,0.07)'] : ['rgba(20,35,10,0.12)'])
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (grain(x / 3, y / 3) > 0.55)
        ellipse(
          ground.at(0),
          x + 0.5 + (hash01(x, y, seed) - 0.5) * 0.8,
          y + 0.5 + (hash01(y, x, seed) - 0.5) * 0.8,
          0.7,
          0.5,
          hash01(x, y, 4) * 3,
        )
  ground.fill(ctx)
  if (map.tiles.includes(T.path)) {
    const path = outline(
      map,
      (t) => t === T.path,
      0,
      () => false,
    )
    ctx.fillStyle = ink ? '#d6c399' : '#8a7150'
    ctx.fill(path)
  }
  // The building's shadow, its walls, then the floors inside.
  const building = outline(
    map,
    (t) => t === T.rock || t === T.plank || t === T.floor,
    0,
    () => false,
  )
  if (!ink) {
    ctx.save()
    ctx.translate(0.25, 0.3)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fill(building)
    ctx.restore()
  }
  // Painted walls are dressed stone; ink walls stay a solid sepia.
  ctx.fillStyle = ink ? '#5b4128' : masonry(ctx, px, false, seed)
  ctx.fill(building)
  const floors = outline(
    map,
    (t) => t === T.plank || t === T.floor,
    0,
    () => false,
  )
  ctx.save()
  ctx.clip(floors)
  ctx.fillStyle = ink ? '#ecd9b6' : '#6e4a2c'
  ctx.fillRect(0, 0, cols, rows)
  const boards = buckets(ink ? ['#efdebd', '#e8d3ad'] : ['#7a5232', '#835a37', '#714b2d'])
  const seams = new Path2D()
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const t = tile(x, y)
      if (t === T.plank)
        for (let k = 0; k < 3; k++) {
          // Boards a third of a square wide, shifted so their edges never sit on the grid.
          const top = y + 0.13 + k / 3
          const off = hash01(x, y * 4 + k, seed) * 0.6
          rounded(
            boards.at(Math.floor(hash01(x + k, y, seed) * 3)),
            x,
            top + 0.01,
            1,
            1 / 3 - 0.02,
            0.02,
          )
          seams.moveTo(x + off + 0.2, top)
          seams.lineTo(x + off + 0.2, top + 1 / 3)
        }
      else if (t === T.floor) rounded(boards.at(0), x + 0.05, y + 0.05, 0.9, 0.9, 0.06)
    }
  boards.fill(ctx)
  ctx.strokeStyle = ink ? 'rgba(91, 65, 40, 0.35)' : 'rgba(30, 18, 8, 0.5)'
  ctx.lineWidth = 0.02
  ctx.stroke(seams)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.lineWidth = ink ? 0.25 : 0.5
  ctx.stroke(floors)
  ctx.restore()
  ctx.strokeStyle = ink ? '#2e2014' : '#1b1611'
  ctx.lineWidth = ink ? 0.08 : 0.12
  ctx.stroke(building)
}

/** A quiet vignette on painted maps. */
function vignette(ctx: Ctx, cols: number, rows: number) {
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

/** The painted canvas as WebP for upload (PNG where the browser cannot encode WebP). */
export async function canvasBlob(canvas: HTMLCanvasElement) {
  const webp = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.86),
  )
  if (webp && webp.type === 'image/webp') return webp
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) throw new Error('unavailable')
  return png
}
