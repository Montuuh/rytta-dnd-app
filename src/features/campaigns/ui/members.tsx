import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  NativeSelect,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useQuery } from '@tanstack/react-query'
import { Ellipsis, Eye, Lock, LogOut, UserPlus } from 'lucide-react'
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
import { parseDmPanel, type DmPanel } from '../domain/dm-panels'
import { useCampaignView } from '../view-context'
import { ActionFeedback, QueryFeedback } from './feedback'
import { AuditTimeline } from './audit-timeline'
import { auditCharacterNames, filterAudit, type AuditFilter } from '../domain/audit'
import type { PartyCharacter } from '../domain/party-level'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { PageHead } from '@/shared/ui/page-head'
import { campaignModules, implementedModuleKeys } from './module-catalog'
import { LeaveCampaignDialog } from './leave'
import { closeOnEscapeWhileOpening } from '@/shared/ui/escape-while-opening'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { DiceSettingsControl } from './dice-settings'
import { DmCenterShell } from './dm-shell'
import { PartyLevelControl } from './party-level'
import { InviteInstructions } from './invite-instructions'
import {
  ActionSheet,
  InvitationActions,
  InvitationLine,
  MemberActions,
  type MemberSheetView,
} from './member-sheet'
import './dm-center.css'
import './members.css'
import './settings-panels.css'
import './audit.css'

type Confirmation = { action: CampaignAction; message: string }
/** What the sheet is open on: a member, or a sent invitation. */
type SheetTarget = { kind: 'member'; userId: string } | { kind: 'invitation'; id: string }

/** The DM Command Center panels. `itemsPanel`, `bestiaryPanel` and `contentPanel` are composed by
 * the page so the campaigns feature does not depend on inventory, shops or combat (ADR 016,
 * ADR 028). The open panel lives in `?panel=`; `?do=invite` opens the invite dialog once. */
export function CampaignMembers({
  itemsPanel,
  bestiaryPanel,
  contentPanel,
  rosterFeedback,
  memberCharacters,
  memberCharacterSheet,
  pendingProposals,
  partySuggested,
  partyCharacters,
  partyFeedback,
}: {
  itemsPanel?: ReactNode
  bestiaryPanel?: ReactNode
  /** RYT-162: the packs this campaign uses, composed by the page like the bestiary. */
  contentPanel?: ReactNode
  rosterFeedback?: ReactNode
  /** RYT-180: the second line of a member's row (the active character), or null for nothing. */
  memberCharacters?: (member: Member) => ReactNode
  /** RYT-180: the character rows and lists of a member's sheet. */
  memberCharacterSheet?: (
    member: Member,
    sheet: { view: MemberSheetView; setView: (view: MemberSheetView) => void; close: () => void },
  ) => ReactNode
  pendingProposals?: number
  /** The highest level among finished sheets: where the party level starts while unset. */
  partySuggested?: number
  /** RYT-180: the party's characters for the Party level panel, once the page has them. */
  partyCharacters?: PartyCharacter[]
  /** Loading or failure of those characters, shown in the list's place. */
  partyFeedback?: ReactNode
} = {}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const user = state.user!
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  const [params, setParams] = useSearchParams()
  const requested = parseDmPanel(params.get('panel'))
  const slots: Partial<Record<DmPanel, ReactNode>> = {
    items: itemsPanel,
    bestiary: bestiaryPanel,
    content: contentPanel,
  }
  const activePanel: DmPanel = requested in slots && !slots[requested] ? 'members' : requested
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const [auditCharacter, setAuditCharacter] = useState<string | null>(null)
  const auditSelect = useRef<HTMLSelectElement>(null)
  const members = useQuery({ ...membersQuery(user.id, campaign.id), enabled: dm })
  const invitations = useQuery({ ...sentInvitationsQuery(user.id, campaign.id), enabled: dm })
  const auditEvents = useQuery({ ...auditEventsQuery(user.id, campaign.id), enabled: dm })
  const action = useCampaignAction()
  const trigger = useRef<HTMLElement | null>(null)
  const inviteButton = useRef<HTMLButtonElement>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRecipient, setInviteRecipient] = useState<string | null>(null)
  // RYT-095: the same confirmation as My campaigns and the profile menu.
  const [leaving, setLeaving] = useState(false)
  const leaveButton = useRef<HTMLButtonElement>(null)
  // RYT-180: the sheet a row's `···` opens, and the list of characters it shows, if any.
  const [sheet, setSheet] = useState<SheetTarget | null>(null)
  const [sheetView, setSheetView] = useState<MemberSheetView>(null)
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
  // The dialogs made inert while they leave, so only those are let work again (and on leaving the page).
  const madeInert = useRef<Set<Element>>(new Set())
  useEffect(
    () => () => {
      stopEarlyEscape.current()
      madeInert.current.forEach((el) => el.removeAttribute('inert'))
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
    // The dialog that is closing, and the sheet that opened it when the close comes before the dialog
    // had focus (an Escape in the same frame as the choice): both are leaving.
    const leaving = [...document.querySelectorAll('[role="dialog"], [role="menu"]')]
    // A closing dialog stays mounted, after the trigger in the page, for its exit transition: Tab
    // pressed right after Escape would land in it and be lost. Inert, it is skipped at once.
    for (const dialog of leaving) {
      if (dialog.getAttribute('role') !== 'dialog') continue
      dialog.setAttribute('inert', '')
      madeInert.current.add(dialog)
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
  // The sheet closes by itself when a choice in it opens a dialog; every other way back is here.
  const closeSheet = () => {
    setSheet(null)
    setSheetView(null)
    restoreTriggerFocus()
  }
  const openSheet = (next: SheetTarget, target: HTMLElement) => {
    trigger.current = target
    setSheetView(null)
    setSheet(next)
    stopEarlyEscape.current()
    stopEarlyEscape.current = closeOnEscapeWhileOpening(() => closeSheet())
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
  const enabledModules = new Set(campaign.player_modules ?? ['party'])
  const showInstructions = (email: string) => {
    setSheet(null)
    setInviteRecipient(email)
    setInviteOpen(true)
    stopEarlyEscape.current()
    stopEarlyEscape.current = closeOnEscapeWhileOpening(() => closeInvite())
  }
  const openInvite = (target: HTMLElement) => {
    trigger.current = target
    action.reset()
    inviteForm.reset()
    setInviteOpen(true)
    stopEarlyEscape.current()
    stopEarlyEscape.current = closeOnEscapeWhileOpening(() => closeInvite())
  }
  // RYT-179: `?do=invite` (the home's "Invite the first player") opens the dialog once; the action
  // leaves the address so Back or a reload does not open it again. Focus returns to Invite player.
  // `?do=sent` (the home's "Invitations to accept") lands on the sent invitations once.
  const sentOnArrival = dm && activePanel === 'members' && params.get('do') === 'sent'
  useEffect(() => {
    if (!sentOnArrival) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('do')
        return next
      },
      { replace: true },
    )
    // After the layout has moved focus to the page for the new route, so that focus is the
    // starting point and not read as the person having moved on. Without a sent invitation there
    // is nothing to land on and focus stays on the panel.
    requestAnimationFrame(() => focusWhenReady('[data-sent-first]'))
  }, [sentOnArrival, setParams])
  // `?do=set` (the switcher's "Set party level") opens the stepper once.
  const stepperOnArrival = dm && activePanel === 'level' && params.get('do') === 'set'
  const stepperFocused = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('do')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const inviteOnArrival = dm && activePanel === 'members' && params.get('do') === 'invite'
  const openInviteOnArrival = useRef(openInvite)
  useEffect(() => {
    openInviteOnArrival.current = openInvite
  })
  useEffect(() => {
    if (!inviteOnArrival) return
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('do')
        return next
      },
      { replace: true },
    )
    if (inviteButton.current) openInviteOnArrival.current(inviteButton.current)
  }, [inviteOnArrival, setParams])
  // A dialog opened again before the last one finished leaving is the same element: let it work.
  useEffect(() => {
    if (confirmation || inviteOpen || sheet) {
      madeInert.current.forEach((el) => el.removeAttribute('inert'))
      madeInert.current.clear()
    }
  }, [confirmation, inviteOpen, sheet])
  const lastDm =
    dm &&
    (!members.data || members.isError || members.data.filter((m) => m.role === 'dm').length <= 1)
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

  // The Player's Members page keeps its own leave box; the DM leaves from the sheet of their row.
  const leaveBox = (
    <Paper p="lg" className="leave-box">
      <Group justify="space-between" align="center" gap="sm">
        <Text size="sm" c="dimmed" className="leave-box-text">
          {t('members.leaveHint')}
        </Text>
        <Button
          ref={leaveButton}
          variant="outline"
          color="red"
          leftSection={<LogOut size={18} aria-hidden="true" />}
          disabled={action.isPending}
          onClick={() => {
            trigger.current = leaveButton.current
            setLeaving(true)
          }}
        >
          {t('members.leave')}
        </Button>
      </Group>
    </Paper>
  )

  const roleConfirmation = (member: Member): Confirmation => {
    const nextRole = member.role === 'dm' ? 'player' : 'dm'
    return {
      action: { kind: 'member', campaignId: campaign.id, userId: member.user_id, role: nextRole },
      message: t('members.confirmRole', {
        name: member.display_name,
        role: t(`campaign.role.${nextRole}`),
      }),
    }
  }
  // A choice that opens a dialog gives the sheet back first; focus returns to the `···` button
  // when the dialog closes.
  const fromSheet = (next: () => void) => {
    setSheet(null)
    setSheetView(null)
    next()
  }
  const sheetMember =
    sheet?.kind === 'member' ? members.data?.find((m) => m.user_id === sheet.userId) : undefined
  const sheetInvitation =
    sheet?.kind === 'invitation' ? invitations.data?.find((i) => i.id === sheet.id) : undefined

  const membersPanel = (
    <section aria-labelledby="dm-members-title">
      <Stack gap="sm">
        <h2 id="dm-members-title" className="dm-subheading dm-panel-title">
          {t('dm.panelMembers')}
        </h2>
        <div className="members-head">
          <Text size="sm" c="dimmed">
            {members.data ? t('members.count', { count: members.data.length }) : ''}
          </Text>
          <Button
            ref={inviteButton}
            leftSection={<UserPlus size={18} aria-hidden="true" />}
            onClick={(event) => openInvite(event.currentTarget)}
          >
            {t('members.invite')}
          </Button>
        </div>
        <QueryFeedback
          pending={members.isPending}
          error={members.isError}
          cause={members.error}
          retry={() => {
            void members.refetch()
          }}
        />
        <QueryFeedback
          pending={false}
          error={invitations.isError}
          cause={invitations.error}
          retry={() => void invitations.refetch()}
        />
        {rosterFeedback}
        {!members.isError && !!members.data?.length && (
          <ul className="member-list">
            <li className="member-list-head" aria-hidden="true">
              <span>{t('members.colMember')}</span>
              <span>{t('members.colCharacter')}</span>
              <span>{t('members.colRole')}</span>
              <span />
            </li>
            {members.data.map((member) => {
              const you = member.user_id === user.id
              const line = memberCharacters?.(member)
              const more = t('members.more', { name: member.display_name })
              return (
                <li key={member.user_id} className="member-row">
                  <div className="member-identity">
                    <span className="member-name user-copy">
                      {member.display_name}
                      {you ? ` · ${t('members.you')}` : ''}
                    </span>
                    <span className="member-email user-copy">{member.email}</span>
                  </div>
                  <div className="member-second">
                    <span className="member-role" data-role={member.role}>
                      {t(`campaign.role.${member.role}`)}
                    </span>
                    {member.role === 'dm' && line && (
                      <span className="member-sep" aria-hidden="true">
                        ·
                      </span>
                    )}
                    {line && <span className="member-character">{line}</span>}
                  </div>
                  <ActionIcon
                    className="member-action"
                    variant="subtle"
                    size={44}
                    aria-label={more}
                    aria-haspopup="dialog"
                    title={more}
                    onClick={(event) =>
                      openSheet({ kind: 'member', userId: member.user_id }, event.currentTarget)
                    }
                  >
                    <Ellipsis size={20} aria-hidden="true" />
                  </ActionIcon>
                </li>
              )
            })}
            {!invitations.isError &&
              invitations.data?.map((item, index) => {
                const more = t('activation.invite.options', { email: item.email })
                return (
                  <li key={item.id} className="member-row" data-invitation>
                    <div className="member-identity">
                      <span
                        className="member-name user-copy"
                        tabIndex={index === 0 ? -1 : undefined}
                        data-sent-first={index === 0 || undefined}
                      >
                        {item.email}
                      </span>
                    </div>
                    <div className="member-second">
                      <InvitationLine expiresAt={item.expires_at} />
                    </div>
                    <ActionIcon
                      className="member-action"
                      variant="subtle"
                      size={44}
                      aria-label={more}
                      aria-haspopup="dialog"
                      title={more}
                      disabled={action.isPending}
                      onClick={(event) =>
                        openSheet({ kind: 'invitation', id: item.id }, event.currentTarget)
                      }
                    >
                      <Ellipsis size={20} aria-hidden="true" />
                    </ActionIcon>
                  </li>
                )
              })}
          </ul>
        )}
      </Stack>
    </section>
  )

  const modulesPanel = (
    <section aria-labelledby="dm-modules-title" className="dm-settings-panel">
      <Stack>
        <h2 id="dm-modules-title" className="dm-subheading dm-panel-title">
          {t('dm.panelModules')}
        </h2>
        <Text size="sm" c="dimmed" className="tabular">
          {t('dm.modulesSeen', {
            seen: [...enabledModules].filter((key) => implementedModuleKeys.has(key)).length,
            total: campaignModules.length,
          })}
        </Text>
        <ul className="module-switch-list">
          {campaignModules.map(({ key, label, icon: Icon }) => {
            const active = enabledModules.has(key)
            return (
              <li key={key} className="module-switch-row" data-active={active || undefined}>
                <Icon size={20} className="feature-icon" aria-hidden="true" />
                <span className="module-switch-name">{t(label)}</span>
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
  )

  const auditPanel = (
    <section aria-labelledby="dm-audit-title" className="dm-settings-panel">
      <Stack>
        <h2 id="dm-audit-title" className="dm-subheading dm-panel-title">
          {t('dm.panelAudit')}
        </h2>
        {(() => {
          const events = auditEvents.data
          const names = events ? auditCharacterNames(events) : new Map<string, string>()
          const present = events
            ? [...new Set(events.map((event) => event.character_id))].flatMap((id) =>
                names.has(id) ? [{ id, name: names.get(id)! }] : [],
              )
            : []
          present.sort((a, b) => a.name.localeCompare(b.name, i18n.language))
          // A character that has left the events cannot stay chosen.
          const characterId = present.some((entry) => entry.id === auditCharacter)
            ? auditCharacter
            : null
          return (
            <>
              <div className="audit-filters">
                <NativeSelect
                  ref={auditSelect}
                  aria-label={t('dm.auditCharacter')}
                  value={characterId ?? ''}
                  onChange={(event) => setAuditCharacter(event.currentTarget.value || null)}
                  data={[
                    { value: '', label: t('dm.auditAllCharacters') },
                    ...present.map(({ id, name }) => ({ value: id, label: name })),
                  ]}
                />
                <SegmentedControl
                  value={auditFilter}
                  onChange={(value) => setAuditFilter(value as AuditFilter)}
                  aria-label={t('dm.auditTimeline')}
                  className="ink-seg audit-filter"
                  data={[
                    { value: 'all', label: t('dm.auditFilterAll') },
                    { value: 'characters', label: t('dm.auditFilterCharacters') },
                    { value: 'resources', label: t('dm.auditFilterResources') },
                  ]}
                />
              </div>
              <QueryFeedback
                pending={auditEvents.isPending}
                error={auditEvents.isError}
                cause={auditEvents.error}
                retry={() => void auditEvents.refetch()}
              />
              {!auditEvents.isError &&
                events &&
                (() => {
                  const memberNames = new Map<string, string>()
                  for (const member of members.data ?? []) {
                    memberNames.set(member.user_id, member.display_name || member.email)
                  }
                  const filtered = filterAudit(events, { family: auditFilter, characterId })
                  if (!events.length) return <Text c="dimmed">{t('dm.noAudit')}</Text>
                  if (!filtered.length)
                    return (
                      <div className="audit-empty">
                        <Text>{t('dm.auditNoMatch')}</Text>
                        <Button
                          variant="subtle"
                          onClick={() => {
                            setAuditFilter('all')
                            setAuditCharacter(null)
                            // The button leaves with the empty result: the filter takes the focus.
                            auditSelect.current?.focus()
                          }}
                        >
                          {t('dm.auditShowAll')}
                        </Button>
                      </div>
                    )
                  return (
                    <AuditTimeline
                      events={filtered}
                      context={events}
                      memberNames={memberNames}
                      now={auditEvents.dataUpdatedAt}
                      characterHref={(id) => `/campaign/${campaign.id}/party/${id}`}
                    />
                  )
                })()}
            </>
          )
        })()}
      </Stack>
    </section>
  )

  const panels: Record<DmPanel, ReactNode> = {
    members: membersPanel,
    level: (
      <PartyLevelControl
        campaignId={campaign.id}
        current={campaign.party_level}
        suggested={partySuggested}
        characters={partyCharacters}
        charactersFeedback={partyFeedback}
        focusStepper={stepperOnArrival}
        onStepperFocused={stepperFocused}
      />
    ),
    modules: modulesPanel,
    dice: (
      <DiceSettingsControl
        campaignId={campaign.id}
        current={{ dice_mode: campaign.dice_mode, roll_visibility: campaign.roll_visibility }}
      />
    ),
    content: contentPanel,
    items: itemsPanel,
    bestiary: bestiaryPanel,
    audit: auditPanel,
  }

  return (
    <>
      {dm ? (
        <DmCenterShell
          current={activePanel}
          pendingProposals={pendingProposals}
          refresh={
            (activePanel === 'members' || activePanel === 'audit') && (
              <RefreshControl onRefresh={refreshAll} fetching={fetching} updatedAt={updatedAt} />
            )
          }
        >
          <Stack gap="xl">
            <ActionFeedback error={action.error} />
            {panels[activePanel]}
          </Stack>
        </DmCenterShell>
      ) : (
        <Stack gap="xl">
          <PageHead title={t('members.title')} description={t('members.playerHint')} />
          <ActionFeedback error={action.error} />
          {!playerPreview && leaveBox}
        </Stack>
      )}
      {leaving && (
        <LeaveCampaignDialog
          campaign={campaign}
          onClose={() => {
            setLeaving(false)
            focusWhenReady(() => trigger.current)
          }}
          onLeft={() => setLeaving(false)}
        />
      )}
      <ActionSheet
        opened={!!(sheetMember || sheetInvitation)}
        onClose={closeSheet}
        title={sheetMember?.display_name ?? sheetInvitation?.email ?? ''}
        subtitle={sheetMember?.email}
      >
        {sheetMember && (
          <MemberActions
            member={sheetMember}
            you={sheetMember.user_id === user.id}
            onlyDm={sheetMember.role === 'dm' && !!lastDm}
            busy={action.isPending}
            view={sheetView}
            setView={setSheetView}
            onClose={closeSheet}
            characters={memberCharacterSheet && ((slot) => memberCharacterSheet(sheetMember, slot))}
            onRole={() =>
              fromSheet(() => openConfirmation(roleConfirmation(sheetMember), trigger.current!))
            }
            onRemove={() =>
              fromSheet(() =>
                openConfirmation(
                  {
                    action: {
                      kind: 'member',
                      campaignId: campaign.id,
                      userId: sheetMember.user_id,
                      role: null,
                    },
                    message: t('members.confirmRemove', { name: sheetMember.display_name }),
                  },
                  trigger.current!,
                ),
              )
            }
            onLeave={() => fromSheet(() => setLeaving(true))}
          />
        )}
        {sheetInvitation && (
          <InvitationActions
            busy={action.isPending}
            onShare={() => showInstructions(sheetInvitation.email)}
            onCancel={() =>
              fromSheet(() =>
                openConfirmation(
                  {
                    action: { kind: 'revoke', invitationId: sheetInvitation.id },
                    message: t('members.confirmRevoke', { email: sheetInvitation.email }),
                  },
                  trigger.current!,
                ),
              )
            }
          />
        )}
      </ActionSheet>
      <Modal
        opened={inviteOpen}
        onClose={closeInvite}
        title={t('members.invite')}
        returnFocus={false}
        centered
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
        centered
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
    </>
  )
}
