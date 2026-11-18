import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import {
  Compass,
  LogOut,
  Maximize,
  Minimize,
  Ruler,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import {
  combatStateQuery,
  Elapsed,
  isHiddenTurn,
  isLive,
  nextUp,
  turnOrder,
  useCombatRealtime,
  useFreshness,
} from '@/features/combat'
import { mediaQuery, tabletopQuery, useTabletopRealtime } from '../api'
import { tabletopPollMs } from '../domain/model'
import { turnMark } from '../domain/table-order'
import { audioPlan, TableAudio } from '../audio/engine'
import { fromSetup, squareCss } from '../domain/calibration'
import { Board } from './board'
import { U } from './palette'
import { TableRuler } from './calibration'
import { TableMeasure } from './table-measure'
import { MeasureTape, PingRipple, StoryPlate } from './overlays'
import { TableOrder } from './table-order'
import { TurnPlate } from './table-plate'
import { useTurnAnnouncement } from './use-turn-announcement'

/**
 * The one table screen (ADR 032, ADR 046): without app chrome and read-only, for every member of the
 * campaign. With a scene on the table it is the map at the calibrated scale, centred on the table
 * frame, with a turn plate over a corner while a fight is live (it plays the table's audio after one
 * tap). Without a scene, or where the account may not read the map, a live fight is the "now and
 * next" screen with the whole order. It always reads the table projection, so a DM account on the
 * table shows no secrets, and Escape or the Leave key goes back.
 */
export function TableScreen({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  // The channel opens once the map has been read: an account it refuses never subscribes.
  const [permitted, setPermitted] = useState(false)
  const connected = useTabletopRealtime(campaignId, permitted)
  useCombatRealtime(campaignId, true)
  const query = useQuery(tabletopQuery(userId, campaignId, null, true, connected))
  const combat = useQuery(combatStateQuery(userId, campaignId, null, true))
  const view = query.data
  // RYT-126 J4-03: staleness the way the combat screens derive it, for both queries. While realtime
  // pushes changes the map polls only every minute, so its budget is that interval plus slack.
  const known = [query.dataUpdatedAt, combat.dataUpdatedAt].filter((at) => at > 0)
  const updatedAt = known.length > 0 ? Math.min(...known) : 0
  const stale = useFreshness(
    updatedAt,
    (query.isError && query.data !== undefined) || (combat.isError && combat.data !== undefined),
    tabletopPollMs(connected) + 15_000,
  )
  const [retrying, setRetrying] = useState(false)
  const { refetch: refetchView } = query
  const { refetch: refetchCombat } = combat
  const retry = async () => {
    setRetrying(true)
    await Promise.allSettled([refetchView(), refetchCombat()])
    setRetrying(false)
  }
  const loadFailed = query.isError && !view
  // A Player whose DM has not opened the map still has the fight: the screen shows the order.
  const mapForbidden = loadFailed && query.error.message === 'forbidden'
  if (Boolean(view) !== permitted) setPermitted(Boolean(view))
  // A map that failed to load tries again by itself every few seconds (the button does it now).
  useEffect(() => {
    if (!loadFailed || mapForbidden) return
    const timer = window.setInterval(() => void refetchView(), 8_000)
    return () => window.clearInterval(timer)
  }, [loadFailed, mapForbidden, refetchView])
  const track = useQuery(mediaQuery(userId, view?.track?.path))
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(false)
  const [ruler, setRuler] = useState(false)
  const rulerButton = useRef<HTMLButtonElement>(null)
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
  const scene = view?.scene ?? null
  const allCombatants = combat.data?.combatants ?? []
  const encounter = combat.data?.encounter
  const active = allCombatants.find((c) => c.is_active)
  const fight = encounter && isLive(encounter.status) ? encounter : null
  // The map screen waits for its one tap; the order screen has no sound to unlock.
  const orderMode = Boolean(fight) && !scene && (Boolean(view) || mapForbidden)
  // Keep the screen awake while the table is open (where the browser allows it).
  const awake = started || orderMode
  useEffect(() => {
    if (!awake) return
    let lock: { release: () => Promise<void> } | null = null
    let cancelled = false
    const request = () =>
      (
        navigator as Navigator & {
          wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
        }
      ).wakeLock
        ?.request('screen')
        .then((l) => {
          // The request can resolve after the screen was left: hand that lock back at once.
          if (cancelled) return void l.release().catch(() => undefined)
          void lock?.release().catch(() => undefined)
          lock = l
        })
        .catch(() => undefined)
    void request()
    const again = () => document.visibilityState === 'visible' && void request()
    document.addEventListener('visibilitychange', again)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', again)
      void lock?.release().catch(() => undefined)
    }
  }, [awake])
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

  // Leaving: the key and Escape go back to where the screen was opened from (a screen opened on its
  // own, such as the TV, goes to the campaign). Full screen ends with the screen.
  const navigate = useNavigate()
  const location = useLocation()
  const leave = useCallback(() => {
    if (location.key !== 'default') return void navigate(-1)
    // A screen opened on its own (the DM's launch in a new tab, the TV) closes itself, so a stray key
    // never lands on the interface behind it; where the browser refuses, it goes to the campaign.
    window.close()
    window.setTimeout(() => navigate(`/campaign/${campaignId}`, { replace: true }), 150)
  }, [location.key, navigate, campaignId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave])
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    },
    [],
  )

  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggleFullscreen = () =>
    void (
      document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen()
    ).catch(() => undefined)

  const calibration = fromSetup(view?.live.screen)
  // RYT-126 J4-34: an uncalibrated map fits the space above the status bar, not the whole screen.
  const statusBar = useRef<HTMLDivElement>(null)
  const tableRoot = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState(0)
  useEffect(() => {
    const node = statusBar.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const height = node.offsetHeight + 24
      // The plate's bottom corners follow the bar in the same frame: the offset is set on the root
      // here, not after a React render, so a bar that grows (a wider font, the live mark arriving)
      // never leaves the plate under it for a frame.
      tableRoot.current?.style.setProperty('--tt-bar', `${height}px`)
      setBarHeight(height)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const fitHeight = calibration ? size.h : Math.max(size.h / 2, size.h - barHeight)
  const square = calibration
    ? squareCss(calibration, size.dpr)
    : scene
      ? Math.min(size.w / scene.cols, fitHeight / scene.rows)
      : 64
  // The status bar's own type is sized from a square that does not depend on the bar's height: the
  // fitted square does (the map fits above the bar), so sizing the bar from it made the two chase each
  // other, forever, whenever the bar sat on the edge of wrapping (a wider font).
  const barSquare = calibration
    ? square
    : scene
      ? Math.min(size.w / scene.cols, size.h / scene.rows)
      : 64
  const z = square / U
  const cx = view?.live.view_x ?? (scene ? scene.cols / 2 : 0)
  const cy = view?.live.view_y ?? (scene ? scene.rows / 2 : 0)
  const x = size.w / 2 - cx * U * z
  const y = fitHeight / 2 - cy * U * z
  const worldTransform = `translate(${x}px, ${y}px) scale(${z})`
  const combatants = useMemo(
    () => new Map((combat.data?.combatants ?? []).map((c) => [c.id, c])),
    [combat.data],
  )
  const measure = view?.live.measure
  const ping = view?.live.ping ?? null
  // RYT-126 J4-18: a shared measure and ping belong to the scene they were made on. When the scene
  // changes, the ones in the projection at that moment are not shown on the new scene.
  const sceneId = scene?.id ?? null
  const [hidden, setHidden] = useState<{ scene: string | null; measure?: string; ping?: string }>({
    scene: sceneId,
  })
  if (hidden.scene !== sceneId)
    setHidden(
      hidden.scene === null
        ? { scene: sceneId }
        : { scene: sceneId, measure: measure?.at, ping: ping?.at },
    )
  const measureFresh =
    measure && measure.at !== hidden.measure && now - Date.parse(measure.at) < 10 * 60 * 1000
  const shownPing = ping && ping.at !== hidden.ping ? ping : null
  const hiddenTurn = isHiddenTurn(encounter, allCombatants)
  const upNext = nextUp(allCombatants)
  const announcement = useTurnAnnouncement(
    turnMark(encounter?.status, encounter?.round ?? 0, encounter?.active_combatant, active),
    combat.data !== undefined,
  )
  const ready = {
    ready: allCombatants.filter((c) => c.initiative !== undefined).length,
    total: allCombatants.length,
  }
  // Each failure says what it is. A refusal has no retry; a network failure does. Without a map the
  // fight is all there is, so its own failure is the screen's failure.
  const combatDenied = combat.isError && !combat.data && combat.error.message === 'forbidden'
  const combatFailed = combat.isError && !combat.data && !combatDenied
  const failed =
    (loadFailed && !mapForbidden) || (!scene && Boolean(view || mapForbidden) && combatFailed)
  const forbidden = mapForbidden && combatDenied
  // The map's own failure says the tabletop failed; a fight that cannot be read says the fight did.
  const fightOnly = failed && !(loadFailed && !mapForbidden)
  const waiting = scene ? false : (!view && !mapForbidden) || (!combat.data && !combat.isError)

  return (
    <div
      ref={tableRoot}
      className={`tt-table ${calibration?.flip ? 'is-flipped' : ''}${orderMode ? ' is-order' : ''}`}
      // Words on the table are sized in squares, so they read the same on any screen.
      style={{ '--tt-sq': `${square}px`, '--tt-sq-bar': `${barSquare}px` } as CSSProperties}
    >
      {failed || forbidden ? (
        <div className="tt-table-empty" role="alert">
          <Compass size={48} aria-hidden="true" />
          <p>
            {t(
              forbidden
                ? 'tabletop.table.forbidden'
                : fightOnly
                  ? 'tabletop.table.fightLoad'
                  : 'tabletop.error.load',
            )}
          </p>
          {!forbidden && (
            <button
              type="button"
              className="tt-status-button"
              aria-disabled={retrying || undefined}
              onClick={() => !retrying && void retry()}
            >
              {retrying ? t('tabletop.table.retrying') : t('tabletop.table.retry')}
            </button>
          )}
        </div>
      ) : waiting ? (
        <div className="tt-table-empty">
          <p>{t('tabletop.loading')}</p>
        </div>
      ) : !scene && fight && encounter ? (
        <TableOrder
          name={encounter.name}
          status={fight.status as 'initiative' | 'active'}
          round={fight.round}
          order={fight.status === 'initiative' ? allCombatants : turnOrder(allCombatants)}
          active={active ?? null}
          next={upNext}
          hiddenTurn={hiddenTurn}
          ready={ready}
          stale={stale}
          width={size.w}
        />
      ) : !scene || !view ? (
        <div className="tt-table-empty">
          <Compass size={56} aria-hidden="true" />
          <p className="tt-table-empty-title">
            {t(mapForbidden ? 'tabletop.table.noFight' : 'tabletop.table.nothing')}
          </p>
          <p>{t(mapForbidden ? 'tabletop.table.noFightHelp' : 'tabletop.table.nothingFight')}</p>
        </div>
      ) : (
        // Keyed by scene: a new scene fades in instead of cutting (reduced motion: no fade).
        <div className="tt-table-world" key={scene.id} style={{ transform: worldTransform }}>
          <Board
            scene={scene}
            items={view.items}
            mode="table"
            combatants={combatants}
            overlay={
              <>
                {measureFresh && <MeasureTape points={measure.points} large />}
                <PingRipple ping={shownPing} />
              </>
            }
          />
        </div>
      )}
      {ruler && scene && (
        <TableMeasure
          key={scene.id}
          cols={scene.cols}
          rows={scene.rows}
          transform={worldTransform}
          flipped={Boolean(calibration?.flip)}
          onClose={() => {
            setRuler(false)
            rulerButton.current?.focus()
          }}
        />
      )}
      {scene && fight && (
        <TurnPlate
          status={fight.status as 'initiative' | 'active'}
          round={fight.round}
          active={active ?? null}
          next={upNext}
          hiddenTurn={hiddenTurn}
          ready={ready}
          stale={stale}
          flipped={Boolean(calibration?.flip)}
        />
      )}
      {view?.card && <StoryPlate card={view.card} fit />}
      {ruler && calibration && (
        <div className="tt-ruler-wrap">
          <TableRuler square={square} baseMm={calibration.baseMm} />
        </div>
      )}
      <div className="tt-status" role="status" ref={statusBar}>
        {scene && <span className="tt-status-scene">{scene.name}</span>}
        {stale ? (
          <span className="tt-status-net is-offline">
            <WifiOff size={14} aria-hidden="true" />
            {/* The count changes every second: sighted readers get it, the live region gets the state. */}
            {updatedAt === 0 ? (
              t('tabletop.table.offline')
            ) : (
              <>
                <span aria-hidden="true">
                  <Elapsed
                    since={updatedAt}
                    format={(seconds) => t('tabletop.table.offlineSince', { seconds })}
                  />
                </span>
                <span className="visually-hidden">{t('tabletop.table.offline')}</span>
              </>
            )}
            <button
              type="button"
              className="tt-status-button"
              aria-disabled={retrying || undefined}
              onClick={() => !retrying && void retry()}
            >
              {retrying ? t('tabletop.table.retrying') : t('tabletop.table.retry')}
            </button>
          </span>
        ) : (
          connected && (
            <span className="tt-status-net">
              <Wifi size={14} aria-hidden="true" />
              {t('tabletop.table.live')}
            </span>
          )
        )}
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
              ref={rulerButton}
              disabled={!scene}
            >
              <Ruler size={14} aria-hidden="true" />
              {t('tabletop.table.ruler')}
            </button>
            <button type="button" className="tt-status-button" onClick={() => setMuted((m) => !m)}>
              {muted ? (
                <Volume2 size={14} aria-hidden="true" />
              ) : (
                <VolumeX size={14} aria-hidden="true" />
              )}
              {t(muted ? 'tabletop.table.unmute' : 'tabletop.table.mute')}
            </button>
          </>
        )}
        {orderMode && (
          <button type="button" className="tt-status-button" onClick={toggleFullscreen}>
            {fullscreen ? (
              <Minimize size={14} aria-hidden="true" />
            ) : (
              <Maximize size={14} aria-hidden="true" />
            )}
            {t(fullscreen ? 'tabletop.table.exitFullscreen' : 'tabletop.table.fullscreen')}
          </button>
        )}
        <button type="button" className="tt-status-button tt-leave" onClick={leave}>
          <LogOut size={14} aria-hidden="true" />
          {t('tabletop.table.leave')}
        </button>
      </div>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {!started && !orderMode && !waiting && !mapForbidden && (
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
