import { useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Modal,
  NativeSelect,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { assignmentsQuery, useCharacterAction } from '../api'
import { useAuth } from '@/features/auth'

type Member = { user_id: string; email: string; display_name: string; role: string }
export function CharacterAssignments({
  campaignId,
  members,
}: {
  campaignId: string
  members: Member[]
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const query = useQuery(assignmentsQuery(state.user!.id, campaignId))
  const action = useCharacterAction(campaignId)
  const [target, setTarget] = useState<{ id: string; name: string; user_id: string | null } | null>(
    null,
  )
  const [email, setEmail] = useState('')
  const [player, setPlayer] = useState('')
  const trigger = useRef<HTMLElement | null>(null)
  const close = () => {
    if (!action.isPending) {
      setTarget(null)
      requestAnimationFrame(() => trigger.current?.focus())
    }
  }
  return (
    <Stack>
      <Title order={2}>{t('shell.link')}</Title>
      {query.isPending && <Text role="status">{t('common.loading')}</Text>}
      {query.isError && (
        <Alert color="red">
          {t('query.error')}
          <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
        </Alert>
      )}
      {!query.isError && (
        <>
          {members.map((member) => (
            <Text key={member.user_id} className="user-copy">
              {member.display_name}:{' '}
              {query.data?.find((c) => c.user_id === member.user_id)?.name ??
                t('shell.noCharacter')}
            </Text>
          ))}
          {query.data?.map((character) => (
            <Paper key={character.id} p="md">
              <Group justify="space-between">
                <div>
                  <Text fw={600} className="user-copy">
                    {character.name}
                  </Text>
                  <Text size="sm" c="dimmed" className="user-copy">
                    {character.user_id
                      ? (members.find((m) => m.user_id === character.user_id)?.display_name ??
                        t('characters.assigned'))
                      : t('characters.unassigned')}
                  </Text>
                </div>
                <Button
                  variant="light"
                  onClick={(event) => {
                    trigger.current = event.currentTarget
                    action.reset()
                    setEmail('')
                    setPlayer('')
                    setTarget(character)
                  }}
                >
                  {t(character.user_id ? 'characters.unassign' : 'shell.link')}
                </Button>
              </Group>
            </Paper>
          ))}
          {query.data?.length === 0 && <Text>{t('characters.empty')}</Text>}
        </>
      )}
      <Modal
        opened={!!target}
        onClose={close}
        title={t(target?.user_id ? 'characters.unassign' : 'shell.link')}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
        returnFocus={false}
      >
        <Stack>
          <Text fw={600} className="user-copy">
            {target?.name}
          </Text>
          {target?.user_id ? (
            <Text>{t('characters.unassignHint', { name: target.name })}</Text>
          ) : (
            <>
              <NativeSelect
                label={t('shell.choosePlayer')}
                value={player}
                onChange={(event) => {
                  setPlayer(event.currentTarget.value)
                  setEmail('')
                }}
                data={[
                  { value: '', label: t('shell.choosePlayer') },
                  ...members
                    .filter(
                      (m) =>
                        m.role === 'player' && !query.data?.some((c) => c.user_id === m.user_id),
                    )
                    .map((m) => ({ value: m.user_id, label: m.display_name })),
                ]}
              />
              <Text size="sm" c="dimmed">
                {t('characters.inviteHint')}
              </Text>
              <TextInput
                label={t('members.email')}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.currentTarget.value)
                  setPlayer('')
                }}
              />
            </>
          )}
          {action.isError && (
            <Alert role="alert" color="red">
              {t('characters.unavailable')}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close} disabled={action.isPending}>
              {t('action.cancel')}
            </Button>
            <Button
              loading={action.isPending}
              disabled={!target?.user_id && !player && !email.trim()}
              onClick={() => {
                if (!target) return
                action.mutate(
                  target.user_id
                    ? { kind: 'unassign', characterId: target.id, expectedUser: target.user_id }
                    : player
                      ? { kind: 'assign', characterId: target.id, userId: player }
                      : { kind: 'invite', characterId: target.id, email },
                  {
                    onSuccess: () => {
                      setTarget(null)
                      requestAnimationFrame(() => trigger.current?.focus())
                    },
                  },
                )
              }}
            >
              {t(target?.user_id ? 'action.confirm' : player ? 'shell.link' : 'characters.invite')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
