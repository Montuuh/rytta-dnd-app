import { useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import { Coins, Droplets, Flame, Minus, Plus, Utensils } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { Link } from 'react-router'
import { charactersQuery, sheetSummariesQuery, useCharacterAction } from '../api'
import { isClassKey } from '../domain/rules'
import { resourceSchema, type Character } from '../domain/character'
import type { SheetSummary } from '../domain/sheet'
import { PlayerAssignmentEditor } from './player-assignment'

const fields = ['gold', 'water_units', 'rations', 'exhaustion'] as const
const resourceIcons = {
  gold: Coins,
  water_units: Droplets,
  rations: Utensils,
  exhaustion: Flame,
} as const
type Editor = { kind: 'create' } | { kind: 'resources'; character: Character }
type PartyEditor = Editor | { kind: 'assignment'; character: Character }

export function CharacterParty() {
  const { t, i18n } = useTranslation()
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
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {query.dataUpdatedAt > 0 &&
            t('characters.updated', {
              time: new Date(query.dataUpdatedAt).toLocaleTimeString(i18n.language),
            })}
        </Text>
        <Button variant="subtle" onClick={() => void query.refetch()}>
          {t('hub.refresh')}
        </Button>
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
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          {query.data?.map((character) => (
            <Paper p="lg" key={character.id} className="character-card">
              <Stack>
                <Stack gap="sm">
                  <Title
                    order={2}
                    className="user-copy"
                    id={`character-${character.id}`}
                    tabIndex={-1}
                  >
                    {character.name}
                  </Title>
                  <div
                    className={`character-owner-bar ${character.user_id ? 'is-assigned' : 'is-unassigned'}`}
                  >
                    <div className="character-owner-info">
                      <Badge variant={character.user_id ? 'filled' : 'outline'}>
                        {t(
                          character.user_id
                            ? dm
                              ? 'characters.assigned'
                              : 'characters.you'
                            : 'characters.unassigned',
                        )}
                      </Badge>
                      {dm && character.user_id && members.data && !members.isError && (
                        <Text size="sm" fw={600} className="user-copy">
                          {t('characters.playerName', {
                            name:
                              members.data.find((member) => member.user_id === character.user_id)
                                ?.display_name ?? t('characters.assigned'),
                          })}
                        </Text>
                      )}
                    </div>
                    {dm && (
                      <Button
                        variant={character.user_id ? 'subtle' : 'light'}
                        onClick={(event) =>
                          open({ kind: 'assignment', character }, event.currentTarget)
                        }
                      >
                        {t(character.user_id ? 'characters.unassign' : 'characters.assign')}
                      </Button>
                    )}
                  </div>
                </Stack>
                <SheetSummaryBar
                  character={character}
                  summary={summaries.data?.find((item) => item.character_id === character.id)}
                  canCreate={!playerPreview && (dm || character.user_id === state.user!.id)}
                  own={!playerPreview && character.user_id === state.user!.id}
                  path={`/campaign/${campaign.id}/party/${character.id}`}
                />
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {fields.map((field) => {
                    const Icon = resourceIcons[field]
                    const maxVal = field === 'gold' ? Number.MAX_SAFE_INTEGER : 2147483647
                    const currentVal = character.character_resources[field]
                    const label = t(`characters.${field}`)
                    const stepInline = (delta: number) => {
                      const next = Math.min(maxVal, Math.max(0, currentVal + delta))
                      if (next === currentVal) return
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
                    return (
                      <div
                        key={field}
                        className={`resource-cell resource-cell-${field} ${currentVal >= 1_000_000_000 ? 'resource-cell-wide' : ''}`}
                      >
                        <div className="resource-cell-header">
                          <span className="resource-icon" aria-hidden="true">
                            <Icon size={16} />
                          </span>
                          <Text size="sm" c="dimmed" className="resource-label">
                            {label}
                          </Text>
                        </div>
                        <div className="resource-cell-body">
                          <Text fw={700} size="xl" className="resource-value">
                            {currentVal.toLocaleString(i18n.language)}
                          </Text>
                          {dm && (
                            <div className="resource-inline-steppers">
                              <ActionIcon
                                type="button"
                                variant="default"
                                size={44}
                                className="stepper-btn"
                                aria-label={`${t('characters.decrease', { field: label })} · ${character.name}`}
                                disabled={quickResourceAction.isPending || currentVal <= 0}
                                onClick={() => stepInline(-1)}
                              >
                                <Minus size={16} aria-hidden="true" />
                              </ActionIcon>
                              <ActionIcon
                                type="button"
                                variant="default"
                                size={44}
                                className="stepper-btn"
                                aria-label={`${t('characters.increase', { field: label })} · ${character.name}`}
                                disabled={quickResourceAction.isPending || currentVal >= maxVal}
                                onClick={() => stepInline(1)}
                              >
                                <Plus size={16} aria-hidden="true" />
                              </ActionIcon>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </SimpleGrid>
                {dm && (
                  <Group>
                    <Button
                      variant="light"
                      onClick={(event) =>
                        open({ kind: 'resources', character }, event.currentTarget)
                      }
                    >
                      {t('characters.edit')}
                    </Button>
                  </Group>
                )}
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
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

function SheetSummaryBar({
  character,
  summary,
  canCreate,
  own,
  path,
}: {
  character: Character
  summary: SheetSummary | undefined
  canCreate: boolean
  own: boolean
  path: string
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
  const className =
    summary.class_key && isClassKey(summary.class_key)
      ? t(`srd.class.${summary.class_key}`)
      : (summary.class_label ?? '')
  const ratio = Math.round((summary.current_hp / Math.max(1, summary.max_hp)) * 100)
  return (
    <div className="sheet-summary">
      <div className="sheet-summary-info">
        <Text size="sm" fw={600} className="user-copy">
          {t('sheet.classLevel', { class: className, level: summary.level })}
        </Text>
        <Group gap="md">
          <Text size="sm">
            {t('sheet.hpSummary', {
              value: `${summary.current_hp}/${summary.max_hp}${summary.temp_hp ? ` +${summary.temp_hp}` : ''}`,
            })}
          </Text>
          <Text size="sm">{t('sheet.acSummary', { value: summary.armor_class })}</Text>
        </Group>
        <Progress
          value={ratio}
          size="sm"
          className={`hp-bar hp-${ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical'}`}
          aria-label={t('sheet.hpValue', { current: summary.current_hp, max: summary.max_hp })}
        />
      </div>
      <Button
        component={Link}
        to={path}
        variant="light"
        aria-describedby={`character-${character.id}`}
      >
        {t('sheet.view')}
      </Button>
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
