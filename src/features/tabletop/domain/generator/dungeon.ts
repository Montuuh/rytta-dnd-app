import {
  densityFactor,
  emptyMap,
  Grid,
  hash01,
  N8,
  rng,
  route,
  runsOf,
  sealSecretDoors,
  subRng,
  T,
  walkable,
  type GeneratedDoor,
  type GeneratedMap,
  type GeneratedNote,
  type GeneratedProp,
  type GeneratedRoom,
  type GeneratorOptions,
  type MapTheme,
  type Rng,
  type RoomRole,
  type RoomUse,
} from './core'

// RYT-063 dungeon and crypt. Rooms by size (a few large, mostly ordinary, some small), packed
// close; a spanning tree of passages plus loops that join distant parts (map-doctrine.md, "loops");
// passages found with A* and a turn penalty; an entrance by the edge, a goal at the far end,
// a hidden treasure in a dead end; furniture that faces the walls and says what each room is for.

type Shape = 'rect' | 'round' | 'hall'
/** A room's purpose (RoomUse); named theme before map themes existed. */
type Theme = RoomUse
interface Room {
  id: string
  index: number
  x: number
  y: number
  w: number
  h: number
  shape: Shape
  theme: Theme
  role?: RoomRole
}
/** 0 north, 1 east, 2 south, 3 west: the room wall a doorway opens in. */
type Side = 0 | 1 | 2 | 3
/** One step from wall `side` into the room. */
const inward: Record<Side, readonly [number, number]> = {
  0: [0, 1],
  1: [-1, 0],
  2: [0, -1],
  3: [1, 0],
}
/** How the goal of a dungeon is dressed (RYT-068). */
type GoalStyle = 'altar' | 'throne' | 'hoard'

/** Room purposes by map theme: what the builders of such a place would have needed. */
const usesByTheme: Record<string, Theme[]> = {
  stone: [
    'store',
    'shrine',
    'library',
    'barracks',
    'armory',
    'prison',
    'kitchen',
    'study',
    'training',
    'ruin',
    'plain',
  ],
  ruins: ['ruin', 'ruin', 'store', 'shrine', 'barracks', 'prison', 'plain'],
  temple: ['shrine', 'shrine', 'library', 'study', 'store', 'barracks', 'kitchen'],
  sandstone: ['shrine', 'store', 'library', 'ruin', 'armory', 'study', 'plain'],
  dwarven: ['forge', 'forge', 'armory', 'store', 'barracks', 'kitchen', 'training'],
  ice: ['store', 'ruin', 'barracks', 'shrine', 'prison', 'plain'],
  volcanic: ['forge', 'prison', 'shrine', 'store', 'ruin', 'armory'],
  crypt: ['tomb', 'tomb', 'tomb', 'ossuary', 'shrine', 'ruin'],
  mossy: ['tomb', 'tomb', 'ossuary', 'ruin', 'ruin', 'shrine'],
  marble: ['tomb', 'tomb', 'shrine', 'shrine', 'ossuary'],
}
const goalStyles: Record<string, GoalStyle[]> = {
  stone: ['throne', 'altar', 'hoard'],
  ruins: ['altar', 'hoard'],
  temple: ['altar', 'altar', 'throne'],
  sandstone: ['altar', 'hoard'],
  dwarven: ['throne', 'hoard'],
  ice: ['throne', 'hoard', 'altar'],
  volcanic: ['hoard', 'throne', 'altar'],
}
interface Doorway {
  room: number
  side: Side
  /** The passage squares touching the room. */
  cells: number[]
  passage: number
  loop: boolean
  exit: boolean
}

const inRoom = (r: Room, i: number, j: number) => {
  if (i < r.x || j < r.y || i >= r.x + r.w || j >= r.y + r.h) return false
  if (r.shape !== 'round') return true
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const rad = r.w / 2
  return (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= rad * rad
}
const centre = (r: Room) => [r.x + r.w / 2, r.y + r.h / 2] as const
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Rooms by a wish list, each placed where it packs well against the rooms already there. */
function placeRooms(options: GeneratorOptions, random: Rng, crypt: boolean, wide: boolean): Room[] {
  const { cols, rows } = options
  const factor = densityFactor[options.density]
  const area = cols * rows
  const target = clamp(Math.round((area / (crypt ? 78 : 96)) * factor), 4, 34)
  const maxW = Math.max(3, Math.min(11, Math.floor(cols / 3)))
  const maxH = Math.max(3, Math.min(9, Math.floor(rows / 3)))
  const big = target >= 6 ? (area >= 1400 ? 2 : 1) : 0
  const small = Math.round(target * (crypt ? 0.35 : 0.25))
  const wishes: { w: number; h: number; shape: Shape }[] = []
  const round = (w: number, h: number) => {
    const d = Math.min(w, h) % 2 ? Math.min(w, h) : Math.min(w, h) - 1
    return { w: d, h: d, shape: 'round' as const }
  }
  for (let n = 0; n < big; n++) {
    const w = random.int(Math.min(7, maxW), maxW)
    const h = random.int(Math.min(6, maxH), maxH)
    wishes.push(
      !wide && Math.min(w, h) >= 7 && random.chance(0.35) ? round(w, h) : { w, h, shape: 'hall' },
    )
  }
  for (let n = 0; n < target - big - small; n++) {
    const w = random.int(Math.min(4, maxW), Math.min(7, maxW))
    const h = random.int(Math.min(4, maxH), Math.min(6, maxH))
    wishes.push(
      !wide && Math.min(w, h) >= 5 && random.chance(crypt ? 0.25 : 0.15)
        ? round(w, h)
        : { w, h, shape: 'rect' },
    )
  }
  for (let n = 0; n < small; n++)
    wishes.push({
      w: random.int(3, Math.min(4, maxW)),
      h: random.int(3, Math.min(4, maxH)),
      shape: 'rect',
    })
  for (const gap of wide ? [4, 3] : [3, 2]) {
    const rooms: Room[] = []
    for (const first of wishes) {
      let best: { x: number; y: number } | null = null
      let bestScore = Infinity
      // A wish that does not fit shrinks a little before it is dropped.
      let wish = first
      for (let c = 0; c < 150; c++) {
        if (c === 100 && !best && wish.shape !== 'round' && wish.w > 3)
          wish = { ...wish, w: Math.max(3, wish.w - 2), h: Math.max(3, wish.h - 1) }
        const hiX = cols - wish.w - 2
        const hiY = rows - wish.h - 2
        if (hiX < 2 || hiY < 2) break
        const x = random.int(2, hiX)
        const y = random.int(2, hiY)
        let nearest = Infinity
        let ok = true
        for (const r of rooms) {
          const dx = Math.max(r.x - (x + wish.w), x - (r.x + r.w))
          const dy = Math.max(r.y - (y + wish.h), y - (r.y + r.h))
          const sep = Math.max(dx, dy)
          if (sep < gap) {
            ok = false
            break
          }
          nearest = Math.min(nearest, sep)
        }
        if (!ok) continue
        // Snug: about one passage away from a neighbour, never far out on its own.
        const score = rooms.length ? Math.abs(nearest - gap - 1) + random.next() * 3 : random.next()
        if (score < bestScore) {
          bestScore = score
          best = { x, y }
        }
      }
      if (best)
        rooms.push({
          id: '',
          index: 0,
          ...best,
          w: wish.w,
          h: wish.h,
          shape: wish.shape,
          theme: 'plain',
        })
    }
    if (rooms.length >= 3 || gap === (wide ? 3 : 2)) {
      // Reading order gives stable, friendly numbers on the DM's map.
      rooms.sort((a, b) => a.y - b.y || a.x - b.x)
      rooms.forEach((r, i) => {
        r.index = i
        r.id = `r${i + 1}`
      })
      return rooms
    }
  }
  return []
}

/** Joins every room (a spanning tree on distance) and adds loops between far-apart parts. */
function plan(rooms: Room[], factor: number) {
  const edges: [number, number, boolean][] = []
  if (rooms.length < 2) return edges
  const dist = (a: Room, b: Room) =>
    Math.hypot(centre(a)[0] - centre(b)[0], centre(a)[1] - centre(b)[1])
  const joined = new Set([0])
  const links: Set<number>[] = rooms.map(() => new Set())
  while (joined.size < rooms.length) {
    let best: [number, number, number] | null = null
    for (const i of joined)
      for (let j = 0; j < rooms.length; j++) {
        if (joined.has(j)) continue
        const d = dist(rooms[i]!, rooms[j]!)
        if (!best || d < best[2]) best = [i, j, d]
      }
    const [i, j] = best!
    joined.add(j)
    links[i]!.add(j)
    links[j]!.add(i)
    edges.push([i, j, false])
  }
  if (rooms.length < 5) return edges
  // Hops through the tree between two rooms: a loop is worth it when it shortcuts a long way round.
  const hops = (from: number) => {
    const d = rooms.map(() => -1)
    d[from] = 0
    const queue = [from]
    for (let h = 0; h < queue.length; h++)
      for (const n of links[queue[h]!]!)
        if (d[n] === -1) {
          d[n] = d[queue[h]!]! + 1
          queue.push(n)
        }
    return d
  }
  const candidates: { i: number; j: number; score: number }[] = []
  rooms.forEach((a, i) => {
    const h = hops(i)
    rooms
      .map((b, j) => ({ j, d: dist(a, b) }))
      .filter(({ j }) => j > i && !links[i]!.has(j))
      .sort((p, q) => p.d - q.d)
      .slice(0, 3)
      .forEach(({ j, d }) => {
        if (h[j]! >= 3) candidates.push({ i, j, score: d / h[j]! })
      })
  })
  candidates.sort((a, b) => a.score - b.score)
  const loops = Math.max(1, Math.round(rooms.length * 0.12 * factor))
  for (const c of candidates.slice(0, loops)) edges.push([c.i, c.j, true])
  return edges
}

interface Layout {
  grid: Grid
  rooms: Room[]
  doorways: Doorway[]
  /** Passage owning each square (-1: none). */
  passage: Int32Array
  passages: number
  links: Set<number>[]
  exit: boolean
}

/** Carves rooms and passages; returns where every doorway is. */
function carve(options: GeneratorOptions, rooms: Room[], k: 1 | 2): Layout {
  const { cols, rows } = options
  const grid = new Grid(cols, rows)
  const roomAt = new Int32Array(cols * rows).fill(-1)
  for (const r of rooms)
    for (let i = r.x; i < r.x + r.w; i++)
      for (let j = r.y; j < r.y + r.h; j++)
        if (inRoom(r, i, j)) {
          grid.set(i, j, T.floor)
          roomAt[j * cols + i] = r.index
        }
  const near = new Uint8Array(cols * rows)
  for (let i = 0; i < cols * rows; i++) {
    if (roomAt[i]! < 0) continue
    const x = i % cols
    const y = (i - x) / cols
    for (const [dx, dy] of [[0, 0], ...N8] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) near[ny * cols + nx] = 1
    }
  }
  const passage = new Int32Array(cols * rows).fill(-1)
  const doorways: Doorway[] = []
  const links: Set<number>[] = rooms.map(() => new Set())
  let passages = 0
  const used = rooms.map(() => [] as number[])

  /** Footprint squares of an anchor (top-left of a k × k passage). */
  const foot = (a: number) => {
    const x = a % cols
    const y = (a - x) / cols
    const cells: number[] = []
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cells.push((y + j) * cols + x + i)
    return cells
  }
  /** Places a passage may leave a room: the middle of each wall, away from its corners. */
  const openings = (r: Room) => {
    const list: { anchor: number; side: Side; cells: number[] }[] = []
    const push = (ax: number, ay: number, side: Side, cells: [number, number][]) => {
      if (ax < 0 || ay < 0 || ax + k > cols || ay + k > rows) return
      const anchor = ay * cols + ax
      const fp = foot(anchor)
      for (const c of fp) {
        if (roomAt[c]! >= 0) return
        const cx = c % cols
        const cy = (c - cx) / cols
        if (cx < 1 || cy < 1 || cx > cols - 2 || cy > rows - 2) return
        for (const [dx, dy] of N8) {
          const o = roomAt[(cy + dy) * cols + cx + dx]
          if (o !== undefined && o >= 0 && o !== r.index) return
        }
      }
      const doorCells = cells.map(([x, y]) => y * cols + x)
      const crowded = doorCells.some((c) =>
        used[r.index]!.some((u) => {
          const ux = u % cols
          return (
            Math.abs(ux - (c % cols)) <= 1 && Math.abs((u - ux) / cols - Math.floor(c / cols)) <= 1
          )
        }),
      )
      if (!crowded) list.push({ anchor, side, cells: doorCells })
    }
    if (r.shape === 'round') {
      const c = r.x + (r.w - 1) / 2
      const m = r.y + (r.h - 1) / 2
      push(c, r.y - 1, 0, [[c, r.y - 1]])
      push(r.x + r.w, m, 1, [[r.x + r.w, m]])
      push(c, r.y + r.h, 2, [[c, r.y + r.h]])
      push(r.x - 1, m, 3, [[r.x - 1, m]])
      return list
    }
    const row = (x: number, y: number) =>
      Array.from({ length: k }, (_, i) => [x + i, y] as [number, number])
    const col = (x: number, y: number) =>
      Array.from({ length: k }, (_, i) => [x, y + i] as [number, number])
    for (let x = r.x + 1; x <= r.x + r.w - 1 - k; x++) {
      push(x, r.y - k, 0, row(x, r.y - 1))
      push(x, r.y + r.h, 2, row(x, r.y + r.h))
    }
    for (let y = r.y + 1; y <= r.y + r.h - 1 - k; y++) {
      push(r.x + r.w, y, 1, col(r.x + r.w, y))
      push(r.x - k, y, 3, col(r.x - 1, y))
    }
    return list
  }
  const seed = options.seed
  const corridor = (c: number) => grid.tiles[c] === T.corridor
  const join = (a: Room, b: Room, loop: boolean) => {
    const from = openings(a)
    const to = openings(b)
    if (!from.length || !to.length) return false
    const goals = new Map(to.map((o) => [o.anchor, o]))
    const starts = new Map(from.map((o) => [o.anchor, o]))
    const outward = [3, 0, 1, 2] // a north wall's passage heads north (N4 index 3)
    const path = route(
      cols,
      rows,
      from.map((o) => ({ index: o.anchor, heading: outward[o.side]! })),
      new Set(goals.keys()),
      (n) => {
        if (goals.has(n)) return 1
        if (starts.has(n)) return Infinity
        const x = n % cols
        const y = (n - x) / cols
        let reuse = false
        let beside = false
        for (const c of foot(n)) {
          const cx = c % cols
          const cy = (c - cx) / cols
          if (cx < 1 || cy < 1 || cx > cols - 2 || cy > rows - 2 || cy >= rows || near[c])
            return Infinity
          if (corridor(c)) reuse = true
          else
            for (const [dx, dy] of N8) {
              const o = (cy + dy) * cols + cx + dx
              if (grid.tiles[o] === T.corridor) beside = true
            }
        }
        return (reuse ? 0.55 : beside ? 3.5 : 1) + hash01(x, y, seed) * 0.3
      },
    )
    if (!path) return false
    const id = passages++
    for (const anchor of path)
      for (const c of foot(anchor))
        if (grid.tiles[c] === T.rock) {
          grid.tiles[c] = T.corridor
          passage[c] = id
        }
    for (const [o, room] of [
      [starts.get(path[0]!)!, a],
      [goals.get(path[path.length - 1]!)!, b],
    ] as const) {
      used[room.index]!.push(...o.cells)
      doorways.push({
        room: room.index,
        side: o.side,
        cells: o.cells,
        passage: id,
        loop,
        exit: false,
      })
    }
    links[a.index]!.add(b.index)
    links[b.index]!.add(a.index)
    return true
  }
  const edges = plan(rooms, densityFactor[options.density])
  for (const [i, j, loop] of edges) {
    if (join(rooms[i]!, rooms[j]!, loop) || loop) continue
    // Rare: no clean way through. A plain bent passage keeps every room reachable.
    const id = passages++
    const [ax, ay] = centre(rooms[i]!).map(Math.floor) as [number, number]
    const [bx, by] = centre(rooms[j]!).map(Math.floor) as [number, number]
    let x = ax
    let y = ay
    const mark = () => {
      const c = y * cols + x
      if (grid.tiles[c] === T.rock) {
        grid.tiles[c] = T.corridor
        passage[c] = id
      }
    }
    while (x !== bx) {
      x += Math.sign(bx - x)
      mark()
    }
    while (y !== by) {
      y += Math.sign(by - y)
      mark()
    }
    links[i]!.add(j)
    links[j]!.add(i)
  }
  return { grid, rooms, doorways, passage, passages, links, exit: false }
}

/** The way in: a passage from the room nearest an edge out to the edge of the map. */
function openExit(layout: Layout, entrance: Room, k: number) {
  const { grid, passage } = layout
  const { cols, rows } = grid
  const sides: [Side, number][] = [
    [0, entrance.y],
    [1, cols - entrance.x - entrance.w],
    [2, rows - entrance.y - entrance.h],
    [3, entrance.x],
  ]
  sides.sort((a, b) => a[1] - b[1])
  for (const [side, distance] of sides) {
    if (distance > 9) break
    const along = side === 0 || side === 2
    const mid = along
      ? entrance.x + Math.floor((entrance.w - k) / 2)
      : entrance.y + Math.floor((entrance.h - k) / 2)
    const cells: number[] = []
    let ok = true
    const [dx, dy] = (
      [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ] as const
    )[side]
    let x = along ? mid : side === 1 ? entrance.x + entrance.w : entrance.x - 1
    let y = along ? (side === 0 ? entrance.y - 1 : entrance.y + entrance.h) : mid
    if (entrance.shape === 'round') {
      x = along ? entrance.x + (entrance.w - 1) / 2 : x
      y = along ? y : entrance.y + (entrance.h - 1) / 2
    }
    while (x >= 0 && y >= 0 && x < cols && y < rows) {
      for (let s = 0; s < k; s++) {
        const cx = along ? x + s : x
        const cy = along ? y : y + s
        const c = cy * cols + cx
        if (grid.tiles[c] !== T.rock) ok = false
        // Beside another room's wall the passage would read as part of it.
        for (const [ox, oy] of N8) {
          const n = (cy + oy) * cols + cx + ox
          const nx = cx + ox
          const ny = cy + oy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          if (grid.tiles[n] === T.floor && !inRoom(entrance, nx, ny)) ok = false
        }
        cells.push(c)
      }
      if (!ok) break
      x += dx
      y += dy
    }
    if (!ok) continue
    const id = layout.passages++
    for (const c of cells) {
      grid.tiles[c] = T.corridor
      passage[c] = id
    }
    layout.doorways.push({
      room: entrance.index,
      side,
      cells: cells.slice(0, k),
      passage: id,
      loop: false,
      exit: true,
    })
    layout.exit = true
    return true
  }
  return false
}

/** Entrance near an edge, goal at the far end, treasure in a dead end (map-doctrine.md). */
function assignRoles(layout: Layout) {
  const { rooms, links, grid } = layout
  const border = (r: Room) => Math.min(r.x, r.y, grid.cols - r.x - r.w, grid.rows - r.y - r.h)
  const pool = rooms.filter((r) => r.shape !== 'hall')
  const entrance = [...(pool.length ? pool : rooms)].sort(
    (a, b) => border(a) - border(b) || a.w * a.h - b.w * b.h,
  )[0]!
  entrance.role = 'entrance'
  const hops = rooms.map(() => -1)
  hops[entrance.index] = 0
  const queue = [entrance.index]
  for (let h = 0; h < queue.length; h++)
    for (const n of links[queue[h]!]!)
      if (hops[n] === -1) {
        hops[n] = hops[queue[h]!]! + 1
        queue.push(n)
      }
  const far = rooms
    .filter((r) => r !== entrance)
    .sort((a, b) => hops[b.index]! - hops[a.index]! || b.w * b.h - a.w * a.h)
  const goal = far[0]
  if (goal) goal.role = 'goal'
  const deadEnd = far.find((r) => r !== goal && links[r.index]!.size === 1)
  if (deadEnd && rooms.length >= 5) deadEnd.role = 'treasure'
  return { entrance, goal, treasure: deadEnd?.role === 'treasure' ? deadEnd : undefined }
}

/** Places props on free floor, keeping doorways clear. */
class Furnisher {
  readonly props: GeneratedProp[] = []
  readonly taken = new Set<string>()
  readonly grid: Grid
  readonly random: Rng
  constructor(grid: Grid, random: Rng) {
    this.grid = grid
    this.random = random
  }
  free(x: number, y: number) {
    return !this.taken.has(`${x}:${y}`) && walkable(this.grid.get(x, y))
  }
  place(prop: string, x: number, y: number, w = 1, h = 1, rotation = 0) {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++) if (!this.free(i, j)) return false
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) this.taken.add(`${i}:${j}`)
    this.props.push({ prop, x, y, w, h, rotation })
    return true
  }
  reserve(x: number, y: number) {
    this.taken.add(`${x}:${y}`)
  }
  /** A prop centred on a point that may fall between squares; it takes every square it covers. */
  centred(prop: string, cx: number, cy: number, w: number, h: number) {
    const x0 = Math.floor(cx - w / 2 + 0.01)
    const y0 = Math.floor(cy - h / 2 + 0.01)
    const x1 = Math.ceil(cx + w / 2 - 0.01)
    const y1 = Math.ceil(cy + h / 2 - 0.01)
    for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) if (!this.free(i, j)) return false
    for (let i = x0; i < x1; i++) for (let j = y0; j < y1; j++) this.taken.add(`${i}:${j}`)
    this.props.push({ prop, x: cx - w / 2, y: cy - h / 2, w, h, rotation: 0 })
    return true
  }
}

/**
 * The wall a prop stands against: its back faces that wall. Rotation 0 puts the back north and
 * turns clockwise, so an east wall is 90 and a west wall 270.
 */
const wallRotation: Record<Side, number> = { 0: 0, 1: 90, 2: 180, 3: 270 }

function furnishRoom(
  room: Room,
  layout: Layout,
  f: Furnisher,
  factor: number,
  crypt: boolean,
  theme: MapTheme,
  goalStyle: GoalStyle,
) {
  const random = f.random
  const mine = layout.doorways.filter((d) => d.room === room.index)
  const firstSide = mine[0]?.side ?? 2
  const far = ((firstSide + 2) % 4) as Side
  const midX = room.x + Math.floor((room.w - 1) / 2)
  const midY = room.y + Math.floor((room.h - 1) / 2)
  /** The squares along the far wall. */
  const across = far === 0 || far === 2 ? room.w : room.h
  /** A square against wall `side`, `offset` squares from that wall's middle. */
  const onWall = (side: Side, offset: number): [number, number] =>
    side === 0
      ? [midX + offset, room.y]
      : side === 2
        ? [midX + offset, room.y + room.h - 1]
        : side === 1
          ? [room.x + room.w - 1, midY + offset]
          : [room.x, midY + offset]
  /** `depth` squares in from wall `side` (in front of what stands against it). */
  const inFront = (side: Side, offset: number, depth = 1): [number, number] => {
    const [x, y] = onWall(side, offset)
    const [dx, dy] = inward[side]
    return [x + dx * depth, y + dy * depth]
  }
  const spots = (sides: Side[]) => {
    const list: [number, number, Side][] = []
    for (const side of sides) {
      const span = side === 0 || side === 2 ? room.w : room.h
      for (let o = -Math.floor((span - 1) / 2); o <= Math.ceil((span - 1) / 2); o++) {
        const [x, y] = onWall(side, o)
        if (inRoom(room, x, y)) list.push([x, y, side])
      }
    }
    return list
  }
  /**
   * A prop `len` squares long with its back to wall `side`, `offset` squares from the wall's middle
   * (the footprint turns with the wall: len × 1 on north and south walls, 1 × len on east and west).
   */
  const against = (prop: string, side: Side, offset = 0, len = 2) => {
    const [x, y] = onWall(side, offset)
    const along = side === 0 || side === 2
    const sx = along ? x - Math.floor((len - 1) / 2) : x
    const sy = along ? y : y - Math.floor((len - 1) / 2)
    const ex = sx + (along ? len - 1 : 0)
    const ey = sy + (along ? 0 : len - 1)
    if (!inRoom(room, sx, sy) || !inRoom(room, ex, ey)) return false
    return f.place(prop, sx, sy, along ? len : 1, along ? 1 : len, wallRotation[side])
  }
  /** A 2 × 2 prop with its back to wall `side`, in the middle of that wall. */
  const deepAgainst = (prop: string, side: Side) => {
    const [x, y] = onWall(side, 0)
    const along = side === 0 || side === 2
    const sx = along ? x : side === 1 ? x - 1 : x
    const sy = along ? (side === 0 ? y : y - 1) : y
    if (!inRoom(room, sx, sy) || !inRoom(room, sx + 1, sy + 1)) return false
    return f.place(prop, sx, sy, 2, 2, wallRotation[side])
  }
  const focal = (prop: string) => {
    if (prop === 'altar' && room.w >= 4 && against('altar', far)) return
    const [x, y] = onWall(far, 0)
    f.place(prop === 'altar' ? 'statue' : prop, x, y, 1, 1, wallRotation[far])
  }
  /** The same prop on both sides of a wall's middle (the far wall unless told). */
  const flank = (prop: string, offset: number, side: Side = far) => {
    const even = side === 0 || side === 2 ? (room.w % 2 ? 0 : 1) : room.h % 2 ? 0 : 1
    const a = onWall(side, -offset)
    const b = onWall(side, offset + even)
    if (!inRoom(room, ...a) || !inRoom(room, ...b) || !f.free(...a) || !f.free(...b)) return
    f.place(prop, a[0], a[1], 1, 1, wallRotation[side])
    f.place(prop, b[0], b[1], 1, 1, wallRotation[side])
  }
  /** A 2 × 2 prop in the middle of the room, moved `toward` the far wall by some squares. */
  const centrePiece = (prop: string, toward = 0, turn = true) => {
    if (room.w < 4 || room.h < 4) return false
    const [dx, dy] = inward[far]
    const x = clamp(
      room.x + Math.floor((room.w - 2) / 2) - dx * toward,
      room.x + 1,
      room.x + room.w - 3,
    )
    const y = clamp(
      room.y + Math.floor((room.h - 2) / 2) - dy * toward,
      room.y + 1,
      room.y + room.h - 3,
    )
    return f.place(prop, x, y, 2, 2, turn ? random.int(0, 3) * 90 : 0)
  }
  const scatter = (pool: string[], count: number, wallsOnly = true) => {
    const list = wallsOnly
      ? spots([0, 1, 2, 3])
      : Array.from(
          { length: room.w * room.h },
          (_, i) =>
            [room.x + (i % room.w), room.y + Math.floor(i / room.w), 0 as Side] as [
              number,
              number,
              Side,
            ],
        ).filter(([x, y]) => inRoom(room, x, y))
    for (let n = 0, tries = 0; n < count && tries < count * 10; tries++) {
      const [x, y, side] = random.pick(list)
      if (
        f.place(
          random.pick(pool),
          x,
          y,
          1,
          1,
          wallsOnly ? wallRotation[side] : random.int(0, 3) * 90,
        )
      )
        n++
    }
  }
  const extras = (n: number) => Math.max(1, Math.round(n * factor))
  /** Walls without a doorway other than the far one, for long furniture. */
  const quiet = ([0, 1, 2, 3] as Side[]).filter((s) => s !== far && !mine.some((d) => d.side === s))
  const fire = theme === 'ice' ? 'candles' : 'brazier'

  if (room.shape === 'round') {
    const c = room.x + (room.w - 1) / 2
    const m = room.y + (room.h - 1) / 2
    if (room.role === 'goal' && crypt) f.place('sarcophagus', c, m - 1, 1, 2, 0)
    else if (room.w >= 7 && (crypt || theme === 'temple' || room.role === 'goal')) {
      if (!f.centred('magic-circle', c + 0.5, m + 0.5, 2, 2)) f.place('statue', c, m, 1, 1, 0)
    } else f.place(theme === 'dwarven' ? 'pillar' : 'statue', c, m, 1, 1, 0)
    for (const [x, y] of [
      [c, room.y + 1],
      [c, room.y + room.h - 2],
      [room.x + 1, m],
      [room.x + room.w - 2, m],
    ] as const)
      if (room.w >= 7) f.place(crypt ? 'candles' : fire, x, y)
    if (room.role === 'treasure') scatter(['chest', 'coins', 'urn'], 3)
    return
  }
  if (room.shape === 'hall' && Math.min(room.w, room.h) >= 5) {
    // Two rows of pillars, mirrored from both ends towards the middle; some fallen in ruins.
    const horizontal = room.w >= room.h
    const len = horizontal ? room.w : room.h
    const lines = horizontal ? [room.y + 1, room.y + room.h - 2] : [room.x + 1, room.x + room.w - 2]
    const start = horizontal ? room.x : room.y
    const fallen = theme === 'ruins' || room.theme === 'ruin'
    for (let i = 1; i * 2 < len - 1; i += 2) {
      const a = start + i
      const b = start + len - 1 - i
      for (const line of lines)
        for (const p of a === b ? [a] : [a, b]) {
          const [x, y] = horizontal ? [p, line] : [line, p]
          if (fallen && random.chance(0.22)) f.place('rubble', x, y, 1, 1, random.int(0, 3) * 90)
          else f.place('pillar', x, y)
        }
    }
    if (fallen)
      f.place(
        'fallen-pillar',
        room.x + Math.floor(room.w / 2) - 1,
        room.y + Math.floor(room.h / 2),
        2,
        1,
        random.pick([0, 180]),
      )
  }
  switch (room.role ?? room.theme) {
    case 'goal':
      if (crypt) {
        const x = room.x + Math.floor((room.w - 1) / 2)
        const y = room.y + Math.floor((room.h - 2) / 2)
        f.place('sarcophagus', x, y, 1, 2, 0)
        flank('candles', 1)
        focal('altar')
        if (room.w >= 6) flank('skull-pile', 2, ((far + 2) % 4) as Side)
      } else if (goalStyle === 'throne' && room.w >= 5 && room.h >= 5) {
        // A throne against the far wall, fire and banners either side, a rug before it.
        focal('throne')
        flank(fire, 1)
        flank('banner', 2)
        centrePiece(
          'rug',
          Math.max(0, Math.floor(((far === 0 || far === 2 ? room.h : room.w) - 4) / 2)),
          false,
        )
        scatter(['chest', 'armor-stand'], 2)
      } else if (goalStyle === 'hoard' && room.w >= 5 && room.h >= 5) {
        // A hoard heaped in the middle, the bones of those who came before, a chest or two.
        centrePiece('treasure-hoard')
        scatter(['skull-pile', 'bones', 'coins', 'chest'], extras(3))
        flank(fire, 1)
      } else {
        focal(room.w >= 5 ? 'altar' : 'statue')
        flank(fire, 2)
        scatter(['chest', 'coins'], 2)
        if (room.w >= 6 && room.h >= 6) centrePiece('magic-circle', 1)
        else if (room.w >= 6 && room.h >= 5) centrePiece('rug', 1)
      }
      return
    case 'treasure':
      if (room.w >= 5 && room.h >= 5 && random.chance(0.5)) centrePiece('treasure-hoard')
      else focal('chest')
      flank('chest', 1)
      scatter(['coins', 'urn', 'coins'], extras(2))
      return
    case 'entrance':
      if (!layout.exit) focal('stairs')
      scatter(['barrel', 'crate', 'torch'], extras(1))
      if (room.w >= 5 && !crypt && theme !== 'ruins') flank('banner', 1, firstSide)
      return
  }
  switch (room.theme) {
    case 'store': {
      const corners: [number, number][] = [
        [room.x, room.y],
        [room.x + room.w - 1, room.y],
        [room.x, room.y + room.h - 1],
        [room.x + room.w - 1, room.y + room.h - 1],
      ]
      for (const [cx, cy] of [random.pick(corners), random.pick(corners)])
        for (const [dx, dy] of [
          [0, 0],
          [cx === room.x ? 1 : -1, 0],
          [0, cy === room.y ? 1 : -1],
        ] as const)
          if (random.chance(0.85 * Math.min(1.2, factor)))
            f.place(random.pick(['crate', 'barrel', 'sack', 'crate']), cx + dx, cy + dy)
      if (quiet[0] !== undefined && random.chance(0.6)) against('keg-rack', quiet[0])
      return
    }
    case 'library': {
      const sides: Side[] = room.w >= room.h ? [0, 2] : [1, 3]
      for (const [x, y, side] of spots(sides))
        if (random.chance(0.8)) f.place('bookshelf', x, y, 1, 1, wallRotation[side])
      if (room.w >= 5 && room.h >= 4) {
        f.place('table', midX, midY)
        // Backrests away from the table (rotation turns the back clockwise from north).
        f.place('chair', midX - 1, midY, 1, 1, 270)
        f.place('chair', midX + 1, midY, 1, 1, 90)
      }
      scatter(['candles'], 1)
      return
    }
    case 'study': {
      // A desk against the far wall and its chair, shelves beside it, a reading rug.
      if (against('desk', far)) {
        const [cx, cy] = inFront(far, 0)
        f.place('chair', cx, cy, 1, 1, (wallRotation[far] + 180) % 360)
      } else focal('bookshelf')
      flank('bookshelf', 2)
      if (room.w >= 5 && room.h >= 6) centrePiece('rug', -1)
      scatter(['candles', 'cauldron', 'chest'], extras(1))
      return
    }
    case 'barracks': {
      if (room.h >= 4)
        for (let x = room.x; x < room.x + room.w; x += 2)
          f.place(random.chance(0.75) ? 'bed' : 'bedroll', x, room.y, 1, 2, 0)
      scatter(['chest', 'weapon-rack'], extras(2))
      if (room.w >= 4 && room.h >= 5) {
        const ty = room.y + room.h - 2
        if (f.place('table', midX, ty)) {
          f.place('stool', midX - 1, ty, 1, 1, 0)
          f.place('stool', midX + 1, ty, 1, 1, 0)
        }
      }
      return
    }
    case 'armory':
      // Racks along the walls, armour on stands either side of the far wall, a heap to sort.
      for (const [x, y, side] of spots(quiet.length ? quiet : [far]))
        if (random.chance(0.55)) f.place('weapon-rack', x, y, 1, 1, wallRotation[side])
      flank('armor-stand', 1)
      scatter(['weapon-pile', 'chest'], extras(1), false)
      return
    case 'forge':
      // The forge on the far wall, its anvil in front, a workbench and fuel along a side wall.
      if (room.w >= 4 && room.h >= 4 && deepAgainst('forge', far)) {
        const [ax, ay] = inFront(far, 0, 2)
        f.place('anvil', ax, ay, 1, 1, wallRotation[far])
      } else focal('anvil')
      if (quiet[0] !== undefined) against('workbench', quiet[0])
      scatter(['firewood', 'barrel', 'weapon-pile'], extras(2))
      return
    case 'kitchen': {
      if (!against('kitchen-counter', far, -1)) focal('oven')
      const [ox, oy] = onWall(far, 1)
      f.place('oven', ox, oy, 1, 1, wallRotation[far])
      if (room.w >= 4 && room.h >= 4) f.place('cauldron', midX, midY, 1, 1, 0)
      scatter(['sack', 'barrel', 'firewood', 'table'], extras(2))
      return
    }
    case 'prison': {
      // Cages along the far wall, chains on the side walls, what is left of the last prisoner.
      for (let o = -Math.floor((across - 1) / 2); o <= Math.ceil((across - 1) / 2); o += 2) {
        const [x, y] = onWall(far, o)
        if (inRoom(room, x, y)) f.place('cage', x, y, 1, 1, wallRotation[far])
      }
      for (const side of quiet) {
        const [x, y] = onWall(side, 0)
        f.place('chains', x, y, 1, 1, wallRotation[side])
      }
      scatter(['bones', 'bones'], extras(1), false)
      // What is left of the last prisoner's bedroll, at its own size (1 × 2: its picture's).
      const beds: [number, number][] = []
      for (let x = room.x; x < room.x + room.w; x++)
        for (let y = room.y; y < room.y + room.h - 1; y++)
          if (inRoom(room, x, y) && inRoom(room, x, y + 1)) beds.push([x, y])
      for (let t = 0; t < 8 && beds.length; t++) {
        const [bx, by] = random.pick(beds)
        if (f.place('bedroll', bx, by, 1, 2, 0)) break
      }
      const [lx, ly] = onWall(firstSide, 1)
      if (inRoom(room, lx, ly)) f.place('lever', lx, ly, 1, 1, wallRotation[firstSide])
      return
    }
    case 'training': {
      // Dummies in a row, a target on the far wall, racks to hand, a bench to rest.
      const [tx, ty] = onWall(far, 0)
      f.place('archery-target', tx, ty, 1, 1, wallRotation[far])
      const depth = Math.min(3, (far === 0 || far === 2 ? room.h : room.w) - 2)
      for (const k of [-2, 0, 2]) {
        const [x, y] = inFront(far, k, depth)
        if (inRoom(room, x, y)) f.place('training-dummy', x, y, 1, 1, 0)
      }
      if (quiet[0] !== undefined) against('bench', quiet[0])
      scatter(['weapon-rack'], 1)
      return
    }
    case 'shrine':
      focal(room.w >= 5 ? 'altar' : theme === 'temple' || theme === 'sandstone' ? 'idol' : 'statue')
      flank('candles', room.w >= 5 ? 2 : 1)
      if (room.w >= 6 && room.h >= 6) centrePiece(random.chance(0.5) ? 'magic-circle' : 'rug', 1)
      else if (theme === 'temple' || theme === 'sandstone') scatter(['urn', 'idol'], 1)
      return
    case 'tomb': {
      // Sarcophagi in mirrored rows along the long walls, an aisle down the middle.
      const tomb = theme === 'mossy' && random.chance(0.4) ? 'coffin' : 'sarcophagus'
      if (room.h >= 4) {
        const rowsY = room.h >= 6 ? [room.y, room.y + room.h - 2] : [room.y]
        for (let i = 0; room.x + 1 + i * 2 <= room.x + room.w - 2; i++) {
          const a = room.x + 1 + i * 2
          const b = room.x + room.w - 2 - i * 2
          if (a > b) break
          for (const y of rowsY)
            for (const x of a === b ? [a] : [a, b])
              f.place(tomb, x, y, 1, 2, y === room.y ? 0 : 180)
        }
      } else f.place(tomb, midX, room.y, 1, 2, 0)
      scatter(['candles', 'urn', 'web'], extras(1))
      return
    }
    case 'ossuary':
      for (const [x, y, side] of spots([0, 1, 2, 3]))
        if (random.chance(0.45))
          f.place(random.pick(['bones', 'skull-pile', 'urn']), x, y, 1, 1, wallRotation[side])
      return
    case 'ruin':
      scatter(
        ['rubble', 'bones', 'web', 'rubble', 'skull-pile'],
        extras(Math.ceil((room.w * room.h) / 10)),
        false,
      )
      if (room.w >= 4)
        f.place(
          'fallen-pillar',
          room.x + random.int(0, room.w - 2),
          room.y + random.int(0, room.h - 1),
          2,
          1,
          random.pick([0, 180]),
        )
      return
    default:
      scatter(['barrel', 'crate', 'table', 'chest'], extras(1))
  }
}

/** Burial niches: one-square alcoves off straight passages (catacombs). */
function niches(layout: Layout, f: Furnisher, factor: number, random: Rng) {
  const { grid, passage } = layout
  const { cols, rows } = grid
  for (let y = 2; y < rows - 2; y++)
    for (let x = 2; x < cols - 2; x++) {
      const c = y * cols + x
      if (grid.tiles[c] !== T.corridor || hash01(x, y, 77) > 0.22 * factor) continue
      const horizontal = grid.get(x - 1, y) === T.corridor && grid.get(x + 1, y) === T.corridor
      const vertical = grid.get(x, y - 1) === T.corridor && grid.get(x, y + 1) === T.corridor
      if (horizontal === vertical) continue
      const options: readonly (readonly [number, number])[] = horizontal
        ? [
            [0, -1],
            [0, 1],
          ]
        : [
            [-1, 0],
            [1, 0],
          ]
      const [dx, dy] = random.pick(options)
      const nx = x + dx
      const ny = y + dy
      if (nx < 1 || ny < 1 || nx > cols - 2 || ny > rows - 2 || grid.get(nx, ny) !== T.rock)
        continue
      // The niche is closed on its three other sides.
      let closed = true
      for (const [ox, oy] of N8) {
        const qx = nx + ox
        const qy = ny + oy
        if (qx === x && qy === y) continue
        if (Math.abs(qx - x) + Math.abs(qy - y) === 1 && (horizontal ? qy === y : qx === x))
          continue
        if (grid.get(qx, qy) !== T.rock) closed = false
      }
      if (!closed) continue
      const n = ny * cols + nx
      grid.tiles[n] = T.corridor
      passage[n] = passage[c]!
      f.place(random.pick(['bones', 'urn', 'bones', 'candles']), nx, ny, 1, 1, 0)
    }
}

/** Shared by dungeon and catacomb crypts. */
function roomsAndPassages(options: GeneratorOptions, crypt: boolean): GeneratedMap {
  const random = rng(options.seed)
  const factor = densityFactor[options.density]
  const wide = options.wide && !crypt
  const k = wide ? 2 : 1
  const rooms = placeRooms(options, random, crypt, wide)
  if (!rooms.length)
    rooms.push({
      id: 'r1',
      index: 0,
      x: Math.floor(options.cols / 2) - 2,
      y: Math.floor(options.rows / 2) - 2,
      w: 4,
      h: 4,
      shape: 'rect',
      theme: 'plain',
    })
  const layout = carve(options, rooms, k)
  const { entrance, goal, treasure } = assignRoles(layout)
  openExit(layout, entrance, k)
  const theme = options.theme ?? (crypt ? 'crypt' : 'stone')
  const themes = usesByTheme[theme] ?? usesByTheme[crypt ? 'crypt' : 'stone']!
  // Its own stream, so the goal's dressing never moves the layout.
  const goalStyle: GoalStyle = subRng(options.seed, 11).pick(
    goalStyles[theme] ?? ['altar' as const],
  )
  for (const room of rooms) {
    if (room.role) continue
    // Neighbours rarely share a purpose.
    for (let n = 0; n < 3; n++) {
      room.theme = random.pick(themes)
      if (![...layout.links[room.index]!].some((j) => rooms[j]!.theme === room.theme)) break
    }
  }
  if (goal && crypt) goal.theme = 'lord'
  const grid = layout.grid
  const f = new Furnisher(grid, random)
  // Keep the squares inside every doorway clear.
  for (const d of layout.doorways)
    for (const c of d.cells) {
      const cx = c % grid.cols
      const cy = (c - cx) / grid.cols
      const [dx, dy] = (
        [
          [0, 1],
          [-1, 0],
          [0, -1],
          [1, 0],
        ] as const
      )[d.side]
      for (const s of [-1, 0, 1]) f.reserve(cx + dx + (dy ? s : 0), cy + dy + (dx ? s : 0))
    }
  if (crypt) niches(layout, f, factor, random)
  for (const room of rooms) furnishRoom(room, layout, f, factor, crypt, theme, goalStyle)

  // Doors: arches, plain doors, the goal locked, loops and the hidden treasure secret.
  const doors: GeneratedDoor[] = []
  const secretLoop = new Set<number>()
  for (const d of layout.doorways) {
    if (k !== 1 || d.exit) continue
    const room = rooms[d.room]!
    const cell = d.cells[0]!
    const cx = cell % grid.cols
    const cy = (cell - cx) / grid.cols
    const passageId = `pass-${d.passage + 1}`
    let secret = false
    let locked = false
    if (room.role === 'goal') locked = true
    else if (room.role === 'treasure') {
      if (options.secret && random.chance(0.6)) secret = true
      else locked = true
    } else if (d.loop && options.secret && !secretLoop.has(d.passage) && random.chance(0.5)) {
      secret = true
      secretLoop.add(d.passage)
    } else if (random.chance(0.28)) continue
    const door: GeneratedDoor =
      d.side === 0
        ? { x: cx + 0.5, y: cy + 1, rotation: 0, secret, rooms: [room.id, passageId] }
        : d.side === 2
          ? { x: cx + 0.5, y: cy, rotation: 0, secret, rooms: [room.id, passageId] }
          : d.side === 1
            ? { x: cx, y: cy + 0.5, rotation: 90, secret, rooms: [room.id, passageId] }
            : { x: cx + 1, y: cy + 0.5, rotation: 90, secret, rooms: [room.id, passageId] }
    if (locked) door.locked = true
    doors.push(door)
  }

  // DM notes: the way in, the goal, the treasure; traps on their own stream.
  const notes: GeneratedNote[] = []
  const at = (r: Room, key: GeneratedNote['key']) => {
    const x = r.x + Math.floor((r.w - 1) / 2)
    let y = r.y + Math.floor((r.h - 1) / 2)
    if (!f.free(x, y) && inRoom(r, x, y + 1) && f.free(x, y + 1)) y += 1
    notes.push({ key, x, y })
  }
  at(entrance, 'entrance')
  if (goal) at(goal, 'goal')
  if (treasure) at(treasure, 'treasure')
  if (options.traps) {
    const trap = subRng(options.seed, 7)
    const spots = layout.doorways
      .filter(
        (d) => !d.exit && (rooms[d.room]!.role === 'goal' || rooms[d.room]!.role === 'treasure'),
      )
      .map((d) => d.cells[0]!)
    // Long straight passages: the middle of a run of six or more.
    const { cols, rows } = grid
    for (let y = 1; y < rows - 1; y++) {
      let run = 0
      for (let x = 1; x < cols; x++) {
        if (
          grid.get(x, y) === T.corridor &&
          grid.get(x, y - 1) === T.rock &&
          grid.get(x, y + 1) === T.rock
        )
          run++
        else {
          if (run >= 6 && trap.chance(0.5)) spots.push(y * cols + x - Math.ceil(run / 2))
          run = 0
        }
      }
    }
    for (const c of spots.slice(0, 4))
      notes.push({ key: 'trap', x: c % cols, y: Math.floor(c / cols) })
  }

  const map = emptyMap(options, grid)
  for (const r of rooms)
    if (r.shape === 'round')
      for (let i = r.x; i < r.x + r.w; i++)
        for (let j = r.y; j < r.y + r.h; j++) if (inRoom(r, i, j)) map.soft[j * grid.cols + i] = 1
  const generatedRooms: GeneratedRoom[] = rooms.map((r) => ({
    id: r.id,
    rects: runsOf(grid.cols, grid.rows, (x, y) => inRoom(r, x, y)),
    ...(r.role ? { role: r.role } : {}),
    use: r.role === 'goal' && !crypt ? (goalStyle === 'altar' ? 'shrine' : 'throne') : r.theme,
  }))
  for (let p = 0; p < layout.passages; p++) {
    const rects = runsOf(grid.cols, grid.rows, (x, y) => layout.passage[y * grid.cols + x] === p)
    if (rects.length) generatedRooms.push({ id: `pass-${p + 1}`, rects })
  }
  return {
    ...map,
    ...(crypt ? { variant: 'catacomb' as const } : {}),
    rooms: sealSecretDoors(generatedRooms, doors, grid.cols, grid.rows),
    doors,
    props: f.props,
    notes,
  }
}

export function dungeon(options: GeneratorOptions): GeneratedMap {
  return roomsAndPassages(options, false)
}

/** A crypt: a pillared nave with mirrored tomb chambers, or a catacomb of tombs and niches. */
export function crypt(options: GeneratorOptions): GeneratedMap {
  const variant = subRng(options.seed, 3).chance(0.5) ? 'nave' : 'catacomb'
  return variant === 'catacomb' ? roomsAndPassages(options, true) : nave(options)
}

function nave(options: GeneratorOptions): GeneratedMap {
  const random = rng(options.seed)
  const { cols, rows } = options
  const grid = new Grid(cols, rows)
  const factor = densityFactor[options.density]
  const hallW = Math.max(4, Math.min(9, Math.round(cols * 0.2)))
  const hall = { x: Math.floor((cols - hallW) / 2), y: 2, w: hallW, h: rows - 4 }
  grid.fill(hall.x, hall.y, hall.w, hall.h, T.floor)
  const rooms: GeneratedRoom[] = [
    { id: 'hall', rects: [[hall.x, hall.y, hall.w, hall.h]], role: 'goal' },
  ]
  const f = new Furnisher(grid, random)
  const doors: GeneratedDoor[] = []
  const passage = new Int32Array(cols * rows).fill(-1)
  let passages = 0
  const chambers: { id: string; x: number; y: number; w: number; h: number }[] = []
  const maxW = Math.max(3, hall.x - 3)
  let y = 2
  let n = 0
  while (y < rows - 5 && maxW >= 3) {
    const h = random.int(3, Math.min(6, rows - 3 - y))
    if (h < 3) break
    const w = random.int(3, Math.min(8, maxW))
    const x = hall.x - 2 - w
    if (x < 1) break
    n++
    const left = { id: `t${n}l`, x, y, w, h }
    const right = { id: `t${n}r`, x: cols - x - w, y, w, h }
    for (const chamber of [left, right]) {
      grid.fill(chamber.x, chamber.y, chamber.w, chamber.h, T.floor)
      chambers.push(chamber)
      const cy = chamber.y + Math.floor(chamber.h / 2)
      const fromLeft = chamber === left
      const startX = fromLeft ? chamber.x + chamber.w : hall.x + hall.w
      const endX = fromLeft ? hall.x - 1 : chamber.x - 1
      const id = passages++
      for (let cx = startX; cx <= endX; cx++) {
        grid.set(cx, cy, T.corridor)
        passage[cy * cols + cx] = id
      }
      const secret = options.secret && n % 3 === 0 && random.chance(0.6)
      doors.push({
        x: fromLeft ? chamber.x + chamber.w : chamber.x,
        y: cy + 0.5,
        rotation: 90,
        secret,
        rooms: [chamber.id, `pass-${id + 1}`],
      })
      // The sarcophagus lies in the middle of the chamber.
      f.place(
        'sarcophagus',
        chamber.x + Math.floor((chamber.w - 1) / 2),
        chamber.y + Math.floor((chamber.h - 2) / 2),
        1,
        2,
        0,
      )
      f.reserve(fromLeft ? chamber.x + chamber.w - 1 : chamber.x, cy)
    }
    y += h + 2
  }
  // Pillars in two rows along the nave, the altar and braziers at its head.
  for (let py = hall.y + 2; py < hall.y + hall.h - 2; py += 3)
    for (const px of [hall.x + 1, hall.x + hall.w - 2]) f.place('pillar', px, py)
  const ax = hall.x + Math.floor((hall.w - 2) / 2)
  f.place('altar', ax, hall.y, 2, 1, 0)
  for (const bx of [hall.x, hall.x + hall.w - 1]) f.place('brazier', bx, hall.y)
  // Burial niches cut into the nave walls between the chamber passages.
  for (let ny = hall.y + 1; ny < hall.y + hall.h - 1; ny++)
    for (const [nx, inner] of [
      [hall.x - 1, hall.x],
      [hall.x + hall.w, hall.x + hall.w - 1],
    ] as const) {
      if (
        grid.get(nx, ny) !== T.rock ||
        grid.get(nx, ny - 1) !== T.rock ||
        grid.get(nx, ny + 1) !== T.rock
      )
        continue
      if (hash01(nx, ny, options.seed) > 0.3 * factor || !f.free(inner, ny)) continue
      grid.set(nx, ny, T.floor)
      rooms[0]!.rects.push([nx, ny, 1, 1])
      f.place(random.pick(['urn', 'bones', 'candles']), nx, ny)
    }
  // The way in from the foot of the nave to the map edge.
  const ex = hall.x + Math.floor(hall.w / 2)
  const way = passages++
  for (let ey = hall.y + hall.h; ey < rows; ey++) {
    grid.set(ex, ey, T.corridor)
    passage[ey * cols + ex] = way
  }
  for (const chamber of chambers) {
    rooms.push({ id: chamber.id, rects: [[chamber.x, chamber.y, chamber.w, chamber.h]] })
    for (let k = 0; k < Math.round(factor * 0.6 + random.next()); k++) {
      const px = random.int(chamber.x, chamber.x + chamber.w - 1)
      const py = random.pick([chamber.y, chamber.y + chamber.h - 1])
      f.place(random.pick(['urn', 'candles', 'bones', 'web']), px, py)
    }
  }
  for (let p = 0; p < passages; p++)
    rooms.push({
      id: `pass-${p + 1}`,
      rects: runsOf(cols, rows, (x, y) => passage[y * cols + x] === p),
    })
  const notes: GeneratedNote[] = [
    { key: 'entrance', x: ex, y: hall.y + hall.h - 1 },
    { key: 'goal', x: ax, y: hall.y + 1 },
  ]
  const secretChamber = doors.find((d) => d.secret)
  if (secretChamber) {
    const c = chambers.find((ch) => ch.id === secretChamber.rooms[0])!
    notes.push({ key: 'ossuary', x: c.x, y: c.y })
  }
  if (options.traps) notes.push({ key: 'trap', x: ex, y: hall.y + Math.floor(hall.h / 2) })
  return {
    ...emptyMap(options, grid),
    variant: 'nave',
    rooms: sealSecretDoors(rooms, doors, cols, rows),
    doors,
    props: f.props,
    notes,
  }
}
