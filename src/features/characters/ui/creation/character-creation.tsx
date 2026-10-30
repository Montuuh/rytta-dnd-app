import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Paper, Progress, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { sheetQuery, useSheetAction } from '../../api'
import {
  creationSteps,
  initialDraft,
  normalizeDraft,
  stepApplies,
  validateAll,
  validateStep,
  type CreationStep,
} from '../../domain/creation'
import type { SheetDraft, SheetRow } from '../../domain/sheet'
import { CreationStepView } from './steps'

const fromRow = (sheet: SheetRow): SheetDraft =>
  sheet.build
    ? {
        build: sheet.build,
        level: sheet.level,
        maxHp: sheet.max_hp,
        armorClass: sheet.armor_class,
      }
    : initialDraft()

export function CharacterCreationPage() {
  const { t } = useTranslation()
  const { characterId = '' } = useParams()
  const { state } = useAuth()
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const query = useQuery(sheetQuery(state.user!.id, campaign.id, characterId))
  const sheetPath = `/campaign/${campaign.id}/party/${characterId}`
  const back = (
    <Button
      component={Link}
      to={sheetPath}
      variant="subtle"
      leftSection={<ArrowLeft size={18} aria-hidden="true" />}
      className="sheet-back"
    >
      {t('sheet.title')}
    </Button>
  )
  if (query.isPending) return <Text role="status">{t('common.loading')}</Text>
  if (query.isError || !query.data)
    return (
      <Stack>
        {back}
        <Alert color="red" role="alert">
          {t(query.isError ? 'query.error' : 'sheet.notFound')}
        </Alert>
      </Stack>
    )
  const canEdit =
    !playerPreview && (campaign.role === 'dm' || query.data.character.user_id === state.user!.id)
  if (!canEdit)
    return (
      <Stack>
        {back}
        <Paper p="xl">
          <Text>{t('wizard.readOnly')}</Text>
        </Paper>
      </Stack>
    )
  return (
    <Wizard
      key={query.data.sheet.character_id}
      name={query.data.character.name}
      sheet={query.data.sheet}
      sheetPath={sheetPath}
      reload={async () => (await query.refetch()).data?.sheet}
    />
  )
}

function Wizard({
  name,
  sheet,
  sheetPath,
  reload,
}: {
  name: string
  sheet: SheetRow
  sheetPath: string
  reload: () => Promise<SheetRow | undefined>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const campaign = useCampaign()
  const action = useSheetAction(campaign.id)
  const [draft, setDraft] = useState(() => fromRow(sheet))
  const [revision, setRevision] = useState(sheet.revision)
  const [index, setIndex] = useState(0)
  const [issues, setIssues] = useState<string[]>([])
  const [savedNotice, setSavedNotice] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const editing = sheet.status === 'complete'
  const steps = creationSteps.filter((step) => stepApplies(step, draft.build))
  const current: CreationStep = steps[Math.min(index, steps.length - 1)]!
  const last = index >= steps.length - 1
  const issuesRef = useRef<HTMLDivElement>(null)
  useEffect(() => heading.current?.focus(), [index])
  useEffect(() => {
    if (issues.length > 0) issuesRef.current?.scrollIntoView({ block: 'nearest' })
  }, [issues])

  const save = (complete: boolean, then: () => void) => {
    const found = complete ? validateAll(draft) : validateStep(current, draft)
    setIssues(found)
    setSavedNotice(false)
    if (found.length > 0) return
    action.mutate(
      {
        kind: 'save',
        characterId: sheet.character_id,
        expectedRevision: revision,
        draft: normalizeDraft(draft),
        complete,
        requestId: crypto.randomUUID(),
      },
      {
        onSuccess: (next) => {
          setRevision(typeof next === 'number' ? next : revision + 1)
          then()
        },
      },
    )
  }
  return (
    <Stack gap="md" className="creation-wizard">
      <Group justify="space-between" gap="xs">
        <Button
          component={Link}
          to={sheetPath}
          variant="subtle"
          leftSection={<ArrowLeft size={18} aria-hidden="true" />}
          className="sheet-back"
        >
          {t('sheet.title')}
        </Button>
        {!last && (
          <Button
            variant="subtle"
            disabled={action.isPending}
            onClick={() => save(false, () => void navigate(sheetPath))}
          >
            {t('wizard.exit')}
          </Button>
        )}
      </Group>
      <div>
        <Text size="sm" c="dimmed">
          {t(editing ? 'wizard.editTitle' : 'wizard.title', { name })}
        </Text>
        <Title order={1} ref={heading} tabIndex={-1}>
          {t(`wizard.step.${current}`)}
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          {t('wizard.progress', { current: index + 1, total: steps.length })}
        </Text>
        <Progress value={((index + 1) / steps.length) * 100} size="sm" mt="xs" aria-hidden="true" />
      </div>
      {editing && (
        <nav aria-label={t('wizard.progress', { current: index + 1, total: steps.length })}>
          <Group gap="xs" className="wizard-steps">
            {steps.map((step, position) => (
              <Button
                key={step}
                size="compact-md"
                variant={position === index ? 'filled' : 'default'}
                aria-current={position === index ? 'step' : undefined}
                disabled={action.isPending}
                onClick={() => {
                  setIssues([])
                  setIndex(position)
                }}
              >
                {t(`wizard.step.${step}`)}
              </Button>
            ))}
          </Group>
        </nav>
      )}
      {issues.length > 0 && (
        <Alert color="red" role="alert" ref={issuesRef}>
          <Stack gap={4}>
            {issues.map((issue) => (
              <Text key={issue} size="sm">
                {t(`wizard.issue.${issue}` as 'wizard.issue.chooseClass')}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      <CreationStepView step={current} draft={draft} setDraft={setDraft} />
      {action.isError && (
        <Alert color="red" role="alert">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {t(
                action.error.message === 'stale'
                  ? 'sheet.stale'
                  : action.error.message === 'forbidden'
                    ? 'sheet.forbidden'
                    : 'sheet.unavailable',
              )}
            </Text>
            {action.error.message === 'stale' && (
              <Button
                variant="light"
                onClick={async () => {
                  const fresh = await reload()
                  if (!fresh) return
                  setDraft(fromRow(fresh))
                  setRevision(fresh.revision)
                  action.reset()
                }}
              >
                {t('hub.refresh')}
              </Button>
            )}
          </Stack>
        </Alert>
      )}
      <div aria-live="polite">
        {savedNotice && (
          <Text size="sm" c="dimmed">
            {t('wizard.draftSaved')}
          </Text>
        )}
      </div>
      <Group justify="space-between" wrap="nowrap" className="wizard-actions">
        <Button
          variant="default"
          disabled={index === 0 || action.isPending}
          onClick={() => {
            setIssues([])
            setIndex(index - 1)
          }}
        >
          {t('wizard.back')}
        </Button>
        <Button
          loading={action.isPending}
          onClick={() =>
            last
              ? save(true, () => void navigate(sheetPath))
              : save(false, () => {
                  setSavedNotice(!editing)
                  setIndex(index + 1)
                })
          }
        >
          {t(last ? (editing ? 'wizard.saveChanges' : 'wizard.finish') : 'wizard.next')}
        </Button>
      </Group>
    </Stack>
  )
}
