import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Modal } from '@/shared/ui/overlays'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  ContentChoiceFields,
  chosenContent,
  contentChoicesQuery,
  defaultChoice,
} from '@/features/campaign-content'
import { useCampaignAction } from '../api'
import { createCampaignSchema } from '../domain/campaign'
import { ActionFeedback } from './feedback'

/**
 * Creating a campaign: its name, then (RYT-167, owner choice P2 A) the packs it uses per category,
 * with the SRD and the Rytta basics ticked. The campaign pins the versions chosen.
 */
export function CreateCampaignDialog({
  opened,
  onClose,
}: {
  opened: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const create = useCampaignAction()
  const [step, setStep] = useState<'details' | 'content'>('details')
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const contentTitle = useRef<HTMLHeadingElement>(null)
  const failure = useRef<HTMLDivElement>(null)
  const choices = useQuery({
    ...contentChoicesQuery(state.user?.id ?? ''),
    enabled: opened && Boolean(state.user),
  })
  const value = picked ?? (choices.data ? defaultChoice(choices.data) : new Set<string>())
  const form = useForm({
    initialValues: { name: '', description: '' },
    validate: {
      name: (name) =>
        createCampaignSchema.shape.name.safeParse(name).success ? null : t('hub.invalidName'),
      description: (description) =>
        description.length <= 2000 ? null : t('hub.invalidDescription'),
    },
  })
  // A refused creation is named where the phone shows it, above the buttons.
  useEffect(() => {
    if (create.error) failure.current?.scrollIntoView({ block: 'nearest' })
  }, [create.error])
  const close = () => {
    if (create.isPending) return
    onClose()
  }
  const toContent = () => {
    setStep('content')
    requestAnimationFrame(() => contentTitle.current?.focus())
  }
  const reset = () => {
    form.reset()
    setStep('details')
    setPicked(null)
    create.reset()
  }
  return (
    <Modal
      opened={opened}
      onClose={close}
      onExitTransitionEnd={reset}
      title={t('hub.create')}
      returnFocus
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      {step === 'details' ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!form.validate().hasErrors) toContent()
          }}
        >
          <Stack>
            <Text size="sm" c="dimmed">
              {t('hub.createHint')}
            </Text>
            <TextInput
              label={t('hub.name')}
              required
              maxLength={100}
              enterKeyHint="next"
              data-autofocus
              {...form.getInputProps('name')}
            />
            <Textarea
              label={t('hub.description')}
              maxLength={2000}
              autosize
              minRows={3}
              {...form.getInputProps('description')}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={close}>
                {t('action.cancel')}
              </Button>
              <Button type="submit">{t('hub.createNext')}</Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!choices.data) return
            create.mutate(
              {
                kind: 'create',
                ...form.values,
                chosen: chosenContent(choices.data, value),
              },
              { onSuccess: () => onClose() },
            )
          }}
        >
          <Stack>
            <div>
              <h3 ref={contentTitle} tabIndex={-1} className="hub-create-step">
                {t('campaignContent.choice.title')}
              </h3>
              <Text size="sm" c="dimmed">
                {t('campaignContent.choice.hint')}
              </Text>
            </div>
            {choices.isPending && (
              <Group gap="xs" role="status">
                <Loader size="xs" aria-hidden="true" />
                <Text size="sm">{t('campaignContent.choice.loading')}</Text>
              </Group>
            )}
            {choices.isError && (
              <Alert color="red" role="alert">
                {t('campaignContent.choice.error')}{' '}
                <Button variant="subtle" onClick={() => void choices.refetch()}>
                  {t('common.retry')}
                </Button>
              </Alert>
            )}
            {choices.data && (
              <ContentChoiceFields choices={choices.data} value={value} onChange={setPicked} />
            )}
            {choices.data && choices.data.length > 0 && value.size === 0 && (
              <Text size="sm" role="status">
                {t('campaignContent.choice.nothing')}
              </Text>
            )}
            <div ref={failure}>
              <ActionFeedback error={create.error} />
            </div>
            <Group justify="space-between">
              <Button
                variant="subtle"
                disabled={create.isPending}
                onClick={() => setStep('details')}
              >
                {t('hub.createBack')}
              </Button>
              <Button type="submit" loading={create.isPending} disabled={!choices.data}>
                {t('hub.create')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  )
}
