import { useMemo, useState } from 'react'
import { Alert, Button, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Monitor, SlidersHorizontal, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { PageHead } from '@/shared/ui/page-head'
import { QueryFeedback, useCampaign, useCampaignView } from '@/features/campaigns'
import { charactersQuery } from '@/features/characters'
import { combatStateQuery, encountersQuery, useCombatRealtime } from '../api'
import { isLive, previewAsPlayer, type CombatState, type EncounterStatus } from '../domain/combat'
import { DmConsole } from './dm-console'
import { EncounterGroup, EncounterList } from './encounter-list'
import { useFreshness } from './helpers'
import { TableDisplay } from './table-display'
import './combat.css'

/** The viewer as the screens see it: DM (not previewing), or a Player (real or previewed). */
function useCombatViewer() {
  const { state } = useAuth()
  const campaign = useCampaign()
  const { playerPreview, previewUserId } = useCampaignView()
  const userId = state.user!.id
  const dm = campaign.role === 'dm'
  const preview = playerPreview
  const previewCharacters = useQuery({
    ...charactersQuery(userId, campaign.id, previewUserId ?? undefined),
    enabled: preview && Boolean(previewUserId),
  })
  const ownIds = useMemo(
    () => new Set((previewCharacters.data ?? []).map((c) => c.id)),
    [previewCharacters.data],
  )
  /** A DM previewing a Player gets a presentation-only Player projection of the DM data. */
  const project = (data: CombatState | undefined) =>
    data && preview && data.viewer?.role === 'dm' ? previewAsPlayer(data, ownIds) : data
  // Players (and a DM previewing one) reach combat only when the DM opened the module (ADR 012).
  const enabled = (campaign.player_modules ?? []).includes('combat')
  return { userId, campaignId: campaign.id, dm, enabled, project }
}

/** Same presentation as the other modules a DM has not opened yet. RLS still governs reads. */
function HiddenCombat() {
  const { t } = useTranslation()
  return (
    <Stack className="combat-page">
      <PageHead title={t('module.combat')} />
      <Paper p="xl">
        <Text>{t('combat.hiddenModule')}</Text>
      </Paper>
    </Stack>
  )
}

/** One combat projection: the own role's (or the table's) state with its freshness. */
function useCombatState(encounterId: string | null, asTable = false, enabled = true) {
  const { userId, campaignId, project } = useCombatViewer()
  const query = useQuery({ ...combatStateQuery(userId, campaignId, encounterId, asTable), enabled })
  const stale = useFreshness(query.dataUpdatedAt, query.isError && query.data !== undefined)
  return { query, data: project(query.data), stale, retry: () => void query.refetch() }
}

export function CombatPage() {
  const { t } = useTranslation()
  const { dm, enabled, campaignId } = useCombatViewer()
  if (!dm && !enabled) return <HiddenCombat />
  if (dm)
    return (
      <Stack gap="lg" className="combat-page">
        <PageHead title={t('combat.title')} description={t('combat.intro.dm')} compactOnPhone />
        <EncounterList campaignId={campaignId} />
        <Text size="xs" c="dimmed">
          {t('combat.srd')}
        </Text>
      </Stack>
    )
  return <PlayerCombat />
}

/**
 * Players have one combat screen: the table view of the live encounter. When the fight they were
 * watching ends, the same screen turns into its summary until a new fight starts.
 */
function PlayerCombat() {
  const { t } = useTranslation()
  const { userId, campaignId } = useCombatViewer()
  const { query, data, stale, retry } = useCombatState(null)
  const connected = useCombatRealtime(campaignId, true)
  const history = useQuery(encountersQuery(userId, campaignId))
  const encounter = data?.encounter
  const [watched, setWatched] = useState<string | null>(null)
  if (encounter && isLive(encounter.status) && watched !== encounter.id) setWatched(encounter.id)
  if (data && encounter && (isLive(encounter.status) || encounter.id === watched))
    return (
      <TableDisplay
        campaignId={campaignId}
        state={data}
        stale={stale}
        connected={connected}
        retry={retry}
      />
    )
  const ended = (history.data ?? []).filter((e) => e.status === 'ended')
  return (
    <Stack gap="lg" className="combat-page">
      <PageHead title={t('combat.title')} description={t('combat.intro.player')} />
      <QueryFeedback pending={query.isPending} error={query.isError} retry={retry} />
      {query.data && (
        <Paper className="combat-empty-state" p="lg">
          <Swords size={28} aria-hidden="true" />
          <Title order={2} className="combat-section-title">
            {t('combat.none.title')}
          </Title>
          <Text c="dimmed">{t('combat.none.body')}</Text>
        </Paper>
      )}
      {ended.length > 0 && <EncounterGroup title={t('combat.list.history')} items={ended} />}
    </Stack>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <Stack gap="md">
      <Alert color="yellow" role="alert">
        {t('combat.notFound')}
      </Alert>
      <Group>
        <Button
          component={Link}
          to=".."
          relative="path"
          variant="default"
          leftSection={<ArrowLeft size={16} aria-hidden="true" />}
        >
          {t('combat.back')}
        </Button>
      </Group>
    </Stack>
  )
}

export function CombatEncounterPage() {
  const { dm, enabled } = useCombatViewer()
  if (!dm && !enabled) return <HiddenCombat />
  return dm ? <DmEncounter /> : <PlayerEncounter />
}

/** A Player opening one encounter (a live link or a past fight) gets its table view. */
function PlayerEncounter() {
  const { encounterId } = useParams()
  const { campaignId } = useCombatViewer()
  const { query, data, stale, retry } = useCombatState(encounterId ?? null)
  const connected = useCombatRealtime(campaignId, true)
  if (query.isError && !query.data && query.error.message === 'gone') return <NotFound />
  if (!data?.encounter)
    return <QueryFeedback pending={query.isPending} error={query.isError} retry={retry} />
  return (
    <TableDisplay
      campaignId={campaignId}
      state={data}
      stale={stale}
      connected={connected}
      retry={retry}
    />
  )
}

type DmView = 'table' | 'console'

/** The DM opens the table view; the console is one switch away. */
function DmEncounter() {
  const { encounterId } = useParams()
  const { query, data } = useCombatState(encounterId ?? null)
  if (query.isError && !query.data && query.error.message === 'gone') return <NotFound />
  if (!data?.encounter)
    return (
      <QueryFeedback
        pending={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
      />
    )
  return <DmViews key={encounterId} encounterId={encounterId!} status={data.encounter.status} />
}

/**
 * Both views stay mounted once opened and the hidden one keeps its state (selection, open tab,
 * targets), so switching back and forth loses nothing. Drafts have no table view: Players and the
 * shared screen never see them. The choice is kept in `?view=` for reloads.
 */
function DmViews({ encounterId, status }: { encounterId: string; status: EncounterStatus }) {
  const { t } = useTranslation()
  const { campaignId } = useCombatViewer()
  const [params, setParams] = useSearchParams()
  const requested = params.get('view')
  const [chosen, setChosen] = useState<DmView>(() =>
    requested === 'console' || requested === 'table'
      ? requested
      : status === 'draft'
        ? 'console'
        : 'table',
  )
  const view: DmView = status === 'draft' ? 'console' : chosen
  const [opened, setOpened] = useState<ReadonlySet<DmView>>(() => new Set([view]))
  if (!opened.has(view)) setOpened(new Set([...opened, view]))
  const connected = useCombatRealtime(campaignId, true)
  const full = useCombatState(encounterId)
  const table = useCombatState(encounterId, true, view === 'table')
  const choose = (next: DmView) => {
    setChosen(next)
    // The view coming into sight refetches at once instead of waiting for the next poll, so a fight
    // that ended (or moved on) behind it never shows its old state (RYT-042 R2-3).
    if (next !== view) void (next === 'console' ? full : table).query.refetch()
    const search = new URLSearchParams(params)
    search.set('view', next)
    setParams(search, { replace: true })
  }
  return (
    <Stack gap="md" className="combat-dm-encounter">
      <div className="combat-viewbar">
        <Button
          component={Link}
          to=".."
          relative="path"
          variant="subtle"
          leftSection={<ArrowLeft size={16} aria-hidden="true" />}
          className="combat-back"
        >
          {t('combat.back')}
        </Button>
        {status !== 'draft' && (
          <SegmentedControl
            value={view}
            onChange={(next) => choose(next as DmView)}
            aria-label={t('combat.view.label')}
            className="combat-view-switch"
            data={[
              {
                value: 'table',
                label: (
                  <span className="combat-view-option">
                    <Monitor size={18} aria-hidden="true" />
                    {t('combat.view.table')}
                  </span>
                ),
              },
              {
                value: 'console',
                label: (
                  <span className="combat-view-option">
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    {t('combat.view.console')}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
      <div hidden={view !== 'table'}>
        {opened.has('table') &&
          (table.data?.encounter ? (
            <TableDisplay
              campaignId={campaignId}
              state={table.data}
              stale={table.stale}
              connected={connected}
              retry={table.retry}
            />
          ) : (
            <QueryFeedback
              pending={table.query.isPending}
              error={table.query.isError}
              retry={table.retry}
            />
          ))}
      </div>
      <div hidden={view !== 'console'}>
        {opened.has('console') && full.data?.encounter && (
          <DmConsole
            campaignId={campaignId}
            state={full.data}
            stale={full.stale}
            connected={connected}
            retry={full.retry}
          />
        )}
      </div>
    </Stack>
  )
}

/** Old table links (RYT-038) land on the encounter, whose default is the table view. */
export function CombatTablePage() {
  const { dm, enabled } = useCombatViewer()
  if (!dm && !enabled) return <HiddenCombat />
  return <Navigate to=".." relative="path" replace />
}
