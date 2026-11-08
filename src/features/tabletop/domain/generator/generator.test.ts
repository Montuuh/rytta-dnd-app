import { describe, expect, it } from 'vitest'
import {
  generateMap,
  Grid,
  loopArea,
  mapKinds,
  mapThemes,
  reach,
  recipeOf,
  sceneContent,
  T,
  traceLoops,
  walkable,
  type GeneratedMap,
  type GeneratorOptions,
  type MapKind,
} from './index'
import { itemSchema } from '../model'
import { propById } from '../props'

const base = (
  kind: MapKind,
  seed: number,
  extra: Partial<GeneratorOptions> = {},
): GeneratorOptions => ({
  kind,
  look: 'ink',
  cols: 32,
  rows: 24,
  seed,
  density: 'normal',
  secret: true,
  wide: false,
  ...extra,
})

function gridOf(map: GeneratedMap) {
  const grid = new Grid(map.options.cols, map.options.rows)
  grid.tiles.set(map.tiles)
  return grid
}
const cellsOf = (rects: [number, number, number, number][]) =>
  rects.flatMap(([x, y, w, h]) =>
    Array.from({ length: w * h }, (_, i) => [x + (i % w), y + Math.floor(i / w)] as const),
  )

describe('ADR 032 map generator', () => {
  for (const kind of mapKinds)
    it(`${kind}: deterministic, bounded and connected`, () => {
      for (const seed of [1, 42, 9001, 123456]) {
        const options = base(kind, seed)
        const a = generateMap(options)
        const b = generateMap(options)
        expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles))
        expect(a.props).toEqual(b.props)
        expect(a.doors).toEqual(b.doors)
        expect(a.notes).toEqual(b.notes)
        const grid = gridOf(a)
        // Props sit inside the map on squares a creature can stand on (bridges over water).
        for (const prop of a.props) {
          expect(prop.x).toBeGreaterThanOrEqual(0)
          expect(prop.y).toBeGreaterThanOrEqual(0)
          expect(prop.x + prop.w).toBeLessThanOrEqual(32)
          expect(prop.y + prop.h).toBeLessThanOrEqual(24)
          // Bridges span water and lily pads float on it (RYT-068).
          if (prop.prop !== 'bridge' && prop.prop !== 'lily-pads')
            expect(walkable(grid.get(prop.x, prop.y)), `${kind} ${seed} ${prop.prop}`).toBe(true)
        }
        // Every room and passage is reachable from the first room.
        const rooms = a.rooms.filter((r) => r.id !== 'yard')
        const start = cellsOf(rooms[0]!.rects).find(([x, y]) => walkable(grid.get(x, y)))!
        const reached = reach(grid, start[0], start[1])
        for (const room of rooms) {
          const found = cellsOf(room.rects).some(([x, y]) => reached[y * 32 + x])
          expect(found, `${kind} ${seed} ${room.id}`).toBe(true)
        }
        // Doors separate two standable squares and name rooms that exist.
        const ids = new Set(a.rooms.map((r) => r.id))
        for (const door of a.doors) {
          const [ax, ay, bx, by] =
            door.rotation === 90
              ? [door.x - 1, Math.floor(door.y), door.x, Math.floor(door.y)]
              : [Math.floor(door.x), door.y - 1, Math.floor(door.x), door.y]
          const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < 32 && y < 24
          for (const [x, y] of [
            [ax, ay],
            [bx, by],
          ].filter(([x, y]) => inside(x!, y!)))
            expect(walkable(grid.get(x!, y!)), `${kind} ${seed} door`).toBe(true)
          for (const id of door.rooms) expect(ids.has(id), `${kind} ${seed} ${id}`).toBe(true)
        }
        // Notes lie on the map.
        for (const note of a.notes) expect(grid.inside(note.x, note.y)).toBe(true)
        // The scene content passes the item contract and the room contract.
        const content = sceneContent(a, (n) => ({ label: n.key, text: `${n.key} text` }))
        for (const room of content.rooms) {
          expect(Object.keys(room).sort()).toEqual(['id', 'rects'])
          expect(room.id).toMatch(/^[a-z0-9-]{1,40}$/)
          expect(room.rects.length).toBeLessThanOrEqual(400)
        }
        for (const item of content.items)
          expect(() =>
            itemSchema.parse({
              id: crypto.randomUUID(),
              label: null,
              combatant_id: null,
              character_id: null,
              w: 1,
              h: 1,
              ...item,
            }),
          ).not.toThrow()
      }
      expect(Array.from(generateMap(base(kind, 1)).tiles)).not.toEqual(
        Array.from(generateMap(base(kind, 2)).tiles),
      )
    })

  it('leaves the square behind a secret door out of every reveal area (RYT-068)', () => {
    let checked = 0
    for (const kind of ['dungeon', 'crypt'] as const)
      for (const seed of [3, 7, 13, 42, 77, 2024, 4242]) {
        const map = generateMap(base(kind, seed, { cols: 47, rows: 26, secret: true }))
        const inArea = (x: number, y: number) =>
          map.rooms.filter((r) =>
            r.rects.some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h),
          )
        for (const door of map.doors.filter((d) => d.secret)) {
          const flat = door.rotation === 0
          const squares = flat
            ? [
                [Math.floor(door.x), door.y - 1],
                [Math.floor(door.x), door.y],
              ]
            : [
                [door.x - 1, Math.floor(door.y)],
                [door.x, Math.floor(door.y)],
              ]
          const areas = squares.map(([x, y]) => inArea(x!, y!).map((r) => r.id))
          // One side is the room behind the secret door; the passage's square is in no area.
          expect(areas.flat(), `${kind} ${seed} ${door.x},${door.y}`).toEqual([door.rooms[0]])
          checked++
        }
      }
    expect(checked).toBeGreaterThan(3)
  })

  it('dungeons follow the map doctrine: a way in, a goal far away, loops, purposeful doors', () => {
    for (const seed of [3, 7, 42, 77, 2024]) {
      const map = generateMap(base('dungeon', seed, { cols: 47, rows: 26 }))
      const rooms = map.rooms.filter((r) => !r.id.startsWith('pass-'))
      const passages = map.rooms.filter((r) => r.id.startsWith('pass-'))
      expect(rooms.length, `${seed} rooms`).toBeGreaterThanOrEqual(6)
      const entrance = rooms.find((r) => r.role === 'entrance')!
      const goal = rooms.find((r) => r.role === 'goal')!
      expect(entrance).toBeDefined()
      expect(goal).toBeDefined()
      expect(goal.id).not.toBe(entrance.id)
      // The way in: a passage that reaches the edge, or stairs inside the entrance.
      const grid = gridOf(map)
      const edge =
        [...Array(47).keys()].some((x) => walkable(grid.get(x, 0)) || walkable(grid.get(x, 25))) ||
        [...Array(26).keys()].some((y) => walkable(grid.get(0, y)) || walkable(grid.get(46, y)))
      const stairs = map.props.some((p) => p.prop === 'stairs')
      expect(edge || stairs, `${seed} way in`).toBe(true)
      // Loops: more passages than a tree would need.
      expect(passages.length, `${seed} loops`).toBeGreaterThanOrEqual(rooms.length)
      // Locked doors lead to the goal or the treasure; notes mark the key rooms.
      const keyRooms = new Set(
        rooms.filter((r) => r.role === 'goal' || r.role === 'treasure').map((r) => r.id),
      )
      for (const door of map.doors.filter((d) => d.locked))
        expect(keyRooms.has(door.rooms[0]!), `${seed} locked`).toBe(true)
      expect(map.notes.map((n) => n.key)).toEqual(expect.arrayContaining(['entrance', 'goal']))
      expect(map.notes.some((n) => n.key === 'trap')).toBe(false)
    }
    const trapped = generateMap(base('dungeon', 42, { cols: 47, rows: 26, traps: true }))
    expect(trapped.notes.some((n) => n.key === 'trap')).toBe(true)
    // Traps come from their own stream: the layout does not move.
    expect(Array.from(trapped.tiles)).toEqual(
      Array.from(generateMap(base('dungeon', 42, { cols: 47, rows: 26 })).tiles),
    )
    // Secret doors only when asked for; wide passages have open arches.
    const plain = generateMap(base('dungeon', 11, { secret: false, density: 'dense' }))
    expect(plain.doors.every((d) => !d.secret)).toBe(true)
    expect(generateMap(base('dungeon', 11, { wide: true })).doors).toEqual([])
  })

  it('lays out the kind-specific features', () => {
    const crypts = [1, 2, 3, 4, 5, 6].map((seed) => generateMap(base('crypt', seed)))
    expect(new Set(crypts.map((c) => c.variant))).toEqual(new Set(['nave', 'catacomb']))
    for (const crypt of crypts) {
      expect(crypt.props.filter((p) => p.prop === 'sarcophagus').length).toBeGreaterThanOrEqual(2)
      expect(crypt.notes.some((n) => n.key === 'goal')).toBe(true)
    }
    expect(crypts.find((c) => c.variant === 'nave')!.rooms[0]!.id).toBe('hall')

    for (const seed of [7, 8, 9]) {
      const cave = generateMap(base('cave', seed))
      const grid = gridOf(cave)
      // One mouth on the edge; every floor square is reached from it.
      const mouth = cave.notes.find((n) => n.key === 'entrance')!
      expect(mouth).toBeDefined()
      const start = cave.tiles.findIndex((t) => t === T.floor)
      const reached = reach(grid, start % 32, Math.floor(start / 32))
      expect(reached.reduce((n, v) => n + v, 0)).toBe(
        cave.tiles.filter((t) => t === T.floor).length,
      )
      const border =
        [...Array(32).keys()].some(
          (x) => cave.tiles[x] !== T.rock || cave.tiles[23 * 32 + x] !== T.rock,
        ) ||
        [...Array(24).keys()].some(
          (y) => cave.tiles[y * 32] !== T.rock || cave.tiles[y * 32 + 31] !== T.rock,
        )
      expect(border).toBe(true)
      // Caverns are the reveal areas; the walls are drawn curved.
      expect(cave.rooms.every((r) => /^c\d+$/.test(r.id))).toBe(true)
      expect(cave.rooms.length).toBeGreaterThanOrEqual(3)
      expect(cave.soft.some((v) => v === 1)).toBe(true)
      expect(cave.notes.some((n) => n.key === 'lair')).toBe(true)
    }

    const forest = generateMap(base('forest', 7))
    expect(forest.rooms.filter((r) => /^c\d+$/.test(r.id)).length).toBeGreaterThanOrEqual(2)
    expect(forest.rooms[0]!.role).toBe('camp')
    expect(forest.trees.length).toBeGreaterThan(40)
    expect(forest.tiles.filter((t) => t === T.tree).length).toBe(forest.trees.length)
    // Trees never stand on the trail or in water; the trail runs edge to edge.
    for (const tree of forest.trees) {
      const t = forest.tiles[Math.floor(tree.y) * 32 + Math.floor(tree.x)]
      expect(t).toBe(T.tree)
    }
    const trail = forest.lines.find((l) => l.kind === 'path' && l.width === 2)!
    expect(trail.points[0]![0]).toBeLessThan(1)
    expect(trail.points.at(-1)![0]).toBeGreaterThan(30)

    const tavern = generateMap(base('tavern', 7))
    expect(tavern.rooms.map((r) => r.id)).toEqual(
      expect.arrayContaining(['hall', 'kitchen', 'store', 'guest1', 'guest2', 'yard']),
    )
    expect(tavern.props.some((p) => p.prop === 'bar')).toBe(true)
    expect(tavern.props.some((p) => p.prop === 'hearth')).toBe(true)
    expect(tavern.notes.map((n) => n.key)).toEqual(['cellar'])
  })

  it('writes the notes and door states into the scene content', () => {
    const map = generateMap(base('dungeon', 42, { cols: 47, rows: 26 }))
    const content = sceneContent(map, (n) => ({ label: `L ${n.key}`, text: `T ${n.key}` }))
    const notes = content.items.filter((i) => i.kind === 'note')
    expect(notes).toHaveLength(map.notes.length)
    expect(notes[0]).toMatchObject({
      label: 'L entrance',
      secret: { text: 'T entrance' },
      data: {},
    })
    const locked = content.items.filter((i) => i.kind === 'door' && i.data?.state === 'locked')
    expect(locked.length).toBe(map.doors.filter((d) => d.locked).length)
    expect(sceneContent(map).items.some((i) => i.kind === 'note')).toBe(false)
  })

  it('traces outlines that fill exactly the region, holes the other way round', () => {
    // A 4 × 3 block with a one-square hole.
    const inside = (x: number, y: number) => x < 4 && y < 3 && !(x === 1 && y === 1)
    const loops = traceLoops(6, 5, inside)
    expect(loops).toHaveLength(2)
    const areas = loops.map((l) => loopArea(l.points)).sort((a, b) => b - a)
    expect(areas).toEqual([12, -1])
    // Squares that touch at a corner stay two loops.
    const diagonal = traceLoops(3, 3, (x, y) => (x === 0 && y === 0) || (x === 1 && y === 1))
    expect(diagonal).toHaveLength(2)
  })

  it('keeps what the preview shows within what a scene can store', () => {
    for (const seed of [1, 2, 3]) {
      const big = generateMap(base('tavern', seed, { cols: 80, rows: 80 }))
      expect(big.doors.length + big.notes.length + big.props.length).toBeLessThanOrEqual(600)
      expect(big.notes.map((n) => n.key)).toEqual(['cellar'])
      expect(sceneContent(big, (n) => ({ label: n.key, text: n.key })).items).toHaveLength(
        big.doors.length + big.notes.length + big.props.length,
      )
    }
    // Options that do not apply to a kind are not kept in its recipe.
    expect(generateMap(base('forest', 1, { traps: true, wide: true })).options).toMatchObject({
      secret: false,
      wide: false,
      traps: false,
    })
  })

  it('clamps sizes to what each kind can lay out', () => {
    const tiny = generateMap(base('tavern', 3, { cols: 5, rows: 5 }))
    expect(tiny.options).toMatchObject({ cols: 18, rows: 14 })
    const huge = generateMap(base('cave', 3, { cols: 500, rows: 81 }))
    expect(huge.options).toMatchObject({ cols: 80, rows: 80 })
    expect(huge.tiles).toHaveLength(6400)
  })
})

describe('prop orientation (RYT-066)', () => {
  // Rotation 0 puts a prop's back north; rotations turn it clockwise.
  const back = (rotation: number): [number, number] =>
    rotation === 90 ? [1, 0] : rotation === 180 ? [0, 1] : rotation === 270 ? [-1, 0] : [0, -1]

  const seeds = Array.from({ length: 40 }, (_, i) => i * 97 + 1)

  it('turns the back of wall props to the wall behind them', () => {
    for (const kind of ['dungeon', 'tavern'] as const) {
      let checked = 0
      for (const seed of seeds) {
        const map = generateMap(base(kind, seed))
        const grid = gridOf(map)
        for (const p of map.props.filter((p) =>
          [
            'bookshelf',
            'hearth',
            'weapon-rack',
            // RYT-068: the new props that stand against a wall.
            'desk',
            'kitchen-counter',
            'oven',
            'keg-rack',
            'workbench',
            'banner',
            'chains',
            'wardrobe',
          ].includes(p.prop),
        )) {
          const [dx, dy] = back(p.rotation)
          // The square just behind the middle of the prop's back is not floor.
          const x = Math.floor(p.x + p.w / 2 + (dx * p.w) / 2 + (dx ? dx * 0.5 : 0))
          const y = Math.floor(p.y + p.h / 2 + (dy * p.h) / 2 + (dy ? dy * 0.5 : 0))
          expect(walkable(grid.get(x, y)), `${kind} ${seed} ${p.prop} at ${p.x},${p.y}`).toBe(false)
          checked++
        }
      }
      expect(checked, kind).toBeGreaterThan(10)
    }
  })

  it('seats chairs facing their table', () => {
    for (const kind of ['tavern', 'dungeon'] as const) {
      let checked = 0
      for (const seed of seeds) {
        const map = generateMap(base(kind, seed))
        // Tables, and the squares of desks (RYT-068: a study's chair faces its desk).
        const tables = new Set(
          map.props
            .filter((p) => p.prop === 'table' || p.prop === 'desk')
            .flatMap((p) =>
              Array.from(
                { length: p.w * p.h },
                (_, i) => `${p.x + (i % p.w)}:${p.y + Math.floor(i / p.w)}`,
              ),
            ),
        )
        for (const chair of map.props.filter((p) => p.prop === 'chair')) {
          const [dx, dy] = back(chair.rotation)
          const at = `${kind} ${seed} ${chair.x},${chair.y}`
          // A chair by a table has the table in front of it, never behind its back.
          expect(tables.has(`${chair.x + dx}:${chair.y + dy}`), at).toBe(false)
          expect(tables.has(`${chair.x - dx}:${chair.y - dy}`), at).toBe(true)
          checked++
        }
      }
      expect(checked, kind).toBeGreaterThan(0)
    }
  })
})

describe('map themes (RYT-068)', () => {
  it('every theme lays out a connected map furnished only with library props', () => {
    for (const kind of mapKinds)
      for (const theme of mapThemes[kind])
        for (const seed of [3, 77, 4242]) {
          const map = generateMap(base(kind, seed, { theme }))
          expect(map.options.theme, `${kind} ${theme}`).toBe(theme)
          for (const prop of map.props) expect(propById.has(prop.prop), prop.prop).toBe(true)
          const grid = gridOf(map)
          const rooms = map.rooms.filter((r) => r.id !== 'yard')
          const start = cellsOf(rooms[0]!.rects).find(([x, y]) => walkable(grid.get(x, y)))!
          const reached = reach(grid, start[0], start[1])
          for (const room of rooms)
            expect(
              cellsOf(room.rects).some(([x, y]) => reached[y * 32 + x]),
              `${kind} ${theme} ${seed} ${room.id}`,
            ).toBe(true)
        }
  })

  it('reads a missing or foreign theme as the kind default, and stores it in the recipe', () => {
    expect(generateMap(base('cave', 5)).options.theme).toBe('rock')
    expect(generateMap(base('cave', 5, { theme: 'oak' })).options.theme).toBe('rock')
    expect(recipeOf(generateMap(base('forest', 5, { theme: 'winter' })).options)).toMatchObject({
      kind: 'forest',
      theme: 'winter',
      version: 3,
    })
  })

  it('dresses rooms by their purpose with the new props', () => {
    const seen = new Set<string>()
    for (const theme of mapThemes.dungeon)
      for (let seed = 1; seed < 60; seed += 3)
        for (const p of generateMap(base('dungeon', seed, { theme, cols: 40, rows: 30 })).props)
          seen.add(p.prop)
    for (const prop of ['forge', 'anvil', 'cage', 'desk', 'throne', 'banner', 'training-dummy'])
      expect(seen.has(prop), prop).toBe(true)
  })
})
