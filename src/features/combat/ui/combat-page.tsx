import { useMemo } from 'react'
import { Alert, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Maximize, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { PageHead } from '@/shared/ui/page-head'
import { QueryFeedback, useCampaign, useCampaignView } from '@/features/campaigns'
import { charactersQuery } from '@/features/characters'
import { combatStateQuery, encountersQuery, useCombatRealtime } from '../api'
import { isLive, previewAsPlayer, type CombatState } from '../domain/combat'
import { DmConsole } from './dm-console'
import { EncounterGroup, EncounterList } from './encounter-list'
import { useFreshness } from './helpers'
import { PlayerView } from './player-view'
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

function useLiveState(encounterId: string | null, asTable = false) {
  const { userId, campaignId, project } = useCombatViewer()
  const query = useQuery(combatStateQuery(userId, campaignId, encounterId, asTable))
  const connected = useCombatRealtime(campaignId, true)
  const stale = useFreshness(query.dataUpdatedAt, query.isError && query.data !== undefined)
  return { query, data: project(query.data), connected, stale, retry: () => void query.refetch() }
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

function PlayerCombat() {
  const { t } = useTranslation()
  const { userId, campaignId } = useCombatViewer()
  const { query, data, connected, stale, retry } = useLiveState(null)
  const history = useQuery(encountersQuery(userId, campaignId))
  const ended = (history.data ?? []).filter((e) => e.status === 'ended')
  if (data?.encounter && isLive(data.encounter.status))
    return (
      <PlayerView
        campaignId={campaignId}
        state={data}
        stale={stale}
        connected={connected}
        retry={retry}
        backLink={false}
      />
    )
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
  return <EncounterScreen />
}

function EncounterScreen() {
  const { encounterId } = useParams()
  const { dm, campaignId } = useCombatViewer()
  const { query, data, connected, stale, retry } = useLiveState(encounterId ?? null)
  if (query.isError && !query.data && query.error.message === 'gone') return <NotFound />
  if (!data?.encounter)
    return <QueryFeedback pending={query.isPending} error={query.isError} retry={retry} />
  if (dm)
    return (
      <DmConsole
        campaignId={campaignId}
        state={data}
        stale={stale}
        connected={connected}
        retry={retry}
      />
    )
  return (
    <PlayerView
      campaignId={campaignId}
      state={data}
      stale={stale}
      connected={connected}
      retry={retry}
      backLink
    />
  )
}

export function CombatTablePage() {
  const { dm, enabled } = useCombatViewer()
  if (!dm && !enabled) return <HiddenCombat />
  return <TableScreen />
}

function TableScreen() {
  const { t } = useTranslation()
  const { encounterId } = useParams()
  const { query, data, connected, stale, retry } = useLiveState(encounterId ?? null, true)
  if (query.isError && !query.data && query.error.message === 'gone') return <NotFound />
  if (!data?.encounter)
    return <QueryFeedback pending={query.isPending} error={query.isError} retry={retry} />
  return (
    <Stack gap="sm">
      {document.fullscreenEnabled && (
        <Group justify="flex-end">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<Maximize size={16} aria-hidden="true" />}
            onClick={() =>
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
          >
            {t('combat.fullscreen')}
          </Button>
        </Group>
      )}
      <TableDisplay state={data} stale={stale} connected={connected} retry={retry} />
    </Stack>
  )
}
