import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Group, Modal as MantineModal, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Monitor, Ruler, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  combatStateQuery,
  isHiddenTurn,
  isLive,
  nextUp,
  turnOrder,
  useCombatRealtime,
  useFreshness,
  type Combatant,
} from '@/features/combat'
import { Modal } from '@/shared/ui/overlays'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { tabletopQuery, useTabletopRealtime } from '../api'
import { fromSetup, squarePx, squaresThatFit } from '../domain/calibration'
import { tabletopPollMs, type TabletopView } from '../domain/model'
import { Board } from './board'
import { CalibrationDialog } from './calibration'
import { StoryPlate } from './overlays'
import { U } from './palette'

export function TableProjectionButton({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const [opened, setOpened] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        ref={trigger}
        variant="default"
        leftSection={<Monitor size={18} aria-hidden="true" />}
        className="tt-projection-trigger"
        onClick={() => setOpened(true)}
      >
        {t('tabletop.projection.open')}
      </Button>
      <MantineModal.Stack>
        <Modal
          stackId="projection"
          opened={opened}
          onClose={() => {
            setOpened(false)
            focusWhenReady(() => trigger.current)
          }}
          returnFocus={false}
          title={t('tabletop.projection.title')}
          closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
        >
          <ProjectionSetup campaignId={campaignId} />
        </Modal>
      </MantineModal.Stack>
    </>
  )
}

function ProjectionSetup({ campaignId }: { campaignId: string }) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const [setup, setSetup] = useState(false)
  const calibrateButton = useRef<HTMLButtonElement>(null)
  const mapConnected = useTabletopRealtime(campaignId, true)
  const combatConnected = useCombatRealtime(campaignId, true)
  // Match the shared screen's requests. A DM preview uses the same server-projected data.
  const map = useQuery(tabletopQuery(userId, campaignId, null, true, mapConnected))
  const combat = useQuery(combatStateQuery(userId, campaignId, null, true))
  const view = map.data
  const encounter = combat.data?.encounter
  const fight = encounter && isLive(encounter.status) ? encounter : null
  const combatants = combat.data?.combatants
  const markers = useMemo(() => new Map(combatants?.map((c) => [c.id, c])), [combatants])
  const calibration = fromSetup(view?.live.screen)
  const table = calibration ? squaresThatFit(calibration) : null
  const canCalibrate = !map.isError && Boolean(view)
  const [retrying, setRetrying] = useState(false)
  const pending = map.isPending || combat.isPending
  const stale = useFreshness(
    Math.min(map.dataUpdatedAt, combat.dataUpdatedAt),
    map.isError || combat.isError,
    tabletopPollMs(mapConnected) + 15_000,
  )
  const active = combatants?.find((c) => c.is_active)
  const next = nextUp(combatants ?? [])
  const loading = pending && !stale
  const connection = stale
    ? 'tabletop.projection.stale'
    : loading
      ? 'tabletop.loading'
      : mapConnected && combatConnected
        ? 'tabletop.table.live'
        : 'tabletop.projection.polling'
  return (
    <Stack gap="md">
      <div className="tt-projection-status" data-stale={stale || undefined}>
        <Text className="tt-projection-message" size="sm" fw={600} role="status">
          {stale && <TriangleAlert size={18} aria-hidden="true" />}
          {t(connection)}
        </Text>
        {stale && (
          <Button
            variant="default"
            aria-disabled={retrying || undefined}
            onClick={async () => {
              if (retrying) return
              setRetrying(true)
              await Promise.allSettled([map.refetch(), combat.refetch()])
              setRetrying(false)
            }}
          >
            {t(retrying ? 'tabletop.table.retrying' : 'tabletop.table.retry')}
          </Button>
        )}
      </div>
      <div
        className="tt-projection-preview"
        role="region"
        aria-label={t('tabletop.projection.preview')}
      >
        {view?.card ? (
          <div className="tt-projection-story">
            <StoryPlate card={view.card} />
          </div>
        ) : (
          <>
            {view?.scene && <ProjectionMap view={view} combatants={markers} />}
            {view?.scene && <Text fw={700}>{view.scene.name}</Text>}
            {fight && (
              <>
                <Text fw={700}>{fight.name}</Text>
                {fight.status === 'initiative' ? (
                  <Text size="sm">
                    {t('combat.table.rolling')} ·{' '}
                    {t('combat.table.ready', {
                      ready: combatants?.filter((c) => c.initiative !== undefined).length ?? 0,
                      total: combatants?.length ?? 0,
                    })}
                  </Text>
                ) : (
                  <Text size="sm">
                    {t('combat.round', { round: fight.round })} ·{' '}
                    {active
                      ? `${t('combat.turn.now')} · ${active.name}`
                      : isHiddenTurn(fight, combatants ?? [])
                        ? t('combat.turn.hidden')
                        : t('combat.turn.now')}
                    {next && ` · ${t('combat.turn.upNext')}: ${next.name}`}
                  </Text>
                )}
                {!view?.scene && combatants && (
                  <ol className="tt-projection-order" aria-label={t('combat.order.title')}>
                    {(fight.status === 'initiative' ? combatants : turnOrder(combatants)).map(
                      (c) => (
                        <li key={c.id}>{c.name}</li>
                      ),
                    )}
                  </ol>
                )}
              </>
            )}
            {!view?.scene && !fight && !pending && !stale && (
              <Text size="sm">{t('tabletop.table.nothing')}</Text>
            )}
          </>
        )}
      </div>
      {calibration && table && (
        <Text size="sm" c="dimmed">
          {t('tabletop.setup.summary', {
            diagonal: calibration.diagonalIn,
            w: calibration.pxW,
            h: calibration.pxH,
            base: new Intl.NumberFormat(i18n.language).format(calibration.baseMm),
            cols: table.cols,
            rows: table.rows,
          })}
        </Text>
      )}
      <Group justify="space-between" gap="xs">
        {canCalibrate && (
          <Button
            ref={calibrateButton}
            variant="subtle"
            leftSection={<Ruler size={18} aria-hidden="true" />}
            onClick={() => setSetup(true)}
          >
            {t(calibration ? 'tabletop.projection.adjust' : 'tabletop.setup.start')}
          </Button>
        )}
        <Button
          component="a"
          href={`#/campaign/${campaignId}/tabletop-table`}
          target="_blank"
          rel="noopener"
          rightSection={<ExternalLink size={16} aria-hidden="true" />}
          aria-label={t('tabletop.projection.launchNewTab')}
          ml="auto"
        >
          {t('tabletop.projection.launch')}
        </Button>
      </Group>
      <CalibrationDialog
        opened={setup}
        onClose={() => setSetup(false)}
        onExitTransitionEnd={() => calibrateButton.current?.focus()}
        campaignId={campaignId}
        current={calibration}
      />
    </Stack>
  )
}

function ProjectionMap({
  view,
  combatants,
}: {
  view: TabletopView
  combatants: ReadonlyMap<string, Combatant>
}) {
  const scene = view.scene!
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const calibration = fromSetup(view.live.screen)
  const ratio = calibration ? calibration.pxW / calibration.pxH : 16 / 9
  const height = width / ratio
  const square = calibration
    ? (squarePx(calibration) * width) / calibration.pxW
    : Math.min(width / scene.cols, height / scene.rows)
  const x = width / 2 - (view.live.view_x ?? scene.cols / 2) * square
  const y = height / 2 - (view.live.view_y ?? scene.rows / 2) * square
  useLayoutEffect(() => {
    const node = frame.current!
    const sync = () => setWidth(node.clientWidth)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={frame} className="tt-projection-map" style={{ aspectRatio: ratio }}>
      <div className={`tt-projection-map-frame${calibration?.flip ? ' is-flipped' : ''}`}>
        <div
          className="tt-table-world"
          style={{ transform: `translate(${x}px, ${y}px) scale(${square / U})` }}
        >
          <Board scene={scene} items={view.items} mode="table" combatants={combatants} />
        </div>
      </div>
    </div>
  )
}
