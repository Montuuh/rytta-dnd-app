import { useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { useCampaignPortraits } from '@/features/inventory'
import { TradeHistory } from '@/features/trades'
import { newRequestId } from '@/shared/lib/request-id'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { PageHead } from '@/shared/ui/page-head'
import { PullToRefresh } from '@/shared/ui/pull-to-refresh'
import { RefreshControl } from '@/shared/ui/refresh-control'
import {
  characterRosterQuery,
  charactersQuery,
  partyOverviewQuery,
  sheetSummariesQuery,
  useCharacterAction,
  useOwnRoster,
} from '../api'
import { resourceSchema, type Character } from '../domain/character'
import { partyTeammates } from '../domain/party'
import { DmPlate, HeroPlate, TeammateCard, type ResourceError } from './party-plates'
import { PlayerAssignmentEditor } from './player-assignment'
import { ArchiveDialog, FirstCharacter, RosterLink } from './roster'

const fields = ['gold', 'water_units', 'rations', 'exhaustion'] as const
type Editor = { kind: 'create' } | { kind: 'resources'; character: Character }
type PartyEditor = Editor | { kind: 'assignment'; character: Character }

export function CharacterParty() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const portraits = useCampaignPortraits(campaign.id)
  const { playerPreview, previewUserId, previewLabel } = useCampaignView()
  const dm = campaign.role === 'dm'
  const filterUserId = dm ? undefined : (previewUserId ?? state.user!.id)
  const query = useQuery(charactersQuery(state.user!.id, campaign.id, filterUserId))
  const members = useQuery({ ...membersQuery(state.user!.id, campaign.id), enabled: dm })
  const summaries = useQuery(sheetSummariesQuery(state.user!.id, campaign.id))
  const overview = useQuery(partyOverviewQuery(state.user!.id, campaign.id))
  // RYT-044: the Player's roster feeds the manager entry point; the DM's shows the reserve.
  const own = useOwnRoster(campaign.id, dm ? null : (filterUserId ?? null))
  const dmRoster = useQuery({ ...characterRosterQuery(state.user!.id, campaign.id), enabled: dm })
  const characters = query.data ?? []
  // RYT-097: a Player sees every assigned teammate; a Player still choosing a first character
  // has no teammates panel yet (RYT-044 onboarding).
  const showTeammates = !dm && characters.length > 0
  const teammates = overview.data
    ? partyTeammates(overview.data, new Set(characters.map((character) => character.id)))
    : null
  const opener = useRef<HTMLElement | null>(null)
  const fallback = useRef<string | null>(null)
  const [editor, setEditor] = useState<PartyEditor | null>(null)
  const open = (next: PartyEditor, target: HTMLElement) => {
    opener.current = target
    fallback.current = 'character' in next ? `character-${next.character.id}` : null
    setEditor(next)
  }
  const close = () => {
    setEditor(null)
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus()
      else if (fallback.current) document.getElementById(fallback.current)?.focus()
    })
  }
  const [notice, setNotice] = useState<
    'characters.saved' | 'characters.assignmentSaved' | 'characters.created' | null
  >(null)
  const [shareError, setShareError] = useState(false)
  const [resourceError, setResourceError] = useState<ResourceError>(null)
  // RYT-044: the DM archives unassigned characters from their plate menu.
  const [archiving, setArchiving] = useState<Character | null>(null)
  const [archivedNotice, setArchivedNotice] = useState<string | null>(null)
  const archivedNoticeRef = useRef<HTMLDivElement>(null)
  // RYT-079: the DM marked the Player absent; their character is out of the party today.
  const benched = !dm && !playerPreview && Boolean(own.roster?.benched)
  const refresh = () => {
    void query.refetch()
    void overview.refetch()
  }
  const ownerName = (character: Character) =>
    (!members.isError &&
      members.data?.find((member) => member.user_id === character.user_id)?.display_name) ||
    null
  return (
    <Stack gap="lg">
      <PageHead
        title={t('characters.title')}
        actions={
          dm ? (
            // One wrapper: on phones each PageHead action takes the whole second row.
            <div className="party-head-actions">
              <RosterLink
                dm
                entries={(dmRoster.data ?? []).filter(
                  (entry) => entry.user_id && !entry.is_active && !entry.archived_at,
                )}
              />
              {/* RYT-097: the DM creates from the head; Players create from My characters. */}
              <Button
                variant="default"
                className="party-create"
                leftSection={<Plus size={18} aria-hidden="true" />}
                aria-label={t('party.newCharacterLabel')}
                onClick={(event) => open({ kind: 'create' }, event.currentTarget)}
              >
                {t('party.newCharacter')}
              </Button>
            </div>
          ) : (
            own.roster &&
            own.roster.entries.length > 0 && <RosterLink dm={false} entries={own.roster.entries} />
          )
        }
        refresh={
          <RefreshControl
            onRefresh={refresh}
            fetching={query.isFetching || overview.isFetching}
            updatedAt={Math.max(query.dataUpdatedAt, overview.dataUpdatedAt)}
          />
        }
      >
        {playerPreview && previewLabel && (
          <Text c="dimmed" mt="xs">
            {t('shell.previewAs', { name: previewLabel })}
          </Text>
        )}
      </PageHead>
      <PullToRefresh onRefresh={refresh} />
      {notice && <Alert role="status">{t(notice)}</Alert>}
      {archivedNotice && (
        <Alert
          ref={archivedNoticeRef}
          tabIndex={-1}
          role="status"
          withCloseButton
          closeButtonLabel={t('roster.dismiss')}
          onClose={() => {
            setArchivedNotice(null)
            // Back to the page's first action (the roster link) rather than the document body.
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('.party-head-actions a, .roster-link')?.focus(),
            )
          }}
        >
          {archivedNotice}
        </Alert>
      )}
      {resourceError && (
        <Alert color="red" role="alert" withCloseButton onClose={() => setResourceError(null)}>
          {t(resourceError === 'stale' ? 'party.resourceStale' : 'characters.unavailable')}
        </Alert>
      )}
      {shareError && (
        <Alert color="red" role="alert" withCloseButton onClose={() => setShareError(false)}>
          {t('party.shareError')}
        </Alert>
      )}
      {query.isPending && <Text role="status">{t('common.loading')}</Text>}
      {query.isError && (
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {benched && (
        <Alert role="status" className="party-benched">
          <Text>{t('characters.benched')}</Text>
          <Link to={`/campaign/${campaign.id}/party/roster`} className="party-benched-link">
            {t('characters.benchedLink')}
          </Link>
        </Alert>
      )}
      {!query.isError &&
        query.data?.length === 0 &&
        !benched &&
        // RYT-044: a Player without characters is guided to create the first one.
        (!dm && !playerPreview ? (
          <FirstCharacter withArchived={(own.roster?.archived.length ?? 0) > 0} archivedLink />
        ) : (
          <Paper p="xl">
            <Text>{t(dm ? 'characters.empty' : 'characters.emptyPlayer')}</Text>
          </Paper>
        ))}
      {!query.isError && characters.length > 0 && dm && (
        <div className="party-dm-grid">
          {characters.map((character) => (
            <DmPlate
              key={character.id}
              character={character}
              summary={summaries.data?.find((item) => item.character_id === character.id)}
              live={overview.data?.find((item) => item.id === character.id)}
              portrait={portraits.get(character.id) ?? null}
              owner={ownerName(character)}
              onAssign={(target) => open({ kind: 'assignment', character }, target)}
              onResources={(target) => open({ kind: 'resources', character }, target)}
              onArchive={(target) => {
                opener.current = target
                setArchiving(character)
              }}
              onShareError={() => setShareError(true)}
              onShareSaved={() => setShareError(false)}
              onResourceError={setResourceError}
            />
          ))}
        </div>
      )}
      {!query.isError && showTeammates && (
        <div className="party-player">
          <div className="party-player-own">
            {characters.map((character) => (
              <HeroPlate
                key={character.id}
                character={character}
                summary={summaries.data?.find((item) => item.character_id === character.id)}
                live={overview.data?.find((item) => item.id === character.id)}
                portrait={portraits.get(character.id) ?? null}
                sheetPath={`/campaign/${campaign.id}/party/${character.id}`}
                inventoryPath={
                  (campaign.player_modules ?? []).includes('inventory')
                    ? `/campaign/${campaign.id}/inventory`
                    : undefined
                }
              />
            ))}
          </div>
          <section className="party-mates" aria-labelledby="party-live-heading">
            <Title order={2} id="party-live-heading" className="party-section-title">
              {t('party.liveTitle')}
            </Title>
            {teammates && teammates.length > 0 ? (
              <ul className="party-mates-grid">
                {teammates.map((member) => (
                  <li key={member.id}>
                    <TeammateCard
                      member={member}
                      campaignId={campaign.id}
                      portrait={portraits.get(member.id) ?? null}
                    />
                  </li>
                ))}
              </ul>
            ) : teammates ? (
              <Text c="dimmed">{t('party.liveEmpty')}</Text>
            ) : overview.isError ? (
              <Alert color="red" role="alert">
                {t('query.error')}{' '}
                <Button variant="subtle" onClick={() => void overview.refetch()}>
                  {t('common.retry')}
                </Button>
              </Alert>
            ) : (
              <Text role="status">{t('common.loading')}</Text>
            )}
          </section>
        </div>
      )}
      <TradeHistory />
      {archiving && (
        <ArchiveDialog
          entry={archiving}
          onClose={() => {
            setArchiving(null)
            focusWhenReady(() => opener.current)
          }}
          onArchived={(text) => {
            setArchiving(null)
            setArchivedNotice(text)
            // The plate is gone; continue from the outcome message once it is on the page.
            focusWhenReady(() => archivedNoticeRef.current)
          }}
        />
      )}
      {editor?.kind === 'assignment' && (
        <PlayerAssignmentEditor
          character={editor.character}
          campaignId={campaign.id}
          close={close}
          complete={() => {
            close()
            setNotice('characters.assignmentSaved')
          }}
        />
      )}
      {editor && editor.kind !== 'assignment' && (
        <CharacterEditor
          editor={editor}
          campaignId={campaign.id}
          close={close}
          complete={(kind) => {
            close()
            setNotice(kind === 'resources' ? 'characters.saved' : 'characters.created')
          }}
        />
      )}
    </Stack>
  )
}

function CharacterEditor({
  editor,
  campaignId,
  close,
  complete,
}: {
  editor: Editor
  campaignId: string
  close: () => void
  complete: (kind: Editor['kind']) => void
}) {
  const { t } = useTranslation()
  const action = useCharacterAction(campaignId)
  const [requestId] = useState(() => newRequestId())
  const form = useForm({
    initialValues: {
      name: '',
      ...('character' in editor
        ? editor.character.character_resources
        : { gold: 0, water_units: 0, rations: 0, exhaustion: 0, revision: 0 }),
    },
    validate: {
      name: (value) => (editor.kind === 'create' && !value.trim() ? t('hub.invalidName') : null),
      ...Object.fromEntries(
        fields.map((field) => [
          field,
          (value: unknown) =>
            editor.kind === 'resources' && !resourceSchema.shape[field].safeParse(value).success
              ? t('characters.invalid')
              : null,
        ]),
      ),
    },
  })
  const title = t(editor.kind === 'create' ? 'characters.create' : 'characters.edit')
  return (
    <Modal
      opened
      onClose={() => {
        if (!action.isPending) close()
      }}
      title={title}
      yOffset="2dvh"
      returnFocus
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={form.onSubmit((values) => {
          const options = { onSuccess: () => complete(editor.kind) }
          if (editor.kind === 'create')
            action.mutate({ kind: 'create', name: values.name }, options)
          else
            action.mutate(
              { kind: 'resources', characterId: editor.character.id, values, requestId },
              options,
            )
        })}
      >
        <Stack gap="xs">
          {'character' in editor && (
            <Text fw={600} className="user-copy">
              {editor.character.name}
            </Text>
          )}
          {editor.kind === 'create' && (
            <TextInput
              data-autofocus
              required
              label={t('characters.name')}
              maxLength={100}
              {...form.getInputProps('name')}
            />
          )}
          {editor.kind === 'resources' &&
            fields.map((field, index) => {
              const maxVal = field === 'gold' ? Number.MAX_SAFE_INTEGER : 2147483647
              const label = t(`characters.${field}`)
              const step = (delta: number) => {
                const raw = Number(form.values[field])
                const current = Number.isFinite(raw) ? Math.trunc(raw) : 0
                const next = Math.min(maxVal, Math.max(0, current + delta))
                form.setFieldValue(field, next)
              }
              return (
                <div key={field} className="resource-stepper-row">
                  <NumberInput
                    data-autofocus={index === 0 || undefined}
                    label={label}
                    required
                    min={0}
                    max={maxVal}
                    allowDecimal={false}
                    hideControls
                    className="resource-stepper-input"
                    {...form.getInputProps(field)}
                  />
                  <div className="resource-stepper-buttons">
                    <ActionIcon
                      type="button"
                      variant="default"
                      size={44}
                      className="stepper-btn"
                      aria-label={t('characters.decrease', { field: label })}
                      disabled={action.isPending || Number(form.values[field]) <= 0}
                      onClick={() => step(-1)}
                    >
                      <Minus size={18} aria-hidden="true" />
                    </ActionIcon>
                    <ActionIcon
                      type="button"
                      variant="default"
                      size={44}
                      className="stepper-btn"
                      aria-label={t('characters.increase', { field: label })}
                      disabled={action.isPending || Number(form.values[field]) >= maxVal}
                      onClick={() => step(1)}
                    >
                      <Plus size={18} aria-hidden="true" />
                    </ActionIcon>
                  </div>
                </div>
              )
            })}
          {action.isError && (
            <Alert role="alert" color="red">
              {t(action.error.message === 'stale' ? 'characters.stale' : 'characters.unavailable')}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" disabled={action.isPending} onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button
              type="submit"
              loading={action.isPending}
              disabled={action.error?.message === 'stale'}
            >
              {editor.kind === 'resources' ? t('characters.save') : title}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
