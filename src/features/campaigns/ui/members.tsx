import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core'
import { useWide } from '@/shared/ui/use-viewport'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  Ellipsis,
  Eye,
  History,
  Lock,
  LogOut,
  Package,
  PawPrint,
  Shield,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  auditEventsQuery,
  membersQuery,
  sentInvitationsQuery,
  useCampaignAction,
  type CampaignAction,
} from '../api'
import { useCampaign } from '../campaign-context'
import { inviteEmailSchema, MembershipError, type Member } from '../domain/campaign'
import { useCampaignView } from '../view-context'
import { ActionFeedback, QueryFeedback } from './feedback'
import { AuditTimeline } from './audit-timeline'
import { auditFamily } from '../domain/audit'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { PageHead } from '@/shared/ui/page-head'
import { campaignModules, implementedModuleKeys } from './module-catalog'
import { LeaveCampaignDialog } from './leave'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { FirstSession } from './first-session'
import './dm-center.css'

type Confirmation = { action: CampaignAction; message: string }
type DmPanel = 'members' | 'modules' | 'items' | 'bestiary' | 'audit'
const dmPanels: DmPanel[] = ['members', 'modules', 'items', 'bestiary', 'audit']
type AuditFilter = 'all' | 'characters' | 'resources'

/** The DM Command Center. `itemsPanel` and `bestiaryPanel` are composed by the page so the
 * campaigns feature does not depend on inventory, shops or combat (ADR 016, ADR 028). The active
 * tab lives in `?panel=` for links. */
export function CampaignMembers({
  itemsPanel,
  bestiaryPanel,
  characterCount,
}: {
  itemsPanel?: ReactNode
  bestiaryPanel?: ReactNode
  /** Characters in play, once loaded by the page; drives the first-session checklist. */
  characterCount?: number
} = {}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const user = state.user!
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  const [params, setParams] = useSearchParams()
  const requested = params.get('panel') as DmPanel | null
  const activePanel: DmPanel =
    requested &&
    dmPanels.includes(requested) &&
    (requested !== 'items' || itemsPanel) &&
    (requested !== 'bestiary' || bestiaryPanel)
      ? requested
      : 'members'
  const setActivePanel = (panel: DmPanel) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (panel === 'members') next.delete('panel')
        else next.set('panel', panel)
        // Panel deep links (the bestiary's ?creature=) do not outlive their panel.
        if (panel !== 'bestiary') next.delete('creature')
        return next
      },
      { replace: true },
    )
  const wide = useWide()
  // Keep the selected tab visible in the horizontally scrolling phone tab rail (deep links).
  useEffect(() => {
    document
      .querySelector('.dm-tabs-list [data-active]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activePanel, wide])
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const members = useQuery({ ...membersQuery(user.id, campaign.id), enabled: dm })
  const invitations = useQuery({ ...sentInvitationsQuery(user.id, campaign.id), enabled: dm })
  const auditEvents = useQuery({ ...auditEventsQuery(user.id, campaign.id), enabled: dm })
  const action = useCampaignAction()
  const trigger = useRef<HTMLElement | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  // RYT-095: the same confirmation as My campaigns and the profile menu.
  const [leaving, setLeaving] = useState(false)
  const leaveButton = useRef<HTMLButtonElement>(null)
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
  useBackToClose(inviteOpen, closeInvite)
  useBackToClose(!!confirmation, closeConfirmation)
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
  const hasPlayers =
    !!members.data?.some((member) => member.role === 'player') || !!invitations.data?.length
  const modulesChosen = (campaign.player_modules ?? ['party']).some(
    (key) => key !== 'party' && implementedModuleKeys.has(key),
  )
  // Shown while the loaded data says the campaign has no players or no characters yet.
  const firstSession = {
    invite: hasPlayers,
    modules: modulesChosen,
    characters: (characterCount ?? 0) > 0,
  }
  const showFirstSession =
    dm &&
    !!members.data &&
    !!invitations.data &&
    characterCount !== undefined &&
    !(firstSession.invite && firstSession.characters)
  const openInvite = (target: HTMLElement) => {
    trigger.current = target
    action.reset()
    inviteForm.reset()
    setInviteOpen(true)
  }
  const lastDm =
    dm &&
    (!members.data || members.isError || members.data.filter((m) => m.role === 'dm').length <= 1)
  const enabledModules = new Set(campaign.player_modules ?? ['party'])
  const showMembers = activePanel === 'members'
  const showModules = activePanel === 'modules'
  const showItems = activePanel === 'items' && !!itemsPanel
  const showBestiary = activePanel === 'bestiary' && !!bestiaryPanel
  const showAudit = activePanel === 'audit'
  const refreshAll = () => {
    void members.refetch()
    void invitations.refetch()
    void auditEvents.refetch()
  }
  const fetching = members.isFetching || invitations.isFetching || auditEvents.isFetching
  const updatedAt = Math.max(
    members.dataUpdatedAt,
    invitations.dataUpdatedAt,
    auditEvents.dataUpdatedAt,
  )

  const leaveBox = (
    <Paper p="lg" className="leave-box">
      <Group justify="space-between" align="center" gap="sm">
        <Text size="sm" c="dimmed" className="leave-box-text">
          {t(lastDm ? 'members.lastDm' : 'members.leaveHint')}
        </Text>
        <Button
          ref={leaveButton}
          variant="outline"
          color="red"
          leftSection={<LogOut size={18} aria-hidden="true" />}
          disabled={lastDm || action.isPending}
          onClick={() => setLeaving(true)}
        >
          {t('members.leave')}
        </Button>
      </Group>
    </Paper>
  )

  return (
    <Stack gap="xl">
      <PageHead
        title={t(dm ? 'campaign.manage' : 'members.title')}
        description={dm ? undefined : t('members.playerHint')}
        compactOnPhone={dm}
        refresh={
          dm && <RefreshControl onRefresh={refreshAll} fetching={fetching} updatedAt={updatedAt} />
        }
      />
      <ActionFeedback error={action.error} />
      {dm && (
        <>
          <Tabs
            value={activePanel}
            onChange={(value) => value && setActivePanel(value as DmPanel)}
            orientation={wide ? 'vertical' : 'horizontal'}
            variant="pills"
            keepMounted={false}
            className="dm-tabs dm-tabs-seg"
          >
            <Tabs.List aria-label={t('dm.commandCenter')} className="dm-tabs-list">
              {(
                [
                  ['members', 'dm.panelMembers', Users],
                  ['modules', 'dm.panelModules', Shield],
                  ['items', 'dm.panelItems', Package],
                  ['bestiary', 'dm.panelBestiary', PawPrint],
                  ['audit', 'dm.panelAudit', History],
                ] as const
              )
                .filter(
                  ([key]) =>
                    (key !== 'items' || itemsPanel) && (key !== 'bestiary' || bestiaryPanel),
                )
                .map(([key, label, Icon]) => (
                  <Tabs.Tab
                    key={key}
                    value={key}
                    data-panel={key}
                    leftSection={<Icon size={18} aria-hidden="true" />}
                  >
                    {t(label)}
                  </Tabs.Tab>
                ))}
            </Tabs.List>
            <Tabs.Panel value={activePanel} className="dm-tabs-panel">
              <Stack gap="xl">
                {showMembers && (
                  <>
                    {showFirstSession && (
                      <FirstSession
                        campaignId={campaign.id}
                        done={firstSession}
                        onInvite={openInvite}
                        onModules={() => {
                          setActivePanel('modules')
                          // The checklist row unmounts with the Members panel: focus the chosen tab.
                          focusWhenReady('.dm-tabs-list [role="tab"][data-panel="modules"]')
                        }}
                      />
                    )}
                    <section aria-label={t('dm.panelMembers')}>
                      <Stack gap="sm">
                        <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                          <Text size="sm" c="dimmed">
                            {members.data ? t('members.count', { count: members.data.length }) : ''}
                          </Text>
                          <Button
                            leftSection={<UserPlus size={18} aria-hidden="true" />}
                            onClick={(event) => openInvite(event.currentTarget)}
                          >
                            {t('members.invite')}
                          </Button>
                        </Group>
                        <QueryFeedback
                          pending={members.isPending}
                          error={members.isError}
                          cause={members.error}
                          retry={() => {
                            void members.refetch()
                          }}
                        />
                        {!members.isError && !!members.data?.length && (
                          <ul className="member-list">
                            {members.data.map((member) => (
                              <MemberRow
                                key={member.user_id}
                                member={member}
                                you={member.user_id === user.id}
                                protectedDm={member.role === 'dm' && lastDm}
                                busy={action.isPending}
                                onConfirm={(next, target) => openConfirmation(next, target)}
                                campaignId={campaign.id}
                              />
                            ))}
                          </ul>
                        )}
                      </Stack>
                    </section>
                    <section aria-labelledby="sent-heading">
                      <Stack gap="sm">
                        <h2 id="sent-heading" className="dm-subheading">
                          {t('members.sent')}
                        </h2>
                        <QueryFeedback
                          pending={invitations.isPending}
                          error={invitations.isError}
                          cause={invitations.error}
                          retry={() => void invitations.refetch()}
                        />
                        {!invitations.isError &&
                          invitations.data &&
                          (invitations.data.length ? (
                            <ul className="member-list">
                              {invitations.data.map((item) => {
                                const revoke = t('members.revoke')
                                return (
                                  <li key={item.id} className="member-row">
                                    <div className="member-identity">
                                      <Text fw={600} className="user-copy">
                                        {item.email}
                                      </Text>
                                      <Text size="sm" c="dimmed">
                                        {t('hub.expires', {
                                          date: new Date(item.expires_at).toLocaleDateString(
                                            i18n.language,
                                          ),
                                        })}
                                      </Text>
                                    </div>
                                    <ActionIcon
                                      variant="subtle"
                                      color="red"
                                      size={44}
                                      aria-label={revoke}
                                      title={revoke}
                                      disabled={action.isPending}
                                      onClick={(event) =>
                                        openConfirmation(
                                          {
                                            action: { kind: 'revoke', invitationId: item.id },
                                            message: t('members.confirmRevoke', {
                                              email: item.email,
                                            }),
                                          },
                                          event.currentTarget,
                                        )
                                      }
                                    >
                                      <X size={20} aria-hidden="true" />
                                    </ActionIcon>
                                  </li>
                                )
                              })}
                            </ul>
                          ) : (
                            <Text c="dimmed">{t('members.noneSent')}</Text>
                          ))}
                      </Stack>
                    </section>
                    {!playerPreview && leaveBox}
                  </>
                )}

                {showModules && (
                  <section aria-label={t('dm.panelModules')}>
                    <Stack>
                      <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                        <Text size="sm" c="dimmed">
                          {t('dm.modulesHint')}
                        </Text>
                        <Badge variant="light" className="module-count">
                          {t('dm.activeCount', {
                            count: [...enabledModules].filter((key) =>
                              implementedModuleKeys.has(key),
                            ).length,
                          })}
                        </Badge>
                      </Group>
                      <ul className="module-switch-list">
                        {campaignModules.map(({ key, label, icon: Icon }) => {
                          const active = enabledModules.has(key)
                          return (
                            <li
                              key={key}
                              className="module-switch-row"
                              data-active={active || undefined}
                            >
                              <Icon size={20} className="feature-icon" aria-hidden="true" />
                              <div className="module-switch-name">
                                <Text fw={600}>{t(label)}</Text>
                              </div>
                              <Switch
                                size="lg"
                                checked={active}
                                aria-disabled={action.isPending || undefined}
                                aria-label={t('dm.moduleSwitch', { module: t(label) })}
                                onLabel={<Eye size={14} aria-hidden="true" />}
                                offLabel={<Lock size={14} aria-hidden="true" />}
                                onChange={() => {
                                  if (action.isPending) return
                                  const next = new Set(enabledModules)
                                  if (active) next.delete(key)
                                  else next.add(key)
                                  action.mutate({
                                    kind: 'modules',
                                    campaignId: campaign.id,
                                    modules: [...next],
                                  })
                                }}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </Stack>
                  </section>
                )}
                {showItems && itemsPanel}
                {showBestiary && bestiaryPanel}
                {showAudit && (
                  <section aria-label={t('dm.panelAudit')}>
                    <Stack>
                      <Text size="sm" c="dimmed">
                        {t('dm.auditHint')}
                      </Text>
                      <SegmentedControl
                        value={auditFilter}
                        onChange={(value) => setAuditFilter(value as AuditFilter)}
                        aria-label={t('dm.auditTimeline')}
                        className="audit-filter"
                        data={[
                          { value: 'all', label: t('dm.auditFilterAll') },
                          { value: 'characters', label: t('dm.auditFilterCharacters') },
                          { value: 'resources', label: t('dm.auditFilterResources') },
                        ]}
                      />
                      <QueryFeedback
                        pending={auditEvents.isPending}
                        error={auditEvents.isError}
                        cause={auditEvents.error}
                        retry={() => void auditEvents.refetch()}
                      />
                      {!auditEvents.isError &&
                        auditEvents.data &&
                        (() => {
                          const memberNames = new Map<string, string>()
                          for (const member of members.data ?? []) {
                            memberNames.set(member.user_id, member.display_name || member.email)
                          }
                          const filteredEvents = auditEvents.data.filter((event) => {
                            const isResourceEvent = auditFamily(event) === 'resources'
                            if (auditFilter === 'resources') return isResourceEvent
                            if (auditFilter === 'characters') return !isResourceEvent
                            return true
                          })
                          if (!filteredEvents.length)
                            return (
                              <Paper p="lg">
                                <Text c="dimmed">{t('dm.noAudit')}</Text>
                              </Paper>
                            )
                          return (
                            <AuditTimeline
                              events={filteredEvents}
                              context={auditEvents.data}
                              memberNames={memberNames}
                              now={auditEvents.dataUpdatedAt}
                            />
                          )
                        })()}
                    </Stack>
                  </section>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
      {!playerPreview && !dm && leaveBox}
      {leaving && (
        <LeaveCampaignDialog
          campaign={campaign}
          onClose={() => {
            setLeaving(false)
            focusWhenReady(() => leaveButton.current)
          }}
          onLeft={() => setLeaving(false)}
        />
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
              <Alert role="alert" color="red" title={t('action.error')}>
                {t(
                  `action.${action.error instanceof MembershipError ? action.error.reason : 'unavailable'}`,
                )}
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

/** One member on a compact row; the role actions live in its menu. */
function MemberRow({
  member,
  you,
  protectedDm,
  busy,
  campaignId,
  onConfirm,
}: {
  member: Member
  you: boolean
  protectedDm: boolean
  busy: boolean
  campaignId: string
  onConfirm: (next: Confirmation, target: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const trigger = useRef<HTMLButtonElement>(null)
  const more = t('members.more', { name: member.display_name })
  const nextRole = member.role === 'dm' ? 'player' : 'dm'
  const confirm = (next: Confirmation) => trigger.current && onConfirm(next, trigger.current)
  return (
    <li className="member-row">
      <div className="member-identity">
        <Text fw={600} className="user-copy">
          {member.display_name}
          {you ? ` · ${t('members.you')}` : ''}
        </Text>
        <Text size="sm" c="dimmed" className="user-copy">
          {member.email}
        </Text>
        {protectedDm && (
          <Text size="sm" c="dimmed">
            {t('members.onlyDm')}
          </Text>
        )}
      </div>
      <Badge variant="light" className="member-role">
        {t(`campaign.role.${member.role}`)}
      </Badge>
      <Menu
        position="bottom-end"
        withinPortal
        withInitialFocusPlaceholder={false}
        returnFocus={false}
      >
        <Menu.Target>
          <ActionIcon ref={trigger} variant="subtle" size={44} aria-label={more} title={more}>
            <Ellipsis size={20} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={busy || protectedDm}
            leftSection={
              member.role === 'dm' ? (
                <ArrowDown size={18} aria-hidden="true" />
              ) : (
                <Shield size={18} aria-hidden="true" />
              )
            }
            onClick={() =>
              confirm({
                action: {
                  kind: 'member',
                  campaignId,
                  userId: member.user_id,
                  role: nextRole,
                },
                message: t('members.confirmRole', {
                  name: member.display_name,
                  role: t(`campaign.role.${nextRole}`),
                }),
              })
            }
          >
            {t(member.role === 'dm' ? 'members.demote' : 'members.promote')}
          </Menu.Item>
          {!you && (
            <Menu.Item
              color="red"
              disabled={busy || protectedDm}
              leftSection={<UserMinus size={18} aria-hidden="true" />}
              onClick={() =>
                confirm({
                  action: { kind: 'member', campaignId, userId: member.user_id, role: null },
                  message: t('members.confirmRemove', { name: member.display_name }),
                })
              }
            >
              {t('members.remove')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </li>
  )
}
