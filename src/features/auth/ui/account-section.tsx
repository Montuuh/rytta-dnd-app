import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Modal, Text, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountDeletionBlockers, deleteMyAccount, exportMyData } from '../account-api'
import {
  dismissAccountNotice,
  noticeCopy,
  showAccountNotice,
  useAccountNotice,
} from '../account-notice'
import { config } from '@/shared/lib/config'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { useAuth } from '../auth-context'
import { AccountError, accountDeletionWord, accountExportFileName } from '../domain/account'
import './account-section.css'

type ExportState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; file: string; rows: number; truncated: string[] }
  | { status: 'error'; kind: 'signIn' | 'offline' | 'unavailable' }

/** The export sections the server can list as capped; anything else reads as a generic label. */
const exportSections = [
  'memberships',
  'characters',
  'inventory',
  'invitations',
  'shop_orders',
  'trades',
  'item_proposals',
  'rest_requests',
  'character_events',
  'inventory_events',
  'combat_events',
  'item_definitions',
  'glossary_entries',
  'content_packs',
] as const
type ExportSection = (typeof exportSections)[number]
const isExportSection = (key: string): key is ExportSection =>
  (exportSections as readonly string[]).includes(key)

/** Saves the server's export as a JSON file through a temporary object URL. */
function saveJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function useExport() {
  const [state, setState] = useState<ExportState>({ status: 'idle' })
  const run = async () => {
    if (state.status === 'busy') return
    setState({ status: 'busy' })
    try {
      const data = await exportMyData()
      const file = accountExportFileName(data)
      saveJson(data, file)
      setState({
        status: 'done',
        file,
        rows: data.limits.rows_per_section,
        truncated: data.truncated,
      })
    } catch (error) {
      const kind = error instanceof AccountError ? error.kind : null
      setState({
        status: 'error',
        kind: kind === 'signIn' || kind === 'offline' ? kind : 'unavailable',
      })
    }
  }
  return { state, run }
}

/** A polite status line that stays mounted, so a result is announced when it appears. */
function ExportStatus({ state }: { state: ExportState }) {
  const { t } = useTranslation()
  let text: string | null = null
  const sections = [
    ...new Set(
      state.status === 'done'
        ? state.truncated.map((key) =>
            isExportSection(key) ? t(`account.section.${key}`) : t('account.section.other'),
          )
        : [],
    ),
  ]
  if (state.status === 'busy') text = t('account.export.busy')
  if (state.status === 'done')
    text = [
      t('account.export.done', { file: state.file }),
      state.truncated.length > 0
        ? t('account.export.truncated', {
            rows: state.rows,
            sections: sections.join(', '),
          })
        : null,
    ]
      .filter(Boolean)
      .join(' ')
  const error =
    state.status === 'error'
      ? t(
          state.kind === 'signIn'
            ? 'account.export.signIn'
            : state.kind === 'offline'
              ? 'account.export.offline'
              : 'account.export.error',
        )
      : null
  return (
    <>
      <p className="account-status" role="status">
        {text}
      </p>
      {error && (
        <p className="account-status" role="alert" data-error>
          {error}
        </p>
      )}
    </>
  )
}

function ExportButton({
  run,
  state,
  label,
  variant = 'default',
}: {
  run: () => void
  state: ExportState
  label: string
  variant?: 'default' | 'subtle'
}) {
  const busy = state.status === 'busy'
  return (
    <Button
      variant={variant}
      className="account-button"
      aria-busy={busy || undefined}
      leftSection={
        busy ? (
          <LoaderCircle size={16} aria-hidden="true" className="account-spin" />
        ) : (
          <Download size={16} aria-hidden="true" />
        )
      }
      onClick={() => void run()}
    >
      {label}
    </Button>
  )
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p className="account-status" role="alert" data-error>
      {children}
    </p>
  )
}

/** RYT-115: what blocks the deletion, then the two ways out. */
function Blocked({
  blockers,
  onNavigate,
  onClose,
}: {
  blockers: { campaignId: string; campaignName: string; otherMembers: number }[]
  onNavigate: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const lead = useRef<HTMLParagraphElement>(null)
  // The form that held focus can unmount when the server finds blockers while deleting: move focus
  // to the explanation so keyboard and screen reader users stay inside the dialog.
  useEffect(() => {
    const dialog = lead.current?.closest('[role="dialog"]')
    if (dialog && !dialog.contains(document.activeElement)) lead.current?.focus()
  }, [])
  return (
    <div className="account-dialog-body">
      <p ref={lead} tabIndex={-1} className="account-lead">
        {t('account.blocked.lead')}
      </p>
      <ul className="account-blockers">
        {blockers.map((blocker) => (
          <li key={blocker.campaignId}>
            <span className="account-blocker-name user-copy">{blocker.campaignName}</span>
            <span className="account-blocker-meta">
              {t('account.blocked.others', { count: blocker.otherMembers })}
            </span>
            <Link
              className="account-link"
              to={`/campaign/${blocker.campaignId}/members`}
              aria-label={t('account.blocked.openLabel', { name: blocker.campaignName })}
              onClick={onNavigate}
            >
              {t('account.blocked.open')}
            </Link>
          </li>
        ))}
      </ul>
      <p>{t('account.blocked.ways')}</p>
      <div className="account-actions">
        <Button variant="default" className="account-button" onClick={onClose}>
          {t('account.dialog.close')}
        </Button>
      </div>
    </div>
  )
}

function Confirm({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  error: string | null
  onSubmit: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const exporting = useExport()
  const [typed, setTyped] = useState('')
  const errorLine = useRef<HTMLParagraphElement>(null)
  // The form remounts empty after the server's "blocked" reply found nothing to list: keep focus
  // inside the dialog, on the message that says what happened.
  useEffect(() => {
    if (error) errorLine.current?.focus()
    // Only when the form appears with a message already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The word is English: case and stray spaces from a phone keyboard must not keep the button locked.
  const ready = typed.trim().toUpperCase() === accountDeletionWord
  const lists = [
    [
      'account.confirm.deletes',
      ['account.confirm.deletes1', 'account.confirm.deletes2', 'account.confirm.deletes3'],
    ],
    ['account.confirm.stays', ['account.confirm.stays1', 'account.confirm.stays2']],
  ] as const
  return (
    <form
      className="account-dialog-body"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (ready && !busy) onSubmit()
      }}
    >
      {lists.map(([heading, items]) => (
        <section key={heading} className="account-list">
          <h4>{t(heading)}</h4>
          <ul>
            {items.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="account-final">{t('account.confirm.final')}</p>
      <div className="account-download">
        <ExportButton
          run={exporting.run}
          state={exporting.state}
          label={t('account.confirm.download')}
        />
        <ExportStatus state={exporting.state} />
      </div>
      <TextInput
        label={t('account.confirm.label', { word: accountDeletionWord })}
        description={<span id="account-confirm-hint">{t('account.confirm.hint')}</span>}
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
        // With a keyboard open the sticky action row would cover the field: bring it into view.
        onFocus={(event) => {
          const field = event.currentTarget
          window.setTimeout(() => field.scrollIntoView({ block: 'center' }), 300)
        }}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={busy}
        classNames={{ input: 'account-input' }}
      />
      {error && (
        <p
          ref={errorLine}
          tabIndex={-1}
          className="account-status account-lead"
          role="alert"
          data-error
        >
          {error}
        </p>
      )}
      <div className="account-actions account-sticky">
        <Button variant="default" className="account-button" onClick={onCancel} disabled={busy}>
          {t('account.confirm.cancel')}
        </Button>
        <Button
          type="submit"
          className="account-button account-danger-solid"
          disabled={!ready || busy}
          aria-describedby="account-confirm-hint"
          aria-busy={busy || undefined}
          leftSection={
            busy ? (
              <LoaderCircle size={16} aria-hidden="true" className="account-spin" />
            ) : undefined
          }
        >
          {busy ? t('account.confirm.busy') : t('account.confirm.submit')}
        </Button>
      </div>
    </form>
  )
}

/** The delete dialog: blockers first, then the explicit confirmation. */
function DeleteDialog({
  opened,
  onClose,
  onNavigate,
}: {
  opened: boolean
  onClose: () => void
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { state, controller } = useAuth()
  // Phones give the dialog the whole screen: the list, the word and both buttons need the height.
  const phone = useMediaQuery('(max-width: 35.99em)')
  const requestId = useRef(crypto.randomUUID())
  const [attempt, setAttempt] = useState(0)
  const blockers = useQuery({
    queryKey: ['account', state.user?.id ?? '', 'blockers', attempt],
    queryFn: ({ signal }) => accountDeletionBlockers(signal),
    enabled: opened && !!state.user,
    gcTime: 0,
    staleTime: 0,
    retry: false,
  })
  const remove = useMutation({
    // Never paused: an offline tap fails at once (deleteMyAccount raises AccountError 'offline')
    // instead of waiting and deleting the account when the network returns.
    networkMode: 'always',
    retry: false,
    mutationFn: async () => {
      const result = await deleteMyAccount({
        confirmation: accountDeletionWord,
        requestId: requestId.current,
        queryClient,
      })
      // The local sign-out above reads as an expired session; this one settles the state without an issue.
      await controller?.signOut().catch(() => undefined)
      showAccountNotice(result.authUser)
      return result
    },
    onError: (error) => {
      // A new DM-only campaign appeared meanwhile: the list says which.
      if (error instanceof AccountError && error.kind === 'blocked') setAttempt((n) => n + 1)
    },
  })
  const busy = remove.isPending
  const close = () => {
    if (busy) return
    remove.reset()
    // A fresh attempt gets a fresh request id; a retry inside the dialog reuses it.
    requestId.current = crypto.randomUUID()
    onClose()
  }
  useBackToClose(opened, close)
  const failure = remove.error
  const failureText =
    failure instanceof AccountError
      ? t(`account.error.${failure.kind}`)
      : failure
        ? t('account.error.unavailable')
        : null
  let body: ReactNode
  if (blockers.isPending)
    body = (
      <div className="account-dialog-body" aria-busy="true">
        <p role="status" className="account-loading">
          <LoaderCircle size={16} aria-hidden="true" className="account-spin" />
          {t('account.dialog.loading')}
        </p>
      </div>
    )
  else if (blockers.isError)
    body = (
      <div className="account-dialog-body">
        <ErrorLine>{t('account.dialog.loadError')}</ErrorLine>
        <div className="account-actions">
          <Button variant="default" className="account-button" onClick={close}>
            {t('account.dialog.close')}
          </Button>
          <Button className="account-button" onClick={() => setAttempt((n) => n + 1)}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    )
  else if (blockers.data.length > 0)
    body = (
      <Blocked
        blockers={blockers.data}
        onNavigate={() => {
          close()
          onNavigate()
        }}
        onClose={close}
      />
    )
  else
    body = (
      <Confirm busy={busy} error={failureText} onSubmit={() => remove.mutate()} onCancel={close} />
    )
  return (
    <Modal
      opened={opened}
      onClose={close}
      title={t('account.dialog.title')}
      centered
      fullScreen={!!phone}
      zIndex={400}
      closeOnClickOutside={false}
      closeOnEscape={!busy}
      closeButtonProps={{ 'aria-label': t('account.dialog.close'), size: 44, disabled: busy }}
      classNames={{
        content: 'account-dialog',
        title: 'account-dialog-title',
        body: 'account-dialog-scroll',
      }}
    >
      {body}
    </Modal>
  )
}

/**
 * RYT-115: the Account group of the Settings drawer. Export is one button; deletion is a quiet
 * action that opens a dialog, which asks the server about blockers before offering the confirm.
 */
export function AccountSection({
  onNavigate,
  onDialogChange,
}: {
  onNavigate?: () => void
  /** The dialog opens inside the Settings drawer, whose own Escape must wait while it is open. */
  onDialogChange?: (opened: boolean) => void
}) {
  const { t } = useTranslation()
  const exporting = useExport()
  const [opened, setOpened] = useState(false)
  return (
    <div className="account-section">
      <div className="account-block">
        <h4>{t('account.export.heading')}</h4>
        <p className="account-copy">{t('account.export.copy')}</p>
        <ExportButton
          run={exporting.run}
          state={exporting.state}
          label={t('account.export.button')}
        />
        <ExportStatus state={exporting.state} />
      </div>
      <div className="account-block">
        <h4>{t('account.delete.heading')}</h4>
        <p className="account-copy">{t('account.delete.copy')}</p>
        <Button
          variant="default"
          className="account-button account-danger"
          leftSection={<TriangleAlert size={16} aria-hidden="true" />}
          onClick={() => {
            setOpened(true)
            onDialogChange?.(true)
          }}
        >
          {t('account.delete.button')}
        </Button>
      </div>
      <DeleteDialog
        opened={opened}
        onClose={() => {
          setOpened(false)
          onDialogChange?.(false)
        }}
        onNavigate={() => onNavigate?.()}
      />
    </div>
  )
}

/** The landing's confirmation after the account was deleted; a remaining sign-in record says how to ask for its removal. */
export function AccountDeletedNotice({
  contact = config.VITE_CONTACT_EMAIL,
}: {
  contact?: string | null
}) {
  const { t } = useTranslation()
  const notice = useAccountNotice()
  if (!notice) return null
  const copy = noticeCopy(notice, contact)
  return (
    <Alert
      className="landing-alert account-notice"
      role="status"
      tabIndex={-1}
      data-leave-focus
      title={t('account.done.title')}
      withCloseButton={false}
    >
      <Text>{t(copy.text)}</Text>
      <div className="account-actions">
        {copy.contact && (
          <>
            <a className="account-link" href={`mailto:${copy.contact}`}>
              {t('account.done.email')}
            </a>
            <Link className="account-link" to="/privacy" state={{ section: 'who' }}>
              {t('account.done.privacy')}
            </Link>
          </>
        )}
        <Button
          variant="subtle"
          className="account-button"
          leftSection={<X size={16} aria-hidden="true" />}
          onClick={dismissAccountNotice}
        >
          {t('account.done.dismiss')}
        </Button>
      </div>
    </Alert>
  )
}
