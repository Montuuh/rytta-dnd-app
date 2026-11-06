import {
  densityFactor,
  emptyMap,
  Grid,
  rng,
  runsOf,
  T,
  walkable,
  type GeneratedDoor,
  type GeneratedMap,
  type GeneratedProp,
  type GeneratorOptions,
} from './core'

interface Area {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** A tavern: a common hall with a bar and hearth, kitchen, storeroom and guest rooms, a yard. */
export function tavern(options: GeneratorOptions): GeneratedMap {
  const random = rng(options.seed)
  const factor = densityFactor[options.density]
  const { cols, rows } = options
  const grid = new Grid(cols, rows, T.grass)
  const margin = cols >= 24 && rows >= 18 ? 2 : 1
  const yard = rows >= 16 ? 3 : 2
  const bx = margin
  const by = margin
  const bw = cols - margin * 2
  const bh = rows - margin - yard
  grid.fill(bx, by, bw, bh, T.rock)
  const ix = bx + 1
  const iy = by + 1
  const iw = bw - 2
  const ih = bh - 2
  const rw = Math.max(4, Math.min(8, Math.round(iw * 0.3) + random.int(-1, 1)))
  const gh = Math.max(3, Math.min(5, Math.round(ih * 0.32) + random.int(-1, 0)))
  const kh = Math.max(Math.floor((ih - 1) / 2), gh + 2)
  const wallX = ix + iw - rw - 1
  const lw = wallX - ix
  const kitchen: Area = { id: 'kitchen', x: wallX + 1, y: iy, w: rw, h: kh }
  const store: Area = { id: 'store', x: wallX + 1, y: iy + kh + 1, w: rw, h: ih - kh - 1 }
  const hall: Area = { id: 'hall', x: ix, y: iy + gh + 1, w: lw, h: ih - gh - 1 }
  const guestCount = lw >= 14 ? random.int(2, 3) : 2
  const guests: Area[] = []
  const guestW = Math.floor((lw - (guestCount - 1)) / guestCount)
  for (let g = 0; g < guestCount; g++) {
    const x = ix + g * (guestW + 1)
    const w = g === guestCount - 1 ? ix + lw - x : guestW
    guests.push({ id: `guest${g + 1}`, x, y: iy, w, h: gh })
  }
  const areas = [hall, kitchen, store, ...guests]
  for (const area of areas)
    grid.fill(area.x, area.y, area.w, area.h, area === store ? T.floor : T.plank)
  const doors: GeneratedDoor[] = []
  const open = (x: number, y: number) => grid.set(x, y, T.plank)
  // Kitchen and store open onto the hall through the wall column.
  const ky = Math.max(hall.y, kitchen.y + kitchen.h - 1)
  open(wallX, ky)
  doors.push({ x: wallX + 1, y: ky + 0.5, rotation: 90, secret: false, rooms: ['kitchen', 'hall'] })
  const sy = store.y + Math.floor(store.h / 2)
  open(wallX, sy)
  doors.push({ x: wallX + 1, y: sy + 0.5, rotation: 90, secret: false, rooms: ['store', 'hall'] })
  // Guest rooms open downwards into the hall.
  for (const guest of guests) {
    const gx = guest.x + Math.floor(guest.w / 2)
    open(gx, iy + gh)
    doors.push({ x: gx + 0.5, y: iy + gh, rotation: 0, secret: false, rooms: [guest.id, 'hall'] })
  }
  // The front door and a path to the edge of the map.
  const fx = hall.x + random.int(2, Math.max(2, hall.w - 4))
  open(fx, by + bh - 1)
  doors.push({ x: fx + 0.5, y: by + bh, rotation: 0, secret: false, rooms: ['hall'] })
  for (let y = by + bh; y < rows; y++) {
    grid.set(fx, y, T.path)
    grid.set(fx + 1, y, T.path)
  }
  const props: GeneratedProp[] = []
  const taken = new Set<string>()
  const place = (prop: string, x: number, y: number, w = 1, h = 1, rotation = 0) => {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++)
        if (taken.has(`${i}:${j}`) || !walkable(grid.get(i, j))) return false
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) taken.add(`${i}:${j}`)
    props.push({ prop, x, y, w, h, rotation })
    return true
  }
  // Keep doorways clear.
  for (const d of doors) {
    if (d.rotation === 90) {
      taken.add(`${d.x - 1}:${Math.floor(d.y)}`).add(`${d.x}:${Math.floor(d.y)}`)
    } else {
      taken.add(`${Math.floor(d.x)}:${d.y - 1}`).add(`${Math.floor(d.x)}:${d.y}`)
    }
  }
  // Hall: the bar along the kitchen wall, barrels behind it, the hearth, stairs, tables.
  const barLength = Math.max(2, Math.min(5, hall.h - 2))
  const barX = hall.x + hall.w - 2
  place('bar', barX, hall.y + 1, 1, barLength)
  for (let j = hall.y + 1; j < hall.y + 1 + barLength; j += 2) place('barrel', barX + 1, j)
  // Its back against the west wall (rotation turns the back clockwise from north).
  place('hearth', hall.x, hall.y + Math.max(0, Math.floor(hall.h / 2) - 1), 1, 2, 270)
  place('stairs', hall.x, hall.y + hall.h - 1, 1, 1, 0)
  const tableStep = (factor > 1.2 ? 3 : factor < 0.8 ? 4 : 3) + (hall.w * hall.h > 600 ? 1 : 0)
  for (let tx = hall.x + 2; tx < barX - 1; tx += tableStep)
    for (let ty = hall.y + 1; ty < hall.y + hall.h - 1; ty += tableStep) {
      if (!random.chance(0.85 * Math.min(1, factor))) continue
      if (!place('table', tx, ty)) continue
      // Backrests away from the table: the chair on the west turns its back west.
      place('chair', tx - 1, ty, 1, 1, 270)
      place('chair', tx + 1, ty, 1, 1, 90)
      if (random.chance(0.5)) place('chair', tx, ty + 1, 1, 1, 180)
    }
  // Kitchen: an oven on the far wall, a work table, stores.
  place('hearth', kitchen.x + kitchen.w - 2, kitchen.y, 2, 1, 0)
  place('table', kitchen.x + Math.floor(kitchen.w / 2), kitchen.y + Math.floor(kitchen.h / 2))
  place('barrel', kitchen.x, kitchen.y)
  place('sack', kitchen.x + kitchen.w - 1, kitchen.y + kitchen.h - 1)
  // Storeroom: crates, barrels and sacks along the walls.
  const goods = Math.max(3, Math.round(((store.w * store.h) / 4) * factor))
  for (let n = 0, tries = 0; n < goods && tries < goods * 10; tries++) {
    const edge = random.int(0, 1)
    const x = edge ? store.x + store.w - 1 : random.int(store.x, store.x + store.w - 1)
    const y = edge ? random.int(store.y, store.y + store.h - 1) : store.y + store.h - 1
    if (place(random.pick(['crate', 'barrel', 'sack', 'crate']), x, y)) n++
  }
  // Guest rooms: a bed and a chest.
  for (const guest of guests) {
    place('bed', guest.x, guest.y, 1, 2)
    place('chest', guest.x, guest.y + 2 < guest.y + guest.h ? guest.y + 2 : guest.y + guest.h - 1)
    if (guest.w >= 3) place('table', guest.x + guest.w - 1, guest.y)
  }
  // The yard.
  const yardTop = by + bh
  place('well', Math.max(0, fx - 3), Math.min(rows - 1, yardTop + 1))
  place('cart', Math.min(cols - 2, fx + 3), Math.min(rows - 1, yardTop))
  for (let n = 0; n < Math.round(4 * factor); n++)
    place(
      random.pick(['bush', 'barrel', 'rock']),
      random.int(0, cols - 1),
      random.int(yardTop, rows - 1),
    )
  const yardRoom = {
    id: 'yard',
    rects: runsOf(cols, rows, (x, y) => grid.get(x, y) === T.grass || grid.get(x, y) === T.path),
  }
  // The cellar door in the storeroom: the way down, for the DM to use or not.
  const cellar = props.length
  for (const [cx, cy] of [
    [store.x + 1, store.y + 1],
    [store.x + store.w - 2, store.y + 1],
    [store.x + 1, store.y + store.h - 2],
  ] as const)
    if (place('trapdoor', cx, cy)) break
  const trapdoor = props[cellar]
  const map: GeneratedMap = {
    ...emptyMap(options, grid),
    notes: trapdoor ? [{ key: 'cellar', x: trapdoor.x, y: trapdoor.y }] : [],
    rooms: [
      ...areas.map((a) => ({
        id: a.id,
        rects: [[a.x, a.y, a.w, a.h] as [number, number, number, number]],
      })),
      yardRoom,
    ],
    doors,
    props,
  }
  // Half the taverns keep the kitchen on the left.
  return random.chance(0.5) ? mirror(map) : map
}

/** The same layout mirrored left to right. */
function mirror(map: GeneratedMap): GeneratedMap {
  const { cols, rows } = map.options
  const tiles = new Uint8Array(map.tiles.length)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) tiles[y * cols + (cols - 1 - x)] = map.tiles[y * cols + x]!
  const flip = (r: number) => (r === 90 ? 270 : r === 270 ? 90 : r)
  return {
    ...map,
    tiles,
    rooms: map.rooms.map((room) => ({
      ...room,
      rects: room.rects.map(
        ([x, y, w, h]) => [cols - x - w, y, w, h] as [number, number, number, number],
      ),
    })),
    doors: map.doors.map((d) => ({ ...d, x: cols - d.x })),
    notes: map.notes.map((n) => ({ ...n, x: cols - 1 - n.x })),
    props: map.props.map((p) => ({ ...p, x: cols - p.x - p.w, rotation: flip(p.rotation) })),
  }
}
