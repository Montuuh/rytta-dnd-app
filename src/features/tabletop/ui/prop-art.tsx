import { useId, type ReactNode } from 'react'
import { hasDrawing } from './palette'
import { propSprite } from './sprites'

// RYT-062: original line art for the prop library, drawn in squares (one unit = one square).
// Ink outlines (0.04 of a square, 2.5px at 64px per square) over flat material washes.

const ink = '#2b1d10'
const S = 0.04
const D = 0.022
const c = {
  wood: '#b07a45',
  woodDark: '#7a4e2a',
  woodLight: '#cf9a5f',
  stone: '#a59d8f',
  stoneDark: '#6f685e',
  stoneLight: '#c8c0b2',
  metal: '#8e949b',
  gold: '#d9b24a',
  cloth: '#c9b48a',
  red: '#9e3b2e',
  paper: '#eadbb8',
  green: '#6e8b3d',
  leaf: '#4e7a34',
  leafLight: '#7aa04a',
  water: '#6fa3b5',
  fire: '#e8892b',
  flame: '#f7d36b',
  bone: '#e6dcc3',
  soot: '#3b322a',
}

const line = {
  stroke: ink,
  strokeWidth: S,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}
const thin = { ...line, strokeWidth: D }

/** Long props are drawn along x; a taller footprint turns the drawing. */
function along(w: number, h: number, draw: (length: number, breadth: number) => ReactNode) {
  if (h > w) return <g transform={`translate(${w} 0) rotate(90)`}>{draw(h, w)}</g>
  return <>{draw(w, h)}</>
}

const flame = (x: number, y: number, r: number) => (
  <g>
    <path
      d={`M ${x} ${y - r} C ${x + r * 0.9} ${y - r * 0.2} ${x + r * 0.7} ${y + r * 0.8} ${x} ${y + r * 0.8} C ${x - r * 0.7} ${y + r * 0.8} ${x - r * 0.9} ${y - r * 0.2} ${x} ${y - r} Z`}
      fill={c.fire}
      {...thin}
    />
    <path
      d={`M ${x} ${y - r * 0.35} C ${x + r * 0.4} ${y + r * 0.05} ${x + r * 0.3} ${y + r * 0.55} ${x} ${y + r * 0.55} C ${x - r * 0.3} ${y + r * 0.55} ${x - r * 0.4} ${y + r * 0.05} ${x} ${y - r * 0.35} Z`}
      fill={c.flame}
      stroke="none"
    />
  </g>
)

const propArt: Record<string, (w: number, h: number) => ReactNode> = {
  table: (w, h) => (
    <g>
      <rect
        x={0.12}
        y={0.12}
        width={w - 0.24}
        height={h - 0.24}
        rx={0.06}
        fill={c.wood}
        {...line}
      />
      <path
        d={`M 0.2 ${h / 2 - 0.12} H ${w - 0.2} M 0.2 ${h / 2 + 0.12} H ${w - 0.2}`}
        fill="none"
        {...thin}
        opacity={0.6}
      />
    </g>
  ),
  chair: () => (
    <g>
      <rect x={0.28} y={0.32} width={0.44} height={0.42} rx={0.05} fill={c.woodLight} {...line} />
      <rect x={0.26} y={0.2} width={0.48} height={0.12} rx={0.04} fill={c.woodDark} {...line} />
    </g>
  ),
  bed: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <rect
          x={0.08}
          y={0.1}
          width={l - 0.16}
          height={b - 0.2}
          rx={0.06}
          fill={c.woodDark}
          {...line}
        />
        <rect
          x={0.16}
          y={0.16}
          width={l - 0.32}
          height={b - 0.32}
          rx={0.05}
          fill={c.paper}
          {...line}
        />
        <rect x={0.22} y={0.24} width={0.36} height={b - 0.48} rx={0.08} fill="#f5ecd7" {...thin} />
        <rect
          x={l * 0.42}
          y={0.16}
          width={l * 0.5 - 0.16}
          height={b - 0.32}
          rx={0.04}
          fill={c.red}
          {...thin}
        />
      </g>
    )),
  bookshelf: () => (
    <g>
      <rect x={0.08} y={0.18} width={0.84} height={0.64} rx={0.03} fill={c.woodDark} {...line} />
      {[0.16, 0.27, 0.38, 0.5, 0.61, 0.72].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={0.26}
          width={0.09}
          height={0.48}
          fill={[c.red, c.green, c.gold, c.water, c.cloth, c.red][i]}
          {...thin}
        />
      ))}
    </g>
  ),
  bar: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <rect
          x={0.06}
          y={0.18}
          width={l - 0.12}
          height={b - 0.36}
          rx={0.08}
          fill={c.woodDark}
          {...line}
        />
        <path d={`M 0.12 ${b / 2} H ${l - 0.12}`} fill="none" {...thin} />
        {Array.from({ length: Math.max(1, Math.floor(l)) }, (_, i) => (
          <circle key={i} cx={i + 0.5} cy={b / 2 - 0.12} r={0.07} fill={c.water} {...thin} />
        ))}
      </g>
    )),
  rug: (w, h) => (
    <g>
      <rect x={0.12} y={0.12} width={w - 0.24} height={h - 0.24} rx={0.04} fill={c.red} {...line} />
      <rect
        x={0.28}
        y={0.28}
        width={w - 0.56}
        height={h - 0.56}
        fill="none"
        stroke={c.gold}
        strokeWidth={0.05}
      />
      <path
        d={`M ${w / 2} 0.42 L ${w - 0.42} ${h / 2} L ${w / 2} ${h - 0.42} L 0.42 ${h / 2} Z`}
        fill={c.gold}
        {...thin}
      />
    </g>
  ),
  'weapon-rack': () => (
    <g>
      <rect x={0.1} y={0.62} width={0.8} height={0.14} rx={0.03} fill={c.woodDark} {...line} />
      <path
        d="M 0.25 0.7 L 0.32 0.16 M 0.5 0.7 L 0.5 0.12 M 0.75 0.7 L 0.68 0.16"
        fill="none"
        {...line}
        stroke={c.metal}
        strokeWidth={0.06}
      />
      <path
        d="M 0.25 0.7 L 0.32 0.16 M 0.5 0.7 L 0.5 0.12 M 0.75 0.7 L 0.68 0.16"
        fill="none"
        {...thin}
      />
    </g>
  ),
  crate: () => (
    <g>
      <rect x={0.14} y={0.14} width={0.72} height={0.72} rx={0.03} fill={c.woodLight} {...line} />
      <path d="M 0.14 0.14 L 0.86 0.86 M 0.86 0.14 L 0.14 0.86" fill="none" {...thin} />
      <rect x={0.22} y={0.22} width={0.56} height={0.56} fill="none" {...thin} opacity={0.6} />
    </g>
  ),
  barrel: () => (
    <g>
      <circle cx={0.5} cy={0.5} r={0.36} fill={c.wood} {...line} />
      <circle cx={0.5} cy={0.5} r={0.27} fill="none" stroke={c.metal} strokeWidth={0.05} />
      <circle cx={0.5} cy={0.5} r={0.27} fill="none" {...thin} />
      <circle cx={0.5} cy={0.5} r={0.05} fill={c.woodDark} {...thin} />
    </g>
  ),
  sack: () => (
    <g>
      <path
        d="M 0.5 0.18 C 0.82 0.22 0.86 0.78 0.5 0.84 C 0.14 0.78 0.18 0.22 0.5 0.18 Z"
        fill={c.cloth}
        {...line}
      />
      <path d="M 0.42 0.2 L 0.5 0.1 L 0.58 0.2" fill="none" {...thin} />
    </g>
  ),
  chest: () => (
    <g>
      <rect x={0.12} y={0.24} width={0.76} height={0.52} rx={0.06} fill={c.wood} {...line} />
      <path d="M 0.12 0.42 H 0.88" fill="none" {...line} />
      <path d="M 0.3 0.24 V 0.76 M 0.7 0.24 V 0.76" stroke={c.gold} strokeWidth={0.05} />
      <rect x={0.44} y={0.38} width={0.12} height={0.12} fill={c.gold} {...thin} />
    </g>
  ),
  urn: () => (
    <g>
      <path
        d="M 0.38 0.16 H 0.62 L 0.6 0.26 C 0.82 0.36 0.82 0.72 0.6 0.84 H 0.4 C 0.18 0.72 0.18 0.36 0.4 0.26 Z"
        fill={c.stoneLight}
        {...line}
      />
      <path d="M 0.28 0.5 H 0.72" fill="none" stroke={c.red} strokeWidth={0.04} />
    </g>
  ),
  coins: () => (
    <g>
      {[
        [0.38, 0.58],
        [0.58, 0.56],
        [0.48, 0.42],
        [0.66, 0.38],
        [0.32, 0.38],
      ].map(([x, y]) => (
        <ellipse key={`${x}${y}`} cx={x} cy={y} rx={0.13} ry={0.09} fill={c.gold} {...thin} />
      ))}
    </g>
  ),
  cauldron: () => (
    <g>
      <circle cx={0.5} cy={0.5} r={0.36} fill={c.soot} {...line} />
      <circle cx={0.5} cy={0.5} r={0.26} fill={c.green} {...thin} />
      <circle cx={0.44} cy={0.46} r={0.05} fill={c.leafLight} stroke="none" />
      <circle cx={0.58} cy={0.56} r={0.04} fill={c.leafLight} stroke="none" />
    </g>
  ),
  altar: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <rect
          x={0.1}
          y={0.16}
          width={l - 0.2}
          height={b - 0.32}
          rx={0.04}
          fill={c.stoneLight}
          {...line}
        />
        <rect x={0.2} y={0.26} width={l - 0.4} height={b - 0.52} fill="none" {...thin} />
        <rect x={l / 2 - 0.3} y={0.24} width={0.6} height={b - 0.48} fill={c.red} {...thin} />
        {flame(0.32, b / 2, 0.08)}
        {flame(l - 0.32, b / 2, 0.08)}
      </g>
    )),
  statue: () => (
    <g>
      <rect x={0.14} y={0.14} width={0.72} height={0.72} rx={0.04} fill={c.stoneDark} {...line} />
      <circle cx={0.5} cy={0.36} r={0.12} fill={c.stoneLight} {...line} />
      <path d="M 0.3 0.74 C 0.3 0.5 0.7 0.5 0.7 0.74 Z" fill={c.stoneLight} {...line} />
    </g>
  ),
  pillar: () => (
    <g>
      <rect x={0.14} y={0.14} width={0.72} height={0.72} rx={0.06} fill={c.stoneDark} {...line} />
      <circle cx={0.5} cy={0.5} r={0.25} fill={c.stoneLight} {...line} />
      <circle cx={0.5} cy={0.5} r={0.15} fill="none" {...thin} />
    </g>
  ),
  sarcophagus: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <path
          d={`M 0.12 ${b * 0.3} L 0.3 0.12 H ${l - 0.12} V ${b - 0.12} H 0.3 L 0.12 ${b * 0.7} Z`}
          fill={c.stoneLight}
          {...line}
        />
        <path
          d={`M 0.4 ${b * 0.3} L 0.5 ${b * 0.22} H ${l - 0.28} V ${b * 0.78} H 0.5 L 0.4 ${b * 0.7} Z`}
          fill="none"
          {...thin}
        />
        <path
          d={`M ${l * 0.55} ${b * 0.38} V ${b * 0.62} M ${l * 0.48} ${b / 2} H ${l * 0.62}`}
          fill="none"
          {...line}
        />
      </g>
    )),
  bones: () => (
    <g>
      <circle cx={0.36} cy={0.34} r={0.12} fill={c.bone} {...thin} />
      <circle cx={0.33} cy={0.33} r={0.025} fill={ink} />
      <circle cx={0.4} cy={0.33} r={0.025} fill={ink} />
      <path
        d="M 0.5 0.55 L 0.78 0.72 M 0.48 0.72 L 0.74 0.5"
        fill="none"
        stroke={c.bone}
        strokeWidth={0.07}
        strokeLinecap="round"
      />
      <path d="M 0.5 0.55 L 0.78 0.72 M 0.48 0.72 L 0.74 0.5" fill="none" {...thin} />
    </g>
  ),
  rubble: () => (
    <g>
      <path d="M 0.2 0.62 L 0.32 0.44 L 0.48 0.5 L 0.44 0.7 Z" fill={c.stone} {...thin} />
      <path d="M 0.52 0.36 L 0.7 0.3 L 0.78 0.48 L 0.6 0.54 Z" fill={c.stoneDark} {...thin} />
      <path d="M 0.56 0.66 L 0.7 0.6 L 0.76 0.76 L 0.6 0.8 Z" fill={c.stone} {...thin} />
      <circle cx={0.3} cy={0.3} r={0.05} fill={c.stoneDark} {...thin} />
    </g>
  ),
  web: () => (
    <g fill="none" stroke="#efe7d6" strokeWidth={0.02} opacity={0.9}>
      <path d="M 0 0 L 1 1 M 1 0 L 0 1 M 0.5 0 V 1 M 0 0.5 H 1" />
      <circle cx={0.5} cy={0.5} r={0.14} />
      <circle cx={0.5} cy={0.5} r={0.28} />
      <circle cx={0.5} cy={0.5} r={0.42} />
    </g>
  ),
  trapdoor: () => (
    <g>
      <rect x={0.14} y={0.14} width={0.72} height={0.72} fill={c.woodDark} {...line} />
      <path d="M 0.14 0.38 H 0.86 M 0.14 0.62 H 0.86" fill="none" {...thin} />
      <circle cx={0.74} cy={0.5} r={0.06} fill={c.metal} {...thin} />
    </g>
  ),
  lever: () => (
    <g>
      <rect x={0.32} y={0.56} width={0.36} height={0.22} rx={0.04} fill={c.stoneDark} {...line} />
      <path
        d="M 0.5 0.62 L 0.68 0.2"
        fill="none"
        stroke={c.metal}
        strokeWidth={0.06}
        strokeLinecap="round"
      />
      <circle cx={0.68} cy={0.2} r={0.07} fill={c.red} {...thin} />
    </g>
  ),
  rock: () => (
    <g>
      <path
        d="M 0.18 0.62 C 0.14 0.4 0.3 0.2 0.52 0.22 C 0.76 0.22 0.88 0.44 0.82 0.64 C 0.74 0.82 0.3 0.84 0.18 0.62 Z"
        fill={c.stone}
        {...line}
      />
      <path d="M 0.36 0.4 C 0.46 0.34 0.58 0.36 0.64 0.44" fill="none" {...thin} />
    </g>
  ),
  stalagmite: () => (
    <g>
      <circle cx={0.5} cy={0.5} r={0.32} fill={c.stoneDark} {...line} />
      <circle cx={0.5} cy={0.5} r={0.2} fill={c.stone} {...thin} />
      <circle cx={0.5} cy={0.5} r={0.08} fill={c.stoneLight} {...thin} />
    </g>
  ),
  mushrooms: () => (
    <g>
      {[
        [0.36, 0.42, 0.16],
        [0.62, 0.36, 0.12],
        [0.56, 0.64, 0.14],
      ].map(([x, y, r]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r={r} fill={c.red} {...thin} />
          <circle
            cx={x! - r! * 0.3}
            cy={y! - r! * 0.3}
            r={r! * 0.22}
            fill="#f3e9d2"
            stroke="none"
          />
        </g>
      ))}
    </g>
  ),
  bush: () => (
    <g>
      <path
        d="M 0.5 0.14 C 0.7 0.12 0.86 0.3 0.84 0.48 C 0.9 0.66 0.72 0.86 0.5 0.84 C 0.28 0.88 0.1 0.68 0.16 0.5 C 0.12 0.3 0.3 0.14 0.5 0.14 Z"
        fill={c.leaf}
        {...line}
      />
      <path
        d="M 0.36 0.4 C 0.42 0.34 0.5 0.34 0.56 0.4 M 0.5 0.6 C 0.56 0.54 0.64 0.54 0.7 0.6"
        fill="none"
        stroke={c.leafLight}
        strokeWidth={0.03}
      />
    </g>
  ),
  tree: (w, h) => (
    <g>
      <ellipse
        cx={w / 2 + 0.08}
        cy={h / 2 + 0.1}
        rx={w * 0.42}
        ry={h * 0.42}
        fill="#000"
        opacity={0.18}
        stroke="none"
      />
      <path
        d={`M ${w / 2} ${h * 0.08} C ${w * 0.8} ${h * 0.06} ${w * 0.94} ${h * 0.3} ${w * 0.9} ${h / 2} C ${w * 0.96} ${h * 0.76} ${w * 0.74} ${h * 0.94} ${w / 2} ${h * 0.92} C ${w * 0.24} ${h * 0.96} ${w * 0.04} ${h * 0.74} ${w * 0.1} ${h / 2} C ${w * 0.06} ${h * 0.26} ${w * 0.24} ${h * 0.06} ${w / 2} ${h * 0.08} Z`}
        fill={c.leaf}
        {...line}
      />
      <circle cx={w * 0.38} cy={h * 0.36} r={w * 0.16} fill={c.leafLight} {...thin} opacity={0.9} />
      <circle cx={w * 0.62} cy={h * 0.6} r={w * 0.14} fill={c.leafLight} {...thin} opacity={0.8} />
    </g>
  ),
  stump: () => (
    <g>
      <circle cx={0.5} cy={0.5} r={0.3} fill={c.woodLight} {...line} />
      <circle cx={0.5} cy={0.5} r={0.18} fill="none" {...thin} />
      <circle cx={0.5} cy={0.5} r={0.07} fill="none" {...thin} />
    </g>
  ),
  log: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <rect
          x={0.1}
          y={b * 0.28}
          width={l - 0.26}
          height={b * 0.44}
          rx={0.06}
          fill={c.wood}
          {...line}
        />
        <ellipse cx={l - 0.16} cy={b / 2} rx={0.1} ry={b * 0.22} fill={c.woodLight} {...line} />
        <path
          d={`M 0.3 ${b * 0.42} H ${l * 0.6} M 0.5 ${b * 0.58} H ${l * 0.8}`}
          fill="none"
          {...thin}
        />
      </g>
    )),
  flowers: () => (
    <g>
      {[
        [0.3, 0.34, c.gold],
        [0.62, 0.3, c.red],
        [0.44, 0.62, '#b48ed6'],
        [0.7, 0.66, c.gold],
      ].map(([x, y, color]) => (
        <g key={`${x}${y}`}>
          <circle cx={x as number} cy={y as number} r={0.09} fill={color as string} {...thin} />
          <circle cx={x as number} cy={y as number} r={0.03} fill={c.paper} stroke="none" />
        </g>
      ))}
    </g>
  ),
  campfire: () => (
    <g>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle
          key={a}
          cx={0.5 + Math.cos((a * Math.PI) / 180) * 0.32}
          cy={0.5 + Math.sin((a * Math.PI) / 180) * 0.32}
          r={0.08}
          fill={c.stoneDark}
          {...thin}
        />
      ))}
      <path
        d="M 0.3 0.62 L 0.7 0.38 M 0.3 0.38 L 0.7 0.62"
        stroke={c.woodDark}
        strokeWidth={0.08}
        strokeLinecap="round"
      />
      {flame(0.5, 0.48, 0.2)}
    </g>
  ),
  brazier: () => (
    <g>
      <circle cx={0.5} cy={0.5} r={0.32} fill={c.metal} {...line} />
      <circle cx={0.5} cy={0.5} r={0.22} fill={c.soot} {...thin} />
      {flame(0.5, 0.5, 0.18)}
    </g>
  ),
  candles: () => (
    <g>
      {[
        [0.34, 0.6],
        [0.56, 0.42],
        [0.66, 0.66],
      ].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r={0.08} fill="#f3ead3" {...thin} />
          {flame(x!, y! - 0.04, 0.06)}
        </g>
      ))}
    </g>
  ),
  torch: () => (
    <g>
      <path d="M 0.5 0.86 L 0.5 0.4" stroke={c.woodDark} strokeWidth={0.1} strokeLinecap="round" />
      <path d="M 0.5 0.86 L 0.5 0.4" stroke={ink} strokeWidth={D} />
      {flame(0.5, 0.32, 0.17)}
    </g>
  ),
  hearth: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <rect
          x={0.06}
          y={0.08}
          width={l - 0.12}
          height={b - 0.16}
          rx={0.04}
          fill={c.stoneDark}
          {...line}
        />
        <rect x={0.3} y={0.28} width={l - 0.6} height={b - 0.42} fill={c.soot} {...thin} />
        {flame(l / 2, b / 2 + 0.04, 0.2)}
      </g>
    )),
  stairs: () => (
    <g>
      <rect x={0.08} y={0.08} width={0.84} height={0.84} fill={c.stone} {...line} />
      {[0.22, 0.36, 0.5, 0.64, 0.78].map((y, i) => (
        <path key={y} d={`M 0.08 ${y} H 0.92`} fill="none" {...thin} opacity={1 - i * 0.12} />
      ))}
      <path d="M 0.5 0.86 L 0.5 0.18 M 0.4 0.28 L 0.5 0.18 L 0.6 0.28" fill="none" {...line} />
    </g>
  ),
  well: () => (
    <g>
      <circle cx={0.5} cy={0.5} r={0.38} fill={c.stone} {...line} />
      <circle cx={0.5} cy={0.5} r={0.24} fill={c.water} {...line} />
      <path d="M 0.12 0.5 H 0.88" stroke={c.woodDark} strokeWidth={0.06} />
    </g>
  ),
  signpost: () => (
    <g>
      <path d="M 0.48 0.44 H 0.84 L 0.92 0.5 L 0.84 0.56 H 0.48 Z" fill={c.woodLight} {...line} />
      <path
        d="M 0.52 0.5 L 0.24 0.3 L 0.16 0.32 L 0.2 0.4 L 0.46 0.58 Z"
        fill={c.woodLight}
        {...line}
      />
      <circle cx={0.5} cy={0.5} r={0.08} fill={c.woodDark} {...line} />
    </g>
  ),
  'lantern-post': () => (
    <g>
      <circle cx={0.36} cy={0.64} r={0.17} fill={c.stone} {...line} />
      <circle cx={0.36} cy={0.64} r={0.08} fill={c.stoneDark} {...line} />
      <path d="M 0.36 0.64 L 0.6 0.4" fill="none" stroke={ink} strokeWidth={0.06} />
      <rect x={0.53} y={0.21} width={0.26} height={0.26} rx={0.04} fill={c.paper} {...line} />
      {/* The flame from above: a bright core in a ring. */}
      <circle cx={0.66} cy={0.34} r={0.065} fill={c.fire} {...thin} />
      <circle cx={0.66} cy={0.34} r={0.03} fill={c.flame} />
    </g>
  ),
  'market-stall': (w, h) => (
    <g>
      <rect x={0.1} y={0.12} width={w - 0.2} height={h * 0.6} rx={0.04} fill={c.cloth} {...line} />
      {[0, 2, 4].map((k) => (
        <rect
          key={k}
          x={0.1 + (k * (w - 0.2)) / 6}
          y={0.12}
          width={(w - 0.2) / 6}
          height={h * 0.6}
          fill={c.red}
          fillOpacity={0.55}
        />
      ))}
      <rect
        x={0.14}
        y={h * 0.74}
        width={w - 0.28}
        height={h * 0.16}
        rx={0.03}
        fill={c.woodLight}
        {...line}
      />
    </g>
  ),
  bridge: (w, h) => (
    <g>
      <rect x={0.1} y={0.18} width={w - 0.2} height={h - 0.36} fill={c.woodLight} {...line} />
      {Array.from({ length: Math.round((w - 0.2) / 0.25) }, (_, i) => (
        <path key={i} d={`M ${0.1 + (i + 1) * 0.25} 0.18 V ${h - 0.18}`} fill="none" {...thin} />
      ))}
      <path
        d={`M 0.1 0.18 H ${w - 0.1} M 0.1 ${h - 0.18} H ${w - 0.1}`}
        stroke={c.woodDark}
        strokeWidth={0.07}
      />
    </g>
  ),
  cart: (w, h) =>
    along(w, h, (l, b) => (
      <g>
        <rect
          x={0.2}
          y={0.16}
          width={l - 0.7}
          height={b - 0.32}
          rx={0.04}
          fill={c.wood}
          {...line}
        />
        <path d={`M ${l - 0.5} ${b / 2} H ${l - 0.08}`} stroke={c.woodDark} strokeWidth={0.06} />
        <rect x={0.5} y={0.06} width={0.4} height={0.1} rx={0.03} fill={c.soot} {...thin} />
        <rect x={0.5} y={b - 0.16} width={0.4} height={0.1} rx={0.03} fill={c.soot} {...thin} />
      </g>
    )),
  tent: (w, h) => (
    <g>
      <path
        d={`M 0.14 ${h - 0.16} L ${w / 2} 0.14 L ${w - 0.14} ${h - 0.16} Z`}
        fill={c.cloth}
        {...line}
      />
      <path d={`M ${w / 2} 0.14 V ${h - 0.16}`} fill="none" {...thin} />
      <path
        d={`M ${w / 2 - 0.24} ${h - 0.16} L ${w / 2} ${h - 0.6} L ${w / 2 + 0.24} ${h - 0.16}`}
        fill={c.woodDark}
        {...thin}
      />
    </g>
  ),
  fountain: (w, h) => (
    <g>
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.44} fill={c.stoneLight} {...line} />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.34} fill={c.water} {...line} />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.1} fill={c.stone} {...line} />
      <circle
        cx={w / 2}
        cy={h / 2}
        r={Math.min(w, h) * 0.2}
        fill="none"
        stroke="#dcecf0"
        strokeWidth={0.02}
      />
    </g>
  ),
}

/**
 * The ink filter for pictures on ink maps: the painting printed in sepia on the parchment, so a
 * prop without a line drawing still belongs to the look (RYT-068).
 */
export function InkFilter({ id }: { id: string }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix
        type="matrix"
        values="0.36 0.62 0.14 0 -0.02  0.29 0.52 0.12 0 -0.03  0.2 0.38 0.09 0 -0.04  0 0 0 1 0"
      />
    </filter>
  )
}

/** A prop drawn in its footprint; unknown ids fall back to a labelled square. */
export function PropDrawing({ prop, w, h }: { prop: string; w: number; h: number }) {
  const draw = propArt[prop]
  if (draw) return <>{draw(w, h)}</>
  return (
    <rect
      x={0.1}
      y={0.1}
      width={w - 0.2}
      height={h - 0.2}
      fill={c.paper}
      {...line}
      strokeDasharray="0.08 0.06"
    />
  )
}

/**
 * A standalone icon of a prop for lists and the library (decorative; names are printed): its
 * picture on painted maps, its line drawing on ink maps (or its picture printed in ink).
 */
export function PropIcon({
  prop,
  w,
  h,
  size = 40,
  painted = true,
}: {
  prop: string
  w: number
  h: number
  size?: number
  painted?: boolean
}) {
  const filter = `ink${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const box = Math.max(w, h)
  const ink = !painted && !hasDrawing(prop)
  const sprite = painted || ink ? propSprite(prop, w, h, 0) : null
  const picture = sprite?.picture ? sprite : null
  return (
    <svg
      viewBox={`${(w - box) / 2} ${(h - box) / 2} ${box} ${box}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="tt-prop-icon"
    >
      {picture ? (
        <>
          {ink && <InkFilter id={filter} />}
          <image
            href={picture.url}
            x={-picture.pad}
            y={-picture.pad}
            width={w + picture.pad * 2}
            height={h + picture.pad * 2}
            filter={ink ? `url(#${filter})` : undefined}
          />
        </>
      ) : (
        <PropDrawing prop={prop} w={w} h={h} />
      )}
    </svg>
  )
}
