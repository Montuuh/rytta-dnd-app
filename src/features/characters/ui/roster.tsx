import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Group, Modal, Stack, Text, TextInput, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Hourglass, Moon, Plus, ScrollText, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/features/auth'
import { membersQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { CharacterPortrait } from '@/features/inventory'
import { PageHead } from '@/shared/ui/page-head'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { newRequestId } from '@/shared/lib/request-id'
import {
  characterRosterQuery,
  sheetSummariesQuery,
  useActivateCharacter,
  useCreateOwnCharacter,
} from '../api'
import { isClassKey } from '../domain/rules'
import { rosterLimit, rostersByPlayer, type RosterEntry } from '../domain/roster'
import type { SheetSummary } from '../domain/sheet'
import './roster.css'

type Entry = RosterEntry & { portraitPath: string | null }

/**
 * RYT-044 character manager. A Player picks the active character from a radio-card roster
 * and fills free slots; a DM sees every Player's roster read-only; a DM previewing a Player
 * sees that Player's roster read-only.
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
  const partyPath = `/campaign/${campaign.id}/party`
  const title = dm
    ? t('roster.dmTitle')
    : playerPreview && previewLabel
      ? t('roster.previewTitle', { name: previewLabel })
      : t('roster.title')
  const entries = (roster.data ?? []) as Entry[]
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
            players={(members.data ?? []).filter((member) => member.role === 'player')}
            membersError={members.isError}
            retryMembers={() => void members.refetch()}
          />
        ) : playerPreview ? (
          entries.length === 0 ? (
            <Text c="dimmed">{t('roster.previewEmpty')}</Text>
          ) : (
            <SlotGrid label={title} used={entries.length}>
              {entries.map((entry) => (
                <RosterCard key={entry.id} entry={entry} summary={find(summaries.data, entry)} />
              ))}
              <EmptySlots count={rosterLimit - entries.length} />
            </SlotGrid>
          )
        ) : (
          <PlayerRoster entries={entries} summaries={summaries.data} />
        ))}
    </Stack>
  )
}

const find = (summaries: SheetSummary[] | undefined, entry: RosterEntry) =>
  summaries?.find((summary) => summary.character_id === entry.id)

/** The Player's own roster: a native radio group of character cards plus free slots. */
function PlayerRoster({
  entries,
  summaries,
}: {
  entries: Entry[]
  summaries: SheetSummary[] | undefined
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const activate = useActivateCharacter(campaign.id)
  const [creating, setCreating] = useState(false)
  const [outcome, setOutcome] = useState<{ kind: 'done' | 'error'; id: string; error?: string }>()
  const createButton = useRef<HTMLButtonElement>(null)
  const groupId = useId()
  const serverActive = entries.find((entry) => entry.is_active)?.id
  // The newest pending choice shows as selected until the server answers.
  const selected = activate.isPending ? activate.variables : serverActive
  const nameOf = (id?: string) => entries.find((entry) => entry.id === id)?.name ?? ''
  if (entries.length === 0)
    return (
      <>
        <RosterWelcome onCreate={() => setCreating(true)} />
        {creating && <CreateCharacterDialog onClose={() => setCreating(false)} />}
      </>
    )
  return (
    <>
      <div role="radiogroup" aria-label={t('roster.choose')} aria-describedby={`${groupId}-count`}>
        <SlotGrid label={null} used={entries.length} countId={`${groupId}-count`}>
          {entries.map((entry) => (
            <RosterCard
              key={entry.id}
              entry={entry}
              summary={find(summaries, entry)}
              radio={{
                name: `${groupId}-active`,
                checked: selected === entry.id,
                pending: activate.isPending && activate.variables === entry.id,
                onSelect: () => {
                  setOutcome(undefined)
                  activate.mutate(entry.id, {
                    onSuccess: () => setOutcome({ kind: 'done', id: entry.id }),
                    onError: (error) =>
                      setOutcome({ kind: 'error', id: serverActive ?? '', error: error.message }),
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
      <div aria-live="polite" className="roster-feedback">
        {activate.isPending && (
          <Text size="sm" c="dimmed">
            {t('roster.switching', { name: nameOf(activate.variables) })}
          </Text>
        )}
        {!activate.isPending && outcome?.kind === 'done' && (
          <Text size="sm" className="roster-done">
            <Check size={16} aria-hidden="true" />{' '}
            {t('roster.switched', { name: nameOf(outcome.id) })}
          </Text>
        )}
      </div>
      {!activate.isPending && outcome?.kind === 'error' && (
        <Alert
          color="red"
          role="alert"
          withCloseButton
          closeButtonLabel={t('action.cancel')}
          onClose={() => setOutcome(undefined)}
        >
          {outcome.error === 'trading'
            ? t('roster.errorTrade', { name: nameOf(outcome.id) })
            : outcome.error === 'combat'
              ? t('roster.errorCombat', { name: nameOf(outcome.id) })
              : t('roster.errorSwitch')}
        </Alert>
      )}
      {entries.length >= rosterLimit && (
        <Text size="sm" c="dimmed">
          {t('roster.full')}
        </Text>
      )}
      {creating && (
        <CreateCharacterDialog
          onClose={() => {
            setCreating(false)
            requestAnimationFrame(() => createButton.current?.focus())
          }}
        />
      )}
    </>
  )
}

/** DM view: one read-only roster per Player, in member order. */
function DmRosters({
  entries,
  summaries,
  players,
  membersError,
  retryMembers,
}: {
  entries: Entry[]
  summaries: SheetSummary[] | undefined
  players: { user_id: string; display_name: string }[]
  membersError: boolean
  retryMembers: () => void
}) {
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
    <Stack gap="xl">
      {rostersByPlayer(entries, players).map(({ player, entries: own }) => {
        const headingId = `roster-player-${player.user_id}`
        return (
          <section key={player.user_id} aria-labelledby={headingId} className="roster-player">
            <Title order={2} id={headingId} className="roster-player-name user-copy">
              {player.display_name}
            </Title>
            {own.length === 0 ? (
              <Text c="dimmed">{t('roster.noCharacters')}</Text>
            ) : (
              <SlotGrid label={player.display_name} used={own.length}>
                {(own as Entry[]).map((entry) => (
                  <RosterCard key={entry.id} entry={entry} summary={find(summaries, entry)} />
                ))}
                <EmptySlots count={rosterLimit - own.length} />
              </SlotGrid>
            )}
          </section>
        )
      })}
    </Stack>
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

/** A character card. With `radio` it is a native radio painted as a card (Player); otherwise
 * it is read-only and states active or in reserve in words (DM and Player preview). */
function RosterCard({
  entry,
  summary,
  radio,
}: {
  entry: Entry
  summary: SheetSummary | undefined
  radio?: { name: string; checked: boolean; pending: boolean; onSelect: () => void }
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const id = useId()
  const active = radio ? radio.checked : entry.is_active
  const sheetPath = `/campaign/${campaign.id}/party/${entry.id}`
  const complete = summary?.status === 'complete'
  const meta = complete
    ? t('sheet.classLevel', {
        class:
          summary.class_key && isClassKey(summary.class_key)
            ? t(`srd.class.${summary.class_key}`)
            : (summary.class_label ?? ''),
        level: summary.level,
      })
    : t('roster.draft')
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
      <span id={`${id}-meta`} className="roster-meta user-copy">
        {meta}
      </span>
      <span id={`${id}-state`} className="roster-state">
        {active ? <Check size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        {t(active ? 'roster.active' : 'roster.reserve')}
      </span>
    </>
  )
  return (
    <li className="roster-slot" data-active={active || undefined}>
      {radio ? (
        <label className="roster-card is-choice">
          <input
            type="radio"
            className="roster-input"
            name={radio.name}
            value={entry.id}
            checked={radio.checked}
            onChange={radio.onSelect}
            aria-labelledby={`${id}-name`}
            aria-describedby={`${id}-meta`}
          />
          {body}
        </label>
      ) : (
        <div className="roster-card" role="group" aria-labelledby={`${id}-name`}>
          {body}
        </div>
      )}
      <Button
        component={Link}
        to={complete ? sheetPath : `${sheetPath}/create`}
        variant="subtle"
        size="sm"
        className="roster-sheet"
        leftSection={<ScrollText size={16} aria-hidden="true" />}
        aria-label={t('roster.sheetOf', { name: entry.name })}
      >
        {t(complete ? 'roster.openSheet' : 'roster.continueSheet')}
      </Button>
    </li>
  )
}

/** First-character onboarding: what the Player sees on Party with an empty roster. */
export function RosterWelcome({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <section className="roster-welcome" aria-labelledby={`${id}-title`}>
      <div className="roster-welcome-slots" aria-hidden="true">
        {Array.from({ length: rosterLimit }, (_, index) => (
          <span key={index} className={`roster-ring${index === 0 ? ' is-first' : ''}`}>
            {index === 0 && <Plus size={30} />}
          </span>
        ))}
      </div>
      <Title order={2} id={`${id}-title`} className="roster-welcome-title">
        {t('roster.welcomeTitle')}
      </Title>
      <Text className="roster-welcome-text">{t('roster.welcomeText')}</Text>
      <Button
        size="lg"
        leftSection={<Plus size={20} aria-hidden="true" />}
        onClick={onCreate}
        className="roster-welcome-cta"
      >
        {t('roster.welcomeCta')}
      </Button>
    </section>
  )
}

/** Party onboarding for a Player with no characters: the welcome plus its dialog. */
export function FirstCharacter() {
  const [creating, setCreating] = useState(false)
  return (
    <>
      <RosterWelcome onCreate={() => setCreating(true)} />
      {creating && <CreateCharacterDialog onClose={() => setCreating(false)} />}
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
          <Group justify="flex-end">
            <Button variant="subtle" disabled={action.isPending} onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" loading={action.isPending}>
              {t('roster.createSubmit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

/** Entry point on Party: the roster's faces plus a label, leading to the manager. */
export function RosterLink({ entries, dm }: { entries: Entry[]; dm: boolean }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const label = t(dm ? 'roster.manageDm' : 'roster.manage')
  const faces = entries.slice(0, rosterLimit)
  return (
    <Link
      to={`/campaign/${campaign.id}/party/roster`}
      className="roster-link"
      aria-label={
        entries.length ? t('roster.manageCount', { label, count: entries.length }) : label
      }
    >
      <span className="roster-link-faces" aria-hidden="true">
        {faces.length === 0 ? (
          <span className="roster-link-face is-icon">
            <UsersRound size={16} />
          </span>
        ) : (
          faces.map((entry) => (
            <span
              key={entry.id}
              className="roster-link-face"
              data-active={(!dm && entry.is_active) || undefined}
            >
              {initial(entry.name)}
            </span>
          ))
        )}
      </span>
      <span className="roster-link-label">{label}</span>
    </Link>
  )
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase()
