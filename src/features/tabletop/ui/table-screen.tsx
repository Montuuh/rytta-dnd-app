import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Compass, RefreshCw, Ruler, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { combatStateQuery, useCombatRealtime } from '@/features/combat'
import { mediaQuery, tabletopQuery, useTabletopRealtime } from '../api'
import { audioPlan, TableAudio } from '../audio/engine'
import { fromSetup, squareCss } from '../domain/calibration'
import { Board } from './board'
import { U } from './palette'
import { TableRuler } from './calibration'
import { MeasureTape, PingRipple, StoryPlate } from './overlays'

/**
 * The table screen (ADR 032): the scene on the table at the calibrated scale, centred on the table
 * frame, read-only and without app chrome. It always uses the table projection, so a DM account on
 * the table shows no secrets. It plays the table's audio after one tap.
 */
export function TableScreen({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const connected = useTabletopRealtime(campaignId, true)
  useCombatRealtime(campaignId, true)
  const query = useQuery(tabletopQuery(userId, campaignId, null, true, connected))
  const combat = useQuery(combatStateQuery(userId, campaignId, null, true))
  const view = query.data
  const track = useQuery(mediaQuery(userId, view?.track?.path))
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(false)
  const [ruler, setRuler] = useState(false)
  // A shared measure fades from the table after ten minutes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  }))
  const audio = useRef<TableAudio | null>(null)
  audio.current ??= new TableAudio()
  useEffect(() => {
    const onResize = () =>
      setSize({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Keep the screen awake while the table is open (where the browser allows it).
  useEffect(() => {
    if (!started) return
    let lock: { release: () => Promise<void> } | null = null
    const request = () =>
      (
        navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
      ).wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined)
    void request()
    const again = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      void lock?.release().catch(() => undefined)
    }
  }, [started])
  useEffect(() => () => audio.current?.dispose(), [])
  const plan = useMemo(() => audioPlan(view?.live), [view?.live])
  useEffect(() => {
    if (!started || muted) return
    audio.current!.apply(plan, track.data ?? null)
  }, [plan, track.data, started, muted])
  useEffect(() => {
    if (muted) {
      audio.current!.setAmbience(null)
      audio.current!.setTrack(null, true)
    }
  }, [muted])
  useEffect(() => {
    const previous = document.title
    document.title = t('tabletop.table.documentTitle')
    document.documentElement.classList.add('tt-table-mode')
    return () => {
      document.title = previous
      document.documentElement.classList.remove('tt-table-mode')
    }
  }, [t])

  const start = async () => {
    setStarted(true)
    await audio.current!.unlock()
    await document.documentElement.requestFullscreen?.().catch(() => undefined)
  }

  const scene = view?.scene ?? null
  const calibration = fromSetup(view?.live.screen)
  const square = calibration
    ? squareCss(calibration, size.dpr)
    : scene
      ? Math.min(size.w / scene.cols, size.h / scene.rows)
      : 64
  const z = square / U
  const cx = view?.live.view_x ?? (scene ? scene.cols / 2 : 0)
  const cy = view?.live.view_y ?? (scene ? scene.rows / 2 : 0)
  const x = size.w / 2 - cx * U * z
  const y = size.h / 2 - cy * U * z
  const combatants = useMemo(
    () => new Map((combat.data?.combatants ?? []).map((c) => [c.id, c])),
    [combat.data],
  )
  const encounter = combat.data?.encounter
  const active = combat.data?.combatants.find((c) => c.is_active)
  const fight = encounter && (encounter.status === 'active' || encounter.status === 'initiative')
  const measure = view?.live.measure
  const measureFresh = measure && now - Date.parse(measure.at) < 10 * 60 * 1000

  return (
    <div
      className={`tt-table ${calibration?.flip ? 'is-flipped' : ''}`}
      // Words on the table are sized in squares, so they read the same on any screen.
      style={{ '--tt-sq': `${square}px` } as CSSProperties}
    >
      {query.isError && !view ? (
        <div className="tt-table-empty" role="alert">
          <Compass size={48} aria-hidden="true" />
          <p>
            {t(
              query.error.message === 'forbidden'
                ? 'tabletop.table.forbidden'
                : 'tabletop.error.load',
            )}
          </p>
        </div>
      ) : !view ? (
        <div className="tt-table-empty">
          <p>{t('tabletop.loading')}</p>
        </div>
      ) : !scene ? (
        <div className="tt-table-empty">
          <Compass size={56} aria-hidden="true" />
          <p className="tt-table-empty-title">{t('tabletop.table.nothing')}</p>
          <p>{t('tabletop.table.nothingHelp')}</p>
        </div>
      ) : (
        <div
          className="tt-table-world"
          style={{ transform: `translate(${x}px, ${y}px) scale(${z})` }}
        >
          <Board
            scene={scene}
            items={view.items}
            mode="table"
            combatants={combatants}
            overlay={
              <>
                {measureFresh && <MeasureTape points={measure.points} large />}
                <PingRipple ping={view.live.ping} />
              </>
            }
          />
        </div>
      )}
      {view?.card && <StoryPlate card={view.card} fit />}
      {ruler && calibration && (
        <div className="tt-ruler-wrap">
          <TableRuler square={square} baseMm={calibration.baseMm} />
        </div>
      )}
      <div className="tt-status" role="status">
        {scene && <span className="tt-status-scene">{scene.name}</span>}
        {fight && (
          <span>
            {t('tabletop.table.round', { round: encounter.round })}
            {active ? ` · ${t('tabletop.table.turn', { name: active.name })}` : ''}
          </span>
        )}
        <span className="tt-status-net">
          {connected ? (
            <Wifi size={14} aria-hidden="true" />
          ) : query.isError ? (
            <WifiOff size={14} aria-hidden="true" />
          ) : (
            <RefreshCw size={14} aria-hidden="true" />
          )}
          {connected
            ? t('tabletop.table.live')
            : query.isError
              ? t('tabletop.table.offline')
              : t('tabletop.table.polling')}
        </span>
        {!calibration && scene && (
          <span className="tt-status-warn">{t('tabletop.table.uncalibrated')}</span>
        )}
        {started && (
          <>
            <button
              type="button"
              className="tt-status-button"
              onClick={() => setRuler((r) => !r)}
              aria-pressed={ruler}
              disabled={!calibration}
            >
              <Ruler size={14} aria-hidden="true" />
              {t('tabletop.table.ruler')}
            </button>
            <button
              type="button"
              className="tt-status-button"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={muted}
            >
              <VolumeX size={14} aria-hidden="true" />
              {t('tabletop.table.mute')}
            </button>
          </>
        )}
      </div>
      {!started && (
        <div
          className="tt-start"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tt-start-title"
          onClick={start}
        >
          <div className="tt-start-card">
            <h1 id="tt-start-title">{t('tabletop.table.startTitle')}</h1>
            <p>{t('tabletop.table.startBody')}</p>
            <button type="button" className="tt-start-button" autoFocus>
              {t('tabletop.table.start')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
