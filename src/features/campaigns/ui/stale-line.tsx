import { useEffect, useRef, useState } from 'react'
import { Button, Loader, Text } from '@mantine/core'
import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConnectionPhase } from '@/shared/lib/connection-context'
import { relativeTime } from '@/shared/lib/relative-time'
import { causeOf, keepsStaleData } from './load-cause'

/** The part of a TanStack query result the line reads. */
export interface LoadedQuery {
  data: unknown
  isError: boolean
  error: unknown
  /** When the data on screen arrived (ms); the line says how old it is. */
  dataUpdatedAt?: number
  refetch: () => Promise<unknown>
}

const has = (data: unknown) => data !== undefined && data !== null

/**
 * RYT-161: which queries failed for a reason the screen survives (a lost connection or a server
 * hiccup) and are not already explained by the connection line. `missing` picks the ones with
 * nothing to show (a section that never loaded); otherwise the ones that keep stale data.
 */
function useFailedRefresh(queries: LoadedQuery[], missing = false) {
  const phase = useConnectionPhase()
  // Offline, reconnecting or with the backend unreachable, the line under the header says it.
  if (phase === 'offline' || phase === 'reconnecting' || phase === 'failed') return []
  return queries.filter((query) => {
    if (!query.isError || causeOf(query.error) === 'offline') return false
    if (missing) return !has(query.data) && causeOf(query.error) === 'unknown'
    return keepsStaleData(query.data, query.error)
  })
}

/**
 * RYT-161: one quiet line, with Retry, above data a refresh could not update (or, with `missing`,
 * in a section that could not load). One per screen or section, however many queries failed.
 */
export function StaleLine({
  queries,
  missing = false,
  text,
}: {
  queries: LoadedQuery[]
  missing?: boolean
  /** What failed, when the place alone does not say it. */
  text?: string
}) {
  const { t, i18n } = useTranslation()
  const failed = useFailedRefresh(queries, missing)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Retry stays in place while it runs, so focus is kept; when the line goes, focus that was on
  // Retry moves to the main content instead of falling to <body> (as the connection line does).
  const focused = useRef(false)
  const shown = failed.length > 0
  useEffect(() => {
    if (shown || !focused.current) return
    focused.current = false
    if (document.activeElement === document.body) document.getElementById('main-content')?.focus()
  }, [shown])
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(tick)
  }, [])
  // The oldest data on screen says how out of date the screen may be.
  const times = failed.map((query) => query.dataUpdatedAt ?? 0).filter((time) => time > 0)
  const age = times.length
    ? relativeTime(Math.min(...times), Math.max(now, ...times), i18n.language)
    : null
  // Announced without the age, so a changing "4 min" is not read again and again.
  const spoken = shown ? (text ?? (missing ? t('query.sectionMissing') : t('query.stale'))) : ''
  const message = shown
    ? (text ??
      (missing
        ? t('query.sectionMissing')
        : age
          ? t('query.staleAge', { time: age })
          : t('query.stale')))
    : ''
  // An always-present polite region: one that mounts already filled is often not announced.
  const [said, setSaid] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setSaid(busy ? t('query.retrying') : spoken), 150)
    return () => window.clearTimeout(timer)
  }, [busy, spoken, t])
  // Only a press shows progress: background refetches must not move or disable the button.
  const fetching = busy
  return (
    <>
      <div className="visually-hidden-live" role="status" aria-atomic="true">
        {said}
      </div>
      {shown && (
        <div className="stale-line">
          {fetching ? (
            <Loader size={18} color="var(--warn)" aria-hidden="true" />
          ) : (
            <TriangleAlert size={18} aria-hidden="true" />
          )}
          <Text size="sm" className="stale-line-text">
            {message}
          </Text>
          <Button
            size="compact-md"
            variant="subtle"
            color="var(--warn)"
            className="stale-line-retry"
            aria-disabled={fetching || undefined}
            onFocus={() => (focused.current = true)}
            onBlur={() => (focused.current = false)}
            onClick={() => {
              if (fetching) return
              setBusy(true)
              void Promise.allSettled(failed.map((query) => query.refetch())).finally(() =>
                setBusy(false),
              )
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
    </>
  )
}
