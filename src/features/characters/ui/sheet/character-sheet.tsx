import { useState } from 'react'
import { Alert, Badge, Button, Group, Paper, Stack, Tabs, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { CharacterPortrait, SheetAttacks } from '@/features/inventory'
import { charactersQuery, sheetQuery, useSheetAction } from '../../api'
import type { Vitals } from '../../domain/sheet'
import { useCharacterLabels } from '../labels'
import { FeaturesTab, NotesTab, SpellsTab, SummaryTab } from './sections'
import { VitalsPanel } from './vitals-panel'

const tabs = ['summary', 'features', 'spells', 'notes'] as const

export function CharacterSheetPage() {
  const { t, i18n } = useTranslation()
  const { characterId = '' } = useParams()
  const { state } = useAuth()
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const userId = state.user!.id
  const query = useQuery(sheetQuery(userId, campaign.id, characterId))
  // Exhaustion stays a DM resource on characters; reuse the Party query for it.
  const resources = useQuery({
    ...charactersQuery(userId, campaign.id, campaign.role === 'dm' ? undefined : userId),
    enabled: !playerPreview,
  })
  const action = useSheetAction(campaign.id)
  const labels = useCharacterLabels()
  const [notice, setNotice] = useState<'sheet.saved' | 'sheet.restDone' | null>(null)
  const party = `/campaign/${campaign.id}/party`
  const back = (
    <Button
      component={Link}
      to={party}
      variant="subtle"
      leftSection={<ArrowLeft size={18} aria-hidden="true" />}
      className="sheet-back"
    >
      {t('sheet.back')}
    </Button>
  )
  if (query.isPending)
    return (
      <Stack>
        {back}
        <Text role="status">{t('common.loading')}</Text>
      </Stack>
    )
  if (query.isError)
    return (
      <Stack>
        {back}
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      </Stack>
    )
  if (!query.data)
    return (
      <Stack>
        {back}
        <Paper p="xl">
          <Text>{t('sheet.notFound')}</Text>
        </Paper>
      </Stack>
    )
  const { character, sheet, vitals } = query.data
  const canEdit = !playerPreview && (campaign.role === 'dm' || character.user_id === userId)
  const editPath = `${party}/${character.id}/create`
  if (sheet.status === 'draft' || !sheet.build)
    return (
      <Stack gap="lg">
        {back}
        <Title order={1} className="user-copy">
          {character.name}
        </Title>
        <Paper p="xl" className="sheet-draft">
          <Stack align="flex-start">
            <Badge variant="outline">{t('sheet.draft')}</Badge>
            <Text>
              {canEdit ? t('sheet.draftHint', { name: character.name }) : t('sheet.draftWaiting')}
            </Text>
            {canEdit && (
              <Button component={Link} to={editPath}>
                {t(sheet.build ? 'sheet.continueCta' : 'sheet.createForCharacter')}
              </Button>
            )}
          </Stack>
        </Paper>
      </Stack>
    )
  const build = sheet.build
  const exhaustion = resources.data?.find((item) => item.id === character.id)?.character_resources
    .exhaustion
  const commit = (values: Vitals, done?: 'sheet.restDone') => {
    setNotice(null)
    action.mutate(
      { kind: 'vitals', characterId: character.id, values, requestId: crypto.randomUUID() },
      { onSuccess: () => setNotice(done ?? null) },
    )
  }
  const shared = { build, sheet, vitals, canEdit, pending: action.isPending, commit }
  return (
    <Stack gap="md" className="character-sheet">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        {back}
        {canEdit && (
          <Button
            component={Link}
            to={editPath}
            variant="light"
            leftSection={<Pencil size={16} aria-hidden="true" />}
          >
            {t('sheet.editBuild')}
          </Button>
        )}
      </Group>
      <header className="sheet-identity">
        <CharacterPortrait
          campaignId={campaign.id}
          characterId={character.id}
          name={character.name}
          path={sheet.portrait_path ?? null}
          size={72}
          editable={canEdit}
        />
        <div className="sheet-identity-text">
          <Title order={1} className="user-copy">
            {character.name}
          </Title>
          <Text c="dimmed" className="user-copy">
            {t('sheet.classLevel', { class: labels.className(build), level: sheet.level })}
            {build.subclass ? ` (${build.subclass})` : ''}. {labels.speciesName(build)},{' '}
            {labels.backgroundName(build)}.
          </Text>
          {!canEdit && (
            <Text size="sm" c="dimmed">
              {t('sheet.readOnly')}
            </Text>
          )}
        </div>
      </header>
      {action.isError && (
        <Alert color="red" role="alert">
          {t(
            action.error.message === 'stale'
              ? 'sheet.stale'
              : action.error.message === 'forbidden'
                ? 'sheet.forbidden'
                : 'sheet.unavailable',
          )}
        </Alert>
      )}
      <div aria-live="polite" className="visually-hidden-live">
        {action.isPending ? t('sheet.saving') : notice ? t(notice) : ''}
      </div>
      <VitalsPanel {...shared} exhaustion={exhaustion} />
      <section aria-labelledby="sheet-attacks" className="sheet-attacks">
        <Title order={2} size="h4" id="sheet-attacks" mb={4}>
          {t('inventory.attacks.title')}
        </Title>
        <SheetAttacks campaignId={campaign.id} characterId={character.id} />
      </section>
      <Text size="xs" c="dimmed">
        {t('characters.updated', {
          time: new Date(query.dataUpdatedAt).toLocaleTimeString(i18n.language),
        })}
      </Text>
      <Tabs defaultValue="summary" keepMounted={false} className="sheet-tabs">
        <Tabs.List aria-label={t('sheet.tabs')} grow>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab}>
              {t(`sheet.tab.${tab}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="summary" pt="md">
          <SummaryTab {...shared} />
        </Tabs.Panel>
        <Tabs.Panel value="features" pt="md">
          <FeaturesTab {...shared} onRest={(values) => commit(values, 'sheet.restDone')} />
        </Tabs.Panel>
        <Tabs.Panel value="spells" pt="md">
          <SpellsTab {...shared} />
        </Tabs.Panel>
        <Tabs.Panel value="notes" pt="md">
          <NotesTab {...shared} />
        </Tabs.Panel>
      </Tabs>
      <Text size="xs" c="dimmed">
        {t('srd.license')}
      </Text>
    </Stack>
  )
}
