import {
  densityFactor,
  distances,
  emptyMap,
  Grid,
  N8,
  noise,
  partition,
  reach,
  rng,
  route,
  runsOf,
  subRng,
  T,
  unpinch,
  walkable,
  type GeneratedLine,
  type GeneratedMap,
  type GeneratedNote,
  type GeneratedProp,
  type GeneratedRoom,
  type GeneratedTree,
  type GeneratorOptions,
  type NoteKey,
  type Rng,
  type Tile,
} from './core'

// RYT-063 caves and forests (map-doctrine.md). Caves: caverns as overlapping lobes with a ragged
// rim, joined by winding tunnels (A* over noise), smoothed, one mouth to the outside; each cavern is
// a reveal area. Forests: clearings with a purpose strung on a trail, trees spaced like a wood
// (dart throwing), a stream crossed at a bridge.

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Zones of a few squares across, for revealing open ground piece by piece. */
function zones(grid: Grid, prefix: string, size: [number, number], inZone: (t: Tile) => boolean) {
  const rooms: GeneratedRoom[] = []
  const [zw, zh] = size
  let n = 0
  for (let y0 = 0; y0 < grid.rows; y0 += zh)
    for (let x0 = 0; x0 < grid.cols; x0 += zw) {
      const inside = (x: number, y: number) =>
        x >= x0 && x < x0 + zw && y >= y0 && y < y0 + zh && inZone(grid.get(x, y))
      let count = 0
      for (let x = x0; x < x0 + zw; x++)
        for (let y = y0; y < y0 + zh; y++) if (inside(x, y)) count++
      if (count < 6) continue
      n++
      rooms.push({ id: `${prefix}${n}`, rects: runsOf(grid.cols, grid.rows, inside) })
    }
  return rooms
}

class Placer {
  readonly props: GeneratedProp[] = []
  readonly taken = new Set<string>()
  readonly grid: Grid
  constructor(grid: Grid) {
    this.grid = grid
  }
  place(
    prop: string,
    x: number,
    y: number,
    w = 1,
    h = 1,
    rotation = 0,
    ground: (t: Tile) => boolean = walkable,
  ) {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++)
        if (this.taken.has(`${i}:${j}`) || !ground(this.grid.get(i, j)) || !this.grid.inside(i, j))
          return false
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) this.taken.add(`${i}:${j}`)
    this.props.push({ prop, x, y, w, h, rotation })
    return true
  }
  scatter(
    random: Rng,
    count: number,
    pool: string[],
    where: (x: number, y: number) => boolean,
    turn = true,
  ) {
    for (let n = 0, tries = 0; n < count && tries < count * 25; tries++) {
      const x = random.int(1, this.grid.cols - 2)
      const y = random.int(1, this.grid.rows - 2)
      if (!where(x, y)) continue
      if (this.place(random.pick(pool), x, y, 1, 1, turn ? random.int(0, 3) * 90 : 0)) n++
    }
  }
}

/** The open square nearest to (x, y). */
function nearestOpen(grid: Grid, x: number, y: number, open: (t: Tile) => boolean) {
  let best = -1
  let bestD = Infinity
  for (let j = 0; j < grid.rows; j++)
    for (let i = 0; i < grid.cols; i++) {
      if (!open(grid.get(i, j))) continue
      const d = (i - x) ** 2 + (j - y) ** 2
      if (d < bestD) {
        bestD = d
        best = j * grid.cols + i
      }
    }
  return best
}

/** Spanning tree on distance plus one loop, as index pairs. */
function joinPoints(points: { x: number; y: number }[], loop: boolean) {
  const edges: [number, number][] = []
  const joined = new Set([0])
  while (joined.size < points.length) {
    let best: [number, number, number] | null = null
    for (const i of joined)
      for (let j = 0; j < points.length; j++) {
        if (joined.has(j)) continue
        const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)
        if (!best || d < best[2]) best = [i, j, d]
      }
    joined.add(best![1])
    edges.push([best![0], best![1]])
  }
  if (loop && points.length >= 4) {
    let best: [number, number, number] | null = null
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        if (edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) continue
        const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)
        if (!best || d < best[2]) best = [i, j, d]
      }
    if (best) edges.push([best[0], best[1]])
  }
  return edges
}

/** A cave: caverns joined by winding tunnels, one mouth, pools or an underground lake. */
export function cave(options: GeneratorOptions): GeneratedMap {
  const random = rng(options.seed)
  const variant = subRng(options.seed, 3).chance(0.35) ? 'lake' : 'caverns'
  const { cols, rows } = options
  const factor = densityFactor[options.density]
  const open = new Uint8Array(cols * rows)
  const inner = (x: number, y: number) => x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1
  const mark = (x: number, y: number) => {
    if (inner(x, y)) open[y * cols + x] = 1
  }
  const count = clamp(Math.round(((cols * rows) / 170) * factor), 3, 9)
  const minD = Math.sqrt((cols * rows) / count) * 0.72
  const rBase = clamp(minD * 0.33, 2.2, 6)
  const centres: { x: number; y: number }[] = []
  for (let tries = 0; tries < 600 && centres.length < count; tries++) {
    const x = random.int(3, cols - 4)
    const y = random.int(3, rows - 4)
    if (centres.every((c) => Math.hypot(c.x - x, c.y - y) >= minD)) centres.push({ x, y })
  }
  // Caverns: two to four lobes each, the rim roughened by noise.
  const rim = noise(options.seed + 5)
  for (const c of centres) {
    const lobes = random.int(2, 4)
    for (let l = 0; l < lobes; l++) {
      const ex = c.x + (random.next() - 0.5) * rBase * 1.3
      const ey = c.y + (random.next() - 0.5) * rBase
      const rx = rBase * (0.6 + random.next() * 0.6)
      const ry = rBase * (0.5 + random.next() * 0.5)
      for (let j = Math.floor(ey - ry - 2); j <= ey + ry + 2; j++)
        for (let i = Math.floor(ex - rx - 2); i <= ex + rx + 2; i++) {
          const v = ((i + 0.5 - ex) / rx) ** 2 + ((j + 0.5 - ey) / ry) ** 2
          if (v <= 1 + (rim(i / 2.5, j / 2.5) - 0.5) * 0.8) mark(i, j)
        }
    }
  }
  // Tunnels: A* over noisy rock so they wander, carved as discs of changing width.
  const wander = noise(options.seed + 9)
  const width = noise(options.seed + 13)
  const tunnels: number[][] = []
  const carveAlong = (path: number[], scale = 1) => {
    path.forEach((cell, t) => {
      const x = cell % cols
      const y = (cell - x) / cols
      const r = (0.6 + width(t / 5, x / 9) * 0.75) * scale
      for (let j = Math.floor(y - r); j <= y + r; j++)
        for (let i = Math.floor(x - r); i <= x + r; i++)
          if ((i - x) ** 2 + (j - y) ** 2 <= r * r + 0.1) mark(i, j)
    })
  }
  const tunnelCost = (n: number) => {
    const x = n % cols
    const y = (n - x) / cols
    if (!inner(x, y) || x < 2 || y < 2 || x > cols - 3 || y > rows - 3) return Infinity
    return open[n] ? 0.6 : 1 + wander(x / 4, y / 4) * 4
  }
  const centreCell = (c: { x: number; y: number }) => c.y * cols + c.x
  for (const [a, b] of joinPoints(centres, true)) {
    const path = route(
      cols,
      rows,
      [0, 1, 2, 3].map((heading) => ({ index: centreCell(centres[a]!), heading })),
      new Set([centreCell(centres[b]!)]),
      tunnelCost,
      0.6,
    )
    if (!path) continue
    tunnels.push(path)
    carveAlong(path)
  }
  // The mouth: from the cavern nearest an edge out to that edge.
  const edgeDistance = (c: { x: number; y: number }) =>
    Math.min(c.x, c.y, cols - 1 - c.x, rows - 1 - c.y)
  const mouthIndex = centres.reduce(
    (best, c, i) => (edgeDistance(c) < edgeDistance(centres[best]!) ? i : best),
    0,
  )
  const m = centres[mouthIndex]!
  const mouthSide = [m.y, cols - 1 - m.x, rows - 1 - m.y, m.x].indexOf(edgeDistance(m))
  const [mx, my] = [
    [m.x, 0],
    [cols - 1, m.y],
    [m.x, rows - 1],
    [0, m.y],
  ][mouthSide]! as [number, number]
  // Smoothing: fill notches, drop spurs.
  for (let pass = 0; pass < 2; pass++) {
    const next = open.slice()
    for (let y = 1; y < rows - 1; y++)
      for (let x = 1; x < cols - 1; x++) {
        let n = 0
        for (const [dx, dy] of N8) n += open[(y + dy) * cols + x + dx]!
        const i = y * cols + x
        if (!open[i] && n >= 5) next[i] = 1
        else if (open[i] && n <= 1) next[i] = 0
      }
    open.set(next)
  }
  // The mouth tunnel after smoothing, so it reaches the very edge.
  let x = m.x
  let y = m.y
  const mouth: number[] = []
  while (x !== mx || y !== my) {
    x += Math.sign(mx - x)
    y += Math.sign(my - y)
    mouth.push(y * cols + x)
  }
  for (const c of mouth) {
    const cx = c % cols
    const cy = (c - cx) / cols
    open[c] = 1
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const)
      if (cx + dx < cols && cy + dy < rows && (mouthSide % 2 ? dy : dx))
        open[(cy + dy) * cols + cx + dx] = 1
  }
  const grid = new Grid(cols, rows)
  open.forEach((v, i) => {
    if (v) grid.tiles[i] = T.floor
  })
  unpinch(grid, (t) => t !== T.rock, T.floor)
  // Keep the cave the mouth opens into; fill small enclosed rock specks.
  const mouthCell = my * cols + mx
  const kept = reach(grid, mx, my)
  for (let i = 0; i < cols * rows; i++) if (!kept[i]) grid.tiles[i] = T.rock
  const outside = distances(grid, [0], (t) => t === T.rock)
  for (let i = 0; i < cols * rows; i++)
    if (grid.tiles[i] === T.rock && outside[i] === -1) {
      // A pocket of rock surrounded by floor: keep big pillars, fill specks.
      const x0 = i % cols
      const y0 = (i - x0) / cols
      let around = 0
      for (const [dx, dy] of N8) if (grid.get(x0 + dx, y0 + dy) === T.rock) around++
      if (around <= 2) grid.tiles[i] = T.floor
    }
  // Water: pools away from the walls, or a lake in the widest cavern.
  const wall = distances(
    grid,
    Array.from(grid.tiles.keys()).filter((i) => grid.tiles[i] === T.rock),
    () => true,
  )
  const pond = noise(options.seed + 7)
  const before = grid.tiles.slice()
  for (let j = 2; j < rows - 2; j++)
    for (let i = 2; i < cols - 2; i++) {
      const c = j * cols + i
      if (grid.tiles[c] !== T.floor || mouth.includes(c)) continue
      const v = pond(i / 6, j / 6)
      if (
        variant === 'lake'
          ? wall[c]! >= 3 && v > 0.32
          : wall[c]! >= 2 && v > 0.8 - (factor - 1) * 0.05
      )
        grid.tiles[c] = T.water
    }
  const seeds = centres.map((c) => nearestOpen(grid, c.x, c.y, walkable))
  const reached = reach(grid, mx, my)
  if (seeds.some((s) => s >= 0 && !reached[s])) grid.tiles.set(before)
  else
    // An island cut off by the lake becomes part of it.
    for (let i = 0; i < cols * rows; i++)
      if (grid.tiles[i] === T.floor && !reached[i]) grid.tiles[i] = T.water
  const map = emptyMap(options, grid)
  for (let i = 0; i < cols * rows; i++) if (grid.tiles[i] !== T.rock) map.soft[i] = 1

  // Each cavern is a reveal area; the tunnels go to the nearest one.
  const parts = partition(grid, seeds, (t) => t !== T.rock)
  const rooms: GeneratedRoom[] = []
  parts.forEach((rects, k) => {
    if (rects.length && rects.length <= 400) rooms.push({ id: `c${k + 1}`, rects })
  })
  const steps = distances(grid, [mouthCell])
  const order = seeds
    .map((s, k) => ({ s, k, d: s >= 0 ? steps[s]! : -1 }))
    .filter((o) => o.s >= 0)
    .sort((a, b) => a.d - b.d)
  const entrance = order[0]
  const lair = order.at(-1)
  const camp = order.length >= 3 ? order[Math.floor(order.length / 2)] : undefined
  for (const [o, role] of [
    [entrance, 'entrance'],
    [lair, 'lair'],
    [camp, 'camp'],
  ] as const) {
    const room = o && rooms.find((r) => r.id === `c${o.k + 1}`)
    if (room && !room.role) room.role = role
  }

  const p = new Placer(grid)
  for (const c of mouth.slice(-3)) p.taken.add(`${c % cols}:${Math.floor(c / cols)}`)
  const nearWall = (x: number, y: number) => grid.get(x, y) === T.floor && wall[y * cols + x] === 1
  const nearWater = (x: number, y: number) =>
    grid.get(x, y) === T.floor && N8.some(([dx, dy]) => grid.get(x + dx, y + dy) === T.water)
  const floorCount = grid.tiles.filter((t) => t === T.floor).length
  p.scatter(
    random,
    Math.round((floorCount / 42) * factor),
    ['stalagmite', 'rock', 'stalagmite', 'rubble'],
    nearWall,
  )
  p.scatter(
    random,
    Math.round((floorCount / 160) * factor) + 1,
    ['mushrooms'],
    (x, y) => nearWater(x, y) || (nearWall(x, y) && random.chance(0.3)),
  )
  const notes: GeneratedNote[] = []
  const at = (o: { s: number } | undefined, key: NoteKey, props: [string, number, number][]) => {
    if (!o) return
    const cx = o.s % cols
    const cy = (o.s - cx) / cols
    for (const [prop, dx, dy] of props) p.place(prop, cx + dx, cy + dy, prop === 'log' ? 2 : 1, 1)
    notes.push({ key, x: cx, y: cy })
  }
  at(lair, 'lair', [
    ['bones', 1, 0],
    ['bones', -1, 1],
    ['chest', 0, -1],
    ['coins', 1, -1],
  ])
  if (camp && camp !== lair)
    at(camp, 'camp', [
      ['campfire', 1, 0],
      ['log', 1, 1],
      ['bones', -1, -1],
    ])
  const mouthInside = mouth[Math.max(0, mouth.length - 3)] ?? mouthCell
  notes.push({ key: 'entrance', x: mouthInside % cols, y: Math.floor(mouthInside / cols) })
  if (options.traps)
    for (const path of tunnels.slice(0, 2)) {
      const c = path[Math.floor(path.length / 2)]!
      if (grid.tiles[c] === T.floor)
        notes.push({ key: 'trap', x: c % cols, y: Math.floor(c / cols) })
    }
  return { ...map, variant, rooms, props: p.props, notes }
}

/** Catmull-Rom through the points, sampled every half square. */
function spline(points: [number, number][]) {
  const out: [number, number][] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(points.length - 1, i + 2)]!
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 2))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(points.at(-1)!)
  return out
}

/** Paints the squares within `half` of a polyline. */
function stroke(
  grid: Grid,
  line: [number, number][],
  half: number,
  tile: Tile,
  keep?: (t: Tile) => boolean,
) {
  const cells = new Set<number>()
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!
    const [bx, by] = line[i + 1]!
    for (let y = Math.floor(Math.min(ay, by) - half - 1); y <= Math.max(ay, by) + half + 1; y++)
      for (let x = Math.floor(Math.min(ax, bx) - half - 1); x <= Math.max(ax, bx) + half + 1; x++) {
        if (!grid.inside(x, y)) continue
        const px = x + 0.5
        const py = y + 0.5
        const dx = bx - ax
        const dy = by - ay
        const len = dx * dx + dy * dy || 1
        const t = clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1)
        if (Math.hypot(px - ax - dx * t, py - ay - dy * t) <= half) cells.add(y * grid.cols + x)
      }
  }
  for (const c of cells) if (!keep?.(grid.tiles[c] as Tile)) grid.tiles[c] = tile
  return cells
}

type Place = 'camp' | 'stones' | 'shrine' | 'woodcutters' | 'pond'

/** A forest: clearings with a purpose on a winding trail, a wood spaced like trees grow. */
export function forest(options: GeneratorOptions): GeneratedMap {
  const random = rng(options.seed)
  const variant = subRng(options.seed, 3).chance(0.6) ? 'stream' : 'deepwoods'
  const { cols, rows } = options
  const factor = densityFactor[options.density]
  const grid = new Grid(cols, rows, T.grass)
  const along = cols >= rows
  const L = along ? cols : rows
  const A = along ? rows : cols
  const pt = (u: number, v: number): [number, number] => (along ? [u, v] : [v, u])
  const count = clamp(Math.round(((cols * rows) / 300) * (0.8 + 0.2 * factor)), 2, 5)
  const kinds: Place[] = ['camp', ...(['stones', 'shrine', 'woodcutters', 'pond'] as const)]
  for (let i = kinds.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(random.next() * i)
    ;[kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!]
  }
  const scale = clamp(Math.min(cols, rows) / 22, 0.75, 1.5)
  const clearings = Array.from({ length: count }, (_, i) => {
    const u = ((i + 0.5) / count) * L + (random.next() - 0.5) * (L / count) * 0.4
    const v = A * (0.28 + random.next() * 0.44)
    const [x, y] = pt(clamp(u, 4, L - 5), clamp(v, 4, A - 5))
    return {
      x,
      y,
      rx: (2.8 + random.next() * 1.6) * scale,
      ry: (2.4 + random.next() * 1.3) * scale,
      kind: kinds[i % kinds.length]!,
      off: false,
    }
  })
  // One place off the trail when there are several: found by those who look (a deer track).
  if (count >= 3) clearings[1 + random.int(0, count - 2)]!.off = true
  const inClearing = (c: (typeof clearings)[number], x: number, y: number, grow = 0) =>
    ((x + 0.5 - c.x) / (c.rx + grow)) ** 2 + ((y + 0.5 - c.y) / (c.ry + grow)) ** 2 <= 1
  const inAny = (x: number, y: number, grow = 0) => clearings.some((c) => inClearing(c, x, y, grow))

  // The trail: edge to edge through the clearings, wandering a little.
  const drift = noise(options.seed + 21)
  const waypoints: [number, number][] = [
    pt(0, (along ? clearings[0]!.y : clearings[0]!.x) + random.int(-2, 2)),
  ]
  for (const c of clearings) {
    const [u, v] = along ? [c.x, c.y] : [c.y, c.x]
    waypoints.push(pt(u, c.off ? clamp(v + (v < A / 2 ? 1 : -1) * (c.ry + 3), 2, A - 3) : v))
  }
  const last = clearings.at(-1)!
  waypoints.push(pt(L - 1, (along ? last.y : last.x) + random.int(-2, 2)))
  const trail = spline(waypoints).map(([x, y], i): [number, number] => {
    const w = (drift(i / 9, 0.5) - 0.5) * 1.6
    return along ? [x, clamp(y + w, 1.5, rows - 2.5)] : [clamp(x + w, 1.5, cols - 2.5), y]
  })
  const lines: GeneratedLine[] = [{ kind: 'path', width: 2, points: trail }]
  stroke(grid, trail, 1.05, T.path)
  // Spurs: a narrow track to each place off the trail.
  for (const c of clearings.filter((k) => k.off)) {
    let best: [number, number] = trail[0]!
    for (const q of trail)
      if (Math.hypot(q[0] - c.x, q[1] - c.y) < Math.hypot(best[0] - c.x, best[1] - c.y)) best = q
    const spur = spline([best, [(best[0] + c.x) / 2 + 1, (best[1] + c.y) / 2], [c.x, c.y]])
    lines.push({ kind: 'path', width: 1, points: spur })
    stroke(grid, spur, 0.55, T.path)
  }
  // A stream across the trail, crossed at a bridge.
  const props = new Placer(grid)
  if (variant === 'stream') {
    const gaps = clearings.slice(1).map((c, i) => {
      const a = along ? clearings[i]!.x + clearings[i]!.rx : clearings[i]!.y + clearings[i]!.ry
      const b = along ? c.x - c.rx : c.y - c.ry
      return { at: (a + b) / 2, size: b - a }
    })
    const gap = gaps.sort((a, b) => b.size - a.size)[0]
    const u0 = gap && gap.size > 2 ? gap.at : L * (0.3 + random.next() * 0.4)
    const phase = random.next() * Math.PI * 2
    const water: [number, number][] = []
    for (let v = -1; v <= A + 1; v += 0.5) {
      const u = u0 + Math.sin(v / 4 + phase) * 1.8 + (drift(v / 5, 3) - 0.5) * 2
      water.push(pt(u, v))
    }
    lines.push({ kind: 'water', width: 2.2, points: water })
    const wet = stroke(grid, water, 1.1, T.water, (t) => t === T.path)
    const crossing = [...wet].find((c) => grid.tiles[c] === T.path)
    if (crossing !== undefined) {
      const cx = crossing % cols
      const cy = (crossing - cx) / cols
      const bx = clamp(along ? cx - 1 : cx, 0, cols - 2)
      const by = clamp(along ? cy : cy - 1, 0, rows - 2)
      props.place('bridge', bx, by, 2, 2, along ? 0 : 90, () => true)
    }
  }
  // Ponds belong to their place.
  for (const c of clearings.filter((k) => k.kind === 'pond')) {
    const px = c.x + c.rx * 0.25
    const py = c.y + c.ry * 0.1
    for (let y = Math.floor(py - 3); y <= py + 3; y++)
      for (let x = Math.floor(px - 3); x <= px + 3; x++)
        if (
          grid.get(x, y) === T.grass &&
          ((x + 0.5 - px) / (c.rx * 0.45)) ** 2 + ((y + 0.5 - py) / (c.ry * 0.45)) ** 2 <= 1
        )
          grid.set(x, y, T.water)
  }

  // Trees: dart throwing with a minimum spacing; groves where the noise is high.
  const grove = noise(options.seed + 31)
  const spacing = options.density === 'dense' ? 1.55 : options.density === 'sparse' ? 2.6 : 1.95
  const trees: GeneratedTree[] = []
  const bucket = new Map<string, GeneratedTree[]>()
  const key = (x: number, y: number) => `${Math.floor(x / 3)}:${Math.floor(y / 3)}`
  const clearOf = (x: number, y: number, r: number) => {
    for (let j = Math.floor(y - r); j <= y + r; j++)
      for (let i = Math.floor(x - r); i <= x + r; i++) {
        const t = grid.get(i, j)
        if (grid.inside(i, j) && (t === T.path || t === T.water)) return false
      }
    return true
  }
  const order = Array.from({ length: cols * rows }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  for (const cell of order) {
    const cx = cell % cols
    const cy = (cell - cx) / cols
    if (!random.chance(0.35 + grove(cx / 7, cy / 7) * 0.65)) continue
    const x = cx + 0.2 + random.next() * 0.6
    const y = cy + 0.2 + random.next() * 0.6
    if (inAny(cx, cy, 0.8) || !clearOf(x, y, 1.2)) continue
    let ok = true
    for (let bx = -1; bx <= 1 && ok; bx++)
      for (let by = -1; by <= 1 && ok; by++)
        for (const t of bucket.get(`${Math.floor(x / 3) + bx}:${Math.floor(y / 3) + by}`) ?? [])
          if (Math.hypot(t.x - x, t.y - y) < spacing) {
            ok = false
            break
          }
    if (!ok) continue
    // Full crowns frame the edges; inside, smaller ones leave ground for miniatures.
    const edge = Math.min(x, y, cols - x, rows - y) < 3
    const tree = {
      x,
      y,
      r: edge
        ? spacing * (0.42 + random.next() * 0.28) + 0.25
        : spacing * (0.3 + random.next() * 0.14) + 0.2,
    }
    trees.push(tree)
    const k = key(x, y)
    const list = bucket.get(k)
    if (list) list.push(tree)
    else bucket.set(k, [tree])
    grid.set(cx, cy, T.tree)
  }

  // The places themselves.
  const notes: GeneratedNote[] = []
  const flat = (x: number, y: number) => grid.get(x, y) === T.grass
  clearings.forEach((c) => {
    const x = Math.floor(c.x)
    const y = Math.floor(c.y)
    switch (c.kind) {
      case 'camp':
        props.place('campfire', x, y - 1)
        props.place('tent', x + 2, y - 3, 2, 2)
        props.place('log', x - 2, y - 1, 2, 1)
        props.place('log', x, y + 1, 2, 1)
        break
      case 'stones':
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2
          props.place('rock', Math.round(x + Math.cos(a) * 2.2), Math.round(y + Math.sin(a) * 2))
        }
        props.place('altar', x, y, 2, 1)
        break
      case 'shrine':
        props.place('statue', x, y - 1)
        props.place('altar', x, y, 2, 1)
        props.place('candles', x - 1, y)
        props.place('candles', x + 2, y)
        break
      case 'woodcutters':
        for (const [dx, dy] of [
          [-2, -1],
          [1, -2],
          [2, 1],
        ] as const)
          props.place('stump', x + dx, y + dy)
        props.place('log', x - 1, y + 1, 2, 1)
        props.place('cart', x + 1, y, 2, 1)
        break
      case 'pond':
        props.scatter(
          random,
          3,
          ['flowers', 'bush'],
          (px, py) => flat(px, py) && inClearing(c, px, py),
        )
        break
    }
    notes.push({ key: c.kind, x, y })
  })
  // Undergrowth: bushes where the trees thin out, rocks, stumps, flowers at the clearing edges.
  const besideTree = (x: number, y: number) =>
    flat(x, y) && N8.some(([dx, dy]) => grid.get(x + dx, y + dy) === T.tree)
  props.scatter(
    random,
    Math.round(((cols * rows) / 55) * factor),
    ['bush', 'bush', 'stump', 'rock', 'mushrooms'],
    (x, y) => besideTree(x, y) && !inAny(x, y),
  )
  props.scatter(
    random,
    count * 3,
    ['flowers'],
    (x, y) => flat(x, y) && inAny(x, y, 0.6) && !inAny(x, y, -0.8),
  )

  const map = emptyMap(options, grid)
  for (let i = 0; i < cols * rows; i++)
    if (grid.tiles[i] === T.water || grid.tiles[i] === T.path) map.soft[i] = 1
  const rooms: GeneratedRoom[] = clearings.map((c, i) => ({
    id: `c${i + 1}`,
    rects: runsOf(cols, rows, (x, y) => inClearing(c, x, y)),
    role: c.kind === 'camp' ? ('camp' as const) : ('place' as const),
  }))
  // Woods zones count only ground reached from the trail; pockets closed in by trees stay out.
  const start = trail[0]!
  const reached = reach(
    grid,
    clamp(Math.floor(start[0]), 0, cols - 1),
    clamp(Math.floor(start[1]), 0, rows - 1),
  )
  const reachable = new Grid(cols, rows)
  reached.forEach((v, i) => {
    if (v && !inAny(i % cols, Math.floor(i / cols))) reachable.tiles[i] = T.grass
  })
  rooms.push(
    ...zones(
      reachable,
      'w',
      [Math.max(6, Math.round(cols / 3)), Math.max(5, Math.round(rows / 2))],
      walkable,
    ),
  )
  return { ...map, variant, rooms, props: props.props, notes, trees, lines }
}
