import { useEffect, useRef, useState } from 'react'
import { Button, Loader } from '@mantine/core'
import { Check, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectionPhase } from '@/shared/lib/connection'

const icons = {
  offline: WifiOff,
  reconnecting: RefreshCw,
  back: Wifi,
  recovered: Check,
  failed: WifiOff,
}

/**
 * The line under the header. It is not a live region itself: `ConnectionStatus` announces each
 * change once. Retry stays in place (busy) while the retry runs, so focus is never dropped; once
 * the line resolves, focus that was on Retry goes to the main content.
 */
export function ConnectionStrip({
  phase,
  retry,
}: {
  phase: ConnectionPhase
  retry: () => unknown
}) {
  const { t } = useTranslation()
  const [retrying, setRetrying] = useState(false)
  // Whether Retry held focus when it went away (its removal leaves focus on <body>).
  const focused = useRef(false)
  const showRetry = phase === 'failed' || (retrying && phase === 'reconnecting')
  if (!showRetry && retrying) setRetrying(false)
  useEffect(() => {
    if (showRetry) return
    if (!focused.current) return
    focused.current = false
    if (document.activeElement === document.body) document.getElementById('main-content')?.focus()
  }, [showRetry])
  if (phase === 'live') return null
  const Icon = icons[phase]
  return (
    <div className="connection-strip" data-phase={phase}>
      {phase === 'reconnecting' ? (
        <Loader size={16} color="currentColor" aria-hidden="true" />
      ) : (
        <Icon size={18} aria-hidden="true" />
      )}
      <span className="connection-strip-text" id="connection-strip-text">
        {t(`connection.${phase}`)}
      </span>
      {showRetry && (
        <Button
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          size="compact-md"
          variant="default"
          className="connection-retry"
          aria-describedby="connection-strip-text"
          aria-disabled={phase === 'reconnecting' || undefined}
          onClick={() => {
            if (phase !== 'failed') return
            setRetrying(true)
            void retry()
          }}
        >
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

/**
 * Polite announcement of each change. It starts empty and fills after mounting, so a cold start
 * without signal is announced too (a region that mounts with its text is often not read).
 */
export function ConnectionStatus({ phase }: { phase: ConnectionPhase }) {
  const { t } = useTranslation()
  const [said, setSaid] = useState('')
  const text = phase === 'live' ? '' : t(`connection.${phase}`)
  useEffect(() => {
    const timer = window.setTimeout(() => setSaid(text), 150)
    return () => window.clearTimeout(timer)
  }, [text])
  return (
    <div className="visually-hidden-live" aria-live="polite" aria-atomic="true">
      {said}
    </div>
  )
}
