import { useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import {
  Backpack,
  BookOpen,
  Coins,
  Eye,
  Gem,
  History,
  Image,
  Landmark,
  Lock,
  ScrollText,
  Shield,
  Package,
  Store,
  Swords,
  UserRound,
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
import { inviteEmailSchema } from '../domain/campaign'
import { useCampaignView } from '../view-context'
import { ActionFeedback, QueryFeedback } from './feedback'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { relativeTime } from '@/shared/lib/relative-time'

type Confirmation = { action: CampaignAction; message: string }
type DmPanel = 'members' | 'modules' | 'items' | 'audit'
const dmPanels: DmPanel[] = ['members', 'modules', 'items', 'audit']
type AuditFilter = 'all' | 'characters' | 'resources'
const auditResourceKeys = ['gold', 'water_units', 'rations', 'exhaustion'] as const

const campaignModules = [
  { key: 'party', label: 'module.party', icon: Users, implemented: true },
  { key: 'inventory', label: 'module.inventory', icon: Backpack, implemented: true },
  { key: 'shops', label: 'module.shops', icon: Store },
  { key: 'quests', label: 'module.quests', icon: ScrollText },
  { key: 'combat', label: 'module.combat', icon: Swords },
  { key: 'atlas', label: 'module.atlas', icon: BookOpen },
  { key: 'glossary', label: 'module.glossary', icon: Shield },
  { key: 'memories', label: 'module.memories', icon: Image },
  { key: 'stronghold', label: 'module.stronghold', icon: Landmark },
  { key: 'workshop', label: 'module.workshop', icon: Gem },
] as const

/** The DM Command Center. `itemsPanel` is composed by the page so the campaigns feature does
 * not depend on inventory or shops (ADR 016). The active tab lives in `?panel=` for links. */
export function CampaignMembers({ itemsPanel }: { itemsPanel?: ReactNode } = {}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const user = state.user!
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  const [params, setParams] = useSearchParams()
  const requested = params.get('panel') as DmPanel | null
  const activePanel: DmPanel =
    requested && dmPanels.includes(requested) && (requested !== 'items' || itemsPanel)
      ? requested
      : 'members'
  const setActivePanel = (panel: DmPanel) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (panel === 'members') next.delete('panel')
        else next.set('panel', panel)
        return next
      },
      { replace: true },
    )
  const wide = useMediaQuery('(min-width: 62em)')
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const members = useQuery({ ...membersQuery(user.id, campaign.id), enabled: dm })
  const invitations = useQuery({ ...sentInvitationsQuery(user.id, campaign.id), enabled: dm })
  const auditEvents = useQuery({ ...auditEventsQuery(user.id, campaign.id), enabled: dm })
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
  const enabledModules = new Set(campaign.player_modules ?? ['party'])
  const showMembers = activePanel === 'members'
  const showModules = activePanel === 'modules'
  const showItems = activePanel === 'items' && !!itemsPanel
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

  return (
    <Stack gap="xl">
      <div>
        <Title order={1}>{t(dm ? 'campaign.manage' : 'members.title')}</Title>
        <Text c="dimmed" mt="sm">
          {t(dm ? 'dm.commandIntro' : 'members.playerHint')}
        </Text>
      </div>
      <ActionFeedback error={action.error} />
      {dm && (
        <>
          <Group justify="flex-end" mb={-8}>
            <RefreshControl onRefresh={refreshAll} fetching={fetching} updatedAt={updatedAt} />
          </Group>
          <Tabs
            value={activePanel}
            onChange={(value) => value && setActivePanel(value as DmPanel)}
            orientation={wide ? 'vertical' : 'horizontal'}
            variant="pills"
            keepMounted={false}
            className="dm-tabs"
          >
            <Tabs.List aria-label={t('dm.commandCenter')} className="dm-tabs-list">
              {(
                [
                  ['members', 'dm.panelMembers', Users],
                  ['modules', 'dm.panelModules', Shield],
                  ['items', 'dm.panelItems', Package],
                  ['audit', 'dm.panelAudit', History],
                ] as const
              )
                .filter(([key]) => key !== 'items' || itemsPanel)
                .map(([key, label, Icon]) => (
                  <Tabs.Tab
                    key={key}
                    value={key}
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
                    <section aria-labelledby="members-heading">
                      <Stack>
                        <Group justify="space-between" align="flex-start">
                          <Group gap="xs">
                            <Users size={20} className="feature-icon" aria-hidden="true" />
                            <Title id="members-heading" order={2}>
                              {t('members.list')}
                            </Title>
                          </Group>
                          <Group>
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
                                      disabled={
                                        action.isPending || (member.role === 'dm' && lastDm)
                                      }
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
                                      date: new Date(item.expires_at).toLocaleDateString(
                                        i18n.language,
                                      ),
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
                                          message: t('members.confirmRevoke', {
                                            email: item.email,
                                          }),
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

                {showModules && (
                  <section aria-labelledby="modules-control-heading">
                    <Stack>
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Group gap="xs">
                            <Shield size={20} className="feature-icon" aria-hidden="true" />
                            <Title order={2} id="modules-control-heading">
                              {t('dm.modulesTitle')}
                            </Title>
                          </Group>
                          <Text size="sm" c="dimmed" mt={4}>
                            {t('dm.modulesHint')}
                          </Text>
                        </div>
                        <Badge variant="light">
                          {t('dm.activeCount', { count: enabledModules.size })}
                        </Badge>
                      </Group>
                      <ul className="module-switch-list">
                        {campaignModules.map(({ key, label, icon: Icon, ...module }) => {
                          const active = enabledModules.has(key)
                          const ready = 'implemented' in module && module.implemented
                          return (
                            <li
                              key={key}
                              className="module-switch-row"
                              data-active={active || undefined}
                            >
                              <Icon size={20} className="feature-icon" aria-hidden="true" />
                              <div className="module-switch-name">
                                <Text fw={600}>{t(label)}</Text>
                                {!ready && (
                                  <Badge variant="outline" className="visibility-badge" size="sm">
                                    {t('common.comingSoonTag')}
                                  </Badge>
                                )}
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
                {showAudit && (
                  <section aria-labelledby="audit-heading">
                    <Stack>
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Group gap="xs">
                            <History size={20} className="feature-icon" aria-hidden="true" />
                            <Title order={2} id="audit-heading">
                              {t('dm.auditTitle')}
                            </Title>
                          </Group>
                          <Text size="sm" c="dimmed" mt={4}>
                            {t('dm.auditHint')}
                          </Text>
                        </div>
                      </Group>
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
                        retry={() => void auditEvents.refetch()}
                      />
                      {!auditEvents.isError &&
                        auditEvents.data &&
                        (() => {
                          const characterNames = new Map<string, string>()
                          for (const item of auditEvents.data) {
                            if (typeof item.after_value.name === 'string')
                              characterNames.set(item.character_id, item.after_value.name)
                            else if (typeof item.before_value?.name === 'string')
                              characterNames.set(item.character_id, item.before_value.name)
                          }
                          const memberNames = new Map<string, string>()
                          for (const member of members.data ?? []) {
                            memberNames.set(member.user_id, member.display_name || member.email)
                          }
                          const filteredEvents = auditEvents.data.filter((event) => {
                            const isResourceEvent =
                              event.kind.startsWith('character_resources') ||
                              event.kind === 'resources_updated'
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
                          const now = auditEvents.dataUpdatedAt
                          return (
                            <Timeline bulletSize={30} lineWidth={2} className="audit-timeline">
                              {filteredEvents.map((event) => {
                                const labelKey = `dm.auditEvent.${event.kind.replace(':', '_')}` as
                                  | 'dm.auditEvent.characters_INSERT'
                                  | 'dm.auditEvent.characters_UPDATE'
                                  | 'dm.auditEvent.character_resources_INSERT'
                                  | 'dm.auditEvent.character_resources_UPDATE'
                                  | 'dm.auditEvent.character_sheets_UPDATE'
                                  | 'dm.auditEvent.character_vitals_UPDATE'
                                const characterName =
                                  (typeof event.after_value.name === 'string'
                                    ? event.after_value.name
                                    : null) ??
                                  characterNames.get(event.character_id) ??
                                  null
                                const actorName = event.actor_id
                                  ? (memberNames.get(event.actor_id) ?? null)
                                  : null
                                const isResourceEvent =
                                  event.kind.startsWith('character_resources') ||
                                  event.kind === 'resources_updated'
                                const isAssignmentEvent =
                                  event.kind === 'characters:UPDATE' ||
                                  event.kind === 'character_assigned' ||
                                  event.kind === 'character_unassigned'
                                const linkedUserId =
                                  typeof event.after_value.user_id === 'string'
                                    ? event.after_value.user_id
                                    : null
                                const linkedPlayerName = linkedUserId
                                  ? (memberNames.get(linkedUserId) ?? linkedUserId)
                                  : null
                                const resourceDiffs = isResourceEvent
                                  ? auditResourceKeys.flatMap((key) => {
                                      const afterVal =
                                        typeof event.after_value[key] === 'number'
                                          ? event.after_value[key]
                                          : null
                                      const beforeVal =
                                        event.before_value &&
                                        typeof event.before_value[key] === 'number'
                                          ? event.before_value[key]
                                          : null
                                      if (afterVal === null) return []
                                      if (beforeVal !== null && beforeVal === afterVal) return []
                                      if (beforeVal === null && afterVal === 0) return []
                                      const delta =
                                        beforeVal !== null ? afterVal - beforeVal : afterVal
                                      const sign = delta > 0 ? `+${delta}` : `${delta}`
                                      const text =
                                        beforeVal !== null
                                          ? `${t(`characters.${key}`)}: ${beforeVal.toLocaleString(i18n.language)} → ${afterVal.toLocaleString(i18n.language)} (${sign})`
                                          : `${t(`characters.${key}`)}: ${afterVal.toLocaleString(i18n.language)}`
                                      return [{ key, text, delta }]
                                    })
                                  : []
                                const created = new Date(event.created_at)
                                return (
                                  <Timeline.Item
                                    key={event.id}
                                    bullet={
                                      isResourceEvent ? (
                                        <Coins size={15} aria-hidden="true" />
                                      ) : (
                                        <UserRound size={15} aria-hidden="true" />
                                      )
                                    }
                                    className="audit-event"
                                  >
                                    <Stack gap={4}>
                                      <Group justify="space-between" align="flex-start" gap="xs">
                                        <Group gap="xs">
                                          <Text fw={700} size="sm">
                                            {t(labelKey)}
                                          </Text>
                                          {characterName && (
                                            <Badge variant="light" className="user-copy">
                                              {characterName}
                                            </Badge>
                                          )}
                                        </Group>
                                        <Text
                                          size="xs"
                                          c="dimmed"
                                          component="time"
                                          dateTime={event.created_at}
                                          title={created.toLocaleString(i18n.language)}
                                        >
                                          {relativeTime(created.getTime(), now, i18n.language) ??
                                            t('common.justNow')}
                                        </Text>
                                      </Group>
                                      {isAssignmentEvent && (
                                        <Text size="sm" className="user-copy">
                                          {linkedPlayerName
                                            ? t('dm.auditLinkedTo', { player: linkedPlayerName })
                                            : t('dm.auditUnlinked')}
                                        </Text>
                                      )}
                                      {isResourceEvent &&
                                        (resourceDiffs.length > 0 ? (
                                          <Group gap={6}>
                                            {resourceDiffs.map((diff) => (
                                              <Badge key={diff.key} variant="outline" size="sm">
                                                {diff.text}
                                              </Badge>
                                            ))}
                                          </Group>
                                        ) : (
                                          <Text size="xs" c="dimmed">
                                            {t('dm.auditNoChanges')}
                                          </Text>
                                        ))}
                                      {actorName && (
                                        <Text size="xs" c="dimmed" className="user-copy">
                                          {t('dm.auditBy', { actor: actorName })}
                                        </Text>
                                      )}
                                    </Stack>
                                  </Timeline.Item>
                                )
                              })}
                            </Timeline>
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
      {!playerPreview && (!dm || showMembers) && (
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
