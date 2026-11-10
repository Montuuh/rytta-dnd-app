import { useMemo, useState } from 'react'
import { Button, Drawer, Switch } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Navigate, useParams } from 'react-router'
import { Maximize, Minus, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { useCampaign } from '@/features/campaigns'
import { combatStateQuery, useCombatRealtime } from '@/features/combat'
import { PageHead } from '@/shared/ui/page-head'
import { tabletopQuery, useTabletopRealtime } from '../api'
import { cellCenter, measurePath, type Point } from '../domain/geometry'
import { Board } from './board'
import { TabletopEditor } from './editor'
import { TabletopLibrary } from './library'
import { MeasureTape, PingRipple, StoryPlate } from './overlays'
import { TableScreen } from './table-screen'
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
  // The table projection, also for a DM previewing as a Player: never the DM's own view.
  const query = useQuery(tabletopQuery(userId, campaignId, null, true, connected))
  const combat = useQuery(combatStateQuery(userId, campaignId, null, false))
  const view = query.data
  const scene = view?.scene ?? null
  const [measuring, setMeasuring] = useState(false)
  const [points, setPoints] = useState<Point[]>([])
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const board = useBoardView(
    scene ? { cols: scene.cols, rows: scene.rows } : null,
    {
      onStart: (p) => {
        if (!measuring) return false
        setStart(cellCenter(p))
        return true
      },
      onMove: (p) => setEnd(cellCenter(p)),
      onEnd: (p, moved) => {
        const at = cellCenter(p)
        setEnd(null)
        setPoints((list) => (moved ? [start ?? at, at] : [...list, at]).slice(-16))
        setStart(null)
      },
    },
    !measuring,
  )
  const combatants = useMemo(
    () => new Map((combat.data?.combatants ?? []).map((c) => [c.id, c])),
    [combat.data],
  )
  const shown = end && start ? [start, end] : points
  const route = measurePath(points)
  const card = view?.card && dismissed !== view.card.id ? view.card : null
  return (
    <div className="tt-library tt-player">
      <PageHead
        title={scene?.name ?? t('module.tabletop')}
        description={scene ? t('tabletop.player.lede') : undefined}
      />
      {query.isError && !view ? (
        <p className="tt-state" role="alert">
          {t(query.error.message === 'forbidden' ? 'tabletop.hiddenModule' : 'tabletop.error.load')}
        </p>
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
          <div className="tt-player-tools">
            <Switch
              label={t('tabletop.player.measure')}
              checked={measuring}
              onChange={(e) => setMeasuring(e.currentTarget.checked)}
            />
            {points.length > 1 && (
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
            <div
              className={`tt-viewport ${measuring ? 'tool-measure' : 'tool-select'}`}
              {...board.bind}
              role="img"
              aria-label={t('tabletop.player.board', { name: scene.name })}
            >
              <div
                className="tt-world-wrap"
                style={{
                  transform: `translate(${board.view.x}px, ${board.view.y}px) scale(${board.view.z})`,
                }}
              >
                <Board
                  scene={scene}
                  items={view.items}
                  mode="player"
                  combatants={combatants}
                  overlay={
                    <>
                      {view.live.measure && <MeasureTape points={view.live.measure.points} />}
                      <MeasureTape points={shown} />
                      <PingRipple ping={view.live.ping} />
                    </>
                  }
                />
              </div>
            </div>
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
    </div>
  )
}
