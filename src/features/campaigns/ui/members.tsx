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
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  CalendarDays,
  Dices,
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
import { closeOnEscapeWhileOpening } from '@/shared/ui/escape-while-opening'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { FirstSession } from './first-session'
import { DiceSettingsControl } from './dice-settings'
import { PartyLevelControl } from './party-level'
import { InviteInstructions, SentInvitationRow } from './invite-instructions'
import './dm-center.css'

type Confirmation = { action: CampaignAction; message: string }
type DmPanel = 'prepare' | 'members' | 'modules' | 'dice' | 'items' | 'bestiary' | 'audit'
const dmPanels: DmPanel[] = ['members', 'prepare', 'modules', 'dice', 'items', 'bestiary', 'audit']
type AuditFilter = 'all' | 'characters' | 'resources'

/** The DM Command Center. `itemsPanel` and `bestiaryPanel` are composed by the page so the
 * campaigns feature does not depend on inventory, shops or combat (ADR 016, ADR 028). The active
 * tab lives in `?panel=` for links. */
export function CampaignMembers({
  itemsPanel,
  bestiaryPanel,
  roster,
  rosterFeedback,
  memberCharacters,
  onAssign,
  pendingProposals,
  partyBelow,
  partySuggested,
}: {
  itemsPanel?: ReactNode
  bestiaryPanel?: ReactNode
  roster?: readonly {
    user_id: string | null
    archived_at: string | null
    absent: boolean
    is_active: boolean
  }[]
  rosterFeedback?: ReactNode
  memberCharacters?: (member: Member) => ReactNode
  onAssign?: (member: Member) => void
  pendingProposals?: number
  /** Finished characters below the party level, once the party list has loaded (RYT-130). */
  partyBelow?: number
  /** The highest level among finished sheets: where the party level starts while unset. */
  partySuggested?: number
} = {}) {
  const { t } = useTranslation()
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
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const members = useQuery({ ...membersQuery(user.id, campaign.id), enabled: dm })
  const invitations = useQuery({ ...sentInvitationsQuery(user.id, campaign.id), enabled: dm })
  const auditEvents = useQuery({ ...auditEventsQuery(user.id, campaign.id), enabled: dm })
  const action = useCampaignAction()
  const trigger = useRef<HTMLElement | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRecipient, setInviteRecipient] = useState<string | null>(null)
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
  // An Escape pressed in the same frame as the control that opens a dialog closes it too.
  const stopEarlyEscape = useRef<() => void>(() => {})
  // The dialog made inert while it leaves, so only that one is let work again (and on leaving the page).
  const madeInert = useRef<Element | null>(null)
  useEffect(
    () => () => {
      stopEarlyEscape.current()
      madeInert.current?.removeAttribute('inert')
    },
    [],
  )
  const openConfirmation = (next: Confirmation, target: HTMLElement) => {
    trigger.current = target
    setConfirmation(next)
    stopEarlyEscape.current()
    stopEarlyEscape.current = closeOnEscapeWhileOpening(() => closeConfirmation())
  }
  // Focus goes back to the control that opened the dialog, however the dialog was left (Escape, a
  // button, Back). The return starts when the dialog closes and waits for it to go; it gives up as soon
  // as the person moves focus elsewhere, so the dialogs start no second return at the end of their exit
  // transition (that one took the control the person had just tabbed to for fallen focus).
  const restoreTriggerFocus = () => {
    // The dialog that is closing, and the menu that opened it when the close comes before the dialog
    // had focus (an Escape in the same frame as the choice): both are leaving.
    const dialogs = [
      document.activeElement?.closest('[role="dialog"]') ??
        document.querySelector('[role="dialog"]'),
      document.activeElement?.closest('[role="menu"]') ?? null,
    ].filter((el): el is Element => el !== null)
    const leaving = dialogs
    // The closing dialog stays mounted, after the trigger in the page, for its exit transition: Tab
    // pressed right after Escape would land in it and be lost. Inert, it is skipped at once.
    const dialog = dialogs.find((el) => el.getAttribute('role') === 'dialog')
    if (dialog) {
      dialog.setAttribute('inert', '')
      madeInert.current = dialog
    }
    stopEarlyEscape.current()
    focusWhenReady(() => trigger.current, {
      // Focus on any control but the trigger counts as the person having moved on, even when this
      // runs a second time with focus already back on the trigger.
      from: trigger.current,
      leaving,
    })
  }
  const closeConfirmation = () => {
    setConfirmation(null)
    restoreTriggerFocus()
  }
  const closeInvite = () => {
    if (!action.isPending) {
      setInviteOpen(false)
      setInviteRecipient(null)
      inviteForm.reset()
      restoreTriggerFocus()
    }
  }
  useBackToClose(inviteOpen, closeInvite)
  useBackToClose(!!confirmation, closeConfirmation)
  const handleInviteSubmit = inviteForm.onSubmit((values) => {
    const email = values.email.trim().toLowerCase()
    action.mutate(
      { kind: 'invite', campaignId: campaign.id, email },
      {
        onSuccess: () => {
          setInviteRecipient(email)
          focusWhenReady('[data-invite-instructions]')
        },
      },
    )
  })
  const players = members.data?.filter((member) => member.role === 'player') ?? []
  const available =
    roster?.some((entry) => !entry.user_id && !entry.archived_at && !entry.absent) ?? false
  const unlinked = players.filter(
    (member) => !roster?.some((entry) => entry.user_id === member.user_id && !entry.archived_at),
  )
  const currentRoster = roster !== undefined
  const linked = currentRoster && players.length > 0 && !unlinked.length
  const enabledModules = new Set(campaign.player_modules ?? ['party'])
  const modulesChosen = [...enabledModules].some((key) => implementedModuleKeys.has(key))
  const openInvite = (target: HTMLElement) => {
    trigger.current = target
    action.reset()
    inviteForm.reset()
    setInviteOpen(true)
    stopEarlyEscape.current()
    stopEarlyEscape.current = closeOnEscapeWhileOpening(() => closeInvite())
  }
  // A dialog opened again before the last one finished leaving is the same element: let it work.
  useEffect(() => {
    if (confirmation || inviteOpen) {
      madeInert.current?.removeAttribute('inert')
      madeInert.current = null
    }
  }, [confirmation, inviteOpen])
  const lastDm =
    dm &&
    (!members.data || members.isError || members.data.filter((m) => m.role === 'dm').length <= 1)
  const showMembers = activePanel === 'members'
  const showModules = activePanel === 'modules'
  const showDice = activePanel === 'dice'
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
        titleClassName={dm ? 'dm-admin-heading' : undefined}
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
            orientation="vertical"
            variant="pills"
            keepMounted={false}
            className="dm-tabs dm-tabs-seg"
          >
            <Tabs.List aria-label={t('dm.commandCenter')} className="dm-tabs-list">
              {(
                [
                  ['members', 'dm.panelMembers', Users],
                  ['prepare', 'dm.prepareSession', CalendarDays],
                  ['modules', 'dm.panelModules', Shield],
                  ['dice', 'dm.panelDice', Dices],
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
                    aria-label={t(label)}
                    aria-describedby={
                      (key === 'members' && invitations.data?.length) ||
                      (key === 'items' && pendingProposals)
                        ? `pending-${key}`
                        : undefined
                    }
                    leftSection={<Icon size={18} aria-hidden="true" />}
                  >
                    {t(label)}
                    {key === 'members' && !!invitations.data?.length && (
                      <small className="dm-nav-count" id={`pending-${key}`}>
                        {t('dm.pendingInvites', { count: invitations.data.length })}
                      </small>
                    )}
                    {key === 'items' && !!pendingProposals && (
                      <small className="dm-nav-count" id={`pending-${key}`}>
                        {t('dm.pendingReview', { count: pendingProposals })}
                      </small>
                    )}
                  </Tabs.Tab>
                ))}
            </Tabs.List>
            <Tabs.Panel value={activePanel} className="dm-tabs-panel">
              <Stack gap="xl">
                {activePanel === 'prepare' && (
                  <>
                    <QueryFeedback
                      pending={members.isPending || invitations.isPending}
                      error={members.isError || invitations.isError}
                      retry={refreshAll}
                    />
                    {rosterFeedback}
                    {members.isSuccess && invitations.isSuccess && currentRoster && (
                      <FirstSession
                        campaignId={campaign.id}
                        joined={players.length > 0}
                        pending={invitations.data.length}
                        modules={modulesChosen}
                        linked={linked}
                        available={available}
                        nextMember={unlinked[0]}
                        onInvite={openInvite}
                        onModules={() => {
                          setActivePanel('modules')
                          focusWhenReady('.dm-tabs-list [data-panel="modules"]')
                        }}
                        onAssign={(member) => onAssign?.(member)}
                      />
                    )}
                  </>
                )}
                {showMembers && (
                  <>
                    <PartyLevelControl
                      campaignId={campaign.id}
                      current={campaign.party_level}
                      below={partyBelow}
                      suggested={partySuggested}
                    />
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
                        {rosterFeedback}
                        {!members.isError && !!members.data?.length && (
                          <ul className="member-list">
                            {members.data.map((member) => (
                              <MemberRow
                                key={member.user_id}
                                member={member}
                                characters={
                                  member.role === 'player' ? memberCharacters?.(member) : undefined
                                }
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
                              {invitations.data.map((item) => (
                                <SentInvitationRow
                                  key={item.id}
                                  invitation={item}
                                  busy={action.isPending}
                                  onShare={(target) => {
                                    trigger.current = target
                                    setInviteRecipient(item.email)
                                    setInviteOpen(true)
                                  }}
                                  onCancel={(target) =>
                                    openConfirmation(
                                      {
                                        action: { kind: 'revoke', invitationId: item.id },
                                        message: t('members.confirmRevoke', { email: item.email }),
                                      },
                                      target,
                                    )
                                  }
                                />
                              ))}
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
                {showDice && (
                  <DiceSettingsControl
                    campaignId={campaign.id}
                    current={{
                      dice_mode: campaign.dice_mode,
                      roll_visibility: campaign.roll_visibility,
                    }}
                  />
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
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        {inviteRecipient ? (
          <InviteInstructions
            email={inviteRecipient}
            campaign={campaign.name}
            onClose={closeInvite}
          />
        ) : (
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
        )}
      </Modal>
      <Modal
        opened={!!confirmation}
        onClose={closeConfirmation}
        title={t('members.confirm')}
        returnFocus={false}
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
  characters,
  member,
  you,
  protectedDm,
  busy,
  campaignId,
  onConfirm,
}: {
  characters?: ReactNode
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
      {characters}
    </li>
  )
}
