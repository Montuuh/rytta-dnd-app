import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Alert, Anchor, Button, Text, TextInput } from '@mantine/core'
import { Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Drawer, Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { useAuth } from '../auth-context'
import { PasswordFailure, passwordMeetsPolicy, type PasswordIssue } from '../domain/auth'
import { captchaEnabled } from './captcha'
import { PasswordField } from './password-field'
import { Captcha, type CaptchaHandle } from './turnstile'
import './email-sign-in.css'

type Mode = 'sign-in' | 'sign-up' | 'check' | 'forgot' | 'forgot-sent'
/** Seconds before the confirmation email can be sent again (Auth limits sends per address). */
const resendCooldown = 60
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** RYT-157: "Continue with email" on the landing and the sheet (dialog on a tablet) it opens. */
export function EmailSignIn() {
  const { t } = useTranslation()
  const phone = usePhone()
  const [opened, setOpened] = useState(false)
  const [mode, setMode] = useState<Mode>('sign-in')
  const close = () => setOpened(false)
  const title = {
    'sign-in': t('auth.email.signInTitle'),
    'sign-up': t('auth.email.signUpTitle'),
    check: t('auth.email.checkTitle'),
    forgot: t('auth.email.forgotTitle'),
    'forgot-sent': t('auth.email.forgotTitle'),
  }[mode]
  const form = <EmailForm mode={mode} onMode={setMode} onSignedIn={close} />
  return (
    <>
      <Button
        className="landing-email"
        variant="outline"
        size="md"
        leftSection={<Mail size={18} aria-hidden="true" />}
        aria-haspopup="dialog"
        onClick={() => {
          setMode('sign-in')
          setOpened(true)
        }}
      >
        {t('auth.email.open')}
      </Button>
      {phone ? (
        <Drawer
          opened={opened}
          onClose={close}
          position="bottom"
          size="auto"
          title={title}
          classNames={{ content: 'email-auth-sheet', title: 'email-auth-title' }}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        >
          {form}
        </Drawer>
      ) : (
        <Modal
          opened={opened}
          onClose={close}
          centered
          title={title}
          classNames={{ title: 'email-auth-title' }}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        >
          {form}
        </Modal>
      )}
    </>
  )
}

function EmailForm({
  mode,
  onMode,
  onSignedIn,
}: {
  mode: Mode
  onMode: (mode: Mode) => void
  onSignedIn: () => void
}) {
  const { t } = useTranslation()
  const { controller } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [issue, setIssue] = useState<PasswordIssue | 'email' | 'captcha-wait' | null>(null)
  const [ruleError, setRuleError] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [resent, setResent] = useState(false)
  const captcha = useRef<CaptchaHandle>(null)
  // A bot check whose script failed to load: the next submit loads it again.
  const [captchaFailed, setCaptchaFailed] = useState(false)
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const captchaFailure = () => {
    setCaptchaFailed(true)
    setIssue('captcha')
  }
  const root = useRef<HTMLDivElement>(null)
  const firstMode = useRef(true)
  const errorId = useId()
  // Each step takes focus: the message of a sent email, otherwise the first field. The first
  // step is handled by the overlay's own autofocus.
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
      return
    }
    const target = root.current?.querySelector<HTMLElement>('[data-focus-target], input')
    target?.focus()
  }, [mode])
  useEffect(() => {
    if (resendAt <= now) return
    const timer = setTimeout(() => setNow(Date.now()), 1000)
    return () => clearTimeout(timer)
  }, [resendAt, now])
  const switchTo = (next: Mode) => {
    setIssue(null)
    setRuleError(false)
    setResent(false)
    setPassword('')
    onMode(next)
  }
  const run = async (action: (captchaToken?: string) => Promise<void>) => {
    if (!emailPattern.test(email.trim())) return setIssue('email')
    if (captchaEnabled && !token) {
      if (captchaFailed) {
        setCaptchaFailed(false)
        setCaptchaAttempt((n) => n + 1)
      }
      return setIssue('captcha-wait')
    }
    setBusy(true)
    setIssue(null)
    try {
      await action(token ?? undefined)
      return true
    } catch (error) {
      setIssue(error instanceof PasswordFailure ? error.issue : 'connection')
      return false
    } finally {
      setBusy(false)
      captcha.current?.reset()
    }
  }
  const startCooldown = () => {
    const at = Date.now()
    setNow(at)
    setResendAt(at + resendCooldown * 1000)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!controller) return
    if (mode === 'sign-in') {
      if (await run((c) => controller.signInWithPassword(email, password, c))) onSignedIn()
    } else if (mode === 'sign-up') {
      if (!passwordMeetsPolicy(password)) {
        setRuleError(true)
        root.current?.querySelector<HTMLElement>('input[autocomplete="new-password"]')?.focus()
        return
      }
      if (await run((c) => controller.signUp(email, password, c))) {
        startCooldown()
        switchTo('check')
      }
    } else if (mode === 'forgot') {
      if (await run((c) => controller.requestPasswordReset(email, c))) switchTo('forgot-sent')
    }
  }
  const resend = async () => {
    if (!controller) return
    if (await run((c) => controller.resendConfirmation(email, c))) {
      startCooldown()
      setResent(true)
      onMode('check')
    }
  }
  const waiting = Math.ceil((resendAt - now) / 1000)
  const alert = issue && (
    <Alert color="red" role="alert" id={errorId} className="email-auth-alert">
      {issue === 'email'
        ? t('auth.email.invalidEmail')
        : issue === 'captcha-wait'
          ? t('auth.email.captchaWait')
          : t(`auth.email.issue.${issue}`)}
    </Alert>
  )
  if (mode === 'check')
    return (
      <div className="email-auth" ref={root}>
        <p className="email-auth-note" role="status" tabIndex={-1} data-focus-target>
          {t('auth.email.checkBody', { email: email.trim() })}
          <span>{t('auth.email.spam')}</span>
        </p>
        {resent && (
          <Text role="status" size="sm" className="email-auth-status">
            {t('auth.email.resent')}
          </Text>
        )}
        {alert}
        <Captcha key={captchaAttempt} ref={captcha} onToken={setToken} onError={captchaFailure} />
        <Button
          variant="default"
          size="md"
          fullWidth
          loading={busy}
          className="email-auth-resend"
          aria-disabled={waiting > 0 || undefined}
          onClick={() => waiting <= 0 && void resend()}
        >
          {waiting > 0 ? t('auth.email.resendIn', { seconds: waiting }) : t('auth.email.resend')}
        </Button>
        <Anchor
          component="button"
          type="button"
          className="email-auth-link"
          onClick={() => switchTo('sign-up')}
        >
          {t('auth.email.changeEmail')}
        </Anchor>
      </div>
    )
  if (mode === 'forgot-sent')
    return (
      <div className="email-auth" ref={root}>
        <p className="email-auth-note" role="status" tabIndex={-1} data-focus-target>
          {t('auth.email.linkSent')}
          <span>{t('auth.email.spam')}</span>
        </p>
        <Button variant="default" size="md" fullWidth onClick={() => switchTo('sign-in')}>
          {t('auth.email.backToSignIn')}
        </Button>
      </div>
    )
  return (
    <div ref={root}>
      <form className="email-auth" onSubmit={(event) => void submit(event)} noValidate>
        <TextInput
          label={t('auth.email.email')}
          type="email"
          inputMode="email"
          autoComplete={mode === 'sign-up' ? 'email' : 'username'}
          required
          withAsterisk={false}
          size="md"
          data-autofocus
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          error={issue === 'email'}
          aria-describedby={issue ? errorId : undefined}
        />
        {mode !== 'forgot' && (
          <PasswordField
            label={t('auth.email.password')}
            value={password}
            onChange={setPassword}
            purpose={mode === 'sign-up' ? 'new' : 'current'}
            showRuleError={ruleError}
          />
        )}
        {mode === 'sign-in' && (
          <Anchor
            component="button"
            type="button"
            className="email-auth-link email-auth-forgot"
            onClick={() => switchTo('forgot')}
          >
            {t('auth.email.forgot')}
          </Anchor>
        )}
        {alert}
        {issue === 'unconfirmed' && (
          <Button
            variant="default"
            size="md"
            fullWidth
            onClick={() => void resend()}
            loading={busy}
          >
            {t('auth.email.resend')}
          </Button>
        )}
        <Captcha key={captchaAttempt} ref={captcha} onToken={setToken} onError={captchaFailure} />
        <Button type="submit" size="md" fullWidth loading={busy} className="email-auth-submit">
          {mode === 'sign-in'
            ? t('auth.email.signIn')
            : mode === 'sign-up'
              ? t('auth.email.signUp')
              : t('auth.email.sendLink')}
        </Button>
        <p className="email-auth-switch">
          {mode === 'sign-in' ? (
            <>
              {t('auth.email.toSignUp')}{' '}
              <Anchor
                component="button"
                type="button"
                className="email-auth-link"
                onClick={() => switchTo('sign-up')}
              >
                {t('auth.email.toSignUpLink')}
              </Anchor>
            </>
          ) : (
            <>
              {mode === 'sign-up' && <>{t('auth.email.toSignIn')} </>}
              <Anchor
                component="button"
                type="button"
                className="email-auth-link"
                onClick={() => switchTo('sign-in')}
              >
                {mode === 'sign-up' ? t('auth.email.toSignInLink') : t('auth.email.backToSignIn')}
              </Anchor>
            </>
          )}
        </p>
      </form>
    </div>
  )
}
