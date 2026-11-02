import { useRef, useState } from 'react'
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
  Flame,
  Link2,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  ScrollText,
  Unlink,
  Utensils,
} from 'lucide-react'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { PullToRefresh } from '@/shared/ui/pull-to-refresh'
import { useLongPress } from '@/shared/ui/use-long-press'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { Link } from 'react-router'
import { charactersQuery, sheetSummariesQuery, useCharacterAction } from '../api'
import { isClassKey } from '../domain/rules'
import { resourceSchema, type Character } from '../domain/character'
import type { SheetSummary } from '../domain/sheet'
import { PlayerAssignmentEditor } from './player-assignment'
import { CharacterPortrait } from '@/features/inventory'

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
  const quickResourceAction = useCharacterAction(campaign.id)
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="start">
        <div>
          <Title order={1}>{t('characters.title')}</Title>
          <Text c="dimmed" mt="sm">
            {t(dm ? 'characters.intro' : 'characters.playerIntro')}
          </Text>
          {playerPreview && previewLabel && (
            <Text c="dimmed" mt="xs">
              {t('shell.previewAs', { name: previewLabel })}
            </Text>
          )}
        </div>
        {dm && (
          <Button onClick={(event) => open({ kind: 'create' }, event.currentTarget)}>
            {t('characters.create')}
          </Button>
        )}
      </Group>
      <PullToRefresh onRefresh={() => void query.refetch()} />
      <Group justify="flex-end">
        <RefreshControl
          onRefresh={() => void query.refetch()}
          fetching={query.isFetching}
          updatedAt={query.dataUpdatedAt}
        />
      </Group>
      {notice && <Alert role="status">{t(notice)}</Alert>}
      {query.isPending && <Text role="status">{t('common.loading')}</Text>}
      {query.isError && (
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {!query.isError && query.data?.length === 0 && (
        <Paper p="xl">
          <Text>{t(dm ? 'characters.empty' : 'characters.emptyPlayer')}</Text>
        </Paper>
      )}
      {!query.isError && (
        <div className={`party-grid ${(query.data?.length ?? 0) > 1 ? 'is-many' : 'is-single'}`}>
          {query.data?.map((character) => {
            const own = !playerPreview && character.user_id === state.user!.id
            const summary = summaries.data?.find((item) => item.character_id === character.id)
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
                            <Badge variant={character.user_id ? 'light' : 'outline'}>
                              {t(
                                character.user_id ? 'characters.assigned' : 'characters.unassigned',
                              )}
                            </Badge>
                            {character.user_id && members.data && !members.isError && (
                              <Text size="sm" fw={600} className="user-copy">
                                {t('characters.playerName', {
                                  name:
                                    members.data.find(
                                      (member) => member.user_id === character.user_id,
                                    )?.display_name ?? t('characters.assigned'),
                                })}
                              </Text>
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
                      canCreate={!playerPreview && (dm || character.user_id === state.user!.id)}
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
                          dm={dm}
                          pending={quickResourceAction.isPending}
                          commit={(next) =>
                            quickResourceAction.mutate(
                              {
                                kind: 'resources',
                                characterId: character.id,
                                values: { ...character.character_resources, [field]: next },
                                requestId: crypto.randomUUID(),
                              },
                              { onSuccess: () => setNotice('characters.saved') },
                            )
                          }
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
  dm,
  pending,
  commit,
}: {
  field: ResourceField
  character: Character
  dm: boolean
  pending: boolean
  commit: (next: number) => void
}) {
  const { t, i18n } = useTranslation()
  const Icon = resourceIcons[field]
  const maxVal = field === 'gold' ? Number.MAX_SAFE_INTEGER : 2147483647
  const currentVal = character.character_resources[field]
  const label = t(`characters.${field}`)
  const step = (delta: number) => {
    const next = Math.min(maxVal, Math.max(0, currentVal + delta))
    if (next !== currentVal) commit(next)
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
                  aria-disabled={pending || undefined}
                  aria-pressed={filled}
                  aria-label={`${t('characters.exhaustionPip', { level })} · ${character.name}`}
                  onClick={() => !pending && commit(target)}
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
                disabled={pending || currentVal <= 0}
                step={step}
              />
              <StepButton
                delta={1}
                label={`${t('characters.increase', { field: label })} · ${character.name}`}
                disabled={pending || currentVal >= maxVal}
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
  const [requestId] = useState(() => crypto.randomUUID())
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
  const request = useRef(crypto.randomUUID())
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
              {t(attempted ? 'common.retry' : 'characters.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
