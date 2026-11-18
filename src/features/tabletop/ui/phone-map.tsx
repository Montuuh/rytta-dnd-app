import { useEffect, useRef, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  ChevronLeft,
  EyeOff,
  LocateFixed,
  Maximize,
  Ruler,
  Sparkles,
  Swords,
  WifiOff,
} from 'lucide-react'
import { CombatantToken, useFreshness, type Combatant } from '@/features/combat'

type StripProps = {
  campaignId: string
  sceneName: string
  /** Null while no fight is live: the strip then names the scene. */
  fight: { status: 'initiative' | 'active'; round: number } | null
  active: Combatant | null
  next: Combatant | null
  hiddenTurn: boolean
  ready: { ready: number; total: number }
  /** This Player has a character that still has to roll initiative. */
  mustRoll: boolean
  /** When the data last arrived (ms, 0 before the first answer) and whether the last fetch failed. */
  updatedAt: number
  failing: boolean
  staleAfter: number
}

/**
 * The compact turn strip over the phone map (RYT-132): the way back to the campaign, who acts now
 * and who is next. On the Player's own turn the whole strip turns to the accent and says so in
 * words; a hidden creature's turn says only that it is hidden (the projection has no name). Long
 * names end in an ellipsis (the text stays whole for assistive technology); the strip reflows into a
 * second row for "next" at large text and drops the round before it would crowd the turn.
 */
export function PhoneStrip({
  campaignId,
  sceneName,
  fight,
  active,
  next,
  hiddenTurn,
  ready,
  mustRoll,
  updatedAt,
  failing,
  staleAfter,
}: StripProps) {
  const { t } = useTranslation()
  // Staleness is derived here, so its five-second tick re-renders the strip and not the whole map.
  const stale = useFreshness(updatedAt, failing, staleAfter)
  const strip = useRef<HTMLElement>(null)
  // The notices that ask for something (a rest vote, leaving the Player view) sit right under it.
  useEffect(() => {
    const node = strip.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const notices = document.querySelector<HTMLElement>('.top-notices')
    const measure = () => {
      root.style.setProperty('--tt-pm-strip', `${node.offsetHeight}px`)
      root.style.setProperty('--tt-pm-notices', `${notices?.offsetHeight ?? 0}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    if (notices) observer.observe(notices)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--tt-pm-strip')
      root.style.removeProperty('--tt-pm-notices')
    }
  }, [])
  const yours = fight?.status === 'active' && active?.is_own === true
  return (
    <header
      ref={strip}
      className={`tt-pm-strip${yours ? ' is-yours' : ''}${stale ? ' is-stale' : ''}`}
    >
      <Link
        to={`/campaign/${campaignId}`}
        className="tt-pm-leave"
        aria-label={t('tabletop.phone.leave')}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      {!fight ? (
        <p className="tt-pm-scene" title={sceneName}>
          {sceneName}
        </p>
      ) : fight.status === 'initiative' ? (
        <div className="tt-pm-now">
          <div>
            {/* The Player's own roll is the line to read; how many are ready is the small one. */}
            <p className="tt-pm-label">
              {mustRoll
                ? t('combat.table.ready', { ready: ready.ready, total: ready.total })
                : t('combat.table.rolling')}
            </p>
            <p className="tt-pm-name">
              {mustRoll
                ? t('tabletop.phone.rollYours')
                : t('combat.table.ready', { ready: ready.ready, total: ready.total })}
            </p>
          </div>
        </div>
      ) : hiddenTurn ? (
        <div className="tt-pm-now">
          <EyeOff size={24} aria-hidden="true" />
          <div>
            <p className="tt-pm-label">{t('tabletop.table.round', { round: fight.round })}</p>
            <p className="tt-pm-name">{t('tabletop.table.hiddenTurn')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="tt-pm-now">
            {active && <CombatantToken combatant={active} showActive={false} size={32} />}
            <div>
              <p className="tt-pm-label">
                <span className="tt-pm-state">
                  {yours ? (
                    <>
                      <Swords size={16} aria-hidden="true" />
                      {t('combat.turn.yours')}
                    </>
                  ) : (
                    t('combat.turn.now')
                  )}
                </span>
                <span className="tt-pm-round">
                  {t('tabletop.table.round', { round: fight.round })}
                </span>
              </p>
              <p className="tt-pm-name" title={active?.name}>
                {active?.name ?? '—'}
              </p>
            </div>
          </div>
          {next && (
            <div className="tt-pm-next">
              <p className="tt-pm-label">{t('combat.turn.upNext')}</p>
              <p className="tt-pm-name" title={next.name}>
                {next.name}
              </p>
            </div>
          )}
        </>
      )}
      {stale && (
        <p className="tt-pm-offline" role="status">
          <WifiOff size={16} aria-hidden="true" />
          <span>{t('tabletop.table.offline')}</span>
        </p>
      )}
    </header>
  )
}

/**
 * The measure readout and its clear key, bottom left. Its height is shared with the page (a notice
 * that sits at the same corner when the phone is on its side stacks above it instead of covering it).
 */
export function PhoneChip({
  feet,
  canClear,
  onClear,
}: {
  /** The route's length, or null while there is nothing to read yet. */
  feet: number | null
  canClear: boolean
  onClear: () => void
}) {
  const { t } = useTranslation()
  const chip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = chip.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const measure = () =>
      root.style.setProperty(
        '--tt-pm-above-chip',
        `${Math.max(0, window.innerHeight - node.getBoundingClientRect().top) + 8}px`,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      root.style.removeProperty('--tt-pm-above-chip')
    }
  }, [])
  return (
    <div className="tt-pm-chip" ref={chip}>
      {feet !== null ? (
        <span className="tt-readout-feet" aria-live="polite">
          {t('tabletop.measure.feet', { count: feet })}
        </span>
      ) : (
        <span>{t('tabletop.phone.measureHint')}</span>
      )}
      {canClear && (
        <button type="button" className="tt-text-action" onClick={onClear}>
          {t('tabletop.measure.clear')}
        </button>
      )}
    </div>
  )
}

type ToolsProps = {
  /** What the first key does: centre on my token, or fit the whole map (always one tap away). */
  action: 'centre' | 'fit'
  onAction: () => void
  measuring: boolean
  onMeasure: () => void
  measureRef: Ref<HTMLButtonElement>
  effects: boolean
  effectsOpen: boolean
  onEffects: () => void
  effectsRef: Ref<HTMLButtonElement>
  toolsRef: Ref<HTMLDivElement>
}

/**
 * The floating round keys over the phone map: centre on my token (or fit the map when there is none),
 * measure and, for a token the DM lets act on the map, effects. They open the existing measure and
 * effects; nothing here is a new map tool.
 */
export function PhoneTools({
  action,
  onAction,
  measuring,
  onMeasure,
  measureRef,
  effects,
  effectsOpen,
  onEffects,
  effectsRef,
  toolsRef,
}: ToolsProps) {
  const { t } = useTranslation()
  return (
    <div className="tt-pm-tools" ref={toolsRef}>
      <button
        type="button"
        className="tt-pm-fab"
        onClick={onAction}
        aria-label={t(action === 'centre' ? 'tabletop.zoom.mine' : 'tabletop.zoom.fit')}
        title={t(action === 'centre' ? 'tabletop.zoom.mine' : 'tabletop.zoom.fit')}
      >
        {action === 'centre' ? (
          <LocateFixed size={22} aria-hidden="true" />
        ) : (
          <Maximize size={22} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className="tt-pm-fab"
        ref={measureRef}
        aria-pressed={measuring}
        onClick={onMeasure}
        aria-label={t('tabletop.player.measure')}
        title={t('tabletop.player.measure')}
      >
        <Ruler size={22} aria-hidden="true" />
      </button>
      {effects && (
        <button
          type="button"
          className="tt-pm-fab"
          ref={effectsRef}
          aria-haspopup="dialog"
          aria-expanded={effectsOpen}
          onClick={onEffects}
          aria-label={t('tabletop.phone.effects')}
          title={t('tabletop.phone.effects')}
        >
          <Sparkles size={22} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
