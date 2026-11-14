import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { clamp, measurePath, type Point } from '../domain/geometry'
import { MeasureTape } from './overlays'
import { U } from './palette'

/** The physical display keeps its scale; this ruler only reads positions on it. */
export function TableMeasure({
  cols,
  rows,
  transform,
  flipped,
  onClose,
}: {
  cols: number
  rows: number
  transform: string
  flipped: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const surface = useRef<SVGSVGElement>(null)
  const press = useRef<{ id: number; at: Point } | null>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [preview, setPreview] = useState<Point[] | null>(null)
  const [cursor, setCursor] = useState<Point>([
    Math.floor(cols / 2) + 0.5,
    Math.floor(rows / 2) + 0.5,
  ])
  useEffect(() => {
    surface.current?.focus({ preventScroll: true })
  }, [])
  const point = (e: PointerEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect()
    const x = ((flipped ? box.right - e.clientX : e.clientX - box.left) * cols) / box.width
    const y = ((flipped ? box.bottom - e.clientY : e.clientY - box.top) * rows) / box.height
    return [clamp(Math.floor(x), 0, cols - 1) + 0.5, clamp(Math.floor(y), 0, rows - 1) + 0.5]
  }
  const add = (at: Point) => setPoints((p) => [...p, at].slice(-16))
  const shown = preview ?? points
  const feet = t('tabletop.measure.feet', { count: measurePath(shown).feet })
  return (
    <>
      <svg
        ref={surface}
        className="tt-table-measure"
        style={{ transform }}
        width={cols * U}
        height={rows * U}
        viewBox={`0 0 ${cols} ${rows}`}
        role="application"
        tabIndex={0}
        aria-label={t('tabletop.table.ruler')}
        aria-describedby="tt-measure-instructions"
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0) return
          const at = point(e)
          press.current = { id: e.pointerId, at }
          setCursor(at)
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (press.current?.id === e.pointerId) setPreview([press.current.at, point(e)])
        }}
        onPointerUp={(e) => {
          if (press.current?.id !== e.pointerId) return
          const a = press.current.at,
            b = point(e)
          press.current = null
          setPreview(null)
          if (a[0] === b[0] && a[1] === b[1]) add(b)
          else setPoints([a, b])
          setCursor(b)
        }}
        onPointerCancel={() => {
          press.current = null
          setPreview(null)
        }}
        onKeyDown={(e) => {
          const dx = Number(e.key === 'ArrowRight') - Number(e.key === 'ArrowLeft'),
            dy = Number(e.key === 'ArrowDown') - Number(e.key === 'ArrowUp')
          if (dx || dy)
            setCursor((p) => [
              clamp(p[0] + dx * (flipped ? -1 : 1), 0.5, cols - 0.5),
              clamp(p[1] + dy * (flipped ? -1 : 1), 0.5, rows - 0.5),
            ])
          else if (e.key === 'Enter' || e.key === ' ') add(cursor)
          else if (e.key === 'Escape') onClose()
          else if (e.key === 'Backspace' || e.key === 'Delete') setPoints([])
          else return
          e.preventDefault()
        }}
      >
        <rect
          x={cursor[0] - 0.5}
          y={cursor[1] - 0.5}
          width={1}
          height={1}
          fill="none"
          stroke="var(--app-focus)"
          strokeWidth={0.07}
        />
        <MeasureTape points={shown} large />
      </svg>
      <p id="tt-measure-instructions" className="visually-hidden">
        {t('tabletop.measure.hint')} {t('tabletop.measure.keyboard')}
      </p>
      <output className="tt-table-distance">{feet}</output>
    </>
  )
}
