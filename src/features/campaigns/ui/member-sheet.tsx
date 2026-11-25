import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Drawer, Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import type { Member } from '../domain/campaign'
import './members.css'

/** Which list of characters a member's sheet shows; `null` is the member's own actions. */
export type MemberSheetView = 'link' | 'switch' | null

/**
 * RYT-180: the sheet a row's `···` opens. A bottom drawer on phones and the shared modal from
 * 48em; the title says what it is about, Escape and system Back close it, and the caller returns
 * focus to the control that opened it.
 */
export function ActionSheet({
  opened,
  onClose,
  title,
  subtitle,
  children,
}: {
  opened: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const content = (
    <div className="sheet-body">
      {subtitle && <p className="sheet-subtitle user-copy">{subtitle}</p>}
      {children}
    </div>
  )
  const shared = {
    opened,
    onClose,
    returnFocus: false,
    className: 'member-action-sheet',
    title: <span className="sheet-title user-copy">{title}</span>,
    closeButtonProps: { 'aria-label': t('panel.close'), size: 44 },
    centered: true,
  }
  return phone ? (
    <Drawer {...shared} position="bottom" size="auto">
      {content}
    </Drawer>
  ) : (
    <Modal {...shared} size="sm">
      {content}
    </Modal>
  )
}

/** One 52px row of a sheet. While it cannot be used it stays reachable (`aria-disabled`) and
 * gives its reason on the second line. Every row asks for the initial focus: the dialog takes the
 * first one in the document, so focus never lands on the close button. */
export function SheetAction({
  label,
  reason,
  danger,
  disabled,
  onClick,
}: {
  label: string
  /** Why the row does nothing yet; shown under the label. */
  reason?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const hint = useId()
  return (
    <button
      type="button"
      className={danger ? 'sheet-row sheet-row--danger' : 'sheet-row'}
      aria-disabled={disabled || undefined}
      aria-describedby={disabled && reason ? hint : undefined}
      data-autofocus
      onClick={() => {
        if (!disabled) onClick()
      }}
    >
      <span className="sheet-row-text">
        <span className="sheet-row-main">{label}</span>
        {disabled && reason && (
          <span id={hint} className="sheet-row-sub">
            {reason}
          </span>
        )}
      </span>
    </button>
  )
}

/** A member's actions: their characters (a slot the page fills), the role change, and removing
 * them or, on the signed-in DM's own row, leaving. */
export function MemberActions({
  member,
  you,
  onlyDm,
  busy,
  view,
  setView,
  characters,
  onClose,
  onRole,
  onRemove,
  onLeave,
}: {
  member: Member
  you: boolean
  /** This member is the campaign's only DM. */
  onlyDm: boolean
  busy: boolean
  view: MemberSheetView
  setView: (view: MemberSheetView) => void
  /** The character rows and lists, drawn by the page (the characters feature owns them). */
  characters?: (sheet: {
    view: MemberSheetView
    setView: (view: MemberSheetView) => void
    close: () => void
  }) => ReactNode
  onClose: () => void
  onRole: () => void
  onRemove: () => void
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const characterRows = characters?.({ view, setView, close: onClose })
  if (view) return <>{characterRows}</>
  const locked = busy || (member.role === 'dm' && onlyDm)
  return (
    <>
      {characterRows}
      <SheetAction
        label={t(member.role === 'dm' ? 'members.demote' : 'members.promote')}
        reason={onlyDm ? t('members.onlyDm') : undefined}
        disabled={locked}
        onClick={onRole}
      />
      {you ? (
        <SheetAction
          danger
          label={t('members.leave')}
          reason={onlyDm ? t('leave.lastDm') : undefined}
          disabled={busy || onlyDm}
          onClick={onLeave}
        />
      ) : (
        <SheetAction danger label={t('members.remove')} disabled={busy} onClick={onRemove} />
      )}
    </>
  )
}

/** A sent invitation's actions: show the instructions again, or cancel it. */
export function InvitationActions({
  busy,
  onShare,
  onCancel,
}: {
  busy: boolean
  onShare: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <SheetAction label={t('members.shareAgain')} disabled={busy} onClick={onShare} />
      <SheetAction danger label={t('members.revoke')} disabled={busy} onClick={onCancel} />
    </>
  )
}

/** The text of the second line of an invitation row. */
export function InvitationLine({ expiresAt }: { expiresAt: string }) {
  const { t, i18n } = useTranslation()
  return (
    <span className="member-character">
      {t('members.sentExpires', { date: new Date(expiresAt).toLocaleDateString(i18n.language) })}
    </span>
  )
}
