import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
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
import { ArrowRight, Check, Ellipsis, Inbox, Mail, Plus, RefreshCw } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PageHead } from '@/shared/ui/page-head'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useAuth } from '@/features/auth'
import { campaignsQuery, invitationsQuery, membersQuery, useCampaignAction } from '../api'
import {
  createCampaignSchema,
  leaveBlock,
  leftCampaignState,
  type Campaign,
  type Invitation,
} from '../domain/campaign'
import { ActionFeedback, QueryFeedback } from './feedback'
import { LeaveCampaignDialog, LeaveCampaignItem } from './leave'

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
  // RYT-095: the dialog lives here, not in the card, which leaves the list on success.
  const [leaving, setLeaving] = useState<{ campaign: Campaign; trigger: HTMLElement } | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const incoming = leftCampaignState.safeParse(location.state).data?.leftCampaign
  const [left, setLeft] = useState(incoming)
  const [seenKey, setSeenKey] = useState(location.key)
  // A later departure while this page stays mounted arrives with a new history entry.
  if (incoming && location.key !== seenKey) {
    setSeenKey(location.key)
    setLeft(incoming)
  }
  const leftRef = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // The outcome is kept here and dropped from history at once, so a reload does not repeat it.
  useEffect(() => {
    if (incoming) void navigate(location.pathname, { replace: true, state: null })
  }, [incoming, location.pathname, navigate])
  // The outcome takes focus after the layout has moved focus to the page on navigation.
  useEffect(() => {
    if (!left) return
    const frame = requestAnimationFrame(() => leftRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [left, location.key])
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
      <PageHead
        title={t('hub.title')}
        headingRef={heading}
        actions={
          <Button
            leftSection={<Plus size={18} aria-hidden="true" />}
            onClick={() => {
              create.reset()
              setOpened(true)
            }}
          >
            {t('hub.create')}
          </Button>
        }
      />
      {left && (
        <Alert
          ref={leftRef}
          tabIndex={-1}
          role="status"
          className="campaign-left user-copy"
          icon={<Check size={18} aria-hidden="true" />}
          withCloseButton
          closeButtonLabel={t('common.close')}
          onClose={() => {
            setLeft(undefined)
            focusWhenReady(() => heading.current)
          }}
        >
          {t('hub.left', { name: left })}
        </Alert>
      )}
      <QueryFeedback pending={campaigns.isPending} error={campaigns.isError} retry={refresh} />
      {!campaigns.isError &&
        campaigns.data &&
        (campaigns.data.length ? (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {campaigns.data.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                userId={user.id}
                onLeave={(trigger) => setLeaving({ campaign, trigger })}
              />
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
                <Group gap="xs" wrap="nowrap" align="center">
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
              className="invitations-refresh"
              leftSection={<RefreshCw size={16} aria-hidden="true" />}
              onClick={refresh}
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
                    <Text>
                      {invite.character_name
                        ? t('characters.invitation', { name: invite.character_name })
                        : t('members.membershipInvite')}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t('hub.expires', {
                        date: new Date(invite.expires_at).toLocaleDateString(i18n.language),
                      })}
                    </Text>
                    <Group className="invite-actions">
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
                        color="red"
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
      {leaving && (
        <LeaveCampaignDialog
          campaign={leaving.campaign}
          onClose={() => {
            const { trigger } = leaving
            setLeaving(null)
            focusWhenReady(() => trigger)
          }}
          onLeft={() => setLeaving(null)}
        />
      )}
      {campaigns.isRefetchError && <Alert color="red">{t('error.campaigns')}</Alert>}
    </Stack>
  )
}

/** One campaign: its role, name and description, Open, and a ⋯ menu with Open and Leave. A DM's
 * member list loads when the menu opens, to tell the only DM why they cannot leave yet. */
function CampaignCard({
  campaign,
  userId,
  onLeave,
}: {
  campaign: Campaign
  userId: string
  onLeave: (trigger: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const [menuOpened, setMenuOpened] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const members = useQuery({
    ...membersQuery(userId, campaign.id),
    enabled: menuOpened && campaign.role === 'dm',
  })
  const more = t('hub.more', { name: campaign.name })
  return (
    <Paper p="lg" className="campaign-card">
      <Stack h="100%">
        <div className="campaign-card-head">
          <Badge variant="light">{t(`campaign.role.${campaign.role}`)}</Badge>
          <Menu
            opened={menuOpened}
            onChange={setMenuOpened}
            position="bottom-end"
            withinPortal
            withInitialFocusPlaceholder={false}
          >
            <Menu.Target>
              <ActionIcon ref={trigger} variant="subtle" size={44} aria-label={more} title={more}>
                <Ellipsis size={20} aria-hidden="true" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                component={Link}
                to={`/campaign/${campaign.id}`}
                leftSection={<ArrowRight size={18} aria-hidden="true" />}
              >
                {t('hub.open')}
              </Menu.Item>
              <Menu.Divider />
              <LeaveCampaignItem
                block={leaveBlock(campaign.role, members.data, members.isError)}
                onSelect={() => trigger.current && onLeave(trigger.current)}
              />
            </Menu.Dropdown>
          </Menu>
        </div>
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
  )
}
