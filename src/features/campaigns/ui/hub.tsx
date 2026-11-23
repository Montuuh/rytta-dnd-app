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
  Title,
} from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, Copy, Ellipsis, LogOut, Plus, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PageHead } from '@/shared/ui/page-head'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { ArtPlate } from '@/shared/ui/art'
import { artUrl, pickByKey } from '@/shared/ui/art-url'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { useAuth } from '@/features/auth'
import { SupervisedCampaigns, useAdminStatus } from '@/features/admin'
import { config } from '@/shared/lib/config'
import { campaignsQuery, invitationsQuery, membersQuery, useCampaignAction } from '../api'
import {
  leaveBlock,
  leftCampaignState,
  MembershipError,
  type Campaign,
  type Invitation,
} from '../domain/campaign'
import { readCampaignVisit } from '../domain/recent-campaign'
import { QueryFeedback } from './feedback'
import { showsData } from './load-cause'
import { StaleLine } from './stale-line'
import { LeaveCampaignDialog, LeaveCampaignItem } from './leave'
import { CreateCampaignDialog } from './create-campaign'
import './hub.css'

const covers = [
  'forest',
  'mountains',
  'coast',
  'desert',
  'underdark',
  'frost',
  'swamp',
  'city',
] as const

/** A cover per campaign, stable for a given id; neighbours in the grid never share one. */
function coversFor(campaigns: readonly Campaign[]) {
  const picked: number[] = []
  for (const [position, campaign] of campaigns.entries()) {
    let index = pickByKey(
      campaign.id,
      covers.map((_, at) => at),
    )
    // A two-column grid puts the previous two entries next to this one.
    while (picked.slice(-2).includes(index)) index = (index + 1) % covers.length
    picked[position] = index
  }
  return picked.map((index) => covers[index]!)
}

/** "Expires today" or tomorrow when it is near, the date otherwise. */
function expiryText(iso: string, t: TFunction, language: string) {
  const expires = new Date(iso)
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const days = Math.floor((expires.getTime() - midnight.getTime()) / 86_400_000)
  if (days <= 0) return t('hub.expiresToday')
  if (days === 1) return t('hub.expiresTomorrow')
  return t('hub.expires', { date: expires.toLocaleDateString(language) })
}

type Notice =
  { kind: 'left' | 'declined'; name: string } | { kind: 'joined'; name: string; id: string }

/** The account's email with a copy button: it is what a DM needs to send an invitation. */
function EmailCopy({ email }: { email: string }) {
  const { t } = useTranslation()
  const clipboard = useClipboard({ timeout: 2000 })
  return (
    <div className="hub-email">
      <Text className="hub-email-address user-copy" fw={600}>
        {email}
      </Text>
      <Button
        variant="default"
        leftSection={
          clipboard.copied ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )
        }
        onClick={() => clipboard.copy(email)}
      >
        {clipboard.copied ? t('hub.copiedEmail') : t('hub.copyEmail')}
      </Button>
      <span className="visually-hidden" role="status">
        {clipboard.copied ? t('hub.copiedEmail') : ''}
      </span>
    </div>
  )
}

/**
 * RYT-148: with no campaign and no invitation, the account in use is the likely problem. Say which
 * one it is, copy it for the DM, switch to another in one action, and reach the contact.
 */
function SignedInAccount({
  email,
  switchAccount,
}: {
  email: string
  switchAccount: () => unknown
}) {
  const { t } = useTranslation()
  const clipboard = useClipboard({ timeout: 2000 })
  const contact = config.VITE_CONTACT_EMAIL
  return (
    <Stack gap={6} className="hub-account">
      <Text size="sm" c="dimmed">
        {t('hub.signedInAs')}
      </Text>
      <Text className="hub-email-address user-copy" fw={600}>
        {email}
      </Text>
      <Group gap="xs" className="hub-account-actions">
        <Button
          variant="default"
          leftSection={
            clipboard.copied ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )
          }
          onClick={() => clipboard.copy(email)}
        >
          {clipboard.copied ? t('hub.copiedEmail') : t('hub.copyEmail')}
        </Button>
        <Button
          variant="subtle"
          leftSection={<LogOut size={18} aria-hidden="true" />}
          onClick={() => void switchAccount()}
        >
          {t('hub.switchAccount')}
        </Button>
      </Group>
      <span className="visually-hidden" role="status">
        {clipboard.copied ? t('hub.copiedEmail') : ''}
      </span>
      {contact && (
        <a className="hub-contact" href={`mailto:${contact}`}>
          {t('hub.contact')}
        </a>
      )}
    </Stack>
  )
}

/** Why answering an invitation failed, in one short line; a retry unless the invitation is gone. */
function RespondError({ error, retry }: { error: Error | null; retry: () => void }) {
  const { t } = useTranslation()
  if (!error) return null
  const reason = error instanceof MembershipError ? error.reason : null
  const gone = reason === 'invitation-unavailable'
  let text: string = t('hub.respondFailed')
  if (error.message === 'Offline') text = t('hub.respondOffline')
  else if (gone) text = t('action.invitation-unavailable')
  return (
    <Alert color="red" role="alert">
      <Text size="sm" mb={gone ? 0 : 'sm'}>
        {text}
      </Text>
      {!gone && (
        <Button variant="default" onClick={retry}>
          {t('common.retry')}
        </Button>
      )}
    </Alert>
  )
}

export function CampaignHub() {
  const { t, i18n } = useTranslation()
  const { state, controller } = useAuth()
  const user = state.user!
  const campaignsQueryResult = useQuery(campaignsQuery(user.id))
  // RYT-153: a campaign entered from Administration is supervised, not one of mine.
  const adminAccess = useAdminStatus().data?.access
  const adminIds = new Set((adminAccess ?? []).map((access) => access.campaign_id))
  const campaigns = {
    ...campaignsQueryResult,
    data: campaignsQueryResult.data?.filter((campaign) => !adminIds.has(campaign.id)),
  }
  const invitations = useQuery(invitationsQuery(user.id))
  const respond = useCampaignAction()
  const [opened, setOpened] = useState(false)
  const [decline, setDecline] = useState<Invitation | null>(null)
  // RYT-095: the dialog lives here, not in the card, which leaves the list on success.
  const [leaving, setLeaving] = useState<{ campaign: Campaign; trigger: HTMLElement } | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const incoming = leftCampaignState.safeParse(location.state).data?.leftCampaign
  const [notice, setNotice] = useState<Notice | undefined>(
    incoming ? { kind: 'left', name: incoming } : undefined,
  )
  const [seenKey, setSeenKey] = useState(location.key)
  // A later departure while this page stays mounted arrives with a new history entry.
  if (incoming && location.key !== seenKey) {
    setSeenKey(location.key)
    setNotice({ kind: 'left', name: incoming })
  }
  const noticeRef = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // The outcome is kept here and dropped from history at once, so a reload does not repeat it.
  useEffect(() => {
    if (incoming) void navigate(location.pathname, { replace: true, state: null })
  }, [incoming, location.pathname, navigate])
  // The outcome takes focus after the layout has moved focus to the page on navigation, and after
  // an answered invitation removed the button that had it.
  useEffect(() => {
    if (!notice) return
    const frame = requestAnimationFrame(() => noticeRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [notice, location.key])
  const refresh = () => {
    void campaigns.refetch()
    void invitations.refetch()
  }
  const startCreate = () => setOpened(true)
  const closeDecline = () => {
    if (respond.isPending) return
    respond.reset()
    setDecline(null)
  }
  useBackToClose(!!decline, closeDecline)
  // The retry repeats the last answer with the same outcome handling.
  const lastAnswer = useRef<{ invite: Invitation; accept: boolean } | null>(null)
  const answer = (invite: Invitation, accept: boolean) => {
    lastAnswer.current = { invite, accept }
    respond.mutate(
      { kind: 'respond', invitationId: invite.id, accept },
      {
        onSuccess: () => {
          setDecline(null)
          setNotice(
            accept
              ? { kind: 'joined', name: invite.campaign_name, id: invite.campaign_id }
              : { kind: 'declined', name: invite.campaign_name },
          )
        },
        onError: (error) => {
          // The invitation is gone: drop its card and say so where the card was.
          if (error instanceof MembershipError && error.reason === 'invitation-unavailable') {
            setDecline(null)
            void invitations.refetch()
          }
        },
      },
    )
  }
  const retryAnswer = () => {
    const last = lastAnswer.current
    if (last) answer(last.invite, last.accept)
  }
  const pendingInvites = showsData(invitations) ? (invitations.data ?? []) : []
  const invitesPending = pendingInvites.length > 0
  // With no campaign and no invitation the empty state owns the one instruction and the create action.
  const showEmpty =
    !campaigns.isError && campaigns.data?.length === 0 && invitations.isSuccess && !invitesPending
  // A pending invitation is the first thing to do; creating a campaign steps back.
  const createVariant = invitesPending ? 'default' : 'filled'
  const coverList = coversFor(campaigns.data ?? [])
  const invitationsPanel = (
    <Paper component="section" aria-labelledby="invitations-heading" p={{ base: 'md', sm: 'xl' }}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
          <div className="invitations-heading">
            <Group gap="xs" wrap="nowrap" align="center">
              <Title order={2} id="invitations-heading">
                {t('hub.invitations')}
              </Title>
              {invitesPending && (
                <Badge
                  variant="light"
                  aria-label={t('hub.pendingCount', { count: pendingInvites.length })}
                >
                  {pendingInvites.length}
                </Badge>
              )}
            </Group>
            {invitesPending && (
              <Text size="sm" c="dimmed" mt={4}>
                {t('hub.joinHint')}
              </Text>
            )}
          </div>
          <RefreshControl
            onRefresh={refresh}
            fetching={campaigns.isFetching || invitations.isFetching}
            updatedAt={Math.max(campaigns.dataUpdatedAt, invitations.dataUpdatedAt)}
          />
        </Group>
        {!decline && <RespondError error={respond.error} retry={retryAnswer} />}
        <QueryFeedback
          pending={invitations.isPending}
          error={!showsData(invitations)}
          retry={() => void invitations.refetch()}
          cause={invitations.error}
          secondary
        />
        {invitations.data !== undefined &&
          showsData(invitations) &&
          (invitesPending ? (
            pendingInvites.map((invite) => {
              const answering =
                respond.isPending &&
                respond.variables?.kind === 'respond' &&
                respond.variables.invitationId === invite.id
              return (
                <Paper key={invite.id} p="lg" className="invitation-card">
                  <Stack>
                    <Title order={3} className="user-copy">
                      {invite.campaign_name}
                    </Title>
                    <Text>
                      {invite.character_name
                        ? t('hub.invitationCharacter', { name: invite.character_name })
                        : t('hub.membershipInvite')}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {expiryText(invite.expires_at, t, i18n.language)}
                    </Text>
                    <Group className="invite-actions">
                      <Button
                        aria-label={t('hub.acceptLabel', { name: invite.campaign_name })}
                        loading={answering}
                        disabled={respond.isPending}
                        onClick={() => answer(invite, true)}
                      >
                        {t('hub.accept')}
                      </Button>
                      <Button
                        variant="subtle"
                        color="red"
                        aria-label={t('hub.declineLabel', { name: invite.campaign_name })}
                        disabled={respond.isPending}
                        onClick={() => {
                          respond.reset()
                          setDecline(invite)
                        }}
                      >
                        {t('hub.decline')}
                      </Button>
                    </Group>
                  </Stack>
                </Paper>
              )
            })
          ) : (
            <div className="invitation-empty">
              <ArtPlate name="empty/invitations" size={96} />
              <Stack gap="xs">
                <Text fw={600}>{t('hub.noInvitations')}</Text>
                <Text size="sm" c="dimmed">
                  {t('hub.emptyHint')}
                </Text>
                <EmailCopy email={user.email} />
              </Stack>
            </div>
          ))}
      </Stack>
    </Paper>
  )
  return (
    <Stack gap="xl">
      <PageHead
        title={t('hub.title')}
        headingRef={heading}
        actions={
          showEmpty ? undefined : (
            <Button
              variant={createVariant}
              leftSection={<Plus size={18} aria-hidden="true" />}
              onClick={startCreate}
            >
              {t('hub.create')}
            </Button>
          )
        }
      />
      {notice && (
        <Alert
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          className="campaign-left user-copy"
          icon={<Check size={18} aria-hidden="true" />}
          withCloseButton
          closeButtonLabel={t('common.close')}
          onClose={() => {
            setNotice(undefined)
            focusWhenReady(() => heading.current)
          }}
        >
          <div className="campaign-left-line">
            <span>{t(`hub.${notice.kind}`, { name: notice.name })}</span>
            {notice.kind === 'joined' && (
              <Button
                component={Link}
                to={`/campaign/${notice.id}`}
                variant="default"
                rightSection={<ArrowRight size={18} aria-hidden="true" />}
              >
                {t('hub.open')}
              </Button>
            )}
          </div>
        </Alert>
      )}
      <StaleLine queries={[campaigns, invitations]} />
      {invitesPending && invitationsPanel}
      <QueryFeedback
        pending={campaigns.isPending}
        error={!showsData(campaigns)}
        retry={refresh}
        cause={campaigns.error}
      />
      {showsData(campaigns) && campaigns.data && campaigns.data.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {campaigns.data.map((campaign, position) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              cover={coverList[position]!}
              userId={user.id}
              onLeave={(trigger) => setLeaving({ campaign, trigger })}
            />
          ))}
        </SimpleGrid>
      )}
      <SupervisedCampaigns />
      {showEmpty && (
        <Paper p={{ base: 'lg', sm: 'xl' }} className="hub-empty">
          <ArtPlate name="empty/campaigns" size={144} />
          <Stack gap="xs" align="flex-start">
            <Title order={2}>{t('hub.empty')}</Title>
            <Text c="dimmed">{t('hub.emptyHint')}</Text>
            <SignedInAccount email={user.email} switchAccount={() => controller?.signOut()} />
            <Button
              mt="xs"
              variant="default"
              leftSection={<Plus size={18} aria-hidden="true" />}
              onClick={startCreate}
            >
              {t('hub.create')}
            </Button>
          </Stack>
        </Paper>
      )}
      {!invitesPending && !showEmpty && invitationsPanel}
      <CreateCampaignDialog opened={opened} onClose={() => setOpened(false)} />
      <Modal
        opened={!!decline}
        onClose={closeDecline}
        title={t('hub.declineTitle')}
        centered
        returnFocus
        closeOnEscape={!respond.isPending}
        closeButtonProps={{
          'aria-label': t('action.cancel'),
          size: 44,
          disabled: respond.isPending,
        }}
      >
        <Stack>
          <Text className="leave-body user-copy">
            {t('hub.declineBody', { name: decline?.campaign_name ?? '' })}
          </Text>
          <RespondError error={decline ? respond.error : null} retry={retryAnswer} />
          <div className="leave-actions">
            <Button
              variant="subtle"
              data-autofocus
              disabled={respond.isPending}
              onClick={closeDecline}
            >
              {t('action.cancel')}
            </Button>
            <Button
              color="red"
              variant="light"
              leftSection={<X size={18} aria-hidden="true" />}
              loading={respond.isPending}
              onClick={() => decline && answer(decline, false)}
            >
              {t('hub.declineConfirm')}
            </Button>
          </div>
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
    </Stack>
  )
}

/** One campaign: a cover with its role and name, the description, Open, and a ⋯ menu with Open and Leave. A DM's
 * member list loads when the menu opens, to tell the only DM why they cannot leave yet. */
function CampaignCard({
  campaign,
  cover,
  userId,
  onLeave,
}: {
  campaign: Campaign
  cover: (typeof covers)[number]
  userId: string
  onLeave: (trigger: HTMLElement) => void
}) {
  const { t, i18n } = useTranslation()
  const [menuOpened, setMenuOpened] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const members = useQuery({
    ...membersQuery(userId, campaign.id),
    enabled: menuOpened && campaign.role === 'dm',
  })
  const more = t('hub.more', { name: campaign.name })
  const visitedAt = readCampaignVisit(userId, campaign.id)
  const date = visitedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        visitedAt,
      )
    : null
  return (
    <Paper className="campaign-card hub-card">
      <div className="hub-cover">
        <img
          src={artUrl(`covers/${cover}`)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </div>
      <Stack className="hub-card-body" gap="sm">
        <div className="hub-card-identity">
          <Title order={2} className="user-copy">
            {campaign.name}
          </Title>
          <Text component="span" fw={600} size="sm">
            {t(`campaign.role.${campaign.role}`)}
          </Text>
          <Text size="sm" c="dimmed">
            {date
              ? t('activation.campaign.lastOpened', { date })
              : t('activation.campaign.noVisit')}
          </Text>
        </div>
        {campaign.description && (
          <Text c="dimmed" className="user-copy hub-card-description">
            {campaign.description}
          </Text>
        )}
        <Group gap="xs" wrap="nowrap" className="hub-card-actions">
          <Button
            component={Link}
            to={`/campaign/${campaign.id}`}
            rightSection={<ArrowRight size={18} aria-hidden="true" />}
            variant="default"
            flex={1}
            aria-label={`${t('hub.open')}: ${campaign.name}`}
          >
            {t('hub.open')}
          </Button>
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
        </Group>
      </Stack>
    </Paper>
  )
}
