import { PlayerEffects } from './visibility'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Button, Drawer, Switch } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { LocateFixed, Maximize, Minus, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { useCampaign, useIsRealDm } from '@/features/campaigns'
import {
  combatStateQuery,
  isHiddenTurn,
  isLive,
  nextUp,
  useCombatRealtime,
  useFreshness,
} from '@/features/combat'
import { PageHead } from '@/shared/ui/page-head'
import { Drawer as BackDrawer } from '@/shared/ui/overlays'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { tabletopQuery, useTabletopRealtime } from '../api'
import { cellCenter, clamp, measurePath, type Point } from '../domain/geometry'
import { tabletopPollMs } from '../domain/model'
import { centreOnToken, labelScale, phoneMapQuery, type Box } from '../domain/phone-map'
import { turnMark } from '../domain/table-order'
import { effectTokens } from '../domain/visibility'
import { Board } from './board'
import { TabletopEditor } from './editor'
import { TabletopLibrary } from './library'
import { MeasureTape, PingRipple, StoryPlate } from './overlays'
import { U } from './palette'
import { PhoneStrip, PhoneTools } from './phone-map'
import { TableScreen } from './table-screen'
import { useTurnAnnouncement } from './use-turn-announcement'
import { useBoardView } from './viewport'
import './tabletop.css'

function HiddenTabletop() {
  const { t } = useTranslation()
  return (
    <div className="tt-library">
      <PageHead title={t('module.tabletop')} />
      <p className="tt-state">{t('tabletop.hiddenModule')}</p>
    </div>
  )
}

/** /tabletop: the DM's scene library, or the Player's read-only view of the scene on the table. */
export function TabletopPage() {
  const campaign = useCampaign()
  if (campaign.role === 'dm') return <TabletopLibrary campaignId={campaign.id} />
  if (!(campaign.player_modules ?? []).includes('tabletop')) return <HiddenTabletop />
  return <PlayerTabletop campaignId={campaign.id} />
}

/** /tabletop/:sceneId: the DM editor. Players go back to the table view. */
export function TabletopScenePage() {
  const campaign = useCampaign()
  const { sceneId } = useParams()
  if (campaign.role !== 'dm' || !sceneId) return <Navigate to=".." relative="path" replace />
  return <TabletopEditor campaignId={campaign.id} sceneId={sceneId} />
}

/** /tabletop-table: the table screen, outside the app layout. */
export function TabletopTablePage() {
  const campaign = useCampaign()
  return <TableScreen campaignId={campaign.id} />
}

/** A Player's phone: the scene on the table, fitted, with pinch zoom and a private measure. */
function PlayerTabletop({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const connected = useTabletopRealtime(campaignId, true)
  useCombatRealtime(campaignId, true)
  // A DM previewing as a Player reads the table projection, never the DM's own view. A Player reads
  // the Player projection, where the own character's token keeps its name under a table alias.
  const realDm = useIsRealDm()
  const query = useQuery(tabletopQuery(userId, campaignId, null, realDm, connected))
  const combat = useQuery(combatStateQuery(userId, campaignId, null, false))
  const view = query.data
  const scene = view?.scene ?? null
  // RYT-132: on a phone the board is the page, with a turn strip and floating keys.
  const phone = useMediaQuery(phoneMapQuery, undefined, { getInitialValueInEffect: false })
  const [cursor, setCursor] = useState<Point | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [effectsOpen, setEffectsOpen] = useState(false)
  const measureKey = useRef<HTMLButtonElement>(null)
  const effectsKey = useRef<HTMLButtonElement>(null)
  const tools = useRef<HTMLDivElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [dismissed, setDismissed] = useState<string | null>(null)
  const origin = useRef<Point | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const board = useBoardView(
    scene ? { cols: scene.cols, rows: scene.rows } : null,
    {
      onStart: (p) => {
        if (!measuring) return false
        origin.current = cellCenter(p)
        setStart(origin.current)
        return true
      },
      onMove: (p) => setEnd(cellCenter(p)),
      onCancel: () => {
        origin.current = null
        setStart(null)
        setEnd(null)
      },
      onEnd: (p, moved) => {
        const at = cellCenter(p)
        setEnd(null)
        const from = origin.current ?? at
        setPoints((list) => (moved ? [from, at] : [...list, at]).slice(-16))
        origin.current = null
        setStart(null)
      },
    },
    !measuring,
  )
  const combatants = useMemo(
    () => new Map((combat.data?.combatants ?? []).map((c) => [c.id, c])),
    [combat.data],
  )
  // RYT-126 J4-26: the own token, so a pinch that ended in the dark has a way back.
  const ownToken =
    view?.items.find(
      (item) =>
        item.kind === 'token' &&
        (item.controllable ||
          (item.combatant_id && combatants.get(item.combatant_id)?.is_own === true)),
    ) ?? null
  const shown = end && start ? [start, end] : points
  const route = measurePath(shown)
  const card = view?.card && dismissed !== view.card.id ? view.card : null
  useBackToClose(Boolean(card), () => setDismissed(card?.id ?? null))
  // Back closes the measure on a phone before it leaves the page (the effects sheet does the same).
  useBackToClose(phone && measuring, () => setMeasuring(false))
  const lighting = !!scene?.visibility?.lighting
  const canEffects = Boolean(
    view && (scene?.visibility?.vision || lighting) && effectTokens(view.items, lighting).length,
  )
  // The turn strip reads what the combat screens read; stale is derived as the table screen does it.
  const allCombatants = combat.data?.combatants ?? []
  const encounter = combat.data?.encounter
  const fight = encounter && isLive(encounter.status) ? encounter : null
  const active = allCombatants.find((c) => c.is_active) ?? null
  const known = [query.dataUpdatedAt, combat.dataUpdatedAt].filter((at) => at > 0)
  const stale = useFreshness(
    known.length > 0 ? Math.min(...known) : 0,
    (query.isError && query.data !== undefined) || (combat.isError && combat.data !== undefined),
    tabletopPollMs(connected) + 15_000,
  )
  const announcement = useTurnAnnouncement(
    turnMark(
      encounter?.status,
      encounter?.round ?? 0,
      encounter?.active_combatant,
      active ?? undefined,
    ),
    combat.data !== undefined,
  )
  const scale = labelScale(board.view.z)
  const plateScale = phone ? labelScale(board.view.z, 0.55) : 1
  const centre = () => {
    const box = board.box()
    if (!box || !ownToken) return
    const keys: Box[] = [...(tools.current?.querySelectorAll('button') ?? [])].map((key) => {
      const r = key.getBoundingClientRect()
      return { x: r.x - box.x, y: r.y - box.y, w: r.width, h: r.height }
    })
    const next = centreOnToken({
      viewport: { w: box.width, h: box.height },
      buttons: keys,
      token: ownToken,
      zoom: board.view.z,
      unit: U,
    })
    board.place({ z: next.z, x: next.x, y: next.y })
  }
  const world = scene && view && (
    <div
      className={`tt-viewport ${measuring ? 'tool-measure' : 'tool-select'}`}
      {...board.bind}
      role={measuring ? 'application' : 'img'}
      tabIndex={measuring ? 0 : undefined}
      onFocus={() => {
        if (measuring) setCursor((p) => p ?? cellCenter(board.center()))
      }}
      onKeyDown={(e) => {
        if (!measuring) return
        const at = cursor ?? cellCenter(board.center())
        const dx = Number(e.key === 'ArrowRight') - Number(e.key === 'ArrowLeft'),
          dy = Number(e.key === 'ArrowDown') - Number(e.key === 'ArrowUp')
        if (dx || dy) {
          const next: Point = [
            clamp(at[0] + dx, 0.5, scene.cols - 0.5),
            clamp(at[1] + dy, 0.5, scene.rows - 0.5),
          ]
          setCursor(next)
          board.reveal(next[0] - 0.5, next[1] - 0.5)
        } else if (e.key === 'Enter' || e.key === ' ') setPoints((p) => [...p, at].slice(-16))
        else if (e.key === 'Escape') {
          setMeasuring(false)
          setCursor(null)
          if (phone) measureKey.current?.focus()
          else
            e.currentTarget
              .closest('.tt-player')
              ?.querySelector<HTMLInputElement>('.tt-player-tools input')
              ?.focus()
        } else return
        e.preventDefault()
      }}
      aria-label={t('tabletop.player.board', { name: scene.name })}
    >
      <div
        className="tt-world-wrap"
        style={
          {
            transform: `translate(${board.view.x}px, ${board.view.y}px) scale(${board.view.z})`,
            // Labels keep their size on screen: the phone map multiplies them by the inverse zoom.
            ...(phone && { '--tt-z': board.view.z, '--tt-label-k': scale }),
          } as CSSProperties
        }
      >
        <Board
          scene={scene}
          items={view.items}
          mode="player"
          combatants={combatants}
          overlay={
            <>
              {view.live.measure && (
                <MeasureTape points={view.live.measure.points} plateScale={plateScale} />
              )}
              {measuring && cursor && (
                <rect
                  x={cursor[0] - 0.5}
                  y={cursor[1] - 0.5}
                  width={1}
                  height={1}
                  fill="none"
                  stroke="var(--app-focus)"
                  strokeWidth={0.07}
                />
              )}
              <MeasureTape points={shown} plateScale={plateScale} />
              <PingRipple ping={view.live.ping} />
            </>
          }
        />
      </div>
    </div>
  )
  const storyDrawer = (
    <Drawer
      closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
      opened={Boolean(card)}
      onClose={() => setDismissed(card?.id ?? null)}
      position="bottom"
      size="auto"
      title={t('tabletop.story.onTable')}
    >
      {card && <StoryPlate card={card} />}
      <Button variant="default" fullWidth mt="md" onClick={() => setDismissed(card?.id ?? null)}>
        {t('tabletop.story.close')}
      </Button>
    </Drawer>
  )

  // The board is the page: no header or bar, a turn strip on top and floating keys over the map.
  if (phone && scene && view)
    return (
      <div className="tt-pm">
        <h1 className="visually-hidden">{scene.name}</h1>
        <PhoneStrip
          campaignId={campaignId}
          sceneName={scene.name}
          fight={
            fight ? { status: fight.status as 'initiative' | 'active', round: fight.round } : null
          }
          active={active}
          next={nextUp(allCombatants)}
          hiddenTurn={isHiddenTurn(encounter, allCombatants)}
          ready={{
            ready: allCombatants.filter((c) => c.initiative !== undefined).length,
            total: allCombatants.length,
          }}
          stale={stale}
        />
        <div className="tt-pm-board">
          {world}
          <PhoneTools
            toolsRef={tools}
            canCentre={Boolean(ownToken)}
            onCentre={ownToken ? centre : board.fit}
            measuring={measuring}
            onMeasure={() => setMeasuring((on) => !on)}
            measureRef={measureKey}
            effects={canEffects}
            effectsOpen={effectsOpen}
            onEffects={() => setEffectsOpen(true)}
            effectsRef={effectsKey}
          />
          {measuring && (
            <div className="tt-pm-chip">
              {shown.length > 1 ? (
                <span className="tt-readout-feet" aria-live="polite">
                  {t('tabletop.measure.feet', { count: route.feet })}
                </span>
              ) : (
                <span>{t('tabletop.phone.measureHint')}</span>
              )}
              {points.length > 0 && (
                <button type="button" className="tt-text-action" onClick={() => setPoints([])}>
                  {t('tabletop.measure.clear')}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="visually-hidden" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
        <BackDrawer
          closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
          opened={effectsOpen}
          onClose={() => setEffectsOpen(false)}
          position="bottom"
          size="auto"
          title={t('tabletop.phone.effects')}
        >
          <PlayerEffects campaignId={campaignId} items={view.items} lighting={lighting} />
        </BackDrawer>
        {storyDrawer}
      </div>
    )

  return (
    <div className="tt-library tt-player">
      <PageHead
        title={scene?.name ?? t('module.tabletop')}
        description={scene ? t('tabletop.player.lede') : undefined}
      />
      {query.isError && !view ? (
        <div className="tt-state" role="alert">
          <p>
            {t(
              query.error.message === 'forbidden' ? 'tabletop.hiddenModule' : 'tabletop.error.load',
            )}
          </p>
          {query.error.message !== 'forbidden' && (
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('tabletop.failure.retry')}
            </Button>
          )}
        </div>
      ) : !view ? (
        <p className="tt-state">{t('tabletop.loading')}</p>
      ) : !scene ? (
        <div className="tt-empty">
          <p className="tt-empty-title">{t('tabletop.table.nothing')}</p>
          <p>{t('tabletop.player.nothing')}</p>
        </div>
      ) : (
        <>
          {query.isError && (
            <p className="tt-stale" role="status">
              {t('tabletop.stale')}
            </p>
          )}
          {(scene.visibility?.vision || scene.visibility?.lighting) && (
            <PlayerEffects campaignId={campaignId} items={view.items} lighting={lighting} />
          )}
          <div className="tt-player-tools">
            <Switch
              label={t('tabletop.player.measure')}
              checked={measuring}
              onChange={(e) => setMeasuring(e.currentTarget.checked)}
            />
            {shown.length > 1 && (
              <span className="tt-readout-feet" aria-live="polite">
                {t('tabletop.measure.feet', { count: route.feet })}
              </span>
            )}
            {points.length > 0 && (
              <button type="button" className="tt-text-action" onClick={() => setPoints([])}>
                {t('tabletop.measure.clear')}
              </button>
            )}
          </div>
          <div className="tt-board-frame tt-player-board">
            {world}
            <div className="tt-zoom" role="group" aria-label={t('tabletop.zoom.label')}>
              <button
                type="button"
                className="tt-icon-button"
                onClick={() => board.zoomAt(1.25)}
                aria-label={t('tabletop.zoom.in')}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tt-icon-button"
                onClick={() => board.zoomAt(0.8)}
                aria-label={t('tabletop.zoom.out')}
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              {ownToken && (
                <button
                  type="button"
                  className="tt-icon-button"
                  onClick={() =>
                    board.centerOn(ownToken.x + ownToken.w / 2, ownToken.y + ownToken.h / 2)
                  }
                  aria-label={t('tabletop.zoom.mine')}
                >
                  <LocateFixed size={18} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="tt-icon-button"
                onClick={board.fit}
                aria-label={t('tabletop.zoom.fit')}
              >
                <Maximize size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
      {storyDrawer}
    </div>
  )
}
