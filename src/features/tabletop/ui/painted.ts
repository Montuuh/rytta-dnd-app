import {
  densityFactor,
  hash01,
  noise,
  rng,
  T,
  type GeneratedMap,
  type Tile,
} from '../domain/generator'
import { decalArt, decalPixels, floorArt, tilePixels, type FloorArt } from './map-art'
import {
  decalUrl,
  floorUrl,
  materialsOf,
  treeUrl,
  wallUrl,
  type MapArt,
  type Materials,
  type Scatter,
} from './materials'
import { outline, torchSpots, type Ctx } from './paint-kit'
import { propPictures } from './prop-pictures'

// RYT-068: the painted look with the author's painted tiles (materials.ts). Floors are tiles over
// each room with their own offset and turn, blended with a worn tile in soft patches; decals and
// a shadow along the walls; walls a band of wall tile with a dark edge; the rock outside an
// untextured dark ground with faint clouds and specks, as battle maps leave what nobody walks on.
// Drawing is in squares (the context is scaled by the square size); a tile covers 4 × 4 squares.

const TILE = 4
/** Tiles drawn in whole squares (checks, terracotta): turned and moved only by whole squares. */
const gridded = new Set<FloorArt>([
  'marble-checker',
  'marble-white',
  'terracotta',
  'sandstone-tiles',
  'mosaic',
  'carpet-red',
  'kitchen-flagstone',
])

/** Floors too bright or busy for the table, and how much shade quiets them (0–1). */
const loud: Partial<Record<FloorArt, number>> = {
  mosaic: 0.4,
  'marble-checker': 0.45,
  'carpet-red': 0.25,
  'parquet-chevron': 0.28,
  'parquet-herringbone': 0.25,
  'brick-herringbone': 0.22,
  'brick-running': 0.3,
  terracotta: 0.22,
  'marble-white': 0.3,
  'autumn-leaves': 0.15,
  'sandstone-tiles': 0.22,
  'sand-desert': 0.18,
  ice: 0.18,
  snow: 0.14,
  'planks-oak-dark': -0.12,
  'cave-rock-damp': -0.06,
  obsidian: -0.05,
}

/** The shade that quiets a loud floor, filled over it. */
/** Busy floors (many small contrasting pieces) also lose contrast: their average colour over them. */
const busy: Partial<Record<FloorArt, number>> = {
  mosaic: 0.45,
  'marble-checker': 0.35,
  'hex-tiles': 0.15,
  cobblestone: 0.15,
}

function quiet(p: Painting, name: FloorArt, area: Path2D | null) {
  const a = loud[name]
  const b = busy[name]
  if (!a && !b) return
  const { ctx } = p
  const fill = (style: string) => {
    ctx.fillStyle = style
    if (area) ctx.fill(area)
    else ctx.fillRect(0, 0, p.cols, p.rows)
  }
  ctx.save()
  if (b) fill(rgba(floorArt[name], b))
  if (a) fill(a > 0 ? `rgba(22, 18, 14, ${a})` : `rgba(255, 236, 210, ${-a})`)
  ctx.restore()
}

interface Painting {
  ctx: Ctx
  map: GeneratedMap
  art: MapArt
  m: Materials
  px: number
  cols: number
  rows: number
  seed: number
  tile: (x: number, y: number) => Tile
}

/** A repeating fill of a tile, moved and turned (a whole number of quarter turns). */
function pattern(p: Painting, url: string, ox = 0, oy = 0, turn = 0, size = TILE) {
  const image = p.art.get(url)
  if (!image) return null
  const fill = p.ctx.createPattern(image, 'repeat')
  if (!fill) return null
  const s = size / tilePixels
  if (typeof DOMMatrix !== 'undefined')
    fill.setTransform(new DOMMatrix().translateSelf(ox, oy).rotateSelf(turn).scaleSelf(s, s))
  return fill
}

/** A floor's fill for one area: its own offset and turn, from the area's number. */
function floorFill(p: Painting, name: FloorArt, salt: number) {
  const h = hash01(salt, 17, p.seed)
  const k = hash01(salt, 29, p.seed)
  const whole = gridded.has(name)
  const ox = whole ? Math.floor(h * TILE) : h * TILE
  const oy = whole ? Math.floor(k * TILE) : k * TILE
  return pattern(p, floorUrl(name), ox, oy, Math.floor(hash01(salt, 41, p.seed) * 4) * 90)
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/**
 * Soft light and shade over an area, from a small canvas of smooth noise drawn smoothed: clouds
 * on the rock, gentle unevenness on floors.
 */
function clouds(
  p: Painting,
  salt: number,
  scale: number,
  light: string,
  dark: string,
  strength: [number, number],
) {
  if (typeof document === 'undefined') return
  const k = 2
  const canvas = document.createElement('canvas')
  canvas.width = p.cols * k + 2
  canvas.height = p.rows * k + 2
  const g = canvas.getContext('2d')
  if (!g) return
  const image = g.createImageData(canvas.width, canvas.height)
  const a = noise(p.seed + salt)
  const b = noise(p.seed + salt + 1)
  const lit = parseInt(light.slice(1), 16)
  const shade = parseInt(dark.slice(1), 16)
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const v =
        a(x / (k * scale), y / (k * scale)) * 0.65 +
        b(x / (k * scale * 0.4), y / (k * scale * 0.4)) * 0.35
      const i = (y * canvas.width + x) * 4
      const c = v > 0.5 ? lit : shade
      image.data[i] = (c >> 16) & 255
      image.data[i + 1] = (c >> 8) & 255
      image.data[i + 2] = c & 255
      image.data[i + 3] = Math.round(
        Math.min(1, Math.abs(v - 0.5) * 2.4) * 255 * (v > 0.5 ? strength[0] : strength[1]),
      )
    }
  g.putImageData(image, 0, 0)
  const { ctx } = p
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, -1 / k, -1 / k, canvas.width / k, canvas.height / k)
  ctx.restore()
}

/** The rock outside an underground map: never textured, a dark ground that recedes. */
function rockGround(p: Painting) {
  const { ctx, cols, rows, m } = p
  ctx.fillStyle = m.rock.base
  ctx.fillRect(0, 0, cols, rows)
  clouds(p, 101, 5, m.rock.light, m.rock.dark, [0.75, 0.7])
  // Grit: tiny specks, a few brighter, like dust over stone in the dark.
  const random = rng(p.seed + 303)
  const faint = new Path2D()
  const bright = new Path2D()
  for (let n = cols * rows * 5; n > 0; n--) {
    const x = random.next() * cols
    const y = random.next() * rows
    const r = 0.012 + random.next() ** 3 * 0.035
    const into = random.next() < 0.06 ? bright : faint
    into.moveTo(x + r, y)
    into.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.fillStyle = rgba(m.rock.speck, 0.16)
  ctx.fill(faint)
  ctx.fillStyle = rgba(m.rock.speck, 0.38)
  ctx.fill(bright)
}

/** Squares as rectangles, for filling an area's floor. */
function rectsPath(rects: readonly (readonly [number, number, number, number])[]) {
  const path = new Path2D()
  for (const [x, y, w, h] of rects) path.rect(x, y, w, h)
  return path
}

/** Which floor each open square takes: by its room (purpose or id), passages their own. */
function floorPlan(p: Painting) {
  const { map, m, cols } = p
  const names: FloorArt[] = []
  const plan = new Int16Array(map.tiles.length).fill(-1)
  const index = (name: FloorArt) => {
    let i = names.indexOf(name)
    if (i < 0) i = names.push(name) - 1
    return i
  }
  index(m.floor)
  map.rooms.forEach((room) => {
    const name = room.id.startsWith('pass-')
      ? m.passage
      : (m.byId?.[room.id] ??
        (room.id.startsWith('guest') ? m.rooms?.guest : undefined) ??
        (room.use ? m.rooms?.[room.use] : undefined) ??
        m.floor)
    const k = index(name)
    for (const [x, y, w, h] of room.rects)
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) plan[j * cols + i] = k
  })
  // Passages not listed as rooms (caves' tunnels) keep the main floor.
  return { names, plan }
}

/** Patches of the worn floor over the main one, gathered where smooth noise is high. */
function wearPatches(p: Painting, on: (i: number) => boolean, rare = 0) {
  const { ctx, cols, rows, m, seed, px } = p
  if (!m.wear || typeof document === 'undefined') return
  const fill = pattern(p, floorUrl(m.wear), 1.3, 2.1, 90)
  if (!fill) return
  // The mask: four pixels a square of smooth noise, drawn smoothed, so patches have soft edges.
  const k = 4
  const mask = document.createElement('canvas')
  mask.width = cols * k
  mask.height = rows * k
  const mg = mask.getContext('2d')
  const layer = document.createElement('canvas')
  layer.width = ctx.canvas.width
  layer.height = ctx.canvas.height
  const g = layer.getContext('2d')
  if (!mg || !g) return
  const image = mg.createImageData(mask.width, mask.height)
  const grain = noise(seed + 7)
  const fine = noise(seed + 13)
  const lo = 0.5 + rare
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      if (!on(Math.floor(y / k) * cols + Math.floor(x / k))) continue
      const v = grain(x / (k * 4.5), y / (k * 4.5)) * 0.8 + fine(x / (k * 1.3), y / (k * 1.3)) * 0.2
      const a = Math.min(1, Math.max(0, (v - lo) / 0.12))
      image.data[(y * mask.width + x) * 4 + 3] = Math.round(a * 0.85 * 255)
    }
  mg.putImageData(image, 0, 0)
  g.scale(px, px)
  g.fillStyle = fill
  g.fillRect(0, 0, cols, rows)
  g.globalCompositeOperation = 'destination-in'
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(mask, 0, 0, cols, rows)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
  layer.width = 0
  layer.height = 0
}

/** Decals scattered square by square, under the props: cracks, moss, pebbles, leaves… */
function scatter(p: Painting, where: (x: number, y: number, s: Scatter) => boolean) {
  const { ctx, cols, rows, m, seed, map } = p
  const factor = densityFactor[map.options.density]
  m.decals.forEach((d, k) => {
    const atlas = p.art.get(decalUrl(d.art))
    if (!atlas) return
    const count = decalArt[d.art]
    ctx.save()
    ctx.globalAlpha = d.alpha ?? 1
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (hash01(x * 7 + k, y * 13 - k, seed + 500 + k * 31) > d.share * factor) continue
        if (!where(x, y, d)) continue
        const h = hash01(x, y, seed + 600 + k)
        const cell = Math.floor(hash01(y, x, seed + 700 + k) * count)
        const size = d.size[0] + (d.size[1] - d.size[0]) * h
        const cx = x + 0.2 + hash01(x + 3, y, seed + k) * 0.6
        const cy = y + 0.2 + hash01(x, y + 3, seed + k) * 0.6
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(h * Math.PI * 2)
        if (hash01(x, y, seed + 800 + k) > 0.5) ctx.scale(-1, 1)
        ctx.drawImage(
          atlas,
          (cell % 3) * decalPixels,
          Math.floor(cell / 3) * decalPixels,
          decalPixels,
          decalPixels,
          -size / 2,
          -size / 2,
          size,
          size,
        )
        ctx.restore()
      }
    ctx.restore()
  })
}

/** A soft shadow inside an area along its edge (the walls' ambient shade). */
function innerShadow(p: Painting, area: Path2D, depth: number, alpha: number) {
  const { ctx, cols, rows, px } = p
  const ring = new Path2D()
  ring.rect(-3, -3, cols + 6, rows + 6)
  ring.addPath(area)
  ctx.save()
  ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`
  ctx.shadowBlur = Math.max(2, depth * px)
  ctx.fillStyle = '#000'
  ctx.fill(ring, 'evenodd')
  ctx.restore()
}

/** Light pooling round a point (screen blend: it lifts what is under it). */
function glow(
  p: Painting,
  x: number,
  y: number,
  r: number,
  rgb: readonly [number, number, number],
  a: number,
) {
  const { ctx } = p
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  const [cr, cg, cb] = rgb
  g.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a})`)
  g.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.4})`)
  g.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`)
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()
}

/** Water by its tile (lava glows); a dark shore round it. */
function water(p: Painting, area: Path2D) {
  const { ctx, m } = p
  const fill = pattern(p, floorUrl(m.water), 0.7, 1.9)
  ctx.save()
  ctx.strokeStyle = m.hot ? 'rgba(20, 8, 4, 0.75)' : 'rgba(12, 10, 8, 0.55)'
  ctx.lineWidth = 0.42
  ctx.stroke(area)
  ctx.fillStyle = fill ?? (m.hot ? '#c8501f' : '#2f5a66')
  ctx.fill(area)
  ctx.clip(area)
  ctx.strokeStyle = m.hot ? 'rgba(255, 150, 60, 0.35)' : 'rgba(5, 15, 22, 0.35)'
  ctx.lineWidth = 0.9
  ctx.stroke(area)
  ctx.restore()
  ctx.strokeStyle = m.hot ? 'rgba(255, 190, 90, 0.55)' : 'rgba(220, 236, 240, 0.28)'
  ctx.lineWidth = 0.045
  ctx.stroke(area)
}

/** A band of wall tile outside an area's edge, with a dark outer edge and a cast shadow. */
function wallBand(p: Painting, area: Path2D, width: number, round: boolean) {
  const { ctx, cols, rows, m } = p
  const outside = new Path2D()
  outside.rect(-3, -3, cols + 6, rows + 6)
  outside.addPath(area)
  const fill = pattern(p, wallUrl(m.wall), 0.37, 0.61, 0, 2)
  ctx.save()
  ctx.clip(outside, 'evenodd')
  ctx.lineJoin = round ? 'round' : 'miter'
  ctx.miterLimit = 4
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.lineWidth = (width + 0.32) * 2
  ctx.stroke(area)
  ctx.strokeStyle = '#0a0806'
  ctx.lineWidth = (width + 0.06) * 2
  ctx.stroke(area)
  ctx.strokeStyle = fill ?? '#6f675b'
  ctx.lineWidth = width * 2
  ctx.stroke(area)
  // The top of the wall catches the light near the room and falls off outwards.
  ctx.strokeStyle = 'rgba(255, 245, 230, 0.1)'
  ctx.lineWidth = width
  ctx.stroke(area)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.lineWidth = width * 2
  ctx.setLineDash([])
  ctx.restore()
  // A crisp line where wall meets floor.
  ctx.save()
  ctx.lineJoin = round ? 'round' : 'miter'
  ctx.strokeStyle = 'rgba(8, 6, 4, 0.9)'
  ctx.lineWidth = 0.05
  ctx.stroke(area)
  ctx.restore()
}

/**
 * A cavern's edge: the wall rock lit near the floor and fading smoothly into the dark within
 * about a square (nothing further out is textured), with a crisp dark rim. The fade is the
 * blurred shadow of the floor, used as the rock's opacity on a layer of its own.
 */
function rockEdge(p: Painting, area: Path2D) {
  const { ctx, cols, rows, m, px } = p
  const outside = new Path2D()
  outside.rect(-3, -3, cols + 6, rows + 6)
  outside.addPath(area)
  const layer = typeof document === 'undefined' ? null : document.createElement('canvas')
  const g = layer?.getContext('2d')
  if (layer && g) {
    layer.width = ctx.canvas.width
    layer.height = ctx.canvas.height
    g.scale(px, px)
    g.lineJoin = 'round'
    g.shadowColor = '#fff'
    g.shadowBlur = px * 0.8
    g.fillStyle = '#fff'
    g.strokeStyle = '#fff'
    g.lineWidth = 0.6
    g.fill(area)
    g.stroke(area)
    g.shadowColor = 'transparent'
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = pattern({ ...p, ctx: g }, wallUrl(m.wall), 0.37, 0.61, 0, 2.5) ?? '#5b544b'
    g.fillRect(-1, -1, cols + 2, rows + 2)
    // In shade: the rock is a wall in the dark, not a lit rim.
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = 'rgba(8, 6, 5, 0.42)'
    g.fillRect(-1, -1, cols + 2, rows + 2)
    ctx.save()
    ctx.clip(outside, 'evenodd')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
    layer.width = 0
    layer.height = 0
  }
  ctx.save()
  ctx.clip(outside, 'evenodd')
  ctx.lineJoin = 'round'
  // The rock's lip catches a little light; a soft shade just outside it.
  ctx.strokeStyle = 'rgba(255, 240, 220, 0.07)'
  ctx.lineWidth = 0.36
  ctx.stroke(area)
  ctx.restore()
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(6, 5, 4, 0.85)'
  ctx.lineWidth = 0.07
  ctx.stroke(area)
  ctx.restore()
}

/** A torch or a cold sconce on the wall: an iron bracket and its flame. */
function bracket(
  p: Painting,
  x: number,
  y: number,
  nx: number,
  ny: number,
  rgb: readonly [number, number, number],
) {
  const { ctx } = p
  const fx = x + nx * 0.2
  const fy = y + ny * 0.2
  ctx.fillStyle = '#211c18'
  ctx.fillRect(x - 0.09, y - 0.09, 0.18, 0.18)
  ctx.strokeStyle = '#4a3220'
  ctx.lineWidth = 0.06
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(fx, fy)
  ctx.stroke()
  const [r, g, b] = rgb
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`
  ctx.beginPath()
  ctx.arc(fx, fy, 0.22, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `rgb(${Math.round(r * 0.9)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.45)})`
  ctx.beginPath()
  ctx.arc(fx, fy, 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `rgb(${Math.min(255, r + 30)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 80)})`
  ctx.beginPath()
  ctx.arc(fx, fy, 0.055, 0, Math.PI * 2)
  ctx.fill()
}

/* ------------------------------------------------------------------ underground */

function underground(p: Painting) {
  const { ctx, map, m, cols, seed } = p
  const cave = map.options.kind === 'cave'
  const open = (t: Tile) => t !== T.rock
  const floor = outline(map, open, cave ? 0.22 : 0, (i) => map.soft[i] === 1, cave ? 5 : 2)
  rockGround(p)

  ctx.save()
  ctx.clip(floor)
  const { names, plan } = floorPlan(p)
  const base = floorFill(p, m.floor, 0)
  if (!base) {
    ctx.restore()
    return false
  }
  ctx.fillStyle = base
  ctx.fillRect(0, 0, cols, p.rows)
  quiet(p, m.floor, null)
  map.rooms.forEach((room, i) => {
    const k = plan[room.rects[0] ? room.rects[0][1] * cols + room.rects[0][0] : 0] ?? 0
    const name = names[k] ?? m.floor
    // Caverns flow into each other: one floor, no seams where reveal areas meet.
    if (cave && name === m.floor) return
    const fill = floorFill(p, name, i + 1)
    if (!fill) return
    const area = rectsPath(room.rects)
    ctx.fillStyle = fill
    ctx.fill(area)
    quiet(p, name, area)
  })
  const main = names.indexOf(m.floor)
  const passage = names.indexOf(m.passage)
  wearPatches(p, (i) => {
    const t = map.tiles[i] as Tile
    return (
      (t === T.floor || t === T.corridor) &&
      (plan[i] === main || plan[i] === -1 || plan[i] === passage)
    )
  })
  clouds(p, 211, 3, '#fff4e0', '#000000', [0.05, 0.2])
  if (map.tiles.includes(T.water))
    water(
      p,
      outline(
        map,
        (t) => t === T.water,
        0.18,
        () => true,
      ),
    )
  const tile = p.tile
  const wet = (x: number, y: number) => tile(x, y) === T.water
  scatter(p, (x, y, d) => {
    const t = tile(x, y)
    if (t !== T.floor && t !== T.corridor) return false
    if (wet(x + 1, y) || wet(x - 1, y) || wet(x, y + 1) || wet(x, y - 1)) return false
    const edge =
      tile(x + 1, y) === T.rock ||
      tile(x - 1, y) === T.rock ||
      tile(x, y + 1) === T.rock ||
      tile(x, y - 1) === T.rock
    return d.where === 'edge' ? edge : !d.where || d.where === 'floor'
  })
  innerShadow(p, floor, 0.22, 0.75)
  innerShadow(p, floor, 0.75, 0.5)
  // Light: torches on the walls of built rooms, a few cold sconces in crypts and icy halls.
  const torches = cave ? [] : torchSpots(map, tile)
  torches.forEach(([x, y, nx, ny], i) => {
    const rgb = m.sconce && hash01(i, 3, seed) < 0.5 ? m.sconce : m.light
    glow(p, x + nx * 0.4, y + ny * 0.4, 2.6, rgb, 0.32)
  })
  if (m.hot)
    for (let y = 0; y < p.rows; y++)
      for (let x = 0; x < cols; x++)
        if (wet(x, y) && hash01(x, y, seed + 9) < 0.18)
          glow(p, x + 0.5, y + 0.5, 2.2, [255, 120, 40], 0.22)
  ctx.restore()

  if (cave) rockEdge(p, floor)
  else wallBand(p, floor, 0.34, false)
  // Secret doors read as wall from inside the room: the room's wall carried on across the doorway,
  // in the band's own layers and tile (map space, never turned with the door), wide enough to hide
  // the passage's own edge lines, and deeper than the margin a revealed room shows (0.4).
  const wall = pattern(p, wallUrl(m.wall), 0.37, 0.61, 0, 2)
  for (const d of map.doors) {
    if (!d.secret) continue
    const flat = d.rotation !== 90
    // The passage side: south or north of a flat door, east or west of an upright one.
    const sign = flat
      ? tile(Math.floor(d.x), Math.round(d.y)) === T.corridor
        ? 1
        : -1
      : tile(Math.round(d.x), Math.floor(d.y)) === T.corridor
        ? 1
        : -1
    // A band from `from` to `to` squares into the passage, `half` squares either side of the door,
    // with its edges on whole device pixels so the layers meet without antialiased hairlines.
    const snap = (v: number) => Math.round(v * p.px) / p.px
    const band = (from: number, to: number, half: number) => {
      const [x0, y0, x1, y1] = flat
        ? [
            d.x - half,
            sign > 0 ? d.y + from : d.y - to,
            d.x + half,
            sign > 0 ? d.y + to : d.y - from,
          ]
        : [
            sign > 0 ? d.x + from : d.x - to,
            d.y - half,
            sign > 0 ? d.x + to : d.x - from,
            d.y + half,
          ]
      return [snap(x0), snap(y0), snap(x1) - snap(x0), snap(y1) - snap(y0)]
    }
    const fill = (style: string | CanvasPattern, depth: number, half = 0.56, from = 0) => {
      const [x, y, w, h] = band(from, depth, half)
      ctx.fillStyle = style
      ctx.fillRect(x!, y!, w!, h!)
    }
    // Behind the wall, the outside's own dark ground (its clouds and specks painted again, so no
    // patch shows) as deep as the wall's shade, past a revealed room's feathered margin (0.4 plus
    // the fog's blur), as wide as the passage's own wall bands: from the room the wall looks like
    // any other wall, with nothing behind it.
    const [gx, gy, gw, gh] = band(0.34, 0.66, 1)
    ctx.save()
    ctx.beginPath()
    ctx.rect(gx!, gy!, gw!, gh!)
    ctx.clip()
    rockGround(p)
    ctx.restore()
    // wallBand's layers outside a straight wall: its shade to 0.66 and its dark edge to 0.40.
    fill('rgba(0, 0, 0, 0.45)', 0.66, 1, 0.34)
    fill('#0a0806', 0.4, 1, 0.34)
    // Seen from the passage, a dead end: its own wall closes it past that margin, in the band's
    // layers (dark outer edge, wall tile lit towards the passage, the crisp line on its floor).
    fill('#0a0806', 1, 0.56, 0.64)
    fill(wall ?? '#6f675b', 1, 0.5, 0.68)
    fill('rgba(255, 245, 230, 0.1)', 1, 0.5, 0.84)
    fill('rgba(8, 6, 4, 0.9)', 1.025, 0.5, 0.975)
    // The wall across the doorway, as deep as the room's band beside it.
    fill('#0a0806', 0.4)
    fill(wall ?? '#6f675b', 0.34)
    fill('rgba(255, 245, 230, 0.1)', 0.17)
    // The crisp line where wall meets the room's floor, as wallBand draws it.
    const [lx, ly, lw, lh] = flat
      ? [d.x - 0.56, d.y - 0.025, 1.12, 0.05]
      : [d.x - 0.025, d.y - 0.56, 0.05, 1.12]
    ctx.fillStyle = 'rgba(8, 6, 4, 0.9)'
    ctx.fillRect(lx!, ly!, lw!, lh!)
  }
  torches.forEach(([x, y, nx, ny], i) =>
    bracket(p, x, y, nx, ny, m.sconce && hash01(i, 3, seed) < 0.5 ? m.sconce : m.light),
  )
  return true
}

/* ------------------------------------------------------------------ outdoors */

function ground(p: Painting, on: (i: number) => boolean, rare = 0) {
  const { ctx, m, cols, rows } = p
  const fill = floorFill(p, m.floor, 0)
  if (!fill) return false
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, cols, rows)
  quiet(p, m.floor, null)
  wearPatches(p, on, rare)
  clouds(p, 223, 4, '#fff6dc', '#000000', [0.06, 0.18])
  return true
}

function forest(p: Painting) {
  const { ctx, map, m, cols, rows, seed, px } = p
  const tile = p.tile
  if (!ground(p, (i) => map.tiles[i] === T.grass || map.tiles[i] === T.tree)) return false
  // Trails: the worn ground with a soft edge.
  const trail = pattern(p, floorUrl(m.passage), 0.5, 0.5)
  const along = (
    kind: 'path' | 'water',
    width: (w: number) => number,
    style: string | CanvasPattern,
    alpha = 1,
  ) => {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = style
    for (const line of map.lines.filter((l) => l.kind === kind)) {
      ctx.lineWidth = width(line.width)
      ctx.beginPath()
      line.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
    ctx.restore()
  }
  if (trail) {
    along('path', (w) => w * 1.05 + 0.45, trail, 0.4)
    along('path', (w) => w * 1.05, trail)
  }
  along('path', (w) => w * 0.4, 'rgba(255, 245, 220, 0.06)')
  // Streams: a muddy bank, the water tile, a darker channel.
  const flow = pattern(p, floorUrl(m.water), 0.3, 0.8)
  along('water', (w) => w * 1.1 + 0.55, 'rgba(48, 36, 20, 0.55)')
  if (flow) along('water', (w) => w * 1.1, flow)
  along('water', (w) => w * 0.45, 'rgba(6, 18, 26, 0.25)')
  const stream = map.lines.filter((l) => l.kind === 'water').flatMap((l) => l.points)
  const pond = (i: number) => {
    const x = (i % cols) + 0.5
    const y = Math.floor(i / cols) + 0.5
    return !stream.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 < 4)
  }
  if (map.tiles.some((t, i) => t === T.water && pond(i)))
    water(
      p,
      outline(
        { ...map, tiles: map.tiles.map((t, i) => (t === T.water && pond(i) ? T.water : T.grass)) },
        (t) => t === T.water,
        0.18,
        () => true,
      ),
    )
  scatter(p, (x, y, d) => {
    const t = tile(x, y)
    if (d.where === 'path') return t === T.path
    return t === T.grass
  })
  // Trees: drop shadows, then crowns from the top down so lower crowns overlap.
  const variants = (m.trees ?? [0]).filter((v) => v < (propPictures.tree?.sizes['2x2'] ?? 0))
  const pad = propPictures.tree?.pad ?? 0.2
  const trees = [...map.trees].sort((a, b) => a.y - b.y)
  for (const t of trees) {
    const v =
      variants[Math.floor(hash01(Math.floor(t.x * 3), Math.floor(t.y * 3), seed) * variants.length)]
    const image = v === undefined ? undefined : p.art.get(treeUrl(v))
    if (!image) continue
    // The picture's crown fills its 2 squares less the importer's inset; scaled to the tree's crown.
    const scale = (t.r * 2) / 1.92
    const side = (2 + pad * 2) * scale
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.rotate(
      Math.floor(hash01(Math.floor(t.y * 5), Math.floor(t.x * 5), seed) * 4) * (Math.PI / 2),
    )
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)'
    ctx.shadowBlur = 0.25 * px
    ctx.shadowOffsetX = 0.2 * px
    ctx.shadowOffsetY = 0.26 * px
    ctx.drawImage(image, -side / 2, -side / 2, side, side)
    ctx.restore()
  }
  // The wood darkens towards the map's edges, framing the scene.
  const edge = ctx.createRadialGradient(
    cols / 2,
    rows / 2,
    Math.min(cols, rows) * 0.35,
    cols / 2,
    rows / 2,
    Math.max(cols, rows) * 0.72,
  )
  edge.addColorStop(0, 'rgba(0, 0, 0, 0)')
  edge.addColorStop(1, 'rgba(0, 0, 0, 0.3)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, cols, rows)
  return true
}

function tavern(p: Painting) {
  const { ctx, map, m, cols } = p
  const tile = p.tile
  if (!ground(p, (i) => map.tiles[i] === T.grass, 0.1)) return false
  if (map.tiles.includes(T.path)) {
    const path = outline(
      map,
      (t) => t === T.path,
      0,
      () => false,
    )
    const fill = floorFill(p, m.passage, 77)
    ctx.save()
    ctx.fillStyle = 'rgba(30, 22, 12, 0.35)'
    ctx.lineWidth = 0.3
    ctx.strokeStyle = 'rgba(30, 22, 12, 0.3)'
    ctx.stroke(path)
    ctx.fillStyle = fill ?? '#8a7150'
    ctx.fill(path)
    ctx.restore()
  }
  scatter(p, (x, y, d) => (d.where === 'ground' ? tile(x, y) === T.grass : false))
  const building = outline(
    map,
    (t) => t === T.rock || t === T.plank || t === T.floor,
    0,
    () => false,
  )
  ctx.save()
  ctx.translate(0.28, 0.34)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)'
  ctx.fill(building)
  ctx.restore()
  const wall = pattern(p, wallUrl(m.wall), 0.21, 0.43, 0, 2)
  ctx.fillStyle = wall ?? '#6f675b'
  ctx.fill(building)
  ctx.fillStyle = 'rgba(255, 245, 230, 0.06)'
  ctx.fill(building)
  const floors = outline(
    map,
    (t) => t === T.plank || t === T.floor,
    0,
    () => false,
  )
  ctx.save()
  ctx.clip(floors)
  const { names, plan } = floorPlan(p)
  map.rooms.forEach((room, i) => {
    if (room.id === 'yard') return
    const first = room.rects[0]
    const k = first ? (plan[first[1] * cols + first[0]] ?? 0) : 0
    const name = names[k] ?? m.floor
    const fill = floorFill(p, name, i + 1)
    if (!fill) return
    const area = rectsPath(room.rects)
    ctx.fillStyle = fill
    ctx.fill(area)
    quiet(p, name, area)
  })
  // Doorways cut through the wall take the floor of the room they open from.
  ctx.fillStyle = floorFill(p, m.byId?.hall ?? m.floor, 99) ?? '#6e4a2c'
  const doorways = new Path2D()
  for (let i = 0; i < map.tiles.length; i++)
    if (map.tiles[i] === T.plank && plan[i] === -1)
      doorways.rect(i % cols, Math.floor(i / cols), 1, 1)
  ctx.fill(doorways)
  scatter(p, (x, y, d) => {
    const t = tile(x, y)
    if (t !== T.plank && t !== T.floor) return false
    const edge = [tile(x + 1, y), tile(x - 1, y), tile(x, y + 1), tile(x, y - 1)].includes(T.rock)
    return d.where === 'edge' ? edge : !d.where || d.where === 'floor'
  })
  innerShadow(p, floors, 0.2, 0.7)
  innerShadow(p, floors, 0.6, 0.4)
  ctx.restore()
  ctx.strokeStyle = 'rgba(8, 6, 4, 0.9)'
  ctx.lineWidth = 0.05
  ctx.stroke(floors)
  ctx.strokeStyle = '#0d0a07'
  ctx.lineWidth = 0.1
  ctx.stroke(building)
  return true
}

/**
 * Paints a generated map with its theme's tiles. Returns false when the main tiles did not load,
 * so the caller can fall back to the drawn painted look.
 */
export function paintTextured(ctx: Ctx, map: GeneratedMap, art: MapArt, px: number) {
  const { cols, rows, kind, seed } = map.options
  const p: Painting = {
    ctx,
    map,
    art,
    m: materialsOf(map),
    px,
    cols,
    rows,
    seed,
    tile: (x, y) =>
      x < 0 || y < 0 || x >= cols || y >= rows ? T.rock : (map.tiles[y * cols + x] as Tile),
  }
  if (!art.get(floorUrl(p.m.floor))) return false
  ctx.save()
  const done = kind === 'forest' ? forest(p) : kind === 'tavern' ? tavern(p) : underground(p)
  ctx.restore()
  return done
}
