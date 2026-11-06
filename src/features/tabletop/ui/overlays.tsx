import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { mediaQuery } from '../api'
import { measurePath, routeMarks, type Point } from '../domain/geometry'
import type { Card } from '../domain/model'

/**
 * The measuring tape (RYT-058): an amber line over a dark halo, a diamond at every counted square,
 * waypoint knots and a readout plate with feet (large) and squares near the end.
 */
export function MeasureTape({
  points,
  large = false,
}: {
  points: readonly Point[]
  large?: boolean
}) {
  const { t } = useTranslation()
  if (points.length < 2) {
    if (points.length === 1)
      return (
        <g className="tt-tape">
          <circle cx={points[0]![0]} cy={points[0]![1]} r={0.16} className="tt-tape-knot" />
        </g>
      )
    return null
  }
  const route = measurePath(points)
  const marks = routeMarks(points)
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')
  const [ex, ey] = points.at(-1)!
  const scale = large ? 1.5 : 1
  const w = 2.4 * scale
  const h = 1.05 * scale
  return (
    <g className="tt-tape" aria-hidden="true">
      <path d={d} className="tt-tape-halo" />
      <path d={d} className="tt-tape-line" />
      {marks.map(([x, y], i) => (
        <path
          key={i}
          d={`M ${x} ${y - 0.09} L ${x + 0.09} ${y} L ${x} ${y + 0.09} L ${x - 0.09} ${y} Z`}
          className="tt-tape-mark"
        />
      ))}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.14} className="tt-tape-knot" />
      ))}
      <g transform={`translate(${ex + 0.35} ${ey - h - 0.2})`}>
        <rect width={w} height={h} rx={0.14} className="tt-tape-plate" />
        <text
          x={w / 2}
          y={h * 0.55}
          textAnchor="middle"
          className="tt-tape-feet"
          fontSize={0.52 * scale}
        >
          {t('tabletop.measure.feetShort', { count: route.feet })}
        </text>
        <text
          x={w / 2}
          y={h * 0.88}
          textAnchor="middle"
          className="tt-tape-squares"
          fontSize={0.26 * scale}
        >
          {t('tabletop.measure.squares', { count: route.squares })}
        </text>
      </g>
    </g>
  )
}

/** A ping: rings that expand three times (one static ring with reduced motion), for 4 seconds. */
export function PingRipple({ ping }: { ping: { x: number; y: number; at: string } | null }) {
  const [now, setNow] = useState(() => Date.now())
  const at = ping ? Date.parse(ping.at) : 0
  useEffect(() => {
    if (!ping) return
    const first = window.setTimeout(() => setNow(Date.now()), 0)
    const last = window.setTimeout(() => setNow(Date.now()), Math.max(0, at + 4100 - Date.now()))
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(last)
    }
  }, [at, ping])
  if (!ping || now - at > 4000) return null
  return (
    <g className="tt-ping" transform={`translate(${ping.x} ${ping.y})`} aria-hidden="true">
      <circle r={0.5} className="tt-ping-ring" />
      <circle r={0.5} className="tt-ping-ring is-late" />
      <circle r={0.18} className="tt-ping-core" />
    </g>
  )
}

/** The part of the map the table screen shows, drawn on the DM's board. */
export function TableFrame({
  x,
  y,
  cols,
  rows,
}: {
  x: number
  y: number
  cols: number
  rows: number
}) {
  const { t } = useTranslation()
  const left = x - cols / 2
  const top = y - rows / 2
  return (
    <g className="tt-frame" aria-hidden="true">
      <rect x={left} y={top} width={cols} height={rows} className="tt-frame-rect" />
      <g transform={`translate(${left} ${top - 0.62})`}>
        <rect width={2.6} height={0.56} rx={0.1} className="tt-frame-tab" />
        <text x={0.2} y={0.4} fontSize={0.34} className="tt-frame-label">
          {t('tabletop.frame.label', { cols, rows })}
        </text>
      </g>
    </g>
  )
}

/** A story card on the table: a parchment plate with type set for reading across the table. */
export function StoryPlate({
  card,
  onClose,
  fit = false,
}: {
  card: Pick<Card, 'title' | 'body' | 'image_path'>
  onClose?: () => void
  /** The table screen: shrink the type until the whole card shows (down to a readable floor). */
  fit?: boolean
}) {
  const { state } = useAuth()
  const { t } = useTranslation()
  const image = useQuery(mediaQuery(state.user?.id ?? 'anonymous', card.image_path))
  const plate = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = plate.current
    if (!fit || !el) return
    let k = 1
    el.style.setProperty('--tt-story-k', '1')
    while (el.scrollHeight > el.clientHeight + 1 && k > 0.5) {
      k = Math.round((k - 0.05) * 100) / 100
      el.style.setProperty('--tt-story-k', String(k))
    }
    el.classList.toggle('is-clipped', el.scrollHeight > el.clientHeight + 1)
  }, [fit, card.title, card.body, image.data])
  return (
    <section className="tt-story" aria-label={t('tabletop.story.onTable')}>
      <div ref={plate} className={`tt-story-plate ${card.image_path ? 'has-image' : ''}`}>
        {card.image_path && image.data && (
          <img src={image.data} alt="" className="tt-story-image" />
        )}
        <div className="tt-story-text">
          <h2 className="tt-story-title">{card.title}</h2>
          {card.body.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
        {onClose && (
          <button type="button" className="tt-story-close" onClick={onClose}>
            {t('tabletop.story.close')}
          </button>
        )}
      </div>
    </section>
  )
}
