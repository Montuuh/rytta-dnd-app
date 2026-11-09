import { useEffect, useRef, useState } from 'react'
import { Button, Skeleton, Text, Title } from '@mantine/core'
import { Check, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth-context'
import { suggestUsername } from '../domain/username'
import { useUsername } from '../username-api'
import { UsernameForm } from './username-form'

const laterKey = (userId: string) => `rytta-username-later-${userId}`
function readLater(userId: string) {
  try {
    return sessionStorage.getItem(laterKey(userId)) === '1'
  } catch {
    return false
  }
}

/**
 * RYT-078: asks for a username while the account has none; "Later" holds for this session.
 * After saving, the card stays to confirm the name and takes focus until it is closed.
 */
export function UsernamePrompt({ onDismiss }: { onDismiss?: () => void } = {}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const user = state.user
  const username = useUsername()
  const [later, setLater] = useState(() => (user ? readLater(user.id) : false))
  // Once the prompt was shown, the name arriving in the cache means it was just saved here.
  const [asked, setAsked] = useState(false)
  if (username.data === null && !asked) setAsked(true)
  const saved = asked && username.data ? username.data : null
  const done = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (saved) done.current?.focus()
  }, [saved])
  if (!user || later) return null
  if (!saved && username.data !== null) return null
  return (
    <section className="username-prompt" aria-labelledby="username-prompt-title">
      <Title order={2} id="username-prompt-title" className="username-prompt-title">
        {t('username.promptTitle')}
      </Title>
      {saved ? (
        <div ref={done} tabIndex={-1} className="username-prompt-done" role="status">
          <Text className="username-status-line" data-kind="ok">
            <Check size={16} strokeWidth={3} aria-hidden="true" />
            {t('username.promptDone', { name: saved })}
          </Text>
          <Button
            variant="subtle"
            onClick={() => {
              setLater(true)
              onDismiss?.()
            }}
          >
            {t('username.close')}
          </Button>
        </div>
      ) : (
        <>
          <Text className="username-prompt-copy">{t('username.promptCopy')}</Text>
          <UsernameForm
            current={null}
            initial={suggestUsername(user.email)}
            submitLabel={t('username.promptSave')}
            extraAction={
              <Button
                variant="subtle"
                onClick={() => {
                  try {
                    sessionStorage.setItem(laterKey(user.id), '1')
                  } catch {
                    /* Dismissal still holds for this page. */
                  }
                  setLater(true)
                  onDismiss?.()
                }}
              >
                {t('username.later')}
              </Button>
            }
          />
        </>
      )}
    </section>
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
