import { useState } from 'react'
import { PasswordInput } from '@mantine/core'
import { Circle, CircleCheck, CircleX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { passwordMeetsPolicy, passwordMinLength } from '../domain/auth'
import './password-field.css'

/**
 * RYT-157: a password with a 44px show/hide control. A new password shows the one policy line,
 * linked to the field; it turns green when met and red after a refused submit. Paste and password
 * managers work: nothing blocks them.
 */
export function PasswordField({
  label,
  value,
  onChange,
  purpose,
  showRuleError = false,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  purpose: 'current' | 'new'
  showRuleError?: boolean
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const met = passwordMeetsPolicy(value)
  return (
    <PasswordInput
      className="password-field"
      label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      autoComplete={purpose === 'new' ? 'new-password' : 'current-password'}
      required
      withAsterisk={false}
      size="md"
      data-autofocus={autoFocus || undefined}
      visible={visible}
      onVisibilityChange={setVisible}
      rightSectionWidth={48}
      classNames={{ visibilityToggle: 'password-toggle' }}
      visibilityToggleButtonProps={{
        'aria-label': visible ? t('auth.email.hide') : t('auth.email.show'),
        // Mantine leaves the toggle out of the tab order; keyboard users need it too.
        tabIndex: 0,
      }}
      error={purpose === 'new' && showRuleError && !met}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      description={
        purpose === 'new' ? (
          <span
            className="password-rule"
            data-state={met ? 'met' : showRuleError ? 'missing' : 'pending'}
          >
            {/* Shape as well as colour: a check, a cross after a refused submit, a ring. */}
            {met ? (
              <CircleCheck size={16} aria-hidden="true" />
            ) : showRuleError ? (
              <CircleX size={16} aria-hidden="true" />
            ) : (
              <Circle size={16} aria-hidden="true" />
            )}
            {t('auth.email.rule', { count: passwordMinLength })}
          </span>
        ) : undefined
      }
    />
  )
}
