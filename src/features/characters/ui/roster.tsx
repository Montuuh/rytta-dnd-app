import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Ellipsis,
  Hourglass,
  Moon,
  PenLine,
  Plus,
  ScrollText,
  UsersRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { CharacterPortrait } from '@/features/inventory'
import { PageHead } from '@/shared/ui/page-head'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { newRequestId } from '@/shared/lib/request-id'
import {
  characterRosterQuery,
  sheetSummariesQuery,
  useActivateCharacter,
  useArchiveAction,
  useCreateOwnCharacter,
} from '../api'
import { isClassKey } from '../domain/rules'
import {
  canRestore,
  rosterLimit,
  rosterOf,
  rostersByPlayer,
  type RosterEntry,
} from '../domain/roster'
import type { SheetSummary } from '../domain/sheet'
import './roster.css'

type Entry = RosterEntry & { portraitPath: string | null }
type Notice = {
  tone: 'pending' | 'done' | 'error'
  text: string
  /** Where focus goes when the notice is closed (the control that started the action). */
  returnTo?: () => HTMLElement | null
}

/**
 * RYT-044 character manager. A Player picks the active character from a radio-card roster,
 * fills free slots and archives or restores characters; a DM sees every Player's roster in a
 * compact list and every archived character; a DM previewing a Player sees that roster
 * read-only.
 */
export function CharacterRosterPage() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const { playerPreview, previewUserId, previewLabel } = useCampaignView()
  const userId = state.user!.id
  const dm = campaign.role === 'dm' && !playerPreview
  const ownerId = playerPreview ? previewUserId : dm ? undefined : userId
  const roster = useQuery({
    ...characterRosterQuery(userId, campaign.id, ownerId ?? undefined),
    enabled: !playerPreview || Boolean(previewUserId),
  })
  const summaries = useQuery(sheetSummariesQuery(userId, campaign.id))
  const members = useQuery({ ...membersQuery(userId, campaign.id), enabled: dm })
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  // Every outcome lands above the roster; bring it into view (phones scroll past the grid).
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [notice])
  const partyPath = `/campaign/${campaign.id}/party`
  const title = dm
    ? t('roster.dmTitle')
    : playerPreview && previewLabel
      ? t('roster.previewTitle', { name: previewLabel })
      : t('roster.title')
  const entries = roster.data ?? []
  const players = (members.data ?? []).filter((member) => member.role === 'player')
  const ownerName = (entry: Entry) =>
    entry.user_id
      ? (members.data?.find((member) => member.user_id === entry.user_id)?.display_name ?? '')
      : t('characters.unassigned')
  const own = ownerId ? rosterOf(entries, ownerId) : null
  const archived = dm ? entries.filter((entry) => entry.archived_at) : (own?.archived ?? [])
  return (
    <Stack gap="lg" className="roster-page">
      <Button
        component={Link}
        to={partyPath}
        variant="subtle"
        className="roster-back"
        leftSection={<ArrowLeft size={18} aria-hidden="true" />}
      >
        {t('roster.back')}
      </Button>
      <PageHead
        title={title}
        description={dm ? t('roster.dmLede') : playerPreview ? undefined : t('roster.lede')}
        refresh={
          <RefreshControl
            onRefresh={() => void roster.refetch()}
            fetching={roster.isFetching}
            updatedAt={roster.dataUpdatedAt}
          />
        }
      />
      <RosterNotice
        notice={notice}
        noticeRef={noticeRef}
        onClose={() => {
          // Back to the control that started the action, else the active character's radio.
          const origin = notice?.returnTo?.()
          setNotice(null)
          focusWhenReady(() =>
            origin?.isConnected
              ? origin
              : (document.querySelector<HTMLElement>('.roster-page input[type="radio"]:checked') ??
                document.querySelector<HTMLElement>('.roster-page .roster-back')),
          )
        }}
      />
      {roster.isPending && roster.fetchStatus !== 'idle' && (
        <Text role="status">{t('common.loading')}</Text>
      )}
      {roster.isError && (
        <Alert color="red" role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void roster.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {roster.data &&
        (dm ? (
          <DmRosters
            entries={entries}
            summaries={summaries.data}
            players={players}
            membersError={members.isError}
            retryMembers={() => void members.refetch()}
            onNotice={setNotice}
            noticeRef={noticeRef}
          />
        ) : playerPreview ? (
          !own || own.entries.length === 0 ? (
            <Text c="dimmed">{t('roster.previewEmpty')}</Text>
          ) : (
            <SlotGrid label={title} used={own.entries.length}>
              {own.entries.map((entry) => (
                <RosterCard key={entry.id} entry={entry} summary={find(summaries.data, entry)} />
              ))}
              <EmptySlots count={rosterLimit - own.entries.length} />
            </SlotGrid>
          )
        ) : (
          <PlayerRoster
            entries={own?.entries ?? []}
            hasArchived={archived.length > 0}
            summaries={summaries.data}
            onNotice={setNotice}
            noticeRef={noticeRef}
          />
        ))}
      {roster.data && !playerPreview && archived.length > 0 && (
        <ArchivedSection
          archived={archived}
          defaultOpen={!dm && (own?.entries.length ?? 0) === 0}
          entries={entries}
          summaries={summaries.data}
          ownerName={dm ? ownerName : undefined}
          onNotice={setNotice}
          noticeRef={noticeRef}
        />
      )}
    </Stack>
  )
}

const find = (summaries: SheetSummary[] | undefined, entry: RosterEntry) =>
  summaries?.find((summary) => summary.character_id === entry.id)

/** Outcome of the last roster action, shown above the roster: progress and success are
 * polite status text, failures are alerts with a Close action. */
function RosterNotice({
  notice,
  noticeRef,
  onClose,
}: {
  notice: Notice | null
  noticeRef: RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div ref={noticeRef} tabIndex={-1} className="roster-notice">
      <div aria-live="polite">
        {notice && notice.tone !== 'error' && (
          <Text size="sm" className="roster-done" data-tone={notice.tone}>
            {notice.tone === 'done' && <Check size={16} aria-hidden="true" />}
            {notice.text}
          </Text>
        )}
      </div>
      {notice?.tone === 'error' && (
        <Alert
          color="red"
          role="alert"
          withCloseButton
          closeButtonLabel={t('roster.dismiss')}
          onClose={onClose}
        >
          {notice.text}
        </Alert>
      )}
    </div>
  )
}

type NoticeProps = {
  onNotice: (notice: Notice | null) => void
  noticeRef: RefObject<HTMLDivElement | null>
}

/** The Player's own roster: a native radio group of character cards plus free slots. */
function PlayerRoster({
  entries,
  hasArchived,
  summaries,
  onNotice,
  noticeRef,
}: {
  entries: Entry[]
  hasArchived: boolean
  summaries: SheetSummary[] | undefined
} & NoticeProps) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const activate = useActivateCharacter(campaign.id)
  const [creating, setCreating] = useState(false)
  const createButton = useRef<HTMLButtonElement>(null)
  const groupId = useId()
  const serverActive = entries.find((entry) => entry.is_active)
  // The newest pending choice shows as selected until the server answers.
  const selected = activate.isPending ? activate.variables : serverActive?.id
  const nameOf = (id?: string) => entries.find((entry) => entry.id === id)?.name ?? ''
  // No character in the roster: no empty radio group. With archived ones, the welcome points
  // to them (the Archived section below opens by default).
  if (entries.length === 0) return <FirstCharacter withArchived={hasArchived} />
  return (
    <>
      <div role="radiogroup" aria-label={t('roster.choose')} aria-describedby={`${groupId}-count`}>
        <SlotGrid label={null} used={entries.length} countId={`${groupId}-count`}>
          {entries.map((entry) => (
            <RosterCard
              key={entry.id}
              entry={entry}
              summary={find(summaries, entry)}
              onNotice={onNotice}
              noticeRef={noticeRef}
              radio={{
                name: `${groupId}-active`,
                checked: selected === entry.id,
                pending: activate.isPending && activate.variables === entry.id,
                onSelect: () => {
                  onNotice({ tone: 'pending', text: t('roster.switching', { name: entry.name }) })
                  activate.mutate(entry.id, {
                    onSuccess: () =>
                      onNotice({ tone: 'done', text: t('roster.switched', { name: entry.name }) }),
                    onError: (error) => {
                      const name = serverActive?.name ?? nameOf(entry.id)
                      onNotice({
                        tone: 'error',
                        text:
                          error.message === 'trading'
                            ? t('roster.errorTrade', { name })
                            : error.message === 'combat'
                              ? t('roster.errorCombat', { name })
                              : t('roster.errorSwitch'),
                      })
                    },
                  })
                },
              }}
            />
          ))}
          {entries.length < rosterLimit && (
            <li className="roster-slot is-new">
              <button
                ref={createButton}
                type="button"
                className="roster-new"
                aria-label={t('roster.newSlotLabel', {
                  slot: entries.length + 1,
                  limit: rosterLimit,
                })}
                onClick={() => setCreating(true)}
              >
                <span className="roster-ring" aria-hidden="true">
                  <Plus size={28} />
                </span>
                <span className="roster-new-label" aria-hidden="true">
                  {t('roster.newSlot')}
                </span>
              </button>
            </li>
          )}
          <EmptySlots count={rosterLimit - entries.length - 1} />
        </SlotGrid>
      </div>
      {entries.length >= rosterLimit && (
        <Text size="sm" c="dimmed">
          {t('roster.full')}
        </Text>
      )}
      {creating && (
        <CreateCharacterDialog
          onClose={() => {
            setCreating(false)
            focusWhenReady(() => createButton.current)
          }}
        />
      )}
    </>
  )
}

/** DM view: one compact list per Player (active first) with a four-slot meter. */
function DmRosters({
  entries,
  summaries,
  players,
  membersError,
  retryMembers,
  onNotice,
  noticeRef,
}: {
  entries: Entry[]
  summaries: SheetSummary[] | undefined
  players: { user_id: string; display_name: string }[]
  membersError: boolean
  retryMembers: () => void
} & NoticeProps) {
  const { t } = useTranslation()
  if (membersError)
    return (
      <Alert color="red" role="alert">
        {t('query.error')}{' '}
        <Button variant="subtle" onClick={retryMembers}>
          {t('common.retry')}
        </Button>
      </Alert>
    )
  if (players.length === 0) return <Text c="dimmed">{t('characters.noPlayers')}</Text>
  return (
    <Stack gap="lg">
      {rostersByPlayer(entries, players).map(({ player, entries: own }) => {
        const headingId = `roster-player-${player.user_id}`
        return (
          <section key={player.user_id} aria-labelledby={headingId} className="roster-player">
            <div className="roster-player-head">
              <Title order={2} id={headingId} className="roster-player-name user-copy">
                {player.display_name}
              </Title>
              <SlotMeter used={own.length} />
            </div>
            {own.length === 0 ? (
              <Text c="dimmed">{t('roster.noCharacters')}</Text>
            ) : (
              <ul className="roster-rows">
                {own.map((entry) => (
                  <RosterRow
                    key={entry.id}
                    entry={entry}
                    summary={find(summaries, entry)}
                    state={entry.is_active ? 'active' : 'reserve'}
                    actions={<CardMenu entry={entry} onNotice={onNotice} noticeRef={noticeRef} />}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </Stack>
  )
}

/** Four small rings: filled ones are characters in the roster. The count is read out. */
function SlotMeter({ used }: { used: number }) {
  const { t } = useTranslation()
  return (
    <span className="slot-meter">
      <span className="slot-meter-rings" aria-hidden="true">
        {Array.from({ length: rosterLimit }, (_, index) => (
          <span key={index} className="slot-meter-ring" data-used={index < used || undefined} />
        ))}
      </span>
      <span className="visually-hidden">{t('roster.count', { used, limit: rosterLimit })}</span>
    </span>
  )
}

/** Four slots per Player; the count is announced, the free ones are drawn. */
function SlotGrid({
  label,
  used,
  countId,
  children,
}: {
  label: string | null
  used: number
  countId?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const fallbackId = useId()
  const id = countId ?? fallbackId
  const count = t('roster.count', { used, limit: rosterLimit })
  return (
    <>
      <span id={id} className="visually-hidden">
        {count}
      </span>
      <ul
        className="roster-grid"
        aria-label={label ? `${label}, ${count}` : undefined}
        aria-describedby={label ? undefined : id}
      >
        {children}
      </ul>
    </>
  )
}

function EmptySlots({ count }: { count: number }) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    <li key={index} className="roster-slot is-empty" aria-hidden="true">
      <span className="roster-ring" />
    </li>
  ))
}

function useMeta(summary: SheetSummary | undefined) {
  const { t } = useTranslation()
  const complete = summary?.status === 'complete'
  return {
    complete,
    meta: complete
      ? t('sheet.classLevel', {
          class:
            summary.class_key && isClassKey(summary.class_key)
              ? t(`srd.class.${summary.class_key}`)
              : (summary.class_label ?? ''),
          level: summary.level,
        })
      : null,
  }
}

/** The sheet action of a character: "Sheet" when complete, "Finish sheet" for a draft. */
function SheetLink({
  entry,
  complete,
  compact = false,
}: {
  entry: Entry
  complete: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const path = `/campaign/${campaign.id}/party/${entry.id}${complete ? '' : '/create'}`
  const Icon = complete ? ScrollText : PenLine
  const label = t(complete ? 'roster.sheetOf' : 'roster.continueSheetOf', { name: entry.name })
  if (compact)
    return (
      <ActionIcon
        component={Link}
        to={path}
        variant="subtle"
        size={44}
        aria-label={label}
        title={label}
        className="roster-row-sheet"
        data-draft={!complete || undefined}
      >
        <Icon size={20} aria-hidden="true" />
      </ActionIcon>
    )
  return (
    <Link
      to={path}
      className="roster-foot-link"
      data-draft={!complete || undefined}
      aria-label={label}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{t(complete ? 'roster.openSheet' : 'roster.continueSheet')}</span>
    </Link>
  )
}

/** A character card: the choice area (radio for the Player, read-only otherwise) and a footer
 * band inside the same frame with the sheet action and, for owners, the card menu. */
function RosterCard({
  entry,
  summary,
  radio,
  onNotice,
  noticeRef,
}: {
  entry: Entry
  summary: SheetSummary | undefined
  radio?: { name: string; checked: boolean; pending: boolean; onSelect: () => void }
} & Partial<NoticeProps>) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const id = useId()
  const active = radio ? radio.checked : entry.is_active
  const { complete, meta } = useMeta(summary)
  const body = (
    <>
      <span className="roster-medallion">
        <CharacterPortrait
          campaignId={campaign.id}
          characterId={entry.id}
          name={entry.name}
          path={entry.portraitPath}
          size={76}
        />
        {active && (
          <span className="roster-check" aria-hidden="true">
            {radio?.pending ? <Hourglass size={14} /> : <Check size={14} strokeWidth={3} />}
          </span>
        )}
      </span>
      <span id={`${id}-name`} className="roster-name user-copy">
        {entry.name}
      </span>
      {meta && (
        <span id={`${id}-meta`} className="roster-meta user-copy">
          {meta}
        </span>
      )}
      <span className="roster-state">
        {active ? <Check size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        {t(active ? 'roster.active' : 'roster.reserve')}
      </span>
    </>
  )
  return (
    <li className="roster-slot" data-active={active || undefined}>
      <div
        className="roster-card"
        role={radio ? undefined : 'group'}
        aria-labelledby={radio ? undefined : `${id}-name`}
      >
        {radio ? (
          <label className="roster-choice is-choice">
            <input
              type="radio"
              className="roster-input"
              name={radio.name}
              value={entry.id}
              checked={radio.checked}
              onChange={radio.onSelect}
              aria-labelledby={`${id}-name`}
              aria-describedby={meta ? `${id}-meta` : undefined}
            />
            {body}
          </label>
        ) : (
          <div className="roster-choice">{body}</div>
        )}
        <div className="roster-card-foot">
          <SheetLink entry={entry} complete={complete} />
        </div>
        {/* Sibling of the choice area (never inside the radio label), pinned to the corner. */}
        {onNotice && noticeRef && (
          <div className="roster-card-menu">
            <CardMenu entry={entry} onNotice={onNotice} noticeRef={noticeRef} />
          </div>
        )}
      </div>
    </li>
  )
}

/** Compact row for the DM lists and the archived section. */
function RosterRow({
  entry,
  summary,
  state,
  owner,
  note,
  actions,
}: {
  entry: Entry
  summary: SheetSummary | undefined
  state: 'active' | 'reserve' | 'archived'
  owner?: string
  /** A short reason under the meta line (for example "No free slot"). */
  note?: string
  actions: ReactNode
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const id = useId()
  const { complete, meta } = useMeta(summary)
  return (
    <li className="roster-row" data-state={state}>
      <div className="roster-row-main" role="group" aria-labelledby={`${id}-name`}>
        <CharacterPortrait
          campaignId={campaign.id}
          characterId={entry.id}
          name={entry.name}
          path={entry.portraitPath}
          size={44}
        />
        <div className="roster-row-text">
          <span id={`${id}-name`} className="roster-row-name user-copy">
            {entry.name}
          </span>
          <span className="roster-row-meta user-copy">
            {[owner, meta ?? t('roster.draft')].filter(Boolean).join(', ')}
          </span>
          {state !== 'archived' && (
            <span className="roster-state">
              {state === 'active' ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Moon size={14} aria-hidden="true" />
              )}
              {t(state === 'active' ? 'roster.active' : 'roster.reserve')}
            </span>
          )}
          {note && <span className="roster-row-note">{note}</span>}
        </div>
      </div>
      <div className="roster-row-actions">
        <SheetLink entry={entry} complete={complete} compact />
        {actions}
      </div>
    </li>
  )
}

/** Card menu with "Archive character"; the active character explains why it cannot go. */
function CardMenu({ entry, onNotice, noticeRef }: { entry: Entry } & NoticeProps) {
  const { t } = useTranslation()
  const trigger = useRef<HTMLButtonElement>(null)
  const [archiving, setArchiving] = useState(false)
  const hintId = useId()
  const blocked = Boolean(entry.user_id) && entry.is_active
  return (
    <>
      <Menu position="bottom-end" withinPortal withInitialFocusPlaceholder={false}>
        <Menu.Target>
          <ActionIcon
            ref={trigger}
            variant="subtle"
            size={44}
            className="roster-menu"
            aria-label={t('roster.more', { name: entry.name })}
            title={t('roster.more', { name: entry.name })}
          >
            <Ellipsis size={20} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {/* For the active character the item stays reachable by arrow keys (aria-disabled,
              not disabled) and carries the reason as its description. */}
          <Menu.Item
            leftSection={<Archive size={18} aria-hidden="true" />}
            // Mantine derives aria-disabled from `disabled`, which would also drop the item from
            // arrow-key navigation; set it on the element instead.
            ref={(node: HTMLButtonElement | null) => {
              if (node && blocked) node.setAttribute('aria-disabled', 'true')
            }}
            aria-describedby={blocked ? hintId : undefined}
            data-blocked={blocked || undefined}
            className="roster-menu-item"
            closeMenuOnClick={!blocked}
            onClick={() => !blocked && setArchiving(true)}
          >
            {t('roster.archive')}
          </Menu.Item>
          {blocked && (
            <Menu.Label id={hintId} className="roster-menu-hint">
              {t('roster.archiveActiveHint')}
            </Menu.Label>
          )}
        </Menu.Dropdown>
      </Menu>
      {archiving && (
        <ArchiveDialog
          entry={entry}
          onClose={() => {
            setArchiving(false)
            focusWhenReady(() => trigger.current)
          }}
          onArchived={(text) => {
            setArchiving(false)
            onNotice({ tone: 'done', text })
            // The card leaves the roster; continue from the outcome message.
            focusWhenReady(() => noticeRef.current)
          }}
        />
      )}
    </>
  )
}

/** Confirmation before archiving: says what it frees and that it can be undone. */
export function ArchiveDialog({
  entry,
  onClose,
  onArchived,
}: {
  entry: { id: string; name: string; user_id: string | null }
  onClose: () => void
  onArchived: (text: string) => void
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const action = useArchiveAction(campaign.id)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (action.isError) errorRef.current?.focus()
  }, [action.isError])
  const npc = !entry.user_id
  const error = action.error?.message
  return (
    <Modal
      opened
      onClose={() => !action.isPending && onClose()}
      title={t('roster.archiveTitle', { name: entry.name })}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        <Text>{t(npc ? 'roster.archiveBodyNpc' : 'roster.archiveBody')}</Text>
        {action.isError && (
          <Alert ref={errorRef} tabIndex={-1} color="red" role="alert">
            {error === 'active'
              ? t('roster.errorActive', { name: entry.name })
              : error === 'trading'
                ? t('roster.errorArchiveTrade', { name: entry.name })
                : error === 'combat'
                  ? t('roster.errorArchiveCombat', { name: entry.name })
                  : t('roster.errorArchive')}
          </Alert>
        )}
        <div className="roster-dialog-actions">
          <Button variant="subtle" data-autofocus disabled={action.isPending} onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            color="red"
            variant="light"
            loading={action.isPending}
            leftSection={<Archive size={18} aria-hidden="true" />}
            onClick={() =>
              action.mutate(
                { kind: 'archive', characterId: entry.id },
                {
                  onSuccess: () =>
                    onArchived(
                      t(npc ? 'roster.archivedDoneNpc' : 'roster.archivedDone', {
                        name: entry.name,
                      }),
                    ),
                },
              )
            }
          >
            {t('roster.archiveConfirm')}
          </Button>
        </div>
      </Stack>
    </Modal>
  )
}

/** Collapsed list of archived characters: open the sheet or restore while a slot is free. */
function ArchivedSection({
  archived,
  defaultOpen,
  entries,
  summaries,
  ownerName,
  onNotice,
  noticeRef,
}: {
  archived: Entry[]
  defaultOpen: boolean
  entries: Entry[]
  summaries: SheetSummary[] | undefined
  ownerName?: (entry: Entry) => string
} & NoticeProps) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const action = useArchiveAction(campaign.id)
  const restore = (entry: Entry, origin: HTMLElement) =>
    action.mutate(
      { kind: 'restore', characterId: entry.id },
      {
        onSuccess: () => {
          onNotice({ tone: 'done', text: t('roster.restored', { name: entry.name }) })
          focusWhenReady(() => noticeRef.current)
        },
        onError: (error) =>
          onNotice({
            tone: 'error',
            text:
              error.message === 'limit'
                ? t('roster.errorRestoreLimit', { name: entry.name })
                : t('roster.errorRestore'),
            returnTo: () => origin,
          }),
      },
    )
  return (
    <Accordion
      className="roster-archived"
      chevronPosition="right"
      variant="contained"
      defaultValue={defaultOpen ? 'archived' : null}
    >
      <Accordion.Item value="archived">
        <Accordion.Control icon={<Archive size={18} aria-hidden="true" />}>
          <span className="roster-archived-title">{t('roster.archived')}</span>
          <span className="roster-archived-count">{archived.length}</span>
        </Accordion.Control>
        <Accordion.Panel>
          <ul className="roster-rows">
            {archived.map((entry) => {
              const free = canRestore(entry, entries)
              const pending =
                action.isPending &&
                action.variables?.kind === 'restore' &&
                action.variables.characterId === entry.id
              return (
                <RosterRow
                  key={entry.id}
                  entry={entry}
                  summary={find(summaries, entry)}
                  state="archived"
                  owner={ownerName?.(entry)}
                  note={free ? undefined : t('roster.noSlot')}
                  actions={
                    <Button
                      variant="light"
                      className="roster-restore"
                      leftSection={<ArchiveRestore size={18} aria-hidden="true" />}
                      disabled={!free || (action.isPending && !pending)}
                      loading={pending}
                      aria-label={t('roster.restoreLabel', { name: entry.name })}
                      onClick={(event) => restore(entry, event.currentTarget)}
                    >
                      {t('roster.restore')}
                    </Button>
                  }
                />
              )
            })}
          </ul>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}

/** First-character onboarding: what the Player sees on Party with an empty roster. The rings
 * only picture the four slots; the button is the one action. */
export function RosterWelcome({
  onCreate,
  ctaRef,
  withArchived = false,
  archivedLink = false,
}: {
  onCreate: () => void
  ctaRef?: RefObject<HTMLButtonElement | null>
  /** The Player only has archived characters: offer them alongside creating a new one. */
  withArchived?: boolean
  /** Show a link to the roster's Archived section (Party); on the roster it sits below. */
  archivedLink?: boolean
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const id = useId()
  return (
    <section className="roster-welcome" aria-labelledby={`${id}-title`}>
      <div className="roster-welcome-slots" aria-hidden="true">
        {Array.from({ length: rosterLimit }, (_, index) => (
          <span key={index} className="roster-ring" />
        ))}
      </div>
      <Title order={2} id={`${id}-title`} className="roster-welcome-title">
        {t('roster.welcomeTitle')}
      </Title>
      <Text className="roster-welcome-text">
        {t(withArchived ? 'roster.welcomeArchived' : 'roster.welcomeText')}
      </Text>
      <div className="roster-welcome-actions">
        <Button
          ref={ctaRef}
          size="lg"
          leftSection={<Plus size={20} aria-hidden="true" />}
          onClick={onCreate}
          className="roster-welcome-cta"
        >
          {t(withArchived ? 'roster.welcomeCtaNew' : 'roster.welcomeCta')}
        </Button>
        {withArchived && archivedLink && (
          <Button
            component={Link}
            to={`/campaign/${campaign.id}/party/roster`}
            size="lg"
            variant="light"
            leftSection={<ArchiveRestore size={20} aria-hidden="true" />}
          >
            {t('roster.welcomeArchivedLink')}
          </Button>
        )}
      </div>
    </section>
  )
}

/** Onboarding for a Player with no characters in the roster: the welcome plus its dialog.
 * Closing the dialog returns focus to the call to action. */
export function FirstCharacter({
  withArchived = false,
  archivedLink = false,
}: {
  withArchived?: boolean
  archivedLink?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const cta = useRef<HTMLButtonElement>(null)
  return (
    <>
      <RosterWelcome
        ctaRef={cta}
        withArchived={withArchived}
        archivedLink={archivedLink}
        onCreate={() => setCreating(true)}
      />
      {creating && (
        <CreateCharacterDialog
          onClose={() => {
            setCreating(false)
            focusWhenReady(() => cta.current)
          }}
        />
      )}
    </>
  )
}

/** Name the character, create it (idempotent request) and continue in the sheet wizard. */
export function CreateCharacterDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const navigate = useNavigate()
  const action = useCreateOwnCharacter(campaign.id)
  const [name, setName] = useState('')
  const [requestId] = useState(() => newRequestId())
  const [invalid, setInvalid] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (action.isError) errorRef.current?.focus()
  }, [action.isError])
  return (
    <Modal
      opened
      onClose={() => !action.isPending && onClose()}
      title={t('roster.createTitle')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (action.isPending) return
          if (!name.trim()) return setInvalid(true)
          action.mutate(
            { name: name.trim(), requestId },
            { onSuccess: (id) => navigate(`/campaign/${campaign.id}/party/${id}/create`) },
          )
        }}
      >
        <Stack>
          <TextInput
            data-autofocus
            withAsterisk
            label={t('characters.name')}
            description={t('roster.createHint')}
            maxLength={100}
            value={name}
            readOnly={action.isPending}
            error={invalid && !name.trim() ? t('hub.invalidName') : undefined}
            onChange={(event) => {
              setName(event.currentTarget.value)
              setInvalid(false)
            }}
          />
          {action.isError && (
            <Alert ref={errorRef} tabIndex={-1} color="red" role="alert">
              {t(action.error.message === 'limit' ? 'roster.errorLimit' : 'roster.errorCreate')}
            </Alert>
          )}
          <div className="roster-dialog-actions">
            <Button variant="subtle" disabled={action.isPending} onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" loading={action.isPending}>
              {t('roster.createSubmit')}
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  )
}

/** Entry point on Party. Players see their roster's initials; the DM sees how many player
 * characters wait in reserve. */
export function RosterLink({ entries, dm }: { entries: Entry[]; dm: boolean }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const label = t(dm ? 'roster.manageDm' : 'roster.manage')
  const count = entries.length
  return (
    <Link
      to={`/campaign/${campaign.id}/party/roster`}
      className="roster-link"
      aria-label={
        count === 0
          ? label
          : t(dm ? 'roster.manageReserve' : 'roster.manageCount', { label, count })
      }
    >
      <span className="roster-link-faces" aria-hidden="true">
        {dm || count === 0 ? (
          <span className="roster-link-face is-icon">
            <UsersRound size={16} />
          </span>
        ) : (
          entries.slice(0, rosterLimit).map((entry) => (
            <span
              key={entry.id}
              className="roster-link-face"
              data-active={entry.is_active || undefined}
            >
              {initial(entry.name)}
            </span>
          ))
        )}
      </span>
      <span className="roster-link-label">{label}</span>
      {dm && count > 0 && (
        <span className="roster-link-meta" aria-hidden="true">
          {t('roster.reserveCount', { count })}
        </span>
      )}
    </Link>
  )
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase()
