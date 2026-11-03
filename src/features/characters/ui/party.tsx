import { GlossaryTerm, glossaryIds } from '@/features/glossary'
import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Loader,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import {
  Backpack,
  Coins,
  Heart,
  Shield,
  Droplets,
  Ellipsis,
  EyeOff,
  Flame,
  Link2,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Radio,
  ScrollText,
  Unlink,
  UserRound,
  Utensils,
} from 'lucide-react'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { PageHead } from '@/shared/ui/page-head'
import { PullToRefresh } from '@/shared/ui/pull-to-refresh'
import { useLongPress } from '@/shared/ui/use-long-press'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { Link } from 'react-router'
import { FirstCharacter, RosterLink } from './roster'
import {
  useOwnRoster,
  characterRosterQuery,
  charactersQuery,
  partyOverviewQuery,
  sheetSummariesQuery,
  useCharacterAction,
  useResourceAction,
} from '../api'
import { isClassKey } from '../domain/rules'
import { resourceSchema, type Character } from '../domain/character'
import type { SheetSummary } from '../domain/sheet'
import { hpTone, sharedTeammates, type PartyMember } from '../domain/party'
import { PlayerAssignmentEditor } from './player-assignment'
import { CharacterPortrait } from '@/features/inventory'
import { TradeButton, TradeHistory, TradeLauncher } from '@/features/trades'
import { newRequestId } from '@/shared/lib/request-id'

const fields = ['gold', 'water_units', 'rations', 'exhaustion'] as const
type ResourceField = (typeof fields)[number]
const exhaustionLevels = 6
const resourceIcons = {
  gold: Coins,
  water_units: Droplets,
  rations: Utensils,
  exhaustion: Flame,
} as const
type Editor = { kind: 'create' } | { kind: 'resources'; character: Character }
type PartyEditor = Editor | { kind: 'assignment'; character: Character }

export function CharacterParty() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
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
  // A DM previewing a Player acts as that Player; the server still authorizes as the DM.
  const viewerId = playerPreview ? previewUserId : state.user!.id
  const ownIds = new Set((query.data ?? []).map((character) => character.id))
  // A Player still choosing a first character has no teammates panel yet (RYT-044 onboarding).
  const teammates =
    !dm && overview.data && (query.data?.length ?? 0) > 0
      ? sharedTeammates(overview.data, ownIds)
      : null
  const opener = useRef<HTMLElement | null>(null)
  const fallback = useRef<string | null>(null)
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
  const [editor, setEditor] = useState<PartyEditor | null>(null)
  const [notice, setNotice] = useState<
    'characters.saved' | 'characters.assignmentSaved' | 'characters.created' | null
  >(null)
  const [shareError, setShareError] = useState(false)
  const [resourceError, setResourceError] = useState<'stale' | 'unavailable' | null>(null)
  return (
    <Stack gap="lg">
      <PageHead
        title={t('characters.title')}
        description={t(dm ? 'characters.intro' : 'characters.playerIntro')}
        actions={
          dm ? (
            // One wrapper: on phones each PageHead action takes the whole second row.
            <div className="party-head-actions">
              <RosterLink dm entries={(dmRoster.data ?? []).filter((entry) => !entry.is_active)} />
              <Button
                leftSection={<Plus size={18} aria-hidden="true" />}
                onClick={(event) => open({ kind: 'create' }, event.currentTarget)}
              >
                {t('characters.create')}
              </Button>
            </div>
          ) : (
            own.roster &&
            own.roster.entries.length > 0 && <RosterLink dm={false} entries={own.roster.entries} />
          )
        }
        refresh={
          <RefreshControl
            onRefresh={() => {
              void query.refetch()
              void overview.refetch()
            }}
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
      <PullToRefresh onRefresh={() => void query.refetch()} />
      {notice && <Alert role="status">{t(notice)}</Alert>}
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
      {!query.isError &&
        query.data?.length === 0 &&
        // RYT-044: a Player without characters is guided to create the first one.
        (!dm && !playerPreview ? (
          <FirstCharacter />
        ) : (
          <Paper p="xl">
            <Text>{t(dm ? 'characters.empty' : 'characters.emptyPlayer')}</Text>
          </Paper>
        ))}
      {!query.isError && (
        <div className={`party-grid ${(query.data?.length ?? 0) > 1 ? 'is-many' : 'is-single'}`}>
          {query.data?.map((character) => {
            const own = !!viewerId && character.user_id === viewerId
            const summary = summaries.data?.find((item) => item.character_id === character.id)
            const live = overview.data?.find((item) => item.id === character.id)
            return (
              <Paper
                p="lg"
                key={character.id}
                className={`character-card ${own || (!dm && character.user_id) ? 'is-own' : ''}`}
                component="article"
                aria-labelledby={`character-${character.id}`}
              >
                <Stack gap="md">
                  <Stack gap="sm">
                    <header className="character-head">
                      <CharacterPortrait
                        campaignId={campaign.id}
                        characterId={character.id}
                        name={character.name}
                        path={null}
                        size={own || !dm ? 64 : 52}
                      />
                      <div className="character-head-text">
                        {!dm && (
                          <Text className="eyebrow" mb={2}>
                            {t('party.hero')}
                          </Text>
                        )}
                        <Title
                          order={2}
                          className="user-copy"
                          id={`character-${character.id}`}
                          tabIndex={-1}
                        >
                          {character.name}
                        </Title>
                        {dm && (
                          <div className="character-owner-info">
                            {character.user_id ? (
                              <Badge
                                variant="light"
                                className="user-copy owner-badge"
                                leftSection={<UserRound size={12} aria-hidden="true" />}
                              >
                                {t('characters.playerName', {
                                  name:
                                    (!members.isError &&
                                      members.data?.find(
                                        (member) => member.user_id === character.user_id,
                                      )?.display_name) ||
                                    t('characters.assigned'),
                                })}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="owner-badge">
                                {t('characters.unassigned')}
                              </Badge>
                            )}
                          </div>
                        )}
                        {summary && summary.status === 'complete' && (
                          <Text size="sm" c="dimmed" className="user-copy">
                            {t('sheet.classLevel', {
                              class:
                                summary.class_key && isClassKey(summary.class_key)
                                  ? t(`srd.class.${summary.class_key}`)
                                  : (summary.class_label ?? ''),
                              level: summary.level,
                            })}
                          </Text>
                        )}
                        {dm && live && (
                          <LiveShareToggle
                            campaignId={campaign.id}
                            characterId={character.id}
                            name={character.name}
                            shared={live.shares_live}
                            onError={() => setShareError(true)}
                            onSuccess={() => setShareError(false)}
                          />
                        )}
                      </div>
                      <CharacterMenu
                        character={character}
                        dm={dm}
                        sheetPath={`/campaign/${campaign.id}/party/${character.id}`}
                        itemPath={`/campaign/${campaign.id}/members?panel=items&create=${character.id}`}
                        inventoryPath={`/campaign/${campaign.id}/inventory?character=${character.id}`}
                        onAssign={(target) => open({ kind: 'assignment', character }, target)}
                        onResources={(target) => open({ kind: 'resources', character }, target)}
                      />
                    </header>
                  </Stack>
                  <div className="character-body">
                    <SheetSummaryBar
                      character={character}
                      summary={summary}
                      canCreate={dm || own}
                      own={own}
                      path={`/campaign/${campaign.id}/party/${character.id}`}
                      inventoryPath={
                        !dm && (campaign.player_modules ?? []).includes('inventory')
                          ? `/campaign/${campaign.id}/inventory`
                          : undefined
                      }
                    />
                    <section
                      className="resource-grid"
                      aria-label={`${t('party.resources')} · ${character.name}`}
                    >
                      {fields.map((field) => (
                        <ResourceTile
                          key={field}
                          field={field}
                          character={character}
                          campaignId={campaign.id}
                          dm={dm}
                          onError={setResourceError}
                        />
                      ))}
                    </section>
                  </div>
                </Stack>
              </Paper>
            )
          })}
        </div>
      )}
      {/* RYT-034: start a trade with any assigned character (Player or Player preview). */}
      <Group justify="flex-end">
        <TradeLauncher />
      </Group>
      {teammates && (
        <section className="party-live" aria-labelledby="party-live-heading">
          <div className="party-live-head">
            <Title order={2} id="party-live-heading">
              {t('party.liveTitle')}
            </Title>
            <Text size="sm" c="dimmed">
              {t('party.liveHint')}
            </Text>
          </div>
          {teammates.length > 0 ? (
            <ul className="party-live-grid">
              {teammates.map((member) => (
                <li key={member.id}>
                  <TeammateCard member={member} campaignId={campaign.id} />
                </li>
              ))}
            </ul>
          ) : (
            <Text c="dimmed">{t('party.liveEmpty')}</Text>
          )}
        </section>
      )}
      <TradeHistory />
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

/** DM-only per-character switch for RYT-031 live sharing. Optimistic while the RPC runs. */
function LiveShareToggle({
  campaignId,
  characterId,
  name,
  shared,
  onError,
  onSuccess,
}: {
  campaignId: string
  characterId: string
  name: string
  shared: boolean
  onError: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const action = useCharacterAction(campaignId)
  const on =
    action.isPending && action.variables?.kind === 'liveSharing' ? action.variables.enabled : shared
  return (
    <div className="live-share-toggle" data-on={on || undefined}>
      <Switch
        size="md"
        checked={on}
        label={t('party.shareLabel')}
        aria-label={`${t('party.shareLabel')} · ${name}`}
        title={t('party.shareToggle', { name })}
        aria-busy={action.isPending || undefined}
        thumbIcon={
          on ? <Radio size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />
        }
        onChange={() => {
          if (action.isPending) return
          action.mutate({ kind: 'liveSharing', characterId, enabled: !on }, { onError, onSuccess })
        }}
      />
    </div>
  )
}

/** Compact live card of a shared teammate: only HP, AC, exhaustion and conditions. */
function TeammateCard({ member, campaignId }: { member: PartyMember; campaignId: string }) {
  const { t } = useTranslation()
  const ready =
    member.sheet_status === 'complete' && member.current_hp !== null && member.max_hp !== null
  const { ratio, tone } = hpTone(member.current_hp ?? 0, member.max_hp ?? 1)
  const exhaustion = member.exhaustion ?? 0
  const conditions = member.conditions ?? []
  const headingId = `teammate-${member.id}`
  return (
    <article className={`teammate-card hp-${ready ? tone : 'none'}`} aria-labelledby={headingId}>
      <div className="teammate-head">
        <CharacterPortrait
          campaignId={campaignId}
          characterId={member.id}
          name={member.name}
          path={null}
          size={40}
        />
        <div className="teammate-id">
          <Title order={3} id={headingId} className="teammate-name user-copy">
            {member.name}
          </Title>
          {ready && member.level !== null && (
            <Text size="xs" c="dimmed" className="user-copy">
              {t('sheet.classLevel', {
                class:
                  member.class_key && isClassKey(member.class_key)
                    ? t(`srd.class.${member.class_key}`)
                    : (member.class_label ?? ''),
                level: member.level,
              })}
            </Text>
          )}
        </div>
        {ready && member.armor_class !== null && (
          // Same "AC 14" chip as the Player's own card (RYT-035).
          <span
            className="vital-chip teammate-ac"
            role="img"
            aria-label={t('party.liveAc', { value: member.armor_class })}
          >
            <Shield size={16} aria-hidden="true" />
            <span aria-hidden="true">{t('sheet.acSummary', { value: member.armor_class })}</span>
          </span>
        )}
      </div>
      {ready ? (
        <div className="teammate-hp">
          <div className="teammate-hp-row">
            <Heart size={16} aria-hidden="true" />
            <span className="teammate-hp-value">
              {member.current_hp}
              <span className="teammate-hp-max">/{member.max_hp}</span>
            </span>
            {(member.temp_hp ?? 0) > 0 && (
              <span className="teammate-temp">
                {t('party.liveTemp', { value: member.temp_hp })}
              </span>
            )}
          </div>
          <Progress
            value={ratio}
            size="sm"
            className={`hp-bar hp-${tone}`}
            aria-label={t('sheet.hpValue', { current: member.current_hp, max: member.max_hp })}
          />
        </div>
      ) : (
        <Text size="sm" c="dimmed">
          {t(member.sheet_status === 'draft' ? 'party.liveDraft' : 'party.liveNoSheet')}
        </Text>
      )}
      <div className="teammate-foot">
        <span
          className="teammate-exhaustion"
          role="img"
          data-active={exhaustion > 0 || undefined}
          aria-label={t('characters.exhaustionLevel', { level: exhaustion })}
        >
          <Flame size={14} aria-hidden="true" />
          {Array.from({ length: exhaustionLevels }, (_, index) => (
            <span
              key={index}
              className="teammate-pip"
              data-filled={index < exhaustion || undefined}
            />
          ))}
          {exhaustion > exhaustionLevels && <span className="teammate-pip-more">{exhaustion}</span>}
        </span>
        {conditions.length > 0 && (
          <ul
            className="teammate-conditions"
            aria-label={t('party.liveConditions', { name: member.name })}
          >
            {conditions.map((condition) => (
              <li key={condition}>
                <GlossaryTerm id={glossaryIds.condition(condition)}>
                  {t(`srd.condition.${condition}`)}
                </GlossaryTerm>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TradeButton partnerId={member.id} name={member.name} />
    </article>
  )
}

function CharacterMenu({
  character,
  dm,
  sheetPath,
  itemPath,
  inventoryPath,
  onAssign,
  onResources,
}: {
  character: Character
  dm: boolean
  sheetPath: string
  itemPath: string
  inventoryPath: string
  onAssign: (target: HTMLElement) => void
  onResources: (target: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const trigger = useRef<HTMLButtonElement>(null)
  if (!dm) return null
  return (
    <Menu position="bottom-end" withinPortal withInitialFocusPlaceholder={false}>
      <Menu.Target>
        <ActionIcon
          ref={trigger}
          variant="subtle"
          size={44}
          aria-label={t('characters.moreFor', { name: character.name })}
          title={t('common.moreActions')}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          component={Link}
          to={sheetPath}
          leftSection={<ScrollText size={18} aria-hidden="true" />}
        >
          {t('sheet.view')}
        </Menu.Item>
        <Menu.Item
          component={Link}
          to={inventoryPath}
          leftSection={<Backpack size={18} aria-hidden="true" />}
        >
          {t('party.openInventory')}
        </Menu.Item>
        <Menu.Item
          component={Link}
          to={itemPath}
          leftSection={<PackagePlus size={18} aria-hidden="true" />}
        >
          {t('store.createFor', { name: character.name })}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<Pencil size={18} aria-hidden="true" />}
          onClick={() => trigger.current && onResources(trigger.current)}
        >
          {t('characters.edit')}
        </Menu.Item>
        <Menu.Item
          leftSection={
            character.user_id ? (
              <Unlink size={18} aria-hidden="true" />
            ) : (
              <Link2 size={18} aria-hidden="true" />
            )
          }
          onClick={() => trigger.current && onAssign(trigger.current)}
        >
          {t(character.user_id ? 'characters.unassign' : 'characters.assign')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

function StepButton({
  delta,
  label,
  disabled,
  step,
}: {
  delta: 1 | -1
  label: string
  disabled: boolean
  step: (amount: number) => void
}) {
  const { t } = useTranslation()
  // aria-disabled (not native disabled) keeps keyboard focus on the control while the RPC runs.
  const press = useLongPress(
    () => !disabled && step(delta),
    () => !disabled && step(delta * 5),
  )
  return (
    <ActionIcon
      type="button"
      variant="default"
      size={44}
      className="stepper-btn"
      aria-label={label}
      title={t('characters.holdHint')}
      aria-disabled={disabled || undefined}
      data-inert={disabled || undefined}
      {...press}
    >
      {delta < 0 ? <Minus size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
    </ActionIcon>
  )
}

function ResourceTile({
  field,
  character,
  campaignId,
  dm,
  onError,
}: {
  field: ResourceField
  character: Character
  campaignId: string
  dm: boolean
  onError: (error: 'stale' | 'unavailable' | null) => void
}) {
  const { t, i18n } = useTranslation()
  const Icon = resourceIcons[field]
  const maxVal = field === 'gold' ? Number.MAX_SAFE_INTEGER : 2147483647
  const currentVal = character.character_resources[field]
  const label = t(`characters.${field}`)
  const resource = useResourceAction(campaignId, character.id)
  const send = (change: (current: number) => number) =>
    resource.apply((values) => {
      onError(null)
      return { [field]: Math.min(maxVal, Math.max(0, change(values[field]))) }
    })
  useEffect(() => {
    if (resource.error) onError(resource.error.message === 'stale' ? 'stale' : 'unavailable')
  }, [resource.error, onError])
  const step = (delta: number) => {
    if (currentVal + delta < 0 || currentVal + delta > maxVal) return
    send((value) => value + delta)
  }
  const [goldEditor, setGoldEditor] = useState<Character | null>(null)
  const goldButton = useRef<HTMLButtonElement>(null)
  const closeGold = () => {
    setGoldEditor(null)
    requestAnimationFrame(() => goldButton.current?.focus())
  }
  const pipMode = field === 'exhaustion' && currentVal <= exhaustionLevels
  return (
    <div
      className={`resource-cell resource-cell-${field} ${pipMode ? 'resource-cell-wide' : ''} ${currentVal >= 1_000_000_000 ? 'resource-cell-wide' : ''}`}
    >
      <div className="resource-cell-header">
        <span className="resource-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <Text size="sm" c="dimmed" className="resource-label">
          {label}
        </Text>
      </div>
      {field === 'gold' && dm ? (
        <div className="resource-cell-body">
          <Button
            ref={goldButton}
            variant="subtle"
            className="resource-value"
            onClick={() => setGoldEditor(character)}
            aria-label={t('catalogue.editGold', { name: character.name, value: currentVal })}
          >
            {currentVal.toLocaleString(i18n.language)} <Pencil size={16} aria-hidden="true" />
          </Button>
          {goldEditor && <GoldEditor character={goldEditor} onClose={closeGold} />}
        </div>
      ) : pipMode ? (
        <div className="exhaustion-track">
          <Text fw={700} className="resource-value">
            {currentVal}
            <span className="resource-value-max">/{exhaustionLevels}</span>
          </Text>
          <div
            className="exhaustion-pips"
            role="group"
            aria-label={t('characters.exhaustionLevel', { level: currentVal })}
          >
            {Array.from({ length: exhaustionLevels }, (_, index) => {
              const level = index + 1
              const filled = level <= currentVal
              const target = level === currentVal ? level - 1 : level
              return dm ? (
                <button
                  key={level}
                  type="button"
                  className="exhaustion-pip"
                  data-filled={filled || undefined}
                  aria-pressed={filled}
                  aria-label={`${t('characters.exhaustionPip', { level })} · ${character.name}`}
                  onClick={() => send(() => target)}
                >
                  <span aria-hidden="true">{level}</span>
                </button>
              ) : (
                <span
                  key={level}
                  className="exhaustion-pip"
                  data-filled={filled || undefined}
                  aria-hidden="true"
                >
                  <span>{level}</span>
                </span>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="resource-cell-body">
          <Text fw={700} className="resource-value">
            {currentVal.toLocaleString(i18n.language)}
          </Text>
          {dm && (
            <div className="resource-inline-steppers">
              <StepButton
                delta={-1}
                label={`${t('characters.decrease', { field: label })} · ${character.name}`}
                disabled={currentVal <= 0}
                step={step}
              />
              <StepButton
                delta={1}
                label={`${t('characters.increase', { field: label })} · ${character.name}`}
                disabled={currentVal >= maxVal}
                step={step}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SheetSummaryBar({
  character,
  summary,
  canCreate,
  own,
  path,
  inventoryPath,
}: {
  character: Character
  summary: SheetSummary | undefined
  canCreate: boolean
  own: boolean
  path: string
  inventoryPath?: string
}) {
  const { t } = useTranslation()
  if (!summary) return null
  if (summary.status === 'draft')
    return (
      <div className="sheet-summary is-draft">
        <Badge variant="outline">{t('sheet.draft')}</Badge>
        {canCreate ? (
          <Button
            component={Link}
            to={`${path}/create`}
            aria-describedby={`character-${character.id}`}
          >
            {t(
              summary.class_label
                ? 'sheet.continueCta'
                : own
                  ? 'sheet.createCta'
                  : 'sheet.createForCharacter',
            )}
          </Button>
        ) : (
          <Button
            component={Link}
            to={path}
            variant="subtle"
            aria-describedby={`character-${character.id}`}
          >
            {t('sheet.view')}
          </Button>
        )}
      </div>
    )
  const ratio = Math.round((summary.current_hp / Math.max(1, summary.max_hp)) * 100)
  const tone = ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical'
  return (
    <div className={`sheet-summary hp-${tone}`}>
      <div className="sheet-summary-info">
        <div className="vital-chips">
          <span className="vital-chip is-hp">
            <Heart size={16} aria-hidden="true" />
            <span>
              {t('sheet.hpSummary', {
                value: `${summary.current_hp}/${summary.max_hp}${summary.temp_hp ? ` +${summary.temp_hp}` : ''}`,
              })}
            </span>
          </span>
          <span className="vital-chip">
            <Shield size={16} aria-hidden="true" />
            <span>{t('sheet.acSummary', { value: summary.armor_class })}</span>
          </span>
        </div>
        <Progress
          value={ratio}
          size="md"
          className={`hp-bar hp-${tone}`}
          aria-label={t('sheet.hpValue', { current: summary.current_hp, max: summary.max_hp })}
        />
      </div>
      <div className="sheet-summary-actions">
        <Button
          component={Link}
          to={path}
          variant="light"
          leftSection={<ScrollText size={16} aria-hidden="true" />}
          aria-describedby={`character-${character.id}`}
        >
          {t('sheet.view')}
        </Button>
        {inventoryPath && (
          <Button
            component={Link}
            to={inventoryPath}
            variant="default"
            leftSection={<Backpack size={16} aria-hidden="true" />}
          >
            {t('party.openInventory')}
          </Button>
        )}
      </div>
    </div>
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

function GoldEditor({ character, onClose }: { character: Character; onClose: () => void }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const action = useCharacterAction(campaign.id)
  const [gold, setGold] = useState<number | string>(character.character_resources.gold)
  const [attempted, setAttempted] = useState(false)
  const errorMessage = useRef<HTMLDivElement>(null)
  const request = useRef(newRequestId())
  const valid = typeof gold === 'number' && Number.isSafeInteger(gold) && gold >= 0
  return (
    <Modal
      opened
      onClose={() => !action.isPending && onClose()}
      title={t('catalogue.goldTitle', { name: character.name })}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || action.isPending) return
          setAttempted(true)
          action.mutate(
            {
              kind: 'resources',
              characterId: character.id,
              values: { ...character.character_resources, gold: gold as number },
              requestId: request.current,
            },
            {
              onSuccess: onClose,
              onError: () => requestAnimationFrame(() => errorMessage.current?.focus()),
            },
          )
        }}
      >
        <Stack>
          <NumberInput
            data-autofocus
            label={t('characters.gold')}
            value={gold}
            onChange={setGold}
            min={0}
            max={Number.MAX_SAFE_INTEGER}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            readOnly={attempted}
          />
          {action.isError && (
            <Alert ref={errorMessage} tabIndex={-1} color="red" role="alert">
              {t(
                action.error.message === 'stale' ? 'characters.stale' : 'catalogue.operationError',
              )}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" disabled={action.isPending} onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button
              type="submit"
              aria-disabled={action.isPending || undefined}
              aria-busy={action.isPending}
              leftSection={action.isPending ? <Loader size={16} /> : undefined}
              disabled={!valid || action.error?.message === 'stale'}
            >
              {t(attempted ? 'common.retry' : 'characters.saveGold')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
