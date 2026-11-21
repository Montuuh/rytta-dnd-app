import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Alert, Button, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { focusWhenReady } from '@/shared/ui/focus-when-ready'
import { Modal } from '@/shared/ui/overlays'
import { useAuth } from '../auth-context'
import { PasswordFailure, passwordMeetsPolicy, type PasswordIssue } from '../domain/auth'
import { PasswordField } from './password-field'

/** Saves a new password for the signed-in user; shared by the reset dialog and the settings. */
function NewPasswordForm({
  label,
  saveLabel,
  onSaved,
  secondary,
}: {
  label: string
  saveLabel: string
  onSaved: () => void
  secondary?: ReactNode
}) {
  const { t } = useTranslation()
  const { controller } = useAuth()
  const [password, setPassword] = useState('')
  const [ruleError, setRuleError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<PasswordIssue | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const field = () => form.current?.querySelector<HTMLInputElement>('input')
  // Outside a Mantine overlay nothing focuses the field for us.
  useEffect(() => {
    focusWhenReady(() => form.current?.querySelector<HTMLInputElement>('input'), { leaving: null })
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!controller) return
    if (!passwordMeetsPolicy(password)) {
      setRuleError(true)
      field()?.focus()
      return
    }
    setBusy(true)
    setIssue(null)
    try {
      await controller.updatePassword(password)
      setPassword('')
      onSaved()
    } catch (error) {
      setIssue(error instanceof PasswordFailure ? error.issue : 'connection')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form ref={form} className="new-password" onSubmit={(event) => void submit(event)} noValidate>
      <PasswordField
        label={label}
        value={password}
        onChange={setPassword}
        purpose="new"
        showRuleError={ruleError}
        autoFocus
      />
      {issue && (
        <Alert color="red" role="alert">
          {t(`auth.email.issue.${issue}`)}
        </Alert>
      )}
      {/* Primary first in the tab order; it shows on the right, or on top on a phone. */}
      <div className="new-password-actions">
        <Button type="submit" loading={busy}>
          {saveLabel}
        </Button>
        {secondary}
      </div>
    </form>
  )
}

/**
 * RYT-157: after a password reset link the user lands signed in; this asks for the new one, then
 * confirms it is saved. `onClosed` places focus on the page behind.
 */
export function RecoveryDialog({ onClosed }: { onClosed?: () => void }) {
  const { t } = useTranslation()
  const { state, controller } = useAuth()
  const [saved, setSaved] = useState(false)
  const next = useRef<HTMLButtonElement>(null)
  // The form is replaced by the confirmation: move focus to its one action.
  useEffect(() => {
    if (saved) focusWhenReady(() => next.current, { leaving: null })
  }, [saved])
  const done = () => {
    controller?.finishRecovery()
    setSaved(false)
    onClosed?.()
  }
  return (
    <Modal
      opened={Boolean(state.recovery)}
      onClose={done}
      centered
      returnFocus={false}
      title={t('auth.recovery.title')}
      classNames={{ title: 'email-auth-title' }}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      {saved ? (
        <div className="new-password-body">
          <p className="email-auth-note" role="status">
            {t('auth.recovery.saved')}
          </p>
          <Button ref={next} onClick={done}>
            {t('auth.recovery.continue')}
          </Button>
        </div>
      ) : (
        <div className="new-password-body">
          <Text>{t('auth.recovery.body')}</Text>
          <NewPasswordForm
            label={t('auth.password.new')}
            saveLabel={t('auth.recovery.save')}
            onSaved={() => setSaved(true)}
            secondary={
              <Button variant="default" onClick={done}>
                {t('auth.recovery.later')}
              </Button>
            }
          />
        </div>
      )}
    </Modal>
  )
}

/** RYT-157: add a password next to Google, or change it, in the account settings. */
export function PasswordSettings() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  // Saved once in this view: the account has a password even before its session says so.
  const [added, setAdded] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const hasPassword = Boolean(state.user?.hasPassword) || added
  const close = () => {
    setOpen(false)
    focusWhenReady(() => opener.current, { leaving: null })
  }
  return (
    <div className="account-block">
      <h4>{t('auth.password.title')}</h4>
      {!hasPassword && <p className="account-copy">{t('auth.password.help')}</p>}
      {saved && (
        <Text role="status" size="sm">
          {t('auth.password.saved')}
        </Text>
      )}
      {open ? (
        <NewPasswordForm
          label={t('auth.password.new')}
          saveLabel={t('auth.password.save')}
          onSaved={() => {
            setSaved(true)
            setAdded(true)
            close()
          }}
          secondary={
            <Button variant="default" onClick={close}>
              {t('auth.password.cancel')}
            </Button>
          }
        />
      ) : (
        <Button
          ref={opener}
          variant="default"
          className="account-button"
          onClick={() => {
            setSaved(false)
            setOpen(true)
          }}
        >
          {hasPassword ? t('auth.password.open') : t('auth.password.add')}
        </Button>
      )}
    </div>
  )
}
