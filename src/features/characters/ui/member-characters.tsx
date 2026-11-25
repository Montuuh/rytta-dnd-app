import { useEffect, useRef } from 'react'
import { Alert } from '@mantine/core'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useActivateCharacter, useCharacterAction } from '../api'
import { rosterOf, unassignedOf, type RosterEntry } from '../domain/roster'

/** Which list of characters the member sheet shows; `null` is the member's own actions. */
export type MemberCharacterView = 'link' | 'switch' | null

/**
 * RYT-180: the second line of a Members row: the active character as a link to its sheet, or
 * "No active character" for a Player, and the reserves in muted text (shown from tablets up; the
 * member sheet lists them on phones).
 */
export function MemberCharacterLine({
  campaignId,
  userId,
  roster,
  showEmpty,
}: {
  campaignId: string
  userId: string
  roster: readonly RosterEntry[]
  /** A Player without a character says so; a DM without one shows nothing. */
  showEmpty: boolean
}) {
  const { t } = useTranslation()
  const own = rosterOf(roster, userId)
  const reserves = own.entries.filter((entry) => !entry.is_active)
  if (!own.active && !showEmpty) return null
  return (
    <>
      {own.active ? (
        <Link
          className="member-sheet-link user-copy"
          to={`/campaign/${campaignId}/party/${own.active.id}`}
          aria-label={t('roster.sheetOf', { name: own.active.name })}
        >
          {own.active.name}
        </Link>
      ) : (
        <span className="member-no-character">{t('dm.noActiveCharacter')}</span>
      )}
      {reserves.length > 0 && (
        <span className="member-reserves user-copy">
          {t('roster.reserve')} · {reserves.map((entry) => entry.name).join(', ')}
        </span>
      )}
    </>
  )
}

/**
 * RYT-180: the character rows of a member's sheet. The member's actions are three rows (open the
 * sheet, link a character, switch the active one); the last two swap the sheet's content for a
 * tappable list of characters: choosing one saves and closes the sheet, and the back row returns
 * to the actions. A failure stays in the sheet with the lists as they were.
 */
export function MemberCharacterSheet({
  campaignId,
  userId,
  roster,
  manage,
  view,
  setView,
  close,
}: {
  campaignId: string
  userId: string
  roster: readonly RosterEntry[]
  /** Players take part in linking and switching; a DM's characters are only opened. */
  manage: boolean
  view: MemberCharacterView
  setView: (view: MemberCharacterView) => void
  close: () => void
}) {
  const { t } = useTranslation()
  const assign = useCharacterAction(campaignId)
  const activate = useActivateCharacter(campaignId)
  const root = useRef<HTMLDivElement>(null)
  const previous = useRef<MemberCharacterView>(view)
  const own = rosterOf(roster, userId)
  const free = own.free ? unassignedOf(roster).filter((entry) => !entry.absent) : []
  const reserves = own.entries.filter((entry) => !entry.is_active)
  const switchable = reserves.filter((entry) => !entry.absent)
  const canLink = manage && own.free > 0 && (!own.active || unassignedOf(roster).length > 0)
  const canSwitch = manage && switchable.length > 0
  const pending = assign.isPending || activate.isPending
  const failed = assign.isError || activate.isError

  // Focus follows the content that replaces the one that was pressed.
  useEffect(() => {
    if (previous.current === view) return
    const was = previous.current
    previous.current = view
    const target = view
      ? (root.current?.querySelector('[data-pick]') ?? root.current?.querySelector('[data-back]'))
      : root.current?.querySelector(`[data-row="${was}"]`)
    ;(target as HTMLElement | null)?.focus()
  }, [view])

  const back = (label: string) => (
    <button
      type="button"
      className="sheet-row sheet-row-back"
      data-back
      onClick={() => {
        assign.reset()
        activate.reset()
        setView(null)
      }}
    >
      <ChevronLeft size={18} aria-hidden="true" />
      <span className="sheet-row-main">{label}</span>
    </button>
  )
  const alert = failed && (
    <Alert role="alert" color="red" className="sheet-alert">
      {t('characters.unavailable')}
    </Alert>
  )

  if (view) {
    const linking = view === 'link'
    const options = linking ? free : switchable
    return (
      <div ref={root} className="sheet-view">
        {back(t(linking ? 'dm.linkCharacter' : 'dm.switchActive'))}
        {options.length ? (
          <ul className="sheet-list">
            {options.map(({ id, name }) => (
              <li key={id}>
                <button
                  type="button"
                  className="sheet-row"
                  data-pick
                  aria-disabled={pending || undefined}
                  aria-busy={pending || undefined}
                  onClick={() => {
                    if (pending) return
                    if (linking)
                      assign.mutate(
                        { kind: 'assign', characterId: id, userId },
                        { onSuccess: close },
                      )
                    else activate.mutate(id, { onSuccess: close })
                  }}
                >
                  <span className="sheet-row-main user-copy">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="sheet-note">
              {t(linking ? 'dm.noFreeCharacter' : 'roster.noCharacters')}
            </p>
            <Link className="sheet-row" to={`/campaign/${campaignId}/party`}>
              <span className="sheet-row-main">{t('module.party')}</span>
              <ExternalLink size={18} aria-hidden="true" />
            </Link>
          </>
        )}
        {alert}
      </div>
    )
  }

  return (
    <div ref={root} className="sheet-view">
      {own.active && (
        <Link
          className="sheet-row"
          data-autofocus
          to={`/campaign/${campaignId}/party/${own.active.id}`}
        >
          <span className="sheet-row-main user-copy">
            {t('members.openSheet', { name: own.active.name })}
          </span>
          <ExternalLink size={18} aria-hidden="true" />
        </Link>
      )}
      {canLink && (
        <button
          type="button"
          className="sheet-row"
          data-row="link"
          data-autofocus
          onClick={() => setView('link')}
        >
          <span className="sheet-row-text">
            <span className="sheet-row-main">{t('dm.linkCharacter')}</span>
            {free.length > 0 && (
              <span className="sheet-row-sub">
                {t('members.freeCount', { count: free.length })}
              </span>
            )}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {canSwitch && (
        <button
          type="button"
          className="sheet-row"
          data-row="switch"
          data-autofocus
          onClick={() => setView('switch')}
        >
          <span className="sheet-row-text">
            <span className="sheet-row-main">{t('dm.switchActive')}</span>
            <span className="sheet-row-sub user-copy">
              {reserves.map((entry) => entry.name).join(', ')}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {alert}
    </div>
  )
}
