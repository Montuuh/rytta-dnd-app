import { useState, type ReactNode } from 'react'
import { Button, Group, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { AtSign, Check, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UsernameError, usernameProblem } from '../domain/username'
import { useSetUsername, useUsernameAvailability } from '../username-api'
import './username-form.css'

/**
 * RYT-078: one field for the account's username, used in Settings and in the sign-in
 * prompt. Format is checked locally once the field was left or submitted; availability is asked
 * of the server after a short pause. A fixed status line announces the result politely.
 */
export function UsernameForm({
  current,
  initial,
  submitLabel,
  extraAction,
  onSaved,
  autoFocus,
}: {
  current: string | null
  initial: string
  submitLabel: string
  extraAction?: ReactNode
  onSaved?: (username: string) => void
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [saved, setSaved] = useState(false)
  // Announce only after the person typed or submitted, not the check of a prefilled suggestion.
  const [dirty, setDirty] = useState(false)
  const save = useSetUsername()
  const name = value.trim()
  const problem = usernameProblem(name)
  const unchanged = current !== null && name === current
  const [debounced] = useDebouncedValue(name, 350)
  const ask = !problem && !unchanged && debounced === name ? name : null
  const availability = useUsernameAvailability(ask)
  const taken =
    (ask !== null && availability.data === false) ||
    (save.error instanceof UsernameError && save.error.kind === 'taken' && save.variables === name)

  // Only "too short" waits for the field to be left: typing more can fix it, not the others.
  const formatError =
    problem && (touched || problem !== 'length' || name.length > 24)
      ? t(`username.problem.${problem}`)
      : null
  const serverError =
    save.error && save.variables === name
      ? save.error instanceof UsernameError && save.error.kind !== 'unavailable'
        ? t(`username.error.${save.error.kind}`)
        : save.error.message === 'Offline'
          ? t('username.error.offline')
          : t('username.error.saveFailed')
      : null
  const error = formatError ?? (taken ? t('username.error.taken') : serverError)

  let status: ReactNode = t('username.hint')
  if (saved && unchanged) status = <StatusIcon kind="ok">{t('username.saved')}</StatusIcon>
  else if (unchanged) status = t('username.current')
  else if (!problem && !taken) {
    if (ask === null || availability.isFetching)
      status = name ? <StatusIcon kind="busy">{t('username.checking')}</StatusIcon> : status
    else if (availability.data)
      status = <StatusIcon kind="ok">{t('username.available')}</StatusIcon>
    // The check failed: say so; saving still asks the server, which stays authoritative.
    else if (availability.isError) status = t('username.checkFailed')
  }

  return (
    <form
      className="username-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        setDirty(true)
        setSaved(false)
        if (problem || taken || unchanged || save.isPending) return
        save.mutate(name, {
          onSuccess: (stored) => {
            setValue(stored)
            setSaved(true)
            onSaved?.(stored)
          },
        })
      }}
    >
      <TextInput
        label={t('username.label')}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value)
          setSaved(false)
          setDirty(true)
        }}
        onBlur={() => setTouched(true)}
        leftSection={<AtSign size={16} aria-hidden="true" />}
        autoFocus={autoFocus}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={24}
        error={Boolean(error)}
        // The status line is Mantine's description, so the input is described by it in every state
        // (Mantine replaces a hand-written aria-describedby). Always mounted and polite.
        description={error ?? status}
        inputWrapperOrder={['label', 'input', 'description']}
        descriptionProps={{
          className: 'username-status',
          'data-error': error ? true : undefined,
          'aria-live': dirty ? 'polite' : 'off',
        }}
        classNames={{ input: 'username-input' }}
      />
      <Group gap="sm" className="username-actions">
        {/* aria-disabled (not native disabled) keeps keyboard focus on the button while saving,
            after a failure and after a save; the submit handler ignores those presses. */}
        <Button
          type="submit"
          leftSection={
            save.isPending ? (
              <LoaderCircle size={16} aria-hidden="true" className="username-spin" />
            ) : undefined
          }
          aria-busy={save.isPending || undefined}
          aria-disabled={unchanged || save.isPending || undefined}
          data-inert={unchanged || undefined}
          className="username-submit"
        >
          {submitLabel}
        </Button>
        {extraAction}
      </Group>
    </form>
  )
}

function StatusIcon({ kind, children }: { kind: 'ok' | 'busy'; children: ReactNode }) {
  return (
    <span className="username-status-line" data-kind={kind}>
      {kind === 'ok' ? (
        <Check size={14} strokeWidth={3} aria-hidden="true" />
      ) : (
        <LoaderCircle size={14} aria-hidden="true" className="username-spin" />
      )}
      {children}
    </span>
  )
}
