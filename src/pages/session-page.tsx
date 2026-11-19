import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { QueryFeedback, useCampaign } from '@/features/campaigns'
import {
  CombatSummary,
  combatStateQuery,
  encountersQuery,
  encounterPlanQuery,
  type SessionContinuity,
  sessionContinuityQuery,
  sharedRecapQuery,
  useSaveSessionContinuity,
} from '@/features/combat'
import { LootDrawer, catalogueQuery } from '@/features/inventory'
import { PageHead } from '@/shared/ui/page-head'

function useContinuity() {
  const campaign = useCampaign()
  const { state } = useAuth()
  return useQuery(sessionContinuityQuery(state.user!.id, campaign.id))
}

export function SessionPage() {
  const campaign = useCampaign()
  return campaign.role === 'dm' ? <DmJournal key={campaign.id} /> : <PlayerRecap />
}

function PlayerRecap() {
  const campaign = useCampaign()
  const { state } = useAuth()
  const { t } = useTranslation()
  const recap = useQuery(sharedRecapQuery(state.user!.id, campaign.id))
  return (
    <Stack>
      <PageHead title={t('session.recap')} />
      <QueryFeedback
        pending={recap.isPending}
        error={recap.isError}
        cause={recap.error}
        retry={() => void recap.refetch()}
      />
      {recap.isSuccess && (
        <Paper p="lg">
          <Text className="user-copy" style={{ whiteSpace: 'pre-wrap' }}>
            {recap.data || t('session.noRecap')}
          </Text>
        </Paper>
      )}
    </Stack>
  )
}

function DmJournal() {
  const campaign = useCampaign()
  const { t } = useTranslation()
  const saved = useContinuity()
  const [params, setParams] = useSearchParams()
  const journalHeading = useRef<HTMLHeadingElement>(null)
  const [closed, setClosed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const encounterId = params.get('encounter')
  const editing = params.has('close') || Boolean(encounterId)
  const enter = () => {
    setClosed(false)
    setParams({ close: '1' })
  }
  if (editing && saved.data)
    return (
      <CloseSession
        key={`${encounterId || campaign.id}/${reloadKey}`}
        saved={saved.data}
        requestedEncounter={encounterId}
        onReload={async () => {
          const result = await saved.refetch()
          if (result.isSuccess) setReloadKey((value) => value + 1)
        }}
        onExit={(completed) => {
          setClosed(completed)
          setParams({}, { replace: true })
          requestAnimationFrame(() => journalHeading.current?.focus())
        }}
      />
    )
  return (
    <Stack>
      <PageHead title={t('session.journal')} headingRef={journalHeading} />
      {closed && <Text role="status">{t('session.closed')}</Text>}
      <QueryFeedback
        pending={saved.isPending}
        error={saved.isError}
        cause={saved.error}
        retry={() => void saved.refetch()}
      />
      {saved.data && (
        <>
          {saved.data.revision > 0 ? (
            <Paper p="lg">
              <Stack>
                {saved.data.lastEncounter && (
                  <div>
                    <Title order={2} size="h4">
                      {t('session.last')}
                    </Title>
                    <Button
                      component={Link}
                      variant="subtle"
                      to={`/campaign/${campaign.id}/combat/${saved.data.lastEncounter.id}`}
                    >
                      {saved.data.lastEncounter.name}
                    </Button>
                  </div>
                )}
                <JournalField
                  label={t('session.pending')}
                  value={saved.data.pendingReward || t('session.noRewards')}
                />
                <JournalField label={t('session.scene')} value={saved.data.nextScene} />
                <JournalField label={t('session.note')} value={saved.data.privateNote} />
                <JournalField label={t('session.recap')} value={saved.data.sharedRecap} />
              </Stack>
            </Paper>
          ) : (
            <Text>{t('session.empty')}</Text>
          )}
          <Button w="fit-content" onClick={enter}>
            {t('session.close')}
          </Button>
        </>
      )}
    </Stack>
  )
}

function JournalField({ label, value }: { label: string; value: string }) {
  return (
    value && (
      <div>
        <Title order={2} size="h4">
          {label}
        </Title>
        <Text className="user-copy" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {value}
        </Text>
      </div>
    )
  )
}

function EncounterReview({ id }: { id: string }) {
  const campaign = useCampaign()
  const { state } = useAuth()
  const { t } = useTranslation()
  const detail = useQuery(combatStateQuery(state.user!.id, campaign.id, id))
  const encounter = detail.data?.encounter
  return (
    <>
      <QueryFeedback
        pending={detail.isPending}
        error={detail.isError}
        cause={detail.error}
        retry={() => void detail.refetch()}
      />
      {encounter &&
        (encounter.summary ? (
          <CombatSummary encounter={encounter} combatants={detail.data!.combatants} />
        ) : (
          <Text>
            {t(`combat.status.${encounter.status}`)} ·{' '}
            {t('combat.round', { round: encounter.round })}
          </Text>
        ))}
    </>
  )
}

function PlannedReward({
  id,
  pending,
  onAdd,
}: {
  id: string
  pending: string
  onAdd: (reward: string) => void
}) {
  const campaign = useCampaign()
  const { state } = useAuth()
  const { t } = useTranslation()
  const plan = useQuery(encounterPlanQuery(state.user!.id, campaign.id, id))
  const reward = plan.data?.reward.trim()
  if (!reward || pending.includes(reward)) return null
  const combined = [pending.trim(), reward].filter(Boolean).join('\n')
  return (
    <Stack gap="xs">
      <JournalField label={t('session.planned')} value={reward} />
      <Button
        variant="light"
        w="fit-content"
        disabled={combined.length > 2000}
        onClick={() => onAdd(combined)}
      >
        {t('session.addReward')}
      </Button>
    </Stack>
  )
}

function CloseSession({
  saved,
  requestedEncounter,
  onReload,
  onExit,
}: {
  saved: SessionContinuity
  requestedEncounter: string | null
  onReload: () => Promise<void>
  onExit: (completed: boolean) => void
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const { state } = useAuth()
  const save = useSaveSessionContinuity(campaign.id)
  const [base] = useState(saved)
  const [step, setStep] = useState(0)
  const [encounterId, setEncounter] = useState(requestedEncounter ?? base.lastEncounter?.id ?? '')
  const [pendingReward, setReward] = useState(base.pendingReward)
  const [privateNote, setNote] = useState(base.privateNote)
  const [nextScene, setScene] = useState(base.nextScene)
  const [sharedRecap, setRecap] = useState(base.sharedRecap)
  const [sharing, setSharing] = useState(Boolean(base.sharedRecap))
  const [giving, setGiving] = useState(false)
  const [delivered, setDelivered] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const list = useQuery({ ...encountersQuery(state.user!.id, campaign.id), enabled: step === 0 })
  const catalogue = useQuery({ ...catalogueQuery(state.user!.id, campaign.id), enabled: giving })
  const go = (next: number) => {
    setStep(next)
    requestAnimationFrame(() => heading.current?.focus())
  }
  const finish = (skip = false) =>
    save.mutate(
      {
        encounterId: encounterId || null,
        pendingReward: pendingReward.trim(),
        privateNote: skip ? base.privateNote : privateNote.trim(),
        nextScene: skip ? base.nextScene : nextScene.trim(),
        sharedRecap: skip ? base.sharedRecap : sharing ? sharedRecap.trim() : '',
        revision: base.revision,
      },
      { onSuccess: () => onExit(true) },
    )
  const titles = ['session.combat', 'session.rewards', 'session.prepare'] as const
  return (
    <Stack maw={760}>
      <PageHead eyebrow={t('session.close')} title={t(titles[step]!)} headingRef={heading} />
      <Text size="sm" c="dimmed">
        {t('session.progress', { current: step + 1 })}
      </Text>
      <Paper p="md">
        <Stack>
          {step === 0 && (
            <>
              <QueryFeedback
                pending={list.isPending}
                error={list.isError}
                cause={list.error}
                retry={() => void list.refetch()}
              />
              <NativeSelect
                label={t('session.encounter')}
                value={encounterId}
                onChange={(e) => setEncounter(e.currentTarget.value)}
                data={[
                  { value: '', label: t('session.none') },
                  ...(list.data ?? []).map((e) => ({ value: e.id, label: e.name })),
                ]}
              />
              {encounterId && <EncounterReview id={encounterId} />}
            </>
          )}
          {step === 1 && (
            <>
              {encounterId && (
                <PlannedReward id={encounterId} pending={pendingReward} onAdd={setReward} />
              )}
              <Textarea
                label={t('session.pending')}
                maxLength={2000}
                value={pendingReward}
                onChange={(e) => setReward(e.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Button variant="light" w="fit-content" onClick={() => setGiving(true)}>
                {t('session.distribute')}
              </Button>
              {delivered && <Text role="status">{t('session.delivered')}</Text>}
              {giving && (
                <QueryFeedback
                  pending={catalogue.isPending}
                  error={catalogue.isError}
                  cause={catalogue.error}
                  retry={() => void catalogue.refetch()}
                />
              )}
              {giving && catalogue.data && (
                <LootDrawer
                  campaignId={campaign.id}
                  items={catalogue.data.filter((item) => !item.archived)}
                  onClose={() => setGiving(false)}
                  onDelivered={() => setDelivered(true)}
                />
              )}
            </>
          )}
          {step === 2 && (
            <>
              <Textarea
                label={t('session.note')}
                description={t('session.private')}
                maxLength={2000}
                autosize
                minRows={3}
                value={privateNote}
                onChange={(e) => setNote(e.currentTarget.value)}
              />
              <Textarea
                label={t('session.scene')}
                maxLength={2000}
                value={nextScene}
                onChange={(e) => setScene(e.currentTarget.value)}
                autosize
                minRows={1}
              />
              <Checkbox
                label={t('session.share')}
                checked={sharing}
                onChange={(e) => setSharing(e.currentTarget.checked)}
              />
              {sharing && (
                <Textarea
                  label={t('session.recap')}
                  description={t('session.audience')}
                  maxLength={2000}
                  value={sharedRecap}
                  onChange={(e) => setRecap(e.currentTarget.value)}
                  autosize
                  minRows={2}
                />
              )}
            </>
          )}
        </Stack>
      </Paper>
      {save.isError && (
        <Alert color="red" role="alert">
          {t('session.error')}{' '}
          <Button variant="subtle" onClick={() => void onReload()}>
            {t('session.reload')}
          </Button>
        </Alert>
      )}
      <Group>
        <Button
          variant="subtle"
          disabled={save.isPending}
          onClick={() => (step === 0 ? onExit(false) : go(step - 1))}
        >
          {t('session.back')}
        </Button>
        <Button
          variant="default"
          disabled={save.isPending}
          onClick={() => {
            if (step === 2) {
              finish(true)
              return
            }
            if (step === 0) setEncounter(base.lastEncounter?.id ?? '')
            if (step === 1) setReward(base.pendingReward)
            go(step + 1)
          }}
        >
          {t(step === 2 ? 'session.skipClose' : 'session.skip')}
        </Button>
        <Button loading={save.isPending} onClick={() => (step === 2 ? finish() : go(step + 1))}>
          {t(step === 2 ? 'session.finish' : 'session.next')}
        </Button>
      </Group>
    </Stack>
  )
}
