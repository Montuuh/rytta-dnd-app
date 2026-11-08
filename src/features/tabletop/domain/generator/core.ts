import { doorSquares } from '../geometry'

// ADR 032 map generator: seeded, deterministic and original. Positions are in squares.
// Generator v2 (RYT-063) follows the map doctrine in docs/map-doctrine.md: loops, a way in, a goal,
// rooms with a purpose, readable walls. Techniques are public (see docs/research.md); code is Rytta's.

export const mapKinds = ['dungeon', 'crypt', 'cave', 'forest', 'tavern'] as const
export type MapKind = (typeof mapKinds)[number]
export const mapLooks = ['ink', 'painted'] as const
export type MapLook = (typeof mapLooks)[number]
export const densities = ['sparse', 'normal', 'dense'] as const
export type Density = (typeof densities)[number]
/**
 * v2 lays out new maps for old seeds; v3 (RYT-068) adds themes and furnishes rooms with the new
 * props. Stored scenes keep their painted map.
 */
export const generatorVersion = 3

/**
 * RYT-068: what a place is built of. The first theme of each kind is its default. A theme changes
 * the painted materials (floors, walls, water, decals, light) and part of the furniture or plants.
 */
export const mapThemes = {
  dungeon: ['stone', 'ruins', 'temple', 'sandstone', 'dwarven', 'ice', 'volcanic'],
  crypt: ['crypt', 'mossy', 'marble'],
  cave: ['rock', 'damp', 'crystal', 'ice', 'volcanic'],
  forest: ['forest', 'autumn', 'meadow', 'swamp', 'winter'],
  tavern: ['oak', 'walnut', 'winter'],
} as const satisfies Record<MapKind, readonly string[]>
export type MapTheme = (typeof mapThemes)[MapKind][number]

/** The theme a map uses: the one asked for when the kind has it, else the kind's default. */
export const themeOf = (kind: MapKind, theme?: string | null): MapTheme => {
  const list: readonly string[] = mapThemes[kind]
  return (theme && list.includes(theme) ? theme : list[0]) as MapTheme
}

export interface GeneratorOptions {
  kind: MapKind
  look: MapLook
  /** RYT-068; missing on v2 recipes, which read as the kind's default theme. */
  theme?: MapTheme
  cols: number
  rows: number
  seed: number
  density: Density
  /** Dungeon and crypt: some loop doors and hidden rooms become secret. */
  secret: boolean
  /** Dungeon: corridors two squares wide. */
  wide: boolean
  /** Underground maps: DM notes where a trap fits (in front of the goal, in long passages). */
  traps?: boolean
}

/** Tiles: what each square is made of. Doors and props are items, not tiles. */
export const T = {
  rock: 0,
  floor: 1,
  water: 2,
  path: 3,
  grass: 4,
  tree: 5,
  plank: 6,
  /** A passage between rooms (painted as slabs, revealed with its doors). */
  corridor: 7,
} as const
export type Tile = (typeof T)[keyof typeof T]

/** What a room is for; it decides its furniture and its DM note. */
export type RoomRole = 'entrance' | 'goal' | 'treasure' | 'lair' | 'camp' | 'place'
/** DM notes the generator leaves; the editor writes their text in the DM's language. */
export const noteKeys = [
  'entrance',
  'goal',
  'treasure',
  'trap',
  'lair',
  'camp',
  'stones',
  'shrine',
  'pond',
  'woodcutters',
  'cellar',
  'ossuary',
] as const
export type NoteKey = (typeof noteKeys)[number]
/** The layout a seed rolled, shown in the generator. */
export const mapVariants = ['nave', 'catacomb', 'caverns', 'lake', 'stream', 'deepwoods'] as const
export type MapVariant = (typeof mapVariants)[number]

export interface GeneratedDoor {
  x: number
  y: number
  rotation: 0 | 90
  secret: boolean
  locked?: boolean
  rooms: string[]
}
export interface GeneratedProp {
  prop: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
}
export interface GeneratedRoom {
  id: string
  rects: [number, number, number, number][]
  role?: RoomRole
  /** What the room is used for (store, library, kitchen…): the painter picks its floor by it. */
  use?: RoomUse
}
/** Room purposes the generators furnish (RYT-063/068). */
export type RoomUse =
  | 'store'
  | 'shrine'
  | 'library'
  | 'barracks'
  | 'ruin'
  | 'plain'
  | 'tomb'
  | 'ossuary'
  | 'lord'
  | 'armory'
  | 'forge'
  | 'kitchen'
  | 'prison'
  | 'study'
  | 'training'
  | 'throne'
  | 'hall'
  | 'cellar'
  | 'guest'
  | 'bath'
  | 'yard'
export interface GeneratedNote {
  key: NoteKey
  x: number
  y: number
}
/** A tree crown centred at (x, y); its trunk square is a tree tile. */
export interface GeneratedTree {
  x: number
  y: number
  r: number
}
/** Centre lines of trails and streams, so the painter draws them as smooth strokes. */
export interface GeneratedLine {
  kind: 'path' | 'water'
  width: number
  points: [number, number][]
}
export interface GeneratedMap {
  options: GeneratorOptions
  variant?: MapVariant
  tiles: Uint8Array
  /** 1 where the outline is drawn as a curve (caves, round rooms), 0 where it stays square. */
  soft: Uint8Array
  rooms: GeneratedRoom[]
  doors: GeneratedDoor[]
  props: GeneratedProp[]
  notes: GeneratedNote[]
  trees: GeneratedTree[]
  lines: GeneratedLine[]
}

/** mulberry32: a small, fast, seedable generator. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <V>(values: readonly V[]): V => values[Math.floor(next() * values.length)]!,
    chance: (p: number) => next() < p,
  }
}
export type Rng = ReturnType<typeof rng>

/** An independent stream for one concern (variant, traps): adding to it never moves the layout. */
export function subRng(seed: number, salt: number) {
  // murmur3's finalizer: neighbouring seeds land far apart.
  const mix = (h: number) => {
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return h >>> 0
  }
  return rng(mix(mix(seed >>> 0) ^ Math.imul(salt + 1, 0x9e3779b9)))
}

/** Integer hash in [0, 1) for a square: stable jitter without consuming a stream. */
export function hash01(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise in [0, 1) for a seed, sampled at fractional squares. */
export function noise(seed: number) {
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = smooth(x - xi)
    const fy = smooth(y - yi)
    const a = hash01(xi, yi, seed)
    const b = hash01(xi + 1, yi, seed)
    const c = hash01(xi, yi + 1, seed)
    const d = hash01(xi + 1, yi + 1, seed)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
  }
}

export class Grid {
  readonly tiles: Uint8Array
  readonly cols: number
  readonly rows: number
  constructor(cols: number, rows: number, fill: Tile = T.rock) {
    this.cols = cols
    this.rows = rows
    this.tiles = new Uint8Array(cols * rows).fill(fill)
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows
  }
  get(x: number, y: number): Tile {
    return this.inside(x, y) ? (this.tiles[y * this.cols + x] as Tile) : T.rock
  }
  set(x: number, y: number, tile: Tile) {
    if (this.inside(x, y)) this.tiles[y * this.cols + x] = tile
  }
  fill(x: number, y: number, w: number, h: number, tile: Tile) {
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) this.set(i, j, tile)
  }
}

/** Squares a creature can stand on. */
export const walkable = (tile: Tile) =>
  tile === T.floor || tile === T.path || tile === T.grass || tile === T.plank || tile === T.corridor

export const N4 = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const
export const N8 = [...N4, [1, 1], [-1, 1], [-1, -1], [1, -1]] as const

/** Flood fill over walkable squares from a start; returns the reached squares as indexes. */
export function reach(grid: Grid, sx: number, sy: number, passable = walkable) {
  const seen = new Uint8Array(grid.cols * grid.rows)
  const queue = [sy * grid.cols + sx]
  if (!passable(grid.get(sx, sy))) return seen
  seen[queue[0]!] = 1
  while (queue.length) {
    const index = queue.pop()!
    const x = index % grid.cols
    const y = Math.floor(index / grid.cols)
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (!grid.inside(nx, ny)) continue
      const n = ny * grid.cols + nx
      if (!seen[n] && passable(grid.get(nx, ny))) {
        seen[n] = 1
        queue.push(n)
      }
    }
  }
  return seen
}

/** Breadth-first steps from a set of start squares over passable squares (-1: not reached). */
export function distances(grid: Grid, starts: number[], passable: (t: Tile) => boolean = walkable) {
  const dist = new Int32Array(grid.cols * grid.rows).fill(-1)
  const queue: number[] = []
  for (const s of starts) {
    if (dist[s] === -1) {
      dist[s] = 0
      queue.push(s)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!
    const x = i % grid.cols
    const y = (i - x) / grid.cols
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (!grid.inside(nx, ny)) continue
      const n = ny * grid.cols + nx
      if (dist[n] === -1 && passable(grid.get(nx, ny))) {
        dist[n] = dist[i]! + 1
        queue.push(n)
      }
    }
  }
  return dist
}

/**
 * RYT-068: the passage square just behind a secret door belongs to no reveal area. Revealing the
 * passage then shows its dead end and stops short of the door (the margin and the fog's blur reach
 * about 0.7 of a square), so nothing behind a secret door shows; revealing the room shows its wall
 * across the doorway. The DM's editor reveals that square once both sides are revealed.
 */
export function sealSecretDoors(
  rooms: GeneratedRoom[],
  doors: readonly GeneratedDoor[],
  cols: number,
  rows: number,
): GeneratedRoom[] {
  const sealed = new Map<string, Set<number>>()
  for (const door of doors) {
    if (!door.secret) continue
    const passage = rooms.find((r) => r.id === door.rooms[1])
    if (!passage) continue
    const cells = sealed.get(passage.id) ?? cellsOf(passage, cols)
    for (const [x, y] of doorSquares(door)) cells.delete(y * cols + x)
    sealed.set(passage.id, cells)
  }
  return rooms
    .map((room) => {
      const cells = sealed.get(room.id)
      return cells
        ? { ...room, rects: runsOf(cols, rows, (x, y) => cells.has(y * cols + x)) }
        : room
    })
    .filter((room) => room.rects.length > 0)
}

const cellsOf = (room: GeneratedRoom, cols: number) => {
  const cells = new Set<number>()
  for (const [x, y, w, h] of room.rects)
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) cells.add(j * cols + i)
  return cells
}

/** Row runs of the squares in a set, as rectangles (for rooms of irregular shape). */
export function runsOf(cols: number, rows: number, inSet: (x: number, y: number) => boolean) {
  const rects: [number, number, number, number][] = []
  for (let y = 0; y < rows; y++) {
    let start = -1
    for (let x = 0; x <= cols; x++) {
      const on = x < cols && inSet(x, y)
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        rects.push([start, y, x - start, 1])
        start = -1
      }
    }
  }
  // Merge equal runs on consecutive rows to keep the list short.
  const merged: [number, number, number, number][] = []
  for (const rect of rects) {
    const above = merged.find(
      (m) => m[0] === rect[0] && m[2] === rect[2] && m[1] + m[3] === rect[1],
    )
    if (above) above[3] += 1
    else merged.push([...rect])
  }
  return merged
}

/**
 * Splits floor into reveal areas: each square goes to the nearest seed by walking steps
 * (caverns, clearings). Returns one rect list per seed (empty when the seed reached nothing).
 */
export function partition(grid: Grid, seeds: number[], passable: (t: Tile) => boolean) {
  const owner = new Int32Array(grid.cols * grid.rows).fill(-1)
  const queue: number[] = []
  seeds.forEach((s, k) => {
    if (s >= 0 && owner[s] === -1 && passable(grid.tiles[s] as Tile)) {
      owner[s] = k
      queue.push(s)
    }
  })
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!
    const x = i % grid.cols
    const y = (i - x) / grid.cols
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (!grid.inside(nx, ny)) continue
      const n = ny * grid.cols + nx
      if (owner[n] === -1 && passable(grid.tiles[n] as Tile)) {
        owner[n] = owner[i]!
        queue.push(n)
      }
    }
  }
  return seeds.map((_, k) => runsOf(grid.cols, grid.rows, (x, y) => owner[y * grid.cols + x] === k))
}

/** Breaks squares that touch only at a corner (a checkerboard 2×2): they pinch the walls. */
export function unpinch(grid: Grid, open: (t: Tile) => boolean, fillWith: Tile) {
  for (let pass = 0; pass < 2; pass++)
    for (let y = 0; y < grid.rows - 1; y++)
      for (let x = 0; x < grid.cols - 1; x++) {
        const a = open(grid.get(x, y))
        const b = open(grid.get(x + 1, y))
        const c = open(grid.get(x, y + 1))
        const d = open(grid.get(x + 1, y + 1))
        if (a && d && !b && !c) grid.set(x + 1, y, fillWith)
        else if (b && c && !a && !d) grid.set(x, y, fillWith)
      }
}

/** A small binary heap keyed by priority. */
export class Heap {
  private readonly keys: number[] = []
  private readonly values: number[] = []
  get size() {
    return this.values.length
  }
  push(value: number, key: number) {
    const k = this.keys
    const v = this.values
    k.push(key)
    v.push(value)
    let i = v.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p]! <= k[i]!) break
      ;[k[p], k[i]] = [k[i]!, k[p]!]
      ;[v[p], v[i]] = [v[i]!, v[p]!]
      i = p
    }
  }
  pop() {
    const k = this.keys
    const v = this.values
    const top = v[0]!
    const lastK = k.pop()!
    const lastV = v.pop()!
    if (v.length) {
      k[0] = lastK
      v[0] = lastV
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < v.length && k[l]! < k[m]!) m = l
        if (r < v.length && k[r]! < k[m]!) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i]!, k[m]!]
        ;[v[m], v[i]] = [v[i]!, v[m]!]
        i = m
      }
    }
    return top
  }
}

/**
 * A* over (square, heading) states with a turn penalty, so passages run straight and bend
 * on purpose. `cost` returns the price of stepping onto a square (Infinity: blocked).
 */
export function route(
  cols: number,
  rows: number,
  starts: { index: number; heading: number }[],
  goals: Set<number>,
  cost: (index: number, heading: number) => number,
  turn = 3,
) {
  const states = cols * rows * 4
  const best = new Float64Array(states).fill(Infinity)
  const from = new Int32Array(states).fill(-1)
  const heap = new Heap()
  const goalList = [...goals]
  const h = (i: number) => {
    const x = i % cols
    const y = (i - x) / cols
    let m = Infinity
    for (const g of goalList) {
      const gx = g % cols
      const d = Math.abs(gx - x) + Math.abs((g - gx) / cols - y)
      if (d < m) m = d
    }
    return m * 0.5
  }
  for (const s of starts) {
    const state = s.index * 4 + s.heading
    best[state] = 0
    heap.push(state, h(s.index))
  }
  let found = -1
  for (let guard = 0; heap.size && guard < states * 2; guard++) {
    const state = heap.pop()
    const i = state >> 2
    const heading = state & 3
    if (goals.has(i)) {
      found = state
      break
    }
    const x = i % cols
    const y = (i - x) / cols
    for (let d = 0; d < 4; d++) {
      if (d === (heading + 2) % 4) continue
      const [dx, dy] = N4[d]!
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const n = ny * cols + nx
      const step = cost(n, d)
      if (!Number.isFinite(step)) continue
      const g = best[state]! + step + (d === heading ? 0 : turn)
      const next = n * 4 + d
      if (g < best[next]!) {
        best[next] = g
        from[next] = state
        heap.push(next, g + h(n))
      }
    }
  }
  if (found < 0) return null
  const path: number[] = []
  for (let s = found; s >= 0; s = from[s]!) path.push(s >> 2)
  return path.reverse()
}

export const densityFactor: Record<Density, number> = { sparse: 0.6, normal: 1, dense: 1.45 }

/** An empty map shell: kinds fill in what they use. */
export function emptyMap(options: GeneratorOptions, grid: Grid): GeneratedMap {
  return {
    options,
    tiles: grid.tiles,
    soft: new Uint8Array(grid.cols * grid.rows),
    rooms: [],
    doors: [],
    props: [],
    notes: [],
    trees: [],
    lines: [],
  }
}
