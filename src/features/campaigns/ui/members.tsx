import { useState } from 'react'
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
import { membersQuery, sentInvitationsQuery, useCampaignAction, type CampaignAction } from '../api'
import { inviteEmailSchema } from '../domain/campaign'
import { useCampaign } from '../campaign-context'
import { ActionFeedback, QueryFeedback } from './feedback'

export function CampaignMembers() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const user = state.user!
  const campaign = useCampaign()
  const dm = campaign.role === 'dm'
  const members = useQuery({ ...membersQuery(user.id, campaign.id), enabled: dm })
  const invitations = useQuery({ ...sentInvitationsQuery(user.id, campaign.id), enabled: dm })
  const action = useCampaignAction()
  const invite = useCampaignAction()
  const [confirmation, setConfirmation] = useState<{
    action: CampaignAction
    message: string
  } | null>(null)
  const form = useForm({
    initialValues: { email: '' },
    validate: {
      email: (value) =>
        inviteEmailSchema.safeParse(value.trim()).success ? null : t('members.invalidEmail'),
    },
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
      </div>
      <ActionFeedback error={action.error} />
      {dm && (
        <>
          <Paper p="lg">
            <form
              onSubmit={form.onSubmit(({ email }) =>
                invite.mutate(
                  { kind: 'invite', campaignId: campaign.id, email },
                  { onSuccess: () => form.reset() },
                ),
              )}
            >
              <Stack>
                <Title order={2}>{t('members.invite')}</Title>
                <TextInput
                  label={t('members.email')}
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  {...form.getInputProps('email')}
                />
                <Text size="sm" c="dimmed">
                  {t('members.inviteHint')}
                </Text>
                <ActionFeedback error={invite.error} />
                {invite.isSuccess && <Alert role="status">{t('members.invited')}</Alert>}
                <Button type="submit" loading={invite.isPending} w="fit-content">
                  {t('members.invite')}
                </Button>
              </Stack>
            </form>
          </Paper>
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
                          onClick={() => {
                            const role = member.role === 'dm' ? 'player' : 'dm'
                            setConfirmation({
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
                            })
                          }}
                        >
                          {t(member.role === 'dm' ? 'members.demote' : 'members.promote')}
                        </Button>
                        {member.user_id !== user.id && (
                          <Button
                            variant="subtle"
                            disabled={action.isPending || (member.role === 'dm' && lastDm)}
                            onClick={() =>
                              setConfirmation({
                                action: {
                                  kind: 'member',
                                  campaignId: campaign.id,
                                  userId: member.user_id,
                                  role: null,
                                },
                                message: t('members.confirmRemove', { name: member.display_name }),
                              })
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
                          onClick={() =>
                            setConfirmation({
                              action: { kind: 'revoke', invitationId: item.id },
                              message: t('members.confirmRevoke', { email: item.email }),
                            })
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
            onClick={() =>
              setConfirmation({
                action: { kind: 'member', campaignId: campaign.id, userId: user.id, role: null },
                message: t('members.confirmLeave'),
              })
            }
          >
            {t('members.leave')}
          </Button>
        </Stack>
      </Paper>
      <Modal
        opened={!!confirmation}
        onClose={() => setConfirmation(null)}
        title={t('members.confirm')}
        returnFocus
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Stack>
          <Text>{confirmation?.message}</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirmation(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (confirmation) action.mutate(confirmation.action)
                setConfirmation(null)
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
