import { useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { Link } from 'react-router'
import { membersQuery, sentInvitationsQuery, useCampaignAction, type CampaignAction } from '../api'
import { useCampaign } from '../campaign-context'
import { inviteEmailSchema } from '../domain/campaign'
import { useCampaignView } from '../view-context'
import { ActionFeedback, QueryFeedback } from './feedback'

type Confirmation = { action: CampaignAction; message: string }

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
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const inviteForm = useForm({
    initialValues: { email: '' },
    validate: {
      email: (value) =>
        inviteEmailSchema.safeParse(value.trim().toLowerCase()).success
          ? null
          : t('members.invalidEmail'),
    },
  })
  const openConfirmation = (next: Confirmation, target: HTMLElement) => {
    trigger.current = target
    setConfirmation(next)
  }
  const closeConfirmation = () => setConfirmation(null)
  const restoreTriggerFocus = () => {
    const node = trigger.current
    requestAnimationFrame(() => node?.focus())
  }
  const closeInvite = () => {
    if (!action.isPending) {
      setInviteOpen(false)
      inviteForm.reset()
      restoreTriggerFocus()
    }
  }
  const handleInviteSubmit = inviteForm.onSubmit((values) => {
    action.mutate(
      { kind: 'invite', campaignId: campaign.id, email: values.email },
      {
        onSuccess: () => {
          setInviteOpen(false)
          inviteForm.reset()
        },
      },
    )
  })
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
        {dm && (
          <Button component={Link} to={`/campaign/${campaign.id}/party`} variant="subtle" mt="xs">
            {t('characters.goToParty')}
          </Button>
        )}
      </div>
      <ActionFeedback error={action.error} />
      {dm && (
        <>
          <section aria-labelledby="members-heading">
            <Stack>
              <Group justify="space-between" align="flex-start">
                <Title id="members-heading" order={2}>
                  {t('members.list')}
                </Title>
                <Group>
                  <Button
                    variant="subtle"
                    onClick={() => {
                      void members.refetch()
                      void invitations.refetch()
                    }}
                    loading={members.isFetching || invitations.isFetching}
                  >
                    {t('hub.refresh')}
                  </Button>
                  <Button
                    onClick={(event) => {
                      trigger.current = event.currentTarget
                      action.reset()
                      inviteForm.reset()
                      setInviteOpen(true)
                    }}
                  >
                    {t('members.invite')}
                  </Button>
                </Group>
              </Group>
              <QueryFeedback
                pending={members.isPending}
                error={members.isError}
                retry={() => {
                  void members.refetch()
                }}
              />
              {!members.isError &&
                members.data?.map((member) => {
                  return (
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
                  )
                })}
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
        opened={inviteOpen}
        onClose={closeInvite}
        title={t('members.invite')}
        returnFocus={false}
        onExitTransitionEnd={restoreTriggerFocus}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <form onSubmit={handleInviteSubmit}>
          <Stack>
            <Text size="sm" c="dimmed">
              {t('members.inviteHint')}
            </Text>
            <TextInput
              label={t('members.email')}
              type="email"
              data-autofocus
              {...inviteForm.getInputProps('email')}
            />
            <Text size="sm" c="dimmed">
              {t('members.membershipInvite')}
            </Text>
            {action.isError && (
              <Alert role="alert" color="red">
                {t('characters.unavailable')}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeInvite} disabled={action.isPending}>
                {t('action.cancel')}
              </Button>
              <Button type="submit" loading={action.isPending}>
                {t('members.invite')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={!!confirmation}
        onClose={closeConfirmation}
        title={t('members.confirm')}
        returnFocus={false}
        onExitTransitionEnd={restoreTriggerFocus}
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
