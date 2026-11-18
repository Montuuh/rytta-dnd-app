import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeOff, Maximize2, Minimize2, Move, WifiOff } from 'lucide-react'
import { CombatantToken, type Combatant } from '@/features/combat'
import {
  cornerFromPoint,
  cornerToward,
  mirrorCorner,
  mirrorDirection,
  nextCorner,
  readPlate,
  writePlate,
  type PlateCorner,
  type PlatePrefs,
} from '../domain/table-plate'

type Props = {
  status: 'initiative' | 'active'
  round: number
  active: Combatant | null
  next: Combatant | null
  hiddenTurn: boolean
  ready: { ready: number; total: number }
  stale: boolean
  /** The table is turned for people on the other side: the plate keeps to the viewer's corners. */
  flipped: boolean
  /** Height of the status bar, so a bottom corner stays above it. */
  barHeight: number
}

/**
 * The turn plate over the map (RYT-131): who acts now and who is next, in one corner of the screen.
 * It moves to another corner by dragging the handle (it snaps where it is released), by the arrow keys
 * on the handle, or by pressing the handle, and it shrinks to the acting name alone. The choice
 * stays on this device. Position changes are instant, so there is nothing for reduced motion to cut.
 */
export function TurnPlate({
  status,
  round,
  active,
  next,
  hiddenTurn,
  ready,
  stale,
  flipped,
  barHeight,
}: Props) {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<PlatePrefs>(() => readPlate())
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [moved, setMoved] = useState('')
  const origin = useRef<{ x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const small = prefs.size === 'small'

  const update = (change: Partial<PlatePrefs>) => {
    const value = { ...prefs, ...change }
    setPrefs(value)
    writePlate(value)
    // The corner is named as the screen shows it: a turned screen mirrors the plate's own frame.
    if (change.corner) {
      const shown = flipped ? mirrorCorner(change.corner) : change.corner
      setMoved(t('tabletop.plate.moved', { corner: t(`tabletop.plate.corner.${shown}`) }))
    }
  }
  const place = (corner: PlateCorner) => corner !== prefs.corner && update({ corner })

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = { x: e.clientX, y: e.clientY }
    dragged.current = false
  }
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const start = origin.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (!dragged.current && Math.hypot(dx, dy) < 8) return
    dragged.current = true
    setDrag({ x: dx, y: dy })
  }
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (!origin.current) return
    origin.current = null
    if (!dragged.current) return
    setDrag(null)
    const x = flipped ? innerWidth - e.clientX : e.clientX
    const y = flipped ? innerHeight - e.clientY : e.clientY
    place(cornerFromPoint(x, y, innerWidth, innerHeight))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const direction = (
      { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const
    )[e.key as 'ArrowLeft']
    if (!direction) return
    e.preventDefault()
    // Arrow keys follow the screen, which a 180 degree turn mirrors against the plate's frame.
    place(cornerToward(prefs.corner, flipped ? mirrorDirection(direction) : direction))
  }

  const style = {
    '--tt-bar': `${barHeight}px`,
    ...(drag && {
      transform: `translate(${flipped ? -drag.x : drag.x}px, ${flipped ? -drag.y : drag.y}px)`,
    }),
  } as CSSProperties

  return (
    <aside
      className={`tt-turnplate${stale ? ' is-stale' : ''}${drag ? ' is-dragging' : ''}`}
      data-corner={prefs.corner}
      data-size={prefs.size}
      aria-label={t('tabletop.plate.label')}
      style={style}
    >
      <div className="tt-turnplate-head">
        <p className="tt-turnplate-round">
          {status === 'initiative'
            ? t('combat.table.rolling')
            : t('tabletop.table.round', { round })}
        </p>
        <button
          type="button"
          className="tt-turnplate-key"
          aria-label={t('tabletop.plate.move')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            origin.current = null
            dragged.current = false
            setDrag(null)
          }}
          onKeyDown={onKeyDown}
          onClick={() => {
            // A drag ends in a click on the same button; only a plain press steps to the next corner.
            if (dragged.current) dragged.current = false
            else place(nextCorner(prefs.corner))
          }}
        >
          <Move size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="tt-turnplate-key"
          aria-label={t(small ? 'tabletop.plate.grow' : 'tabletop.plate.shrink')}
          onClick={() => update({ size: small ? 'full' : 'small' })}
        >
          {small ? (
            <Maximize2 size={20} aria-hidden="true" />
          ) : (
            <Minimize2 size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      {status === 'initiative' ? (
        <p className="tt-turnplate-name">
          {t('combat.table.ready', { ready: ready.ready, total: ready.total })}
        </p>
      ) : hiddenTurn ? (
        <p className="tt-turnplate-name is-hidden-turn">
          <EyeOff size={22} aria-hidden="true" />
          {t('tabletop.table.hiddenTurn')}
        </p>
      ) : (
        <>
          <div className="tt-turnplate-line is-now">
            {active && !small && <CombatantToken combatant={active} showActive={false} size={48} />}
            <div>
              <p className="tt-turnplate-label">{t('combat.turn.now')}</p>
              <p className="tt-turnplate-name">{active?.name ?? '—'}</p>
            </div>
          </div>
          {!small && next && (
            <div className="tt-turnplate-line is-next">
              <CombatantToken combatant={next} showActive={false} size={32} />
              <div>
                <p className="tt-turnplate-label">{t('combat.turn.upNext')}</p>
                <p className="tt-turnplate-next">{next.name}</p>
              </div>
            </div>
          )}
        </>
      )}
      {stale && (
        <p className="tt-turnplate-stale">
          <WifiOff size={18} aria-hidden="true" />
          {t('tabletop.table.offline')}
        </p>
      )}
      <span className="visually-hidden" role="status">
        {moved}
      </span>
    </aside>
  )
}
