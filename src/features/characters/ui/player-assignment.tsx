import { useState } from 'react'
import { Alert, Button, Group, Modal, NativeSelect, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery } from '@/features/campaigns'
import { charactersQuery, useCharacterAction } from '../api'
import type { Character } from '../domain/character'

export function PlayerAssignmentEditor({
  character,
  campaignId,
  close,
  complete,
}: {
  character: Character
  campaignId: string
  close: () => void
  complete: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const members = useQuery(membersQuery(state.user!.id, campaignId))
  const characters = useQuery(charactersQuery(state.user!.id, campaignId))
  const action = useCharacterAction(campaignId)
  const [userId, setUserId] = useState('')
  const unlink = character.user_id !== null
  const unavailable =
    members.isPending || members.isError || characters.isPending || characters.isError
  const players = members.data?.filter((member) => member.role === 'player') ?? []
  const eligible = players.filter(
    (member) => !characters.data?.some((item) => item.user_id === member.user_id),
  )
  const current = characters.data?.find((item) => item.id === character.id)
  const changed =
    !characters.isPending && !characters.isError && current?.user_id !== character.user_id
  const title = t(unlink ? 'characters.unassign' : 'characters.assign')
  return (
    <Modal
      opened
      onClose={() => {
        if (!action.isPending) close()
      }}
      title={title}
      returnFocus={false}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        <Text fw={600} className="user-copy">
          {character.name}
        </Text>
        {unlink ? (
          <Text>{t('characters.unassignHint', { name: character.name })}</Text>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {t('characters.assignHint')}
            </Text>
            {unavailable ? (
              members.isError || characters.isError ? (
                <Alert color="red" role="alert">
                  {t('query.error')}
                  <Button
                    variant="subtle"
                    onClick={() => {
                      void members.refetch()
                      void characters.refetch()
                    }}
                  >
                    {t('common.retry')}
                  </Button>
                </Alert>
              ) : (
                <Text role="status">{t('common.loading')}</Text>
              )
            ) : eligible.length > 0 ? (
              <NativeSelect
                data-autofocus
                label={t('characters.player')}
                value={userId}
                onChange={(event) => setUserId(event.currentTarget.value)}
                data={[
                  { value: '', label: t('characters.choosePlayer') },
                  ...eligible.map((member) => ({
                    value: member.user_id,
                    label: `${member.display_name} · ${member.email}`,
                  })),
                ]}
              />
            ) : (
              <Text>
                {t(players.length === 0 ? 'characters.noPlayers' : 'characters.noAvailablePlayers')}
              </Text>
            )}
            <Button
              component={Link}
              to={`/campaign/${campaignId}/members`}
              variant="subtle"
              disabled={action.isPending}
            >
              {t('characters.manageMembers')}
            </Button>
          </>
        )}
        {changed && (
          <Alert role="alert" color="red">
            {t('characters.assignmentChanged')}
          </Alert>
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
            disabled={
              changed ||
              (!unlink && (unavailable || !eligible.some((member) => member.user_id === userId)))
            }
            onClick={() => {
              if (unlink)
                action.mutate(
                  { kind: 'unassign', characterId: character.id, expectedUser: character.user_id! },
                  { onSuccess: complete },
                )
              else if (!unavailable && eligible.some((member) => member.user_id === userId))
                action.mutate(
                  { kind: 'assign', characterId: character.id, userId },
                  { onSuccess: complete },
                )
            }}
          >
            {unlink ? t('action.confirm') : title}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
