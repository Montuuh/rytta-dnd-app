import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Modal } from '@/shared/ui/overlays'
import { Skeleton } from '@/shared/ui/kit/skeleton'
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
 * Creating a campaign: its name and (RYT-167, owner choice P2 A) the packs it uses per category,
 * with the SRD and the Rytta basics ticked. RYT-184 (finding 22): one step; the content is one
 * line until "Change" opens the checkboxes. The campaign pins the versions chosen.
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
  const [picked, setPicked] = useState<Set<string> | null>(null)
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
  const reset = () => {
    form.reset()
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
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (form.validate().hasErrors || !choices.data) return
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
          <Text size="sm" c="dimmed">
            {t('hub.createHint')}
          </Text>
          <TextInput
            label={t('hub.name')}
            required
            maxLength={100}
            enterKeyHint="done"
            data-autofocus
            {...form.getInputProps('name')}
          />
          <Textarea
            label={t('hub.description')}
            maxLength={2000}
            autosize
            minRows={2}
            {...form.getInputProps('description')}
          />
          {choices.isPending && (
            <Skeleton
              role="status"
              aria-label={t('campaignContent.choice.loading')}
              className="tw:h-11 tw:w-full"
            />
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
            <ContentChoiceFields
              choices={choices.data}
              value={value}
              onChange={setPicked}
              userId={state.user?.id}
            />
          )}
          <div ref={failure}>
            <ActionFeedback error={create.error} />
          </div>
          <Group justify="flex-end">
            <Button variant="subtle" disabled={create.isPending} onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!choices.data}>
              {t('hub.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
