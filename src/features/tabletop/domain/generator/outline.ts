import { hash01 } from './core'

// RYT-063: outlines of a region of squares as closed loops, for walls drawn as one line.
// Contour tracing on square corners, then corner cutting (Chaikin) on the soft corners only,
// so caves and round rooms read as curves while built rooms keep their right angles.

export interface Loop {
  /** Corner points in squares: x0, y0, x1, y1, … (inside on the right, clockwise on screen). */
  points: number[]
  /** 1 where the corner may be rounded. */
  soft: number[]
}

/**
 * Traces the boundary of the squares where `inside` holds. Holes come out the other way round,
 * so a nonzero fill of all loops paints exactly the region.
 */
export function traceLoops(
  cols: number,
  rows: number,
  inside: (x: number, y: number) => boolean,
  softAt: (x: number, y: number) => boolean = () => false,
): Loop[] {
  const W = cols + 1
  const out = new Map<number, number[]>()
  const add = (x: number, y: number, dir: number) => {
    const v = y * W + x
    const list = out.get(v)
    if (list) list.push(dir)
    else out.set(v, [dir])
  }
  const isIn = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && inside(x, y)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!isIn(x, y)) continue
      if (!isIn(x, y - 1)) add(x, y, 0)
      if (!isIn(x + 1, y)) add(x + 1, y, 1)
      if (!isIn(x, y + 1)) add(x + 1, y + 1, 2)
      if (!isIn(x - 1, y)) add(x, y + 1, 3)
    }
  const step = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const
  const softCorner = (x: number, y: number) =>
    (isIn(x - 1, y - 1) && softAt(x - 1, y - 1)) ||
    (isIn(x, y - 1) && softAt(x, y - 1)) ||
    (isIn(x - 1, y) && softAt(x - 1, y)) ||
    (isIn(x, y) && softAt(x, y))
  const take = (v: number, prefer: number[]) => {
    const list = out.get(v)
    if (!list?.length) return -1
    for (const d of prefer) {
      const k = list.indexOf(d)
      if (k >= 0) {
        list.splice(k, 1)
        return d
      }
    }
    return list.shift()!
  }
  const loops: Loop[] = []
  for (const [start, list] of out) {
    while (list.length) {
      const first = list.shift()!
      let v = start
      let dir = first
      const corners: number[] = []
      const dirs: number[] = []
      for (let guard = 0; guard < W * (rows + 1) * 4; guard++) {
        corners.push(v)
        dirs.push(dir)
        const x = (v % W) + step[dir]![0]
        const y = Math.floor(v / W) + step[dir]![1]
        v = y * W + x
        // A pinch (two ways on): turn right, towards the inside, to keep regions apart.
        const prefer = [(dir + 1) % 4, dir, (dir + 3) % 4]
        if (v === start) {
          // Back at the start: the loop closes when the turn rule picks the edge we began with.
          const left = out.get(v) ?? []
          const choice = prefer.find((d) => d === first || left.includes(d))
          if (choice === undefined || choice === first) break
          left.splice(left.indexOf(choice), 1)
          dir = choice
          continue
        }
        const next = take(v, prefer)
        if (next < 0) break
        dir = next
      }
      // Drop straight-through corners: only turns are corners of the outline.
      const points: number[] = []
      const soft: number[] = []
      const n = corners.length
      for (let i = 0; i < n; i++) {
        const before = dirs[(i - 1 + n) % n]
        const x = corners[i]! % W
        const y = Math.floor(corners[i]! / W)
        const s = softCorner(x, y)
        if (before === dirs[i] && !s) continue
        points.push(x, y)
        soft.push(s ? 1 : 0)
      }
      if (points.length >= 6) loops.push({ points, soft })
    }
  }
  return loops
}

/**
 * Rounds the soft corners: a little jitter for living rock, relaxation that melts stair steps
 * into slopes, then corner cutting. Sharp corners stay exactly where they are.
 */
export function smoothLoop(loop: Loop, iterations = 3, jitter = 0, seed = 0, relax = 0): number[] {
  let pts = loop.points.slice()
  let soft = loop.soft.slice()
  const count = soft.length
  for (let r = 0; r < relax; r++) {
    const next = pts.slice()
    for (let i = 0; i < count; i++) {
      if (!soft[i]) continue
      const p = (i - 1 + count) % count
      const q = (i + 1) % count
      next[i * 2] = pts[i * 2]! * 0.5 + (pts[p * 2]! + pts[q * 2]!) * 0.25
      next[i * 2 + 1] = pts[i * 2 + 1]! * 0.5 + (pts[p * 2 + 1]! + pts[q * 2 + 1]!) * 0.25
    }
    pts = next
  }
  if (jitter > 0)
    for (let i = 0; i < soft.length; i++) {
      if (!soft[i]) continue
      const x = pts[i * 2]!
      const y = pts[i * 2 + 1]!
      pts[i * 2] = x + (hash01(x * 7, y * 13, seed) - 0.5) * jitter
      pts[i * 2 + 1] = y + (hash01(x * 11, y * 5, seed + 1) - 0.5) * jitter
    }
  for (let it = 0; it < iterations; it++) {
    const next: number[] = []
    const nextSoft: number[] = []
    const n = soft.length
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2]!
      const y = pts[i * 2 + 1]!
      if (!soft[i]) {
        next.push(x, y)
        nextSoft.push(0)
        continue
      }
      const p = (i - 1 + n) % n
      const q = (i + 1) % n
      next.push(x + (pts[p * 2]! - x) * 0.25, y + (pts[p * 2 + 1]! - y) * 0.25)
      next.push(x + (pts[q * 2]! - x) * 0.25, y + (pts[q * 2 + 1]! - y) * 0.25)
      nextSoft.push(1, 1)
    }
    pts = next
    soft = nextSoft
  }
  return pts
}

/** Signed area of a loop (positive: clockwise on screen). */
export function loopArea(points: number[]) {
  let a = 0
  const n = points.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += points[i * 2]! * points[j * 2 + 1]! - points[j * 2]! * points[i * 2 + 1]!
  }
  return a / 2
}
