import { useEffect, useRef, useState } from 'react'
import { Button, Group, Modal, Skeleton, Text } from '@mantine/core'
import { Check, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth-context'
import { suggestUsername } from '../domain/username'
import { useUsername } from '../username-api'
import { UsernameForm } from './username-form'
import { laterKey, readLater } from '../domain/username-later'

/**
 * RYT-078: on every sign-in, a dialog asks for a username while the account has none. "Later"
 * (or Escape) closes it until the next sign-in; an account with a username changes it only in
 * Settings. After saving, the dialog confirms the name and takes focus until it is closed.
 */
export function UsernameDialog({
  suspended = false,
  onClosed,
}: {
  /** While true (the Settings drawer, which holds the same field, is open) the dialog waits. */
  suspended?: boolean
  onClosed?: () => void
} = {}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const user = state.user
  const username = useUsername()
  const [later, setLater] = useState(() => (user ? readLater(user.id) : false))
  // Once the dialog asked, the name arriving in the cache means it was just saved here.
  const [asked, setAsked] = useState(false)
  if (username.data === null && !asked && !later && !suspended) setAsked(true)
  const saved = asked && username.data ? username.data : null
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (saved) closeButton.current?.focus()
  }, [saved])
  const opened = Boolean(user) && !later && !suspended && (username.data === null || saved !== null)
  const close = () => {
    if (user && !saved)
      try {
        sessionStorage.setItem(laterKey(user.id), '1')
      } catch {
        /* Dismissal still holds for this page. */
      }
    setLater(true)
    requestAnimationFrame(() => onClosed?.())
  }
  // Mounted only while open: the enter transition then always starts fresh, also when a lazy
  // route suspends during the first render.
  if (!opened || !user) return null
  return (
    <Modal.Root opened onClose={close} closeOnClickOutside={false} centered returnFocus={false}>
      <Modal.Overlay />
      {/* No Modal.Body: the dialog is labelled by its title and not described by every control. */}
      <Modal.Content>
        {/* A div, not a second banner landmark. */}
        <Modal.Header component="div">
          <Modal.Title className="username-dialog-title">
            {saved ? t('username.doneTitle') : t('username.promptTitle')}
          </Modal.Title>
        </Modal.Header>
        <div className="username-dialog-body">
          {saved ? (
            <>
              <p className="username-done-line" role="status">
                <Check
                  size={16}
                  strokeWidth={3}
                  aria-hidden="true"
                  className="username-done-icon"
                />
                <span>{t('username.promptDone', { name: saved })}</span>
              </p>
              <Group justify="flex-end" className="username-actions">
                <Button ref={closeButton} onClick={close}>
                  {t('username.close')}
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Text className="username-prompt-copy">{t('username.promptCopy')}</Text>
              <UsernameForm
                current={null}
                initial={suggestUsername(user.email)}
                submitLabel={t('username.promptSave')}
                autoFocus
                extraAction={
                  <Button variant="default" onClick={close}>
                    {t('username.later')}
                  </Button>
                }
              />
            </>
          )}
        </div>
      </Modal.Content>
    </Modal.Root>
  )
}

/** RYT-078: the body of the Settings drawer's username section. */
export function UsernameSettings() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const username = useUsername()
  // After a failed load, the alert and its retry stay mounted while retrying (a refetch without
  // data goes back to pending), so keyboard focus stays on "Try again".
  const [failed, setFailed] = useState(false)
  if (username.isError && !failed) setFailed(true)
  if (!state.user) return null
  if (failed && username.data === undefined)
    return (
      <div className="username-load-error" role="alert">
        <Text className="username-status" data-error>
          {t('username.error.unavailable')}
        </Text>
        <Button
          variant="default"
          aria-busy={username.isFetching || undefined}
          leftSection={
            username.isFetching ? (
              <LoaderCircle size={16} aria-hidden="true" className="username-spin" />
            ) : undefined
          }
          onClick={() => {
            if (!username.isFetching) void username.refetch()
          }}
        >
          {t('username.retry')}
        </Button>
      </div>
    )
  if (username.isPending)
    // Same height as the form, so Language and Theme do not move when it arrives.
    return (
      <div className="username-skeleton" aria-busy="true" aria-label={t('username.loading')}>
        <Skeleton height={16} width="40%" />
        <Skeleton height={44} />
        <Skeleton height={16} width="55%" />
        <Skeleton height={44} width={160} mt={6} />
      </div>
    )
  return (
    <UsernameForm
      current={username.data ?? null}
      initial={username.data ?? suggestUsername(state.user.email)}
      submitLabel={t('username.save')}
      // A successful retry replaces the button that had focus: continue on the field.
      autoFocus={failed}
    />
  )
}
