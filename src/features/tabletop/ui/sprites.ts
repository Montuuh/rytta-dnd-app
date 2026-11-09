import { hash01 } from '../domain/generator'
import { propPictures } from './prop-pictures'

// RYT-064: painted props for painted maps, drawn by Rytta on a 2D canvas (no downloaded art).
// Seen from above with a soft drop shadow, light from the top left; light sources carry a warm
// halo past their square. Drawing is in squares (ctx scaled by the pixels per square). The back of
// a wall prop faces north (rotation 0); the board turns it. Sprites are cached as image URLs.
// RYT-066: props with a painted picture (prop-pictures.ts) use it instead of the drawing.

type Ctx = CanvasRenderingContext2D

/** Pixels per square of a sprite: sharp on a 4K table at about 70 px per square. */
const PX = 96

const C = {
  ink: '#21160d',
  wood: '#8a5a33',
  woodLight: '#b57d48',
  woodDark: '#5a3820',
  plank: '#9c6a3d',
  iron: '#3f4247',
  ironLight: '#8b9096',
  gold: '#d9b24a',
  goldDark: '#9a7426',
  stone: '#8f877a',
  stoneLight: '#bdb4a4',
  stoneDark: '#5d564d',
  clay: '#a8623d',
  clayDark: '#6e3b22',
  cloth: '#cdb98f',
  bone: '#e8dfc8',
  leaf: '#3f6b2c',
  leafLight: '#6f9a45',
  leafDark: '#28461b',
  water: '#2f6a78',
  waterLight: '#6fa9b4',
  fire: '#e8752b',
  flame: '#ffd36b',
  ember: '#b8341c',
  web: 'rgba(235, 235, 230, 0.55)',
  canvas: '#d8c9a3',
  canvasDark: '#a8966e',
}
/** Blanket, rug and book colours; a variant picks among them. */
const dyes = ['#8e2f2a', '#2f4f7e', '#3f6b3a', '#6a3f7a', '#a6782e', '#7a2f4f']

interface Draw {
  ctx: Ctx
  w: number
  h: number
  v: number
}

const rnd = (v: number, k: number) => hash01(v * 13 + k, k * 7 + 3, 919)

function shadowed(ctx: Ctx, fn: () => void, depth = 1) {
  ctx.save()
  // A contact shadow, not offset: props turn on the board, and light comes from overhead.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = PX * 0.12 * depth
  fn()
  ctx.restore()
}

/** The box of the sprite being drawn: shading runs across it, light from the top left. */
let box = { w: 1, h: 1 }

/** Fill with a top-left light to bottom-right shade, then a dark outline. */
function solid(ctx: Ctx, path: Path2D, base: string, light: string, dark: string, line = 0.03) {
  const g = ctx.createLinearGradient(0, 0, box.w * 1.1, box.h * 1.1)
  g.addColorStop(0, light)
  g.addColorStop(0.45, base)
  g.addColorStop(1, dark)
  ctx.fillStyle = g
  ctx.fill(path)
  if (line > 0) {
    ctx.strokeStyle = C.ink
    ctx.lineWidth = line
    ctx.stroke(path)
  }
}

const rect = (x: number, y: number, w: number, h: number, r = 0.05) => {
  const p = new Path2D()
  p.roundRect(x, y, w, h, r)
  return p
}
const disc = (x: number, y: number, r: number) => {
  const p = new Path2D()
  p.arc(x, y, r, 0, Math.PI * 2)
  return p
}
const oval = (x: number, y: number, rx: number, ry: number, a = 0) => {
  const p = new Path2D()
  p.ellipse(x, y, rx, ry, a, 0, Math.PI * 2)
  return p
}
function lines(ctx: Ctx, color: string, width: number, segs: number[][]) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  for (const [x1, y1, x2, y2] of segs) {
    ctx.moveTo(x1!, y1!)
    ctx.lineTo(x2!, y2!)
  }
  ctx.stroke()
}

/** Wooden boards with grain, laid along x. */
function boards(ctx: Ctx, x: number, y: number, w: number, h: number, count: number, v: number) {
  const bh = h / count
  for (let i = 0; i < count; i++) {
    const tone = rnd(v, i) * 0.25
    const p = rect(x, y + i * bh + 0.01, w, bh - 0.02, 0.02)
    solid(ctx, p, mix(C.plank, C.woodDark, tone), C.woodLight, C.woodDark, 0)
    lines(ctx, 'rgba(40, 22, 10, 0.35)', 0.012, [
      [x + w * 0.1, y + i * bh + bh * 0.45, x + w * 0.9, y + i * bh + bh * 0.5],
    ])
  }
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 0.03
  ctx.strokeRect(x, y, w, h)
}

function flame(ctx: Ctx, x: number, y: number, r: number) {
  const outer = new Path2D()
  outer.moveTo(x, y - r)
  outer.bezierCurveTo(x + r * 0.9, y - r * 0.2, x + r * 0.7, y + r * 0.8, x, y + r * 0.8)
  outer.bezierCurveTo(x - r * 0.7, y + r * 0.8, x - r * 0.9, y - r * 0.2, x, y - r)
  ctx.fillStyle = C.fire
  ctx.fill(outer)
  ctx.fillStyle = C.flame
  ctx.fill(oval(x, y + r * 0.2, r * 0.35, r * 0.45))
}

/** A warm halo: drawn first, under the light's own body. */
function glow(ctx: Ctx, x: number, y: number, r: number, strength = 0.42) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(255, 196, 110, ${strength})`)
  g.addColorStop(0.45, `rgba(255, 160, 70, ${strength * 0.45})`)
  g.addColorStop(1, 'rgba(255, 140, 60, 0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) =>
    Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

/**
 * A tree crown or bush from above: a shaded mass, then rings of leaf clumps in three tones and
 * sunlit clumps towards the top left. `px` sizes the drop shadow (it is in device pixels).
 */
export function crown(ctx: Ctx, cx: number, cy: number, r: number, v: number, px = PX, tone = 0) {
  const base = mix(C.leaf, C.leafDark, 0.3 + tone * 0.4)
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = px * 0.18
  ctx.shadowOffsetX = px * 0.12
  ctx.shadowOffsetY = px * 0.16
  ctx.fillStyle = base
  ctx.fill(disc(cx, cy, r * 0.86))
  ctx.restore()
  const tones = [mix(C.leaf, C.leafDark, tone * 0.5), C.leafDark, mix(C.leaf, C.leafLight, 0.3)]
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + rnd(v, k) * 0.4
    const d = r * (0.5 + rnd(v, k + 20) * 0.32)
    ctx.fillStyle = tones[k % 3]!
    ctx.fill(disc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.2 + rnd(v, k + 40) * 0.1)))
  }
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd(v, k + 60) * 0.6
    const d = r * (0.18 + rnd(v, k + 70) * 0.28)
    ctx.fillStyle = k % 2 ? tones[0]! : tones[2]!
    ctx.fill(disc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.18 + rnd(v, k + 80) * 0.08)))
  }
  // Sunlit clumps towards the light, a little shade on the far side.
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * 1.25 + (rnd(v, k + 90) - 0.5) * 1.6
    const d = r * (0.25 + rnd(v, k + 95) * 0.45)
    ctx.fillStyle = k % 2 ? 'rgba(170, 205, 110, 0.55)' : 'rgba(140, 180, 90, 0.5)'
    ctx.fill(disc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.1 + rnd(v, k + 99) * 0.08)))
  }
  ctx.fillStyle = 'rgba(10, 25, 5, 0.25)'
  ctx.fill(oval(cx + r * 0.35, cy + r * 0.4, r * 0.4, r * 0.3, 0.6))
}

/** Light sources and how far their halo reaches past their square (in squares). */
const halo: Record<string, number> = {
  campfire: 1.5,
  brazier: 1.2,
  candles: 0.8,
  torch: 1.1,
  hearth: 1.2,
  'lantern-post': 1.1,
}

const draw: Record<string, (d: Draw) => void> = {
  table: ({ ctx, w, h, v }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.1, 0.12, w - 0.2, h - 0.24, 0.06), C.wood, C.woodLight, C.woodDark),
    )
    lines(ctx, 'rgba(40, 22, 10, 0.4)', 0.015, [
      [0.12, h * 0.38, w - 0.12, h * 0.38],
      [0.12, h * 0.62, w - 0.12, h * 0.62],
    ])
    // What lies on it: a mug, a plate, maybe a candle.
    ctx.fillStyle = '#d9d2c0'
    ctx.fill(disc(w * 0.35, h * 0.45, 0.14))
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 0.015
    ctx.stroke(disc(w * 0.35, h * 0.45, 0.14))
    lines(ctx, C.clayDark, 0.03, [[w * 0.66 + 0.1, h * 0.58, w * 0.66 + 0.15, h * 0.58]])
    solid(ctx, disc(w * 0.66, h * 0.58, 0.1), C.clay, '#d08a5a', C.clayDark, 0.015)
    ctx.fillStyle = '#efe2bf'
    ctx.fill(disc(w * 0.66, h * 0.58, 0.06))
    if (v % 2) {
      ctx.fillStyle = '#f1e7cf'
      ctx.fill(disc(w * 0.62, h * 0.3, 0.04))
      glow(ctx, w * 0.62, h * 0.3, 0.3, 0.3)
    }
  },
  chair: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(w * 0.24, h * 0.3, w * 0.52, h * 0.5, 0.06), C.wood, C.woodLight, C.woodDark),
    )
    solid(ctx, rect(w * 0.2, h * 0.18, w * 0.6, h * 0.12, 0.04), C.woodDark, C.wood, C.ink, 0.025)
  },
  bed: ({ ctx, w, h, v }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.06, 0.06, w - 0.12, h - 0.12, 0.06), C.woodDark, C.wood, C.ink),
    )
    // Pillow at the head, the blanket over the rest, folded back at the top.
    solid(ctx, rect(0.14, 0.12, w - 0.28, h * 0.17, 0.08), '#e9e3d3', '#ffffff', '#b8b0a0', 0.02)
    const dye = dyes[v % dyes.length]!
    solid(
      ctx,
      rect(0.1, h * 0.32, w - 0.2, h * 0.62, 0.05),
      dye,
      mix(dye, '#ffffff', 0.3),
      mix(dye, '#000000', 0.35),
      0.02,
    )
    solid(ctx, rect(0.1, h * 0.32, w - 0.2, h * 0.08, 0.03), '#e9e3d3', '#ffffff', '#b8b0a0', 0.015)
    lines(ctx, 'rgba(0,0,0,0.25)', 0.015, [[0.2, h * 0.62, w - 0.2, h * 0.66]])
  },
  bookshelf: ({ ctx, w, h, v }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.06, 0.04, w - 0.12, h * 0.48, 0.03), C.woodDark, C.wood, C.ink),
    )
    // Book spines along the front edge.
    let x = 0.12
    for (let k = 0; x < w - 0.14; k++) {
      const bw = 0.06 + rnd(v, k) * 0.06
      ctx.fillStyle = dyes[Math.floor(rnd(v, k + 9) * dyes.length)]!
      ctx.fillRect(x, 0.1, bw, h * 0.36)
      x += bw + 0.012
    }
    lines(ctx, C.ink, 0.02, [[0.08, h * 0.47, w - 0.08, h * 0.47]])
  },
  bar: ({ ctx, w, h, v }) => {
    // A counter: dark rim, worn top, a row of tankards and a tap block at one end.
    const long = h > w
    shadowed(ctx, () =>
      solid(ctx, rect(0.06, 0.06, w - 0.12, h - 0.12, 0.05), C.woodDark, C.wood, C.ink),
    )
    solid(
      ctx,
      rect(0.16, 0.16, w - 0.32, h - 0.32, 0.03),
      '#6e4526',
      C.woodLight,
      C.woodDark,
      0.015,
    )
    const n = Math.round(Math.max(w, h)) * 2
    for (let k = 1; k < n - 1; k++) {
      if (rnd(v, k) < 0.35) continue
      const t = (k + 0.5) / n
      const [mx, my] = long ? [w / 2, h * t] : [w * t, h / 2]
      solid(ctx, disc(mx, my, 0.09), '#8a6a3f', '#c9a25a', '#4a3318', 0.015)
      ctx.fillStyle = '#efe2bf'
      ctx.fill(disc(mx - 0.02, my - 0.02, 0.05))
    }
    const [tx, ty] = long ? [w / 2, 0.32] : [0.32, h / 2]
    solid(ctx, rect(tx - 0.13, ty - 0.13, 0.26, 0.26, 0.03), C.iron, C.ironLight, '#1e2023', 0.015)
    solid(ctx, disc(tx, ty, 0.05), C.gold, '#f3d98a', C.goldDark, 0.01)
  },
  rug: ({ ctx, w, h, v }) => {
    const dye = dyes[v % dyes.length]!
    const trim = ['#d9b874', '#e8dcc0', '#c97a4a'][v % 3]!
    shadowed(
      ctx,
      () =>
        solid(
          ctx,
          rect(0.12, 0.12, w - 0.24, h - 0.24, 0.02),
          dye,
          mix(dye, '#ffffff', 0.15),
          mix(dye, '#000000', 0.3),
          0.02,
        ),
      0.4,
    )
    ctx.strokeStyle = trim
    ctx.lineWidth = 0.05
    ctx.strokeRect(0.24, 0.24, w - 0.48, h - 0.48)
    ctx.fillStyle = trim
    if (v % 3 === 0) {
      // A diamond medallion.
      const d = new Path2D()
      d.moveTo(w / 2, h * 0.3)
      d.lineTo(w * 0.7, h / 2)
      d.lineTo(w / 2, h * 0.7)
      d.lineTo(w * 0.3, h / 2)
      d.closePath()
      ctx.fill(d)
      ctx.fillStyle = mix(dye, '#000000', 0.35)
      ctx.fill(disc(w / 2, h / 2, 0.08))
    } else if (v % 3 === 1) {
      // A round rosette in rings.
      ctx.fill(disc(w / 2, h / 2, Math.min(w, h) * 0.22))
      ctx.fillStyle = dye
      ctx.fill(disc(w / 2, h / 2, Math.min(w, h) * 0.15))
      ctx.fillStyle = trim
      ctx.fill(disc(w / 2, h / 2, Math.min(w, h) * 0.06))
    } else {
      // Bands across the field.
      for (let k = 1; k < 4; k++)
        ctx.fillRect(0.3, 0.24 + (k * (h - 0.48)) / 4 - 0.03, w - 0.6, 0.06)
    }
    // Fringe on the short ends.
    for (let x = 0.16; x < w - 0.14; x += 0.07)
      lines(ctx, '#e8dcbf', 0.015, [
        [x, 0.06, x, 0.12],
        [x, h - 0.12, x, h - 0.06],
      ])
  },
  'weapon-rack': ({ ctx, w, h }) => {
    // A rack against the wall holding a sword, an axe and a spear.
    shadowed(ctx, () =>
      solid(ctx, rect(0.08, 0.1, w - 0.16, 0.14, 0.03), C.wood, C.woodLight, C.woodDark),
    )
    // Sword: blade, crossguard, grip.
    lines(ctx, C.ironLight, 0.05, [[0.28, 0.2, 0.28, h * 0.78]])
    lines(ctx, C.goldDark, 0.05, [[0.2, 0.3, 0.36, 0.3]])
    // Axe: haft and head.
    lines(ctx, C.woodDark, 0.045, [[0.5, 0.2, 0.5, h * 0.82]])
    const head = new Path2D()
    head.moveTo(0.5, 0.26)
    head.quadraticCurveTo(0.68, 0.3, 0.64, 0.46)
    head.lineTo(0.5, 0.42)
    head.closePath()
    solid(ctx, head, C.iron, C.ironLight, '#1e2023', 0.015)
    // Spear: shaft and point.
    lines(ctx, C.woodDark, 0.035, [[0.74, 0.22, 0.74, h * 0.86]])
    const tip = new Path2D()
    tip.moveTo(0.74, 0.16)
    tip.lineTo(0.79, 0.3)
    tip.lineTo(0.69, 0.3)
    tip.closePath()
    solid(ctx, tip, C.ironLight, '#c8ccd0', C.iron, 0.012)
  },
  crate: ({ ctx, w, h, v }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.12, 0.12, w - 0.24, h - 0.24, 0.03), C.wood, C.woodLight, C.woodDark),
    )
    boards(ctx, 0.16, 0.16, w - 0.32, h - 0.32, 3, v)
    lines(ctx, C.woodDark, 0.05, [
      [0.18, 0.18, w - 0.18, h - 0.18],
      [w - 0.18, 0.18, 0.18, h - 0.18],
    ])
  },
  barrel: ({ ctx, w, h }) => {
    const r = Math.min(w, h) * 0.38
    shadowed(ctx, () => solid(ctx, disc(w / 2, h / 2, r), C.wood, C.woodLight, C.woodDark))
    ctx.strokeStyle = C.iron
    ctx.lineWidth = 0.035
    ctx.stroke(disc(w / 2, h / 2, r * 0.92))
    ctx.stroke(disc(w / 2, h / 2, r * 0.55))
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI
      lines(ctx, 'rgba(40, 22, 10, 0.45)', 0.012, [
        [
          w / 2 + Math.cos(a) * r * 0.55,
          h / 2 + Math.sin(a) * r * 0.55,
          w / 2 + Math.cos(a) * r * 0.9,
          h / 2 + Math.sin(a) * r * 0.9,
        ],
      ])
    }
    lines(ctx, 'rgba(40, 22, 10, 0.45)', 0.012, [[w / 2 - r * 0.5, h / 2, w / 2 + r * 0.5, h / 2]])
  },
  sack: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, oval(w / 2, h * 0.55, w * 0.34, h * 0.3, 0.2), C.cloth, '#eadcb6', '#8f7b52'),
    )
    solid(ctx, oval(w / 2, h * 0.26, w * 0.1, h * 0.07), '#a8936a', C.cloth, '#6f5c3a', 0.02)
    lines(ctx, 'rgba(60, 45, 20, 0.4)', 0.015, [[w * 0.36, h * 0.5, w * 0.6, h * 0.66]])
  },
  chest: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.12, 0.22, w - 0.24, h - 0.44, 0.06), C.wood, C.woodLight, C.woodDark),
    )
    lines(ctx, C.iron, 0.05, [
      [0.3, 0.22, 0.3, h - 0.22],
      [w - 0.3, 0.22, w - 0.3, h - 0.22],
    ])
    lines(ctx, 'rgba(40, 22, 10, 0.4)', 0.015, [[0.14, h / 2, w - 0.14, h / 2]])
    solid(ctx, rect(w / 2 - 0.07, h - 0.34, 0.14, 0.12, 0.02), C.gold, '#f3d98a', C.goldDark, 0.015)
  },
  urn: ({ ctx, w, h }) => {
    for (const side of [-1, 1])
      solid(ctx, oval(w / 2 + side * 0.3, h / 2, 0.07, 0.1), C.clay, '#cf8a5c', C.clayDark, 0.015)
    shadowed(ctx, () => solid(ctx, disc(w / 2, h / 2, 0.3), C.clay, '#cf8a5c', C.clayDark))
    ctx.fillStyle = '#2a1a10'
    ctx.fill(disc(w / 2, h / 2, 0.13))
    ctx.strokeStyle = '#e3b080'
    ctx.lineWidth = 0.035
    ctx.stroke(disc(w / 2, h / 2, 0.17))
    ctx.strokeStyle = 'rgba(70, 35, 15, 0.5)'
    ctx.lineWidth = 0.02
    ctx.stroke(disc(w / 2, h / 2, 0.25))
  },
  coins: ({ ctx, w, h, v }) => {
    for (let k = 0; k < 9; k++) {
      const x = w * (0.25 + rnd(v, k) * 0.5)
      const y = h * (0.25 + rnd(v, k + 30) * 0.5)
      shadowed(ctx, () => solid(ctx, disc(x, y, 0.08), C.gold, '#f8e39a', C.goldDark, 0.012), 0.3)
    }
  },
  cauldron: ({ ctx, w, h }) => {
    shadowed(ctx, () => solid(ctx, disc(w / 2, h / 2, 0.38), C.iron, C.ironLight, '#1e2023'))
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 0.3)
    g.addColorStop(0, '#9fd16a')
    g.addColorStop(1, '#3f7a2a')
    ctx.fillStyle = g
    ctx.fill(disc(w / 2, h / 2, 0.3))
    ctx.fillStyle = 'rgba(220, 255, 180, 0.7)'
    ctx.fill(disc(w * 0.44, h * 0.46, 0.04))
    ctx.fill(disc(w * 0.58, h * 0.56, 0.03))
  },
  altar: ({ ctx, w, h }) => {
    // A carved stone block: raised rim, a cloth hanging over the front, candles at the corners,
    // an offering bowl in the middle.
    shadowed(
      ctx,
      () => solid(ctx, rect(0.06, 0.08, w - 0.12, h - 0.16, 0.02), C.stoneDark, C.stone, '#3a352f'),
      1.2,
    )
    solid(ctx, rect(0.14, 0.15, w - 0.28, h - 0.3, 0.01), C.stone, C.stoneLight, C.stoneDark, 0.02)
    const cloth = new Path2D()
    cloth.moveTo(w * 0.32, 0.15)
    cloth.lineTo(w * 0.68, 0.15)
    cloth.lineTo(w * 0.68, h - 0.02)
    cloth.lineTo(w / 2, h - 0.1)
    cloth.lineTo(w * 0.32, h - 0.02)
    cloth.closePath()
    solid(ctx, cloth, '#7a2a2a', '#a8463c', '#4a1717', 0.015)
    lines(ctx, C.gold, 0.02, [[w * 0.34, h * 0.5, w * 0.66, h * 0.5]])
    solid(ctx, disc(w / 2, h * 0.34, 0.08), C.gold, '#f3d98a', C.goldDark, 0.012)
    for (const [x, y] of [
      [0.24, 0.24],
      [w - 0.24, 0.24],
      [0.24, h - 0.24],
      [w - 0.24, h - 0.24],
    ] as const) {
      solid(ctx, disc(x, y, 0.06), '#efe6cc', '#ffffff', '#b8ad8e', 0.012)
      flame(ctx, x, y - 0.02, 0.06)
    }
  },
  statue: ({ ctx, w, h }) => {
    // A square plinth and a cloaked figure seen from above: wide shoulders, head forward, a
    // sword point down in front, a long shadow.
    shadowed(
      ctx,
      () => solid(ctx, rect(0.08, 0.08, w - 0.16, h - 0.16, 0.02), C.stoneDark, C.stone, '#3a352f'),
      1.5,
    )
    const cloak = new Path2D()
    cloak.moveTo(w * 0.18, h * 0.42)
    cloak.quadraticCurveTo(w / 2, h * 0.18, w * 0.82, h * 0.42)
    cloak.quadraticCurveTo(w * 0.78, h * 0.72, w / 2, h * 0.76)
    cloak.quadraticCurveTo(w * 0.22, h * 0.72, w * 0.18, h * 0.42)
    cloak.closePath()
    solid(ctx, cloak, C.stone, C.stoneLight, C.stoneDark, 0.025)
    solid(ctx, oval(w * 0.3, h * 0.44, 0.1, 0.08), C.stoneLight, '#e0d8c8', C.stone, 0.018)
    solid(ctx, oval(w * 0.7, h * 0.44, 0.1, 0.08), C.stoneLight, '#e0d8c8', C.stone, 0.018)
    solid(ctx, disc(w / 2, h * 0.5, 0.11), '#cfc6b6', '#ece5d8', C.stone, 0.02)
    lines(ctx, C.stoneDark, 0.04, [[w / 2, h * 0.62, w / 2, h * 0.9]])
    lines(ctx, C.stoneDark, 0.035, [[w * 0.4, h * 0.64, w * 0.6, h * 0.64]])
  },
  pillar: ({ ctx, w, h }) => {
    shadowed(
      ctx,
      () => solid(ctx, disc(w / 2, h / 2, 0.36), C.stone, C.stoneLight, C.stoneDark),
      1.4,
    )
    ctx.strokeStyle = 'rgba(40, 34, 28, 0.45)'
    ctx.lineWidth = 0.02
    ctx.stroke(disc(w / 2, h / 2, 0.26))
    ctx.stroke(disc(w / 2, h / 2, 0.15))
  },
  sarcophagus: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.1, 0.08, w - 0.2, h - 0.16, 0.12), C.stone, C.stoneLight, C.stoneDark),
    )
    // The carved effigy: head, body, crossed hands.
    solid(ctx, disc(w / 2, h * 0.2, 0.1), C.stoneLight, '#e0d8c8', C.stone, 0.015)
    solid(
      ctx,
      rect(w / 2 - 0.14, h * 0.28, 0.28, h * 0.6, 0.1),
      C.stoneLight,
      '#d8d0c0',
      C.stone,
      0.015,
    )
    lines(ctx, C.stoneDark, 0.02, [
      [w / 2 - 0.1, h * 0.42, w / 2 + 0.1, h * 0.48],
      [w / 2 + 0.1, h * 0.42, w / 2 - 0.1, h * 0.48],
    ])
  },
  bones: ({ ctx, w, h, v }) => {
    // Shaded bones with knobbed ends, ribs and a skull with its sockets.
    const bone = (x: number, y: number, a: number, len: number) => {
      const dx = Math.cos(a) * len
      const dy = Math.sin(a) * len
      shadowed(
        ctx,
        () => {
          lines(ctx, '#a89c80', 0.07, [[x - dx, y - dy, x + dx, y + dy]])
          for (const sgn of [-1, 1]) {
            ctx.fillStyle = '#a89c80'
            ctx.fill(disc(x + sgn * dx - dy * 0.12, y + sgn * dy + dx * 0.12, 0.045))
            ctx.fill(disc(x + sgn * dx + dy * 0.12, y + sgn * dy - dx * 0.12, 0.045))
          }
        },
        0.3,
      )
      lines(ctx, C.bone, 0.045, [[x - dx, y - dy, x + dx, y + dy]])
    }
    bone(w * 0.36, h * 0.62, rnd(v, 1) * Math.PI, 0.2)
    bone(w * 0.62, h * 0.7, rnd(v, 2) * Math.PI, 0.16)
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = C.bone
      ctx.lineWidth = 0.03
      ctx.beginPath()
      ctx.arc(w * 0.42, h * 0.38 + k * 0.08, 0.16, Math.PI * 0.15, Math.PI * 0.85)
      ctx.stroke()
    }
    shadowed(
      ctx,
      () => solid(ctx, oval(w * 0.66, h * 0.34, 0.13, 0.15), C.bone, '#ffffff', '#b8ad92', 0.02),
      0.5,
    )
    ctx.fillStyle = '#2a2219'
    ctx.fill(oval(w * 0.61, h * 0.32, 0.035, 0.04))
    ctx.fill(oval(w * 0.71, h * 0.32, 0.035, 0.04))
    ctx.fill(disc(w * 0.66, h * 0.41, 0.018))
  },
  rubble: ({ ctx, w, h, v }) => {
    for (let k = 0; k < 8; k++) {
      const x = w * (0.2 + rnd(v, k) * 0.6)
      const y = h * (0.2 + rnd(v, k + 11) * 0.6)
      const r = 0.06 + rnd(v, k + 21) * 0.09
      shadowed(
        ctx,
        () =>
          solid(
            ctx,
            oval(x, y, r, r * 0.75, rnd(v, k) * 3),
            C.stone,
            C.stoneLight,
            C.stoneDark,
            0.015,
          ),
        0.4,
      )
    }
  },
  web: ({ ctx, w, h }) => {
    const cx = 0.05
    const cy = 0.05
    ctx.strokeStyle = 'rgba(240, 240, 235, 0.6)'
    ctx.lineWidth = 0.022
    for (let k = 0; k < 6; k++) {
      const a = (k / 5) * (Math.PI / 2)
      lines(ctx, 'rgba(240, 240, 235, 0.6)', 0.022, [
        [cx, cy, cx + Math.cos(a) * w * 0.9, cy + Math.sin(a) * h * 0.9],
      ])
    }
    for (let r = 0.2; r < 0.9; r += 0.15) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * Math.min(w, h), 0, Math.PI / 2)
      ctx.stroke()
    }
  },
  trapdoor: ({ ctx, w, h, v }) => {
    shadowed(
      ctx,
      () => solid(ctx, rect(0.1, 0.1, w - 0.2, h - 0.2, 0.03), C.woodDark, C.wood, C.ink),
      0.3,
    )
    boards(ctx, 0.14, 0.14, w - 0.28, h - 0.28, 4, v)
    ctx.strokeStyle = C.iron
    ctx.lineWidth = 0.04
    ctx.stroke(disc(w / 2, h * 0.7, 0.09))
  },
  lever: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.3, 0.3, w - 0.6, h - 0.6, 0.04), C.iron, C.ironLight, '#1e2023'),
    )
    lines(ctx, C.woodDark, 0.07, [[w / 2, h / 2, w * 0.72, h * 0.22]])
    solid(ctx, disc(w * 0.72, h * 0.22, 0.07), '#7a2a2a', '#b84a3c', '#3a1010', 0.015)
  },
  rock: ({ ctx, w, h, v }) => {
    const p = new Path2D()
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2
      const r = Math.min(w, h) * (0.3 + rnd(v, k) * 0.1)
      const x = w / 2 + Math.cos(a) * r
      const y = h / 2 + Math.sin(a) * r * 0.85
      if (k) p.lineTo(x, y)
      else p.moveTo(x, y)
    }
    p.closePath()
    shadowed(ctx, () => solid(ctx, p, C.stone, C.stoneLight, C.stoneDark), 1.2)
    lines(ctx, 'rgba(40, 34, 28, 0.45)', 0.015, [[w * 0.4, h * 0.4, w * 0.55, h * 0.55]])
  },
  stalagmite: ({ ctx, w, h, v }) => {
    // A lumpy cone from above: an irregular base, ridges running up, the tip lit off centre.
    const base = new Path2D()
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      const r = 0.3 + rnd(v, k) * 0.1
      const x = w / 2 + Math.cos(a) * r
      const y = h / 2 + Math.sin(a) * r * 0.9
      if (k) base.lineTo(x, y)
      else base.moveTo(x, y)
    }
    base.closePath()
    shadowed(ctx, () => solid(ctx, base, '#7d7163', '#a99c8a', '#4a4137'), 1.6)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rnd(v, k + 9)
      lines(ctx, 'rgba(50, 42, 34, 0.45)', 0.018, [
        [
          w * 0.45 + Math.cos(a) * 0.08,
          h * 0.44 + Math.sin(a) * 0.08,
          w / 2 + Math.cos(a) * 0.3,
          h / 2 + Math.sin(a) * 0.28,
        ],
      ])
    }
    solid(ctx, oval(w * 0.44, h * 0.42, 0.12, 0.1, 0.4), '#a99c8a', '#d6cab5', '#7d7163', 0.015)
    ctx.fillStyle = '#e8dfcc'
    ctx.fill(disc(w * 0.42, h * 0.4, 0.045))
  },
  mushrooms: ({ ctx, w, h, v }) => {
    for (let k = 0; k < 5; k++) {
      const x = w * (0.25 + rnd(v, k) * 0.5)
      const y = h * (0.25 + rnd(v, k + 4) * 0.5)
      const r = 0.07 + rnd(v, k + 8) * 0.07
      const cap = v % 2 ? '#a33b2a' : '#8a6a3f'
      shadowed(
        ctx,
        () =>
          solid(
            ctx,
            disc(x, y, r),
            cap,
            mix(cap, '#ffffff', 0.35),
            mix(cap, '#000000', 0.4),
            0.015,
          ),
        0.4,
      )
      if (v % 2) {
        ctx.fillStyle = '#f3ead2'
        ctx.fill(disc(x - r * 0.3, y - r * 0.2, r * 0.18))
      }
    }
  },
  bush: ({ ctx, w, h, v }) => crown(ctx, w / 2, h / 2, Math.min(w, h) * 0.4, v, PX * 0.5, 0.4),
  tree: ({ ctx, w, h, v }) => crown(ctx, w / 2, h / 2, Math.min(w, h) * 0.48, v),
  stump: ({ ctx, w, h }) => {
    shadowed(ctx, () => solid(ctx, disc(w / 2, h / 2, 0.32), '#6a4526', '#8a5a33', '#3a2414'))
    ctx.fillStyle = '#c99a62'
    ctx.fill(disc(w / 2, h / 2, 0.24))
    ctx.strokeStyle = 'rgba(90, 56, 32, 0.6)'
    ctx.lineWidth = 0.012
    for (const r of [0.06, 0.12, 0.18]) ctx.stroke(disc(w / 2, h / 2, r))
  },
  log: ({ ctx, w, h }) => {
    const long = w >= h
    const [lw, lh] = long ? [w, h] : [h, w]
    ctx.save()
    if (!long) {
      ctx.translate(w, 0)
      ctx.rotate(Math.PI / 2)
    }
    shadowed(ctx, () =>
      solid(ctx, rect(0.08, lh * 0.28, lw - 0.16, lh * 0.44, 0.2), '#6a4526', '#8a5a33', '#3a2414'),
    )
    lines(ctx, 'rgba(30, 18, 8, 0.5)', 0.015, [
      [0.3, lh * 0.4, lw * 0.6, lh * 0.42],
      [lw * 0.4, lh * 0.58, lw - 0.3, lh * 0.56],
    ])
    ctx.fillStyle = '#c99a62'
    ctx.fill(oval(lw - 0.14, lh / 2, 0.07, lh * 0.21))
    ctx.restore()
  },
  flowers: ({ ctx, w, h, v }) => {
    for (let k = 0; k < 9; k++) {
      const x = w * (0.2 + rnd(v, k) * 0.6)
      const y = h * (0.2 + rnd(v, k + 3) * 0.6)
      ctx.fillStyle = C.leafLight
      ctx.fill(disc(x, y + 0.03, 0.04))
      ctx.fillStyle = ['#f2d24a', '#e8eef2', '#d65a6a', '#9a7ad8'][(k + v) % 4]!
      ctx.fill(disc(x, y, 0.035))
    }
  },
  campfire: ({ ctx, w, h }) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      solid(
        ctx,
        oval(w / 2 + Math.cos(a) * 0.3, h / 2 + Math.sin(a) * 0.3, 0.08, 0.06, a),
        C.stone,
        C.stoneLight,
        C.stoneDark,
        0.012,
      )
    }
    lines(ctx, C.woodDark, 0.07, [
      [w / 2 - 0.18, h / 2 - 0.1, w / 2 + 0.18, h / 2 + 0.1],
      [w / 2 + 0.18, h / 2 - 0.1, w / 2 - 0.18, h / 2 + 0.1],
    ])
    flame(ctx, w / 2, h / 2, 0.18)
  },
  brazier: ({ ctx, w, h }) => {
    // An iron bowl on three feet, heaped with embers, flames licking up.
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2
      solid(
        ctx,
        disc(w / 2 + Math.cos(a) * 0.34, h / 2 + Math.sin(a) * 0.34, 0.06),
        C.iron,
        C.ironLight,
        '#1e2023',
        0.012,
      )
    }
    shadowed(ctx, () => solid(ctx, disc(w / 2, h / 2, 0.3), C.iron, C.ironLight, '#1e2023'))
    ctx.strokeStyle = C.ironLight
    ctx.lineWidth = 0.025
    ctx.stroke(disc(w / 2, h / 2, 0.27))
    ctx.fillStyle = '#3a140c'
    ctx.fill(disc(w / 2, h / 2, 0.23))
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      ctx.fillStyle = k % 2 ? C.ember : '#e0592a'
      ctx.fill(disc(w / 2 + Math.cos(a) * 0.12, h / 2 + Math.sin(a) * 0.12, 0.06))
    }
    flame(ctx, w * 0.46, h * 0.48, 0.13)
    flame(ctx, w * 0.56, h * 0.52, 0.1)
  },
  candles: ({ ctx, w, h }) => {
    // Three candles on a brass dish, so the group reads at arm's length.
    shadowed(
      ctx,
      () => solid(ctx, disc(w / 2, h / 2, 0.27), C.goldDark, C.gold, '#6a4e18', 0.02),
      0.6,
    )
    for (const [x, y] of [
      [0.4, 0.44],
      [0.6, 0.4],
      [0.52, 0.6],
    ] as const) {
      solid(ctx, disc(w * x, h * y, 0.075), '#efe6cc', '#ffffff', '#b8ad8e', 0.012)
      flame(ctx, w * x, h * y - 0.02, 0.08)
    }
  },
  torch: ({ ctx, w }) => {
    // The same torch the painted walls carry: an iron bracket and its flame.
    solid(ctx, rect(w / 2 - 0.09, 0.04, 0.18, 0.18, 0.03), C.iron, C.ironLight, '#1e2023', 0.015)
    lines(ctx, C.woodDark, 0.07, [[w / 2, 0.14, w / 2, 0.36]])
    ctx.fillStyle = 'rgba(255, 190, 110, 0.35)'
    ctx.fill(disc(w / 2, 0.38, 0.24))
    flame(ctx, w / 2, 0.4, 0.15)
  },
  hearth: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.04, 0.04, w - 0.08, h * 0.62, 0.04), C.stoneDark, C.stone, '#3a352f'),
    )
    ctx.fillStyle = '#1e1712'
    ctx.fill(rect(w * 0.22, 0.12, w * 0.56, h * 0.4, 0.06))
    ctx.fillStyle = C.ember
    ctx.fill(oval(w / 2, h * 0.38, w * 0.2, h * 0.1))
    flame(ctx, w * 0.42, h * 0.34, 0.12)
    flame(ctx, w * 0.58, h * 0.36, 0.1)
  },
  stairs: ({ ctx, w, h }) => {
    // Steps going down to the south: each darker than the last.
    const n = Math.max(4, Math.round(h * 5))
    for (let k = 0; k < n; k++) {
      const y = 0.06 + (k * (h - 0.12)) / n
      ctx.fillStyle = mix(C.stoneLight, '#2a2520', k / n)
      ctx.fillRect(0.08, y, w - 0.16, (h - 0.12) / n)
      lines(ctx, 'rgba(0,0,0,0.4)', 0.015, [[0.08, y, w - 0.08, y]])
    }
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 0.03
    ctx.strokeRect(0.08, 0.06, w - 0.16, h - 0.12)
  },
  well: ({ ctx, w, h }) => {
    shadowed(ctx, () => solid(ctx, disc(w / 2, h / 2, 0.38), C.stone, C.stoneLight, C.stoneDark))
    ctx.fillStyle = '#0e1a1f'
    ctx.fill(disc(w / 2, h / 2, 0.24))
    lines(ctx, C.woodDark, 0.06, [[0.08, h / 2, w - 0.08, h / 2]])
    solid(ctx, disc(w / 2, h / 2, 0.06), C.wood, C.woodLight, C.woodDark, 0.012)
  },
  bridge: ({ ctx, w, h, v }) => {
    shadowed(ctx, () =>
      solid(ctx, rect(0.04, 0.2, w - 0.08, h - 0.4, 0.03), C.woodDark, C.wood, C.ink),
    )
    // Planks across the way, a rail on each side.
    const n = Math.round(w * 5)
    for (let k = 0; k < n; k++) {
      const x = 0.06 + (k * (w - 0.12)) / n
      ctx.fillStyle = mix(C.plank, C.woodDark, rnd(v, k) * 0.35)
      ctx.fillRect(x, 0.24, (w - 0.12) / n - 0.015, h - 0.48)
    }
    lines(ctx, C.woodDark, 0.07, [
      [0.04, 0.22, w - 0.04, 0.22],
      [0.04, h - 0.22, w - 0.04, h - 0.22],
    ])
  },
  cart: ({ ctx, w, h, v }) => {
    for (const x of [w * 0.3, w * 0.62])
      for (const y of [0.12, h - 0.12])
        solid(
          ctx,
          rect(x - 0.12, y - 0.05, 0.24, 0.1, 0.03),
          '#2a2017',
          '#4a3a2a',
          '#100c08',
          0.012,
        )
    shadowed(ctx, () =>
      solid(ctx, rect(0.1, 0.16, w * 0.78, h - 0.32, 0.04), C.wood, C.woodLight, C.woodDark),
    )
    boards(ctx, 0.14, 0.2, w * 0.7, h - 0.4, 3, v)
    lines(ctx, C.woodDark, 0.05, [
      [w * 0.88, h * 0.35, w - 0.04, h * 0.42],
      [w * 0.88, h * 0.65, w - 0.04, h * 0.58],
    ])
  },
  tent: ({ ctx, w, h, v }) => {
    // Guy ropes to pegs, then the canvas: a lit slope and a shaded one split by the ridge pole,
    // and the dark open flap at the front.
    lines(ctx, 'rgba(60, 45, 25, 0.75)', 0.018, [
      [0.22, 0.22, 0.04, 0.04],
      [w - 0.22, 0.22, w - 0.04, 0.04],
      [0.22, h - 0.22, 0.04, h - 0.04],
      [w - 0.22, h - 0.22, w - 0.04, h - 0.04],
    ])
    for (const [x, y] of [
      [0.04, 0.04],
      [w - 0.04, 0.04],
      [0.04, h - 0.04],
      [w - 0.04, h - 0.04],
    ] as const) {
      ctx.fillStyle = C.woodDark
      ctx.fill(disc(x, y, 0.04))
    }
    const tints = [
      ['#efe3c2', '#8f7f5a'],
      ['#c9b48a', '#6f5c3a'],
      ['#b8a07a', '#5e4c30'],
    ]
    const [lit, dark] = tints[v % tints.length]!
    shadowed(
      ctx,
      () => {
        ctx.fillStyle = dark!
        ctx.fill(rect(0.2, 0.2, w - 0.4, h - 0.4, 0.03))
      },
      1.3,
    )
    const left = ctx.createLinearGradient(0.2, 0, w / 2, 0)
    left.addColorStop(0, lit!)
    left.addColorStop(1, mix(lit!, dark!, 0.3))
    ctx.fillStyle = left
    ctx.fillRect(0.2, 0.2, w / 2 - 0.2, h - 0.4)
    const right = ctx.createLinearGradient(w / 2, 0, w - 0.2, 0)
    right.addColorStop(0, mix(lit!, dark!, 0.65))
    right.addColorStop(1, dark!)
    ctx.fillStyle = right
    ctx.fillRect(w / 2, 0.2, w / 2 - 0.2, h - 0.4)
    lines(ctx, '#3e3020', 0.05, [[w / 2, 0.14, w / 2, h - 0.14]])
    const flap = new Path2D()
    flap.moveTo(w / 2 - 0.3, h - 0.2)
    flap.lineTo(w / 2 + 0.3, h - 0.2)
    flap.lineTo(w / 2, h - 0.62)
    flap.closePath()
    ctx.fillStyle = '#2a2017'
    ctx.fill(flap)
    ctx.strokeStyle = C.ink
    ctx.lineWidth = 0.03
    ctx.strokeRect(0.2, 0.2, w - 0.4, h - 0.4)
  },
  fountain: ({ ctx, w, h }) => {
    shadowed(ctx, () =>
      solid(ctx, disc(w / 2, h / 2, Math.min(w, h) * 0.45), C.stone, C.stoneLight, C.stoneDark),
    )
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.38)
    g.addColorStop(0, C.waterLight)
    g.addColorStop(1, C.water)
    ctx.fillStyle = g
    ctx.fill(disc(w / 2, h / 2, Math.min(w, h) * 0.37))
    solid(ctx, disc(w / 2, h / 2, 0.16), C.stone, C.stoneLight, C.stoneDark, 0.02)
    ctx.strokeStyle = 'rgba(220, 240, 245, 0.5)'
    ctx.lineWidth = 0.02
    ctx.stroke(disc(w / 2, h / 2, 0.3))
  },
  // RYT-068: the three catalogue props still without a picture, drawn until theirs arrive.
  signpost: ({ ctx, w, h, v }) => {
    // A post and two arms pointing different ways, seen from above.
    const turn = rnd(v, 1) * 0.6 - 0.3
    shadowed(ctx, () => {
      for (const [a, len] of [
        [turn, 0.36],
        [turn + Math.PI * 0.62, 0.3],
      ] as const) {
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.rotate(a)
        solid(ctx, rect(-0.02, -0.07, len, 0.14, 0.02), C.plank, C.woodLight, C.woodDark, 0.02)
        ctx.beginPath()
        ctx.moveTo(len - 0.02, -0.07)
        ctx.lineTo(len + 0.08, 0)
        ctx.lineTo(len - 0.02, 0.07)
        ctx.fillStyle = C.plank
        ctx.fill()
        ctx.restore()
      }
    })
    solid(ctx, disc(w / 2, h / 2, 0.08), C.woodDark, C.wood, C.ink, 0.02)
  },
  'lantern-post': ({ ctx, w, h }) => {
    // A stone foot and iron post, its lantern on an arm, lit: large enough to read in a 44 px icon.
    shadowed(ctx, () =>
      solid(ctx, disc(w * 0.36, h * 0.64, 0.17), C.stone, C.stoneLight, C.stoneDark),
    )
    solid(ctx, disc(w * 0.36, h * 0.64, 0.09), C.iron, C.ironLight, '#1e2023', 0.02)
    lines(ctx, C.iron, 0.07, [[w * 0.36, h * 0.64, w * 0.62, h * 0.38]])
    ctx.fillStyle = 'rgba(255, 190, 110, 0.4)'
    ctx.fill(disc(w * 0.66, h * 0.34, 0.26))
    shadowed(ctx, () =>
      solid(ctx, rect(w * 0.53, h * 0.21, 0.26, 0.26, 0.04), C.iron, C.ironLight, '#1e2023', 0.02),
    )
    ctx.fillStyle = '#ffe2a0'
    ctx.fill(rect(w * 0.57, h * 0.25, 0.18, 0.18, 0.03))
    // The flame seen from above: a bright core in an orange ring (as the painted wall torches).
    ctx.fillStyle = C.fire
    ctx.fill(disc(w * 0.66, h * 0.34, 0.065))
    ctx.fillStyle = C.flame
    ctx.fill(disc(w * 0.66, h * 0.34, 0.035))
  },
  'market-stall': ({ ctx, w, h, v }) => {
    // A striped awning over a counter: the counter's front faces south.
    const dye = dyes[Math.floor(rnd(v, 2) * dyes.length)]!
    shadowed(ctx, () =>
      solid(ctx, rect(0.08, 0.1, w - 0.16, h * 0.62, 0.04), C.canvas, '#efe3c2', C.canvasDark),
    )
    const stripes = 6
    for (let k = 0; k < stripes; k += 2) {
      ctx.fillStyle = dye
      ctx.fillRect(0.08 + (k * (w - 0.16)) / stripes, 0.12, (w - 0.16) / stripes, h * 0.62 - 0.04)
    }
    lines(ctx, 'rgba(40, 25, 10, 0.45)', 0.02, [[0.08, h * 0.41, w - 0.08, h * 0.41]])
    shadowed(ctx, () =>
      solid(ctx, rect(0.12, h * 0.72, w - 0.24, h * 0.18, 0.03), C.wood, C.woodLight, C.woodDark),
    )
    // Goods on the counter: a few round fruits or pots.
    for (let k = 0; k < 5; k++)
      solid(
        ctx,
        disc(0.3 + (k * (w - 0.6)) / 4, h * 0.81, 0.06),
        k % 2 ? C.clay : '#b8433a',
        '#e09a6a',
        C.clayDark,
        0.012,
      )
  },
}

/** Drawers that read the variant; the rest are cached once. */
const varied = new Set([
  'table',
  'bed',
  'bookshelf',
  'bar',
  'rug',
  'crate',
  'coins',
  'bones',
  'rubble',
  'trapdoor',
  'rock',
  'stalagmite',
  'mushrooms',
  'bush',
  'tree',
  'flowers',
  'bridge',
  'cart',
  'tent',
  'signpost',
  'market-stall',
])

/** Props this kit can paint; anything else falls back to the line drawing. */
export const paintedProps = new Set(Object.keys(draw))

/**
 * A prop's image and the margin around its box (in squares). Pictures may be mirrored or turned a
 * quarter inside their box; drawn sprites never are.
 */
export interface Sprite {
  url: string
  pad: number
  flip?: boolean
  turn?: number
  picture?: boolean
}

const cache = new Map<string, Sprite>()

/**
 * The painted sprite of a prop, as an image URL and the halo margin around its box (in squares).
 * `variant` (0–5) picks colours and small details, so a room of beds is not one bed repeated.
 */
export function propSprite(prop: string, w: number, h: number, variant = 0): Sprite | null {
  return pictureOf(prop, w, h, variant) ?? drawnSprite(prop, w, h, variant)
}

/** The sprite Rytta draws itself; also the fallback when a picture fails to load. */
export function drawnSprite(prop: string, w: number, h: number, variant = 0): Sprite | null {
  const fn = draw[prop]
  if (!fn || typeof document === 'undefined') return null
  const v = varied.has(prop) ? Math.abs(Math.trunc(variant)) % 6 : 0
  const key = `${prop}:${w}:${h}:${v}`
  const hit = cache.get(key)
  if (hit) return hit
  const pad = halo[prop] ?? 0.2
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((w + pad * 2) * PX)
  canvas.height = Math.ceil((h + pad * 2) * PX)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(PX, PX)
  ctx.translate(pad, pad)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // The halo sits on the flame: the torch's flame is near the wall, not in the middle.
  if (halo[prop]) glow(ctx, w / 2, prop === 'torch' ? 0.4 : h / 2, Math.max(w, h) / 2 + pad, 0.28)
  box = { w, h }
  fn({ ctx, w, h, v })
  const entry = { url: canvas.toDataURL('image/png'), pad }
  cache.set(key, entry)
  return entry
}

/**
 * RYT-066: a painted picture made for the prop (public/tabletop/props), when there is one for this
 * size or for a size with the same proportions (a prop scaled up or down); otherwise null and the
 * drawing is used. The variant picks the picture, then whether it is mirrored and, for square props
 * without a front, a quarter turn, so a room of crates is not one crate repeated.
 */
function pictureOf(prop: string, w: number, h: number, variant: number): Sprite | null {
  const picture = propPictures[prop]
  if (!picture) return null
  const sizes = Object.keys(picture.sizes).map((k) => k.split('x').map(Number) as [number, number])
  const size =
    sizes.find(([a, b]) => a === w && b === h) ??
    sizes.find(([a, b]) => Math.abs(a * h - b * w) < 1e-9)
  if (!size) return null
  const count = picture.sizes[`${size[0]}x${size[1]}`]!
  const n = Math.abs(Math.trunc(variant))
  const v = n % count
  return {
    url: `${import.meta.env.BASE_URL}tabletop/props/${prop}-${v}-${size[0]}x${size[1]}.webp`,
    pad: (picture.pad * w) / size[0],
    flip: Math.floor(n / count) % 2 === 1,
    turn: picture.spin && w === h ? (Math.floor(n / (count * 2)) % 4) * 90 : 0,
    picture: true,
  }
}

const decoded = new Set<string>()

/** RYT-077: how many pictures a prop has at this size (or one of the same proportions). */
export function pictureCount(prop: string, w: number, h: number): number {
  const picture = propPictures[prop]
  if (!picture) return 0
  const sizes = Object.keys(picture.sizes).map((k) => k.split('x').map(Number) as [number, number])
  const size =
    sizes.find(([a, b]) => a === w && b === h) ??
    sizes.find(([a, b]) => Math.abs(a * h - b * w) < 1e-9)
  return size ? picture.sizes[`${size[0]}x${size[1]}`]! : 0
}

/** RYT-077: every picture of a prop, at every size it has, so a placing preview never waits. */
export function pictureUrls(prop: string): string[] {
  const picture = propPictures[prop]
  if (!picture) return []
  return Object.entries(picture.sizes).flatMap(([size, count]) =>
    Array.from(
      { length: count },
      (_, v) => `${import.meta.env.BASE_URL}tabletop/props/${prop}-${v}-${size}.webp`,
    ),
  )
}

/** True once every picture has been decoded by this page. */
export const picturesReady = (urls: readonly string[]) => urls.every((url) => decoded.has(url))

/**
 * Loads and decodes pictures before they are shown, so the props of a map appear together rather
 * than one by one; resolves after `timeout` milliseconds at the latest, or at once without a DOM.
 */
export function decodePictures(urls: readonly string[], timeout = 1500): Promise<void> {
  const pending = urls.filter((url) => !decoded.has(url))
  if (!pending.length || typeof Image === 'undefined') return Promise.resolve()
  const all = Promise.all(
    pending.map((url) => {
      const image = new Image()
      image.src = url
      return image.decode().then(
        () => void decoded.add(url),
        () => undefined,
      )
    }),
  )
  return Promise.race([
    all.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ])
}

/**
 * A stable variant for an item, from its id: 0–20159 (2520 × 8), so it divides evenly among 1–9
 * pictures (RYT-068: up to 9 a prop) times the mirror and the quarter turns; drawings use it
 * modulo 6.
 */
export const variantRange = 20_160
export const variantOf = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % variantRange
}
