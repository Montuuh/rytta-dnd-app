import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  connectionPhaseAfterRefresh,
  recoveredMs,
  refreshWaitMs,
  type ConnectionPhase,
} from '@/shared/lib/connection'
import { backendReachable } from '@/shared/api/reachability'
import { config } from '@/shared/lib/config'

/**
 * RYT-013: the app-wide connection state. Offline, the screen keeps what it had and says it may be
 * out of date. When the network returns, every query on screen is fetched again (realtime
 * channels re-subscribe and refetch by themselves); nothing that changes data is ever re-sent.
 */
export function useConnection() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<ConnectionPhase>(() => (navigator.onLine ? 'live' : 'offline'))
  const run = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++run.current
    const started = Date.now()
    setPhase('reconnecting')
    // Slow retries of one screen must not keep the line on "Reconnecting": after a short wait the
    // health check decides, and queries still loading show their own progress.
    const settled = await Promise.race([
      queryClient.refetchQueries({ type: 'active' }).then(() => true),
      new Promise<false>((resolve) => window.setTimeout(() => resolve(false), refreshWaitMs)),
    ])
    if (id !== run.current) return
    // A screen's own error (no access, a server fault on one call) is that screen's to show. Only
    // when something failed and the backend does not answer at all is it a connection problem.
    const errored = queryClient
      .getQueryCache()
      .findAll({ type: 'active' })
      .some((query) => query.state.status === 'error' && query.state.errorUpdatedAt >= started)
    const failed =
      (errored || !settled) &&
      !(await backendReachable(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_PUBLISHABLE_KEY))
    if (id !== run.current) return
    setPhase(connectionPhaseAfterRefresh({ online: navigator.onLine, failed }))
  }, [queryClient])
  useEffect(() => {
    const up = () => void refresh()
    const down = () => {
      run.current += 1
      setPhase('offline')
    }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [refresh])
  useEffect(() => {
    if (phase !== 'recovered') return
    const timer = window.setTimeout(() => setPhase('live'), recoveredMs)
    return () => window.clearTimeout(timer)
  }, [phase])
  return { phase, retry: refresh }
}
