import { useEffect, useRef, useState } from 'react'
import { Button } from '@mantine/core'
import { RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  buildId,
  checkDue,
  fetchPublishedBuild,
  forcedBuildKey,
  isNewerBuild,
} from '@/shared/lib/app-version'
import { activateNewerShell } from '@/shared/lib/offline-shell'

const dismissedKey = 'rytta-update-dismissed'

function readStorage(storage: 'localStorage' | 'sessionStorage', key: string) {
  try {
    return window[storage].getItem(key)
  } catch {
    return null
  }
}

/** The id this deploy publishes. Development servers publish none unless a test forces one. */
async function publishedBuild(now: number) {
  if (import.meta.env.DEV) return readStorage('localStorage', forcedBuildKey)
  return fetchPublishedBuild(import.meta.env.BASE_URL, now)
}

/**
 * RYT-117: a quiet, non-blocking notice when a newer build is deployed. It checks on focus and
 * visibility, at most every 15 minutes, and never reloads or moves focus: an open dialog or form
 * keeps its input until the user chooses Reload.
 */
export function UpdateNotice() {
  const { t } = useTranslation()
  const [newer, setNewer] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => readStorage('sessionStorage', dismissedKey) === '1',
  )
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (newer || dismissed) return
    let active = true
    const check = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden' || !checkDue(last.current, now)) return
      last.current = now
      void publishedBuild(now).then((published) => {
        if (active && isNewerBuild(buildId, published)) setNewer(true)
      })
    }
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      active = false
      // A remount (React strict mode, a dependency change) checks afresh.
      last.current = null
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [newer, dismissed])
  // Where focus was before the notice was used: dismissing it returns there, never to the page.
  const outside = useRef<Element | null>(null)
  useEffect(() => {
    if (!newer || dismissed) return
    const track = (event: FocusEvent) => {
      const target = event.target as Element | null
      if (target && !target.closest('.update-notice')) outside.current = target
    }
    document.addEventListener('focusin', track)
    return () => document.removeEventListener('focusin', track)
  }, [newer, dismissed])
  if (!newer || dismissed) return null
  return (
    <div className="update-notice" role="status">
      <span className="update-notice-text">{t('update.available')}</span>
      <div className="update-notice-actions">
        <Button
          size="compact-md"
          variant="subtle"
          color="gray"
          className="update-notice-action"
          onClick={() => {
            try {
              sessionStorage.setItem(dismissedKey, '1')
            } catch {
              /* Dismissal then lasts until the next load. */
            }
            const back = outside.current
            setDismissed(true)
            requestAnimationFrame(() =>
              (back?.isConnected
                ? (back as HTMLElement)
                : document.getElementById('main-content')
              )?.focus(),
            )
          }}
        >
          <X size={18} aria-hidden="true" className="update-notice-x" />
          <span className="update-notice-dismiss">{t('update.dismiss')}</span>
        </Button>
        <Button
          size="compact-md"
          className="update-notice-action"
          leftSection={<RefreshCw size={16} aria-hidden="true" />}
          onClick={() => void activateNewerShell().then(() => window.location.reload())}
        >
          {t('update.reload')}
        </Button>
      </div>
    </div>
  )
}
