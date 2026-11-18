import type { Ref } from 'react'
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
import { CombatantToken, type Combatant } from '@/features/combat'

type StripProps = {
  campaignId: string
  sceneName: string
  /** Null while no fight is live: the strip then names the scene. */
  fight: { status: 'initiative' | 'active'; round: number } | null
  active: Combatant | null
  next: Combatant | null
  hiddenTurn: boolean
  ready: { ready: number; total: number }
  stale: boolean
}

/**
 * The compact turn strip over the phone map (RYT-132): the way back to the campaign, who acts now
 * and who is next. On the Player's own turn the whole strip turns to the accent and says so in
 * words; a hidden creature's turn says only that it is hidden (the projection has no name).
 */
export function PhoneStrip({
  campaignId,
  sceneName,
  fight,
  active,
  next,
  hiddenTurn,
  ready,
  stale,
}: StripProps) {
  const { t } = useTranslation()
  const yours = fight?.status === 'active' && active?.is_own === true
  return (
    <header className={`tt-pm-strip${yours ? ' is-yours' : ''}${stale ? ' is-stale' : ''}`}>
      <Link
        to={`/campaign/${campaignId}`}
        className="tt-pm-leave"
        aria-label={t('tabletop.phone.leave')}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      {!fight ? (
        <p className="tt-pm-scene">{sceneName}</p>
      ) : fight.status === 'initiative' ? (
        <div className="tt-pm-now">
          <div>
            <p className="tt-pm-label">{t('combat.table.rolling')}</p>
            <p className="tt-pm-name">
              {t('combat.table.ready', { ready: ready.ready, total: ready.total })}
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
                {yours ? (
                  <>
                    <Swords size={16} aria-hidden="true" />
                    {t('combat.turn.yours')}
                  </>
                ) : (
                  t('combat.turn.now')
                )}
                <span className="tt-pm-round">
                  {t('tabletop.table.round', { round: fight.round })}
                </span>
              </p>
              <p className="tt-pm-name">{active?.name ?? '—'}</p>
            </div>
          </div>
          {next && (
            <div className="tt-pm-next">
              <p className="tt-pm-label">{t('combat.turn.upNext')}</p>
              <p className="tt-pm-name">{next.name}</p>
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

type ToolsProps = {
  /** Without an own token the first key fits the whole map instead of centring on it. */
  canCentre: boolean
  onCentre: () => void
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
  canCentre,
  onCentre,
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
        onClick={onCentre}
        aria-label={t(canCentre ? 'tabletop.zoom.mine' : 'tabletop.zoom.fit')}
        title={t(canCentre ? 'tabletop.zoom.mine' : 'tabletop.zoom.fit')}
      >
        {canCentre ? (
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
