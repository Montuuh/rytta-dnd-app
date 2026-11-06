import { describe, expect, it } from 'vitest'
import { gridFromName, isUvttName, parseUvtt, uvttLayout, uvttSize } from './uvtt'
import { itemSchema } from './model'

/** Two rooms side by side inside a 10 × 6 map, a door between them, a window and a pillar. */
const sample = {
  format: 0.3,
  resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 6 }, pixels_per_grid: 72 },
  line_of_sight: [
    // Room A: x 1–5, y 1–5; room B: x 5–9, y 1–5. The shared wall has a gap at y 2.5–3.5.
    [
      { x: 1, y: 1 },
      { x: 9, y: 1 },
      { x: 9, y: 5 },
      { x: 1, y: 5 },
      { x: 1, y: 1 },
    ],
    [
      { x: 5, y: 1 },
      { x: 5, y: 2.5 },
    ],
    [
      { x: 5, y: 3.5 },
      { x: 5, y: 5 },
    ],
  ],
  objects_line_of_sight: [
    [
      { x: 7.2, y: 2.2 },
      { x: 7.8, y: 2.2 },
      { x: 7.8, y: 2.8 },
      { x: 7.2, y: 2.8 },
      { x: 7.2, y: 2.2 },
    ],
  ],
  portals: [
    {
      position: { x: 5, y: 3 },
      bounds: [
        { x: 5, y: 2.5 },
        { x: 5, y: 3.5 },
      ],
      rotation: 1.5708,
      closed: true,
      freestanding: false,
    },
    {
      position: { x: 3, y: 1 },
      bounds: [
        { x: 2.5, y: 1 },
        { x: 3.5, y: 1 },
      ],
      rotation: 0,
      closed: false,
      freestanding: false,
    },
  ],
  lights: [{ position: { x: 2, y: 2 }, range: 4, intensity: 1, color: 'ffeccd8b', shadows: true }],
  image:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
}

describe('RYT-065 Universal VTT import', () => {
  it('reads the grid, splits the floor along the walls and joins the rooms by their door', () => {
    const layout = uvttLayout(parseUvtt(JSON.stringify(sample)))
    expect(layout).toMatchObject({ cols: 10, rows: 6, pixelsPerSquare: 72, windows: 1, lights: 1 })
    // Outside, room A and room B (the pillar's inside is too small to be an area).
    expect(layout.rooms).toHaveLength(3)
    const areaOf = (x: number, y: number) =>
      layout.rooms.find((r) =>
        r.rects.some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h),
      )?.id
    const a = areaOf(2, 2)
    const b = areaOf(6, 4)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a).not.toBe(b)
    expect(areaOf(0, 0)).not.toBe(a)
    // One door (the open portal is a window), across the gap, joining A and B.
    expect(layout.doors).toHaveLength(1)
    const door = layout.doors[0]!
    expect(door).toMatchObject({ kind: 'door', x: 5, y: 3, w: 1, rotation: 90 })
    expect(new Set((door.data as { rooms: string[] }).rooms)).toEqual(new Set([a, b]))
    expect(() =>
      itemSchema.parse({
        id: crypto.randomUUID(),
        label: null,
        combatant_id: null,
        character_id: null,
        ...door,
      }),
    ).not.toThrow()
  })

  it('honours the map origin and refuses what is not a Universal VTT file', () => {
    const shifted = {
      ...sample,
      resolution: { ...sample.resolution, map_origin: { x: 10, y: 20 } },
      line_of_sight: sample.line_of_sight.map((l) => l.map((p) => ({ x: p.x + 10, y: p.y + 20 }))),
      objects_line_of_sight: [],
      portals: sample.portals.map((p) => ({
        ...p,
        position: { x: p.position.x + 10, y: p.position.y + 20 },
        bounds: p.bounds.map((q) => ({ x: q.x + 10, y: q.y + 20 })),
      })),
    }
    const layout = uvttLayout(parseUvtt(JSON.stringify(shifted)))
    expect(layout.doors[0]).toMatchObject({ x: 5, y: 3 })
    expect(() => parseUvtt('{"resolution":{}}')).toThrow()
    expect(() => parseUvtt('not json')).toThrow()
  })

  it('never strands squares on a 45° wall, refuses oversize maps early, counts what it leaves out', () => {
    const diagonal = {
      ...sample,
      resolution: { ...sample.resolution, map_size: { x: 20, y: 20 } },
      line_of_sight: [
        [
          { x: 0, y: 0 },
          { x: 20, y: 20 },
        ],
      ],
      objects_line_of_sight: [],
      portals: [],
    }
    const layout = uvttLayout(parseUvtt(JSON.stringify(diagonal)))
    const covered = layout.rooms.reduce(
      (n, r) => n + r.rects.reduce((m, [, , w, h]) => m + w * h, 0),
      0,
    )
    expect(covered).toBe(400)
    expect(layout.dropped).toBe(0)
    const huge = parseUvtt(
      JSON.stringify({
        ...sample,
        resolution: { ...sample.resolution, map_size: { x: 5000, y: 5000 } },
      }),
    )
    expect(uvttSize(huge)).toMatchObject({ cols: 5000, rows: 5000, fits: false })
    expect(() => uvttLayout(huge)).toThrow('size')
  })

  it('recognises export names and grid sizes in file names', () => {
    expect(isUvttName('Tavern.dd2vtt')).toBe(true)
    expect(isUvttName('map.UVTT')).toBe(true)
    expect(isUvttName('map.png')).toBe(false)
    expect(gridFromName('Crypt_30x20', 3000, 2000)).toBe(30)
    expect(gridFromName('[20 x 30] Keep', 3000, 2000)).toBe(30)
    expect(gridFromName('tower 20by30', 2000, 3000)).toBe(20)
    expect(gridFromName('no grid here', 100, 100)).toBeNull()
  })
})
