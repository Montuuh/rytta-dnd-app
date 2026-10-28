import { lazy, useRef, useState } from 'react'
import { Badge, Button, Group, Modal, Paper, Stack, Text, Title } from '@mantine/core'
const CharacterAssignments = lazy(() =>
  import('@/features/characters').then((module) => ({ default: module.CharacterAssignments })),
)
import { useCampaignView } from '../view-context'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { membersQuery, sentInvitationsQuery, useCampaignAction, type CampaignAction } from '../api'
import { useCampaign } from '../campaign-context'
import { ActionFeedback, QueryFeedback } from './feedback'

export function CampaignMembers() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const user = state.user!
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm'
  const members = useQuery({ ...membersQuery(user.id, campaign.id), enabled: dm })
  const invitations = useQuery({ ...sentInvitationsQuery(user.id, campaign.id), enabled: dm })
  const action = useCampaignAction()
  const trigger = useRef<HTMLElement | null>(null)
  const [confirmation, setConfirmation] = useState<{
    action: CampaignAction
    message: string
  } | null>(null)
  const openConfirmation = (
    next: { action: CampaignAction; message: string },
    target: HTMLElement,
  ) => {
    trigger.current = target
    setConfirmation(next)
  }
  const closeConfirmation = () => setConfirmation(null)
  const lastDm =
    dm &&
    (!members.data || members.isError || members.data.filter((m) => m.role === 'dm').length <= 1)
  return (
    <Stack gap="xl">
      <div>
        <Title order={1}>{t('members.title')}</Title>
        <Text c="dimmed" mt="sm">
          {t(dm ? 'members.intro' : 'members.playerHint')}
        </Text>
      </div>
      <ActionFeedback error={action.error} />
      {dm && (
        <>
          {members.data && !members.isError && (
            <CharacterAssignments campaignId={campaign.id} members={members.data} />
          )}
          <section aria-labelledby="members-heading">
            <Stack>
              <Group justify="space-between">
                <Title id="members-heading" order={2}>
                  {t('members.list')}
                </Title>
                <Button
                  variant="subtle"
                  onClick={() => {
                    void members.refetch()
                    void invitations.refetch()
                  }}
                  loading={members.isFetching}
                >
                  {t('hub.refresh')}
                </Button>
              </Group>
              <QueryFeedback
                pending={members.isPending}
                error={members.isError}
                retry={() => void members.refetch()}
              />
              {!members.isError &&
                members.data?.map((member) => (
                  <Paper key={member.user_id} p="lg">
                    <Stack>
                      <Group justify="space-between" align="flex-start">
                        <div className="member-identity">
                          <Text fw={600} className="user-copy">
                            {member.display_name}
                            {member.user_id === user.id ? ` · ${t('members.you')}` : ''}
                          </Text>
                          <Text size="sm" c="dimmed" className="user-copy">
                            {member.email}
                          </Text>
                        </div>
                        <Badge variant="light">{t(`campaign.role.${member.role}`)}</Badge>
                      </Group>
                      <Group>
                        <Button
                          variant="light"
                          disabled={action.isPending || (member.role === 'dm' && lastDm)}
                          onClick={(event) => {
                            const role = member.role === 'dm' ? 'player' : 'dm'
                            openConfirmation(
                              {
                                action: {
                                  kind: 'member',
                                  campaignId: campaign.id,
                                  userId: member.user_id,
                                  role,
                                },
                                message: t('members.confirmRole', {
                                  name: member.display_name,
                                  role: t(`campaign.role.${role}`),
                                }),
                              },
                              event.currentTarget,
                            )
                          }}
                        >
                          {t(member.role === 'dm' ? 'members.demote' : 'members.promote')}
                        </Button>
                        {member.user_id !== user.id && (
                          <Button
                            variant="subtle"
                            disabled={action.isPending || (member.role === 'dm' && lastDm)}
                            onClick={(event) =>
                              openConfirmation(
                                {
                                  action: {
                                    kind: 'member',
                                    campaignId: campaign.id,
                                    userId: member.user_id,
                                    role: null,
                                  },
                                  message: t('members.confirmRemove', {
                                    name: member.display_name,
                                  }),
                                },
                                event.currentTarget,
                              )
                            }
                          >
                            {t('members.remove')}
                          </Button>
                        )}
                      </Group>
                    </Stack>
                  </Paper>
                ))}
            </Stack>
          </section>
          <section aria-labelledby="sent-heading">
            <Stack>
              <Title order={2} id="sent-heading">
                {t('members.sent')}
              </Title>
              <QueryFeedback
                pending={invitations.isPending}
                error={invitations.isError}
                retry={() => void invitations.refetch()}
              />
              {!invitations.isError &&
                invitations.data &&
                (invitations.data.length ? (
                  invitations.data.map((item) => (
                    <Paper key={item.id} p="lg">
                      <Stack>
                        <Text className="user-copy">{item.email}</Text>
                        <Text size="sm" c="dimmed">
                          {t('hub.expires', {
                            date: new Date(item.expires_at).toLocaleDateString(i18n.language),
                          })}
                        </Text>
                        <Button
                          w="fit-content"
                          variant="subtle"
                          disabled={action.isPending}
                          onClick={(event) =>
                            openConfirmation(
                              {
                                action: { kind: 'revoke', invitationId: item.id },
                                message: t('members.confirmRevoke', { email: item.email }),
                              },
                              event.currentTarget,
                            )
                          }
                        >
                          {t('members.revoke')}
                        </Button>
                      </Stack>
                    </Paper>
                  ))
                ) : (
                  <Text c="dimmed">{t('members.noneSent')}</Text>
                ))}
            </Stack>
          </section>
        </>
      )}
      {!playerPreview && (
        <Paper p="lg">
          <Stack>
            {lastDm && (
              <Text size="sm" c="dimmed">
                {t('members.lastDm')}
              </Text>
            )}
            <Button
              variant="outline"
              disabled={lastDm || action.isPending}
              w="fit-content"
              onClick={(event) =>
                openConfirmation(
                  {
                    action: {
                      kind: 'member',
                      campaignId: campaign.id,
                      userId: user.id,
                      role: null,
                    },
                    message: t('members.confirmLeave'),
                  },
                  event.currentTarget,
                )
              }
            >
              {t('members.leave')}
            </Button>
          </Stack>
        </Paper>
      )}
      <Modal
        opened={!!confirmation}
        onClose={closeConfirmation}
        title={t('members.confirm')}
        returnFocus={false}
        onExitTransitionEnd={() => trigger.current?.focus()}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Stack>
          <Text>{confirmation?.message}</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeConfirmation}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (confirmation) action.mutate(confirmation.action)
                closeConfirmation()
              }}
            >
              {t('action.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
