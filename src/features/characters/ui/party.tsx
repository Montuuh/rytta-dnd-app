import { useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { useCampaign } from '@/features/campaigns'
import { charactersQuery, useCharacterAction } from '../api'
import { resourceSchema, type Character } from '../domain/character'

const fields = ['gold', 'water_units', 'rations', 'exhaustion'] as const
type Editor =
  { kind: 'create' } | { kind: 'resources' | 'invite' | 'unassign'; character: Character }

export function CharacterParty() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const dm = campaign.role === 'dm'
  const query = useQuery(charactersQuery(state.user!.id, campaign.id))
  const opener = useRef<HTMLElement | null>(null)
  const open = (next: Editor, target: HTMLElement) => {
    opener.current = target
    setEditor(next)
  }
  const close = () => {
    setEditor(null)
    requestAnimationFrame(() => opener.current?.focus())
  }
  const [editor, setEditor] = useState<Editor | null>(null)
  const [notice, setNotice] = useState<'characters.saved' | 'characters.invited' | null>(null)
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="start">
        <div>
          <Title order={1}>{t('characters.title')}</Title>
          <Text c="dimmed" mt="sm">
            {t(dm ? 'characters.intro' : 'characters.playerIntro')}
          </Text>
        </div>
        {dm && (
          <Button onClick={(event) => open({ kind: 'create' }, event.currentTarget)}>
            {t('characters.create')}
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        {t('characters.rules')}
      </Text>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {query.dataUpdatedAt > 0 &&
            t('characters.updated', {
              time: new Date(query.dataUpdatedAt).toLocaleTimeString(i18n.language),
            })}
        </Text>
        <Button variant="subtle" loading={query.isFetching} onClick={() => void query.refetch()}>
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
                <div>
                  <Title order={2} className="user-copy">
                    {character.name}
                  </Title>
                  <Badge mt="sm" variant="light">
                    {t(
                      character.user_id
                        ? dm
                          ? 'characters.assigned'
                          : 'characters.you'
                        : 'characters.unassigned',
                    )}
                  </Badge>
                </div>
                <SimpleGrid cols={2}>
                  {fields.map((field) => (
                    <div
                      key={field}
                      className={`resource-cell ${character.character_resources[field] >= 1_000_000_000 ? 'resource-cell-wide' : ''}`}
                    >
                      <Text size="sm" c="dimmed">
                        {t(`characters.${field}`)}
                      </Text>
                      <Text fw={600} size="xl" className="resource-value">
                        {character.character_resources[field].toLocaleString(i18n.language)}
                      </Text>
                    </div>
                  ))}
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
                    <Button
                      variant="subtle"
                      onClick={(event) =>
                        open(
                          { kind: character.user_id ? 'unassign' : 'invite', character },
                          event.currentTarget,
                        )
                      }
                    >
                      {t(character.user_id ? 'characters.unassign' : 'characters.invite')}
                    </Button>
                  </Group>
                )}
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
      {editor && (
        <CharacterEditor
          editor={editor}
          campaignId={campaign.id}
          close={close}
          complete={(kind) => {
            close()
            setNotice(
              kind === 'resources'
                ? 'characters.saved'
                : kind === 'invite'
                  ? 'characters.invited'
                  : null,
            )
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
  const [requestId] = useState(() => crypto.randomUUID())
  const form = useForm({
    initialValues: {
      name: '',
      email: '',
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
  const title = t(
    editor.kind === 'create'
      ? 'characters.create'
      : editor.kind === 'invite'
        ? 'characters.invite'
        : editor.kind === 'unassign'
          ? 'characters.unassign'
          : 'characters.edit',
  )
  return (
    <Modal
      opened
      onClose={() => {
        if (!action.isPending) close()
      }}
      title={title}
      returnFocus
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={form.onSubmit((values) => {
          const options = { onSuccess: () => complete(editor.kind) }
          if (editor.kind === 'create')
            action.mutate({ kind: 'create', name: values.name }, options)
          else if (editor.kind === 'invite')
            action.mutate(
              { kind: 'invite', characterId: editor.character.id, email: values.email },
              options,
            )
          else if (editor.kind === 'unassign')
            action.mutate(
              {
                kind: 'unassign',
                characterId: editor.character.id,
                expectedUser: editor.character.user_id!,
              },
              options,
            )
          else
            action.mutate(
              { kind: 'resources', characterId: editor.character.id, values, requestId },
              options,
            )
        })}
      >
        <Stack>
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
          {editor.kind === 'invite' && (
            <>
              <Text size="sm" c="dimmed">
                {t('characters.inviteHint')}
              </Text>
              <TextInput
                data-autofocus
                required
                type="email"
                maxLength={254}
                label={t('members.email')}
                {...form.getInputProps('email')}
              />
            </>
          )}
          {editor.kind === 'unassign' && (
            <Text>{t('characters.unassignHint', { name: editor.character.name })}</Text>
          )}
          {editor.kind === 'resources' &&
            fields.map((field, index) => (
              <NumberInput
                key={field}
                data-autofocus={index === 0 || undefined}
                label={t(`characters.${field}`)}
                required
                min={0}
                max={field === 'gold' ? Number.MAX_SAFE_INTEGER : 2147483647}
                allowDecimal={false}
                hideControls
                {...form.getInputProps(field)}
              />
            ))}
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
              {editor.kind === 'resources'
                ? t('characters.save')
                : editor.kind === 'unassign'
                  ? t('action.confirm')
                  : title}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
