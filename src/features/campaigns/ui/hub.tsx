import { useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Inbox, Mail, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { campaignsQuery, invitationsQuery, useCampaignAction } from '../api'
import { createCampaignSchema, type Invitation } from '../domain/campaign'
import { ActionFeedback, QueryFeedback } from './feedback'

export function CampaignHub() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const user = state.user!
  const campaigns = useQuery(campaignsQuery(user.id))
  const invitations = useQuery(invitationsQuery(user.id))
  const action = useCampaignAction()
  const create = useCampaignAction()
  const [opened, setOpened] = useState(false)
  const [decline, setDecline] = useState<Invitation | null>(null)
  const form = useForm({
    initialValues: { name: '', description: '' },
    validate: {
      name: (value) =>
        createCampaignSchema.shape.name.safeParse(value).success ? null : t('hub.invalidName'),
      description: (value) => (value.length <= 2000 ? null : t('hub.invalidDescription')),
    },
  })
  const refresh = () => {
    void campaigns.refetch()
    void invitations.refetch()
  }
  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text className="eyebrow">RYTTA</Text>
          <Title order={1}>{t('hub.title')}</Title>
          <Text c="dimmed" mt="sm">
            {t('hub.intro')}
          </Text>
        </div>
        <Button
          leftSection={<Plus size={18} />}
          onClick={() => {
            create.reset()
            setOpened(true)
          }}
        >
          {t('hub.create')}
        </Button>
      </Group>
      <QueryFeedback pending={campaigns.isPending} error={campaigns.isError} retry={refresh} />
      {!campaigns.isError &&
        campaigns.data &&
        (campaigns.data.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {campaigns.data.map((campaign) => (
              <Paper key={campaign.id} p="lg" className="campaign-card">
                <Stack>
                  <Badge w="fit-content" variant="light">
                    {t(`campaign.role.${campaign.role}`)}
                  </Badge>
                  <Title order={2}>{campaign.name}</Title>
                  {campaign.description && (
                    <Text c="dimmed" className="user-copy">
                      {campaign.description}
                    </Text>
                  )}
                  <Button
                    component={Link}
                    to={`/campaign/${campaign.id}`}
                    rightSection={<ArrowRight size={18} />}
                    variant="light"
                    aria-label={`${t('hub.open')}: ${campaign.name}`}
                  >
                    {t('hub.open')}
                  </Button>
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
        ) : (
          <Paper p="xl">
            <Title order={2}>{t('hub.empty')}</Title>
            <Text c="dimmed" mt="sm">
              {t('hub.emptyHint')}
            </Text>
          </Paper>
        ))}
      <Paper component="section" aria-labelledby="invitations-heading" p={{ base: 'md', sm: 'xl' }}>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-start">
            <Group gap="sm" wrap="nowrap" align="flex-start" className="invitations-heading">
              <ThemeIcon size={44} radius="xl" variant="light">
                <Mail size={22} aria-hidden="true" />
              </ThemeIcon>
              <div>
                <Group gap="xs">
                  <Title order={2} id="invitations-heading">
                    {t('hub.invitations')}
                  </Title>
                  {!!invitations.data?.length && !invitations.isError && (
                    <Badge
                      variant="light"
                      aria-label={t('hub.pendingCount', { count: invitations.data.length })}
                    >
                      {invitations.data.length}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed" mt={4}>
                  {t('hub.joinHint')}
                </Text>
              </div>
            </Group>
            <Button
              variant="default"
              leftSection={<RefreshCw size={16} aria-hidden="true" />}
              onClick={refresh}
              loading={invitations.isFetching || campaigns.isFetching}
            >
              {t('hub.refresh')}
            </Button>
          </Group>
          <ActionFeedback error={action.error} />
          <QueryFeedback
            pending={invitations.isPending}
            error={invitations.isError}
            retry={() => void invitations.refetch()}
          />
          {!invitations.isError &&
            invitations.data &&
            (invitations.data.length ? (
              invitations.data.map((invite) => (
                <Paper key={invite.id} p="lg" className="invitation-card">
                  <Stack>
                    <Title order={3}>{invite.campaign_name}</Title>
                    <Text>{t('characters.invitation', { name: invite.character_name })}</Text>
                    <Text size="sm" c="dimmed">
                      {t('hub.expires', {
                        date: new Date(invite.expires_at).toLocaleDateString(i18n.language),
                      })}
                    </Text>
                    <Group>
                      <Button
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({ kind: 'respond', invitationId: invite.id, accept: true })
                        }
                      >
                        {t('hub.accept')}
                      </Button>
                      <Button
                        variant="subtle"
                        disabled={action.isPending}
                        onClick={() => setDecline(invite)}
                      >
                        {t('hub.decline')}
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              ))
            ) : (
              <Stack gap="xs" align="center" py="lg" className="invitation-empty">
                <ThemeIcon size={52} radius="xl" variant="light">
                  <Inbox size={26} aria-hidden="true" />
                </ThemeIcon>
                <Text fw={600} ta="center">
                  {t('hub.noInvitations')}
                </Text>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                  {t('hub.noInvitationsHint')}
                </Text>
              </Stack>
            ))}
          <Text size="sm" c="dimmed" className="invitation-account user-copy">
            {t('hub.inviteHint', { email: user.email })}
          </Text>
        </Stack>
      </Paper>
      <Modal
        opened={opened}
        onClose={() => {
          if (!create.isPending) setOpened(false)
        }}
        title={t('hub.create')}
        returnFocus
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <form
          onSubmit={form.onSubmit((values) =>
            create.mutate(
              { kind: 'create', ...values },
              {
                onSuccess: () => {
                  setOpened(false)
                  form.reset()
                },
              },
            ),
          )}
        >
          <Stack>
            <Text size="sm" c="dimmed">
              {t('hub.createHint')}
            </Text>
            <TextInput
              label={t('hub.name')}
              required
              maxLength={100}
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
            <ActionFeedback error={create.error} />
            <Group justify="flex-end">
              <Button variant="subtle" disabled={create.isPending} onClick={() => setOpened(false)}>
                {t('action.cancel')}
              </Button>
              <Button type="submit" loading={create.isPending}>
                {t('hub.create')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={!!decline}
        onClose={() => setDecline(null)}
        title={t('members.confirm')}
        returnFocus
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Stack>
          <Text>{t('members.confirmDecline', { name: decline?.campaign_name ?? '' })}</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDecline(null)}>
              {t('action.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (decline)
                  action.mutate({ kind: 'respond', invitationId: decline.id, accept: false })
                setDecline(null)
              }}
            >
              {t('action.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      {campaigns.isRefetchError && <Alert color="red">{t('error.campaigns')}</Alert>}
    </Stack>
  )
}
