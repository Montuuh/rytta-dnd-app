import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useComputedColorScheme } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { config } from '@/shared/lib/config'
import { captchaEnabled } from './captcha'

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      language: string
      theme: 'light' | 'dark'
      size: 'flexible'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null
function loadTurnstile() {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error()))
    script.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.append(script)
  })
  return loading
}

export type CaptchaHandle = { reset: () => void }

/**
 * Cloudflare Turnstile, rendered only when a site key is configured. Each token is single use, so
 * the form resets the widget after every submit.
 */
export const Captcha = forwardRef<
  CaptchaHandle,
  { onToken: (token: string | null) => void; onError: () => void }
>(function Captcha({ onToken, onError }, ref) {
  const { i18n } = useTranslation()
  const scheme = useComputedColorScheme('dark')
  const host = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const report = useRef(onToken)
  const failed = useRef(onError)
  useEffect(() => {
    report.current = onToken
    failed.current = onError
  }, [onToken, onError])
  useImperativeHandle(ref, () => ({
    reset: () => {
      report.current(null)
      if (widget.current) window.turnstile?.reset(widget.current)
    },
  }))
  useEffect(() => {
    const siteKey = config.VITE_TURNSTILE_SITE_KEY
    if (!siteKey) return
    let active = true
    void loadTurnstile()
      .then((api) => {
        if (!active || !host.current) return
        widget.current = api.render(host.current, {
          sitekey: siteKey,
          language: i18n.language.startsWith('en') ? 'en' : 'es',
          theme: scheme,
          size: 'flexible',
          callback: (token) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => {
            report.current(null)
            failed.current()
          },
        })
      })
      // The script did not load: say so instead of waiting for a check that never comes.
      .catch(() => {
        report.current(null)
        failed.current()
      })
    return () => {
      active = false
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [i18n.language, scheme])
  if (!captchaEnabled) return null
  return <div ref={host} className="email-auth-captcha" />
})
