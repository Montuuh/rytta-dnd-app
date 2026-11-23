import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  backHoldMs,
  connectionPhaseAfterRefresh,
  recoveredMs,
  refreshWaitMs,
  type ConnectionPhase,
} from '@/shared/lib/connection'
import { backendReachable } from '@/shared/api/reachability'
import { config } from '@/shared/lib/config'

const wait = (ms: number) =>
  new Promise<false>((resolve) => window.setTimeout(() => resolve(false), ms))

/**
 * RYT-013: the app-wide connection state. Offline, the screen keeps what it had and says it may be
 * out of date. When the network returns, every query on screen is fetched again (realtime
 * channels re-subscribe and refetch by themselves); nothing that changes data is ever re-sent.
 */
export function useConnection() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<ConnectionPhase>(() => (navigator.onLine ? 'live' : 'offline'))
  const run = useRef(0)
  // True while "Connection back" waits for slow screens: the line stays until they settle.
  const holding = useRef(false)
  const refresh = useCallback(async () => {
    const id = ++run.current
    holding.current = false
    const started = Date.now()
    setPhase('reconnecting')
    const errored = () =>
      queryClient
        .getQueryCache()
        .findAll({ type: 'active' })
        .some((query) => query.state.status === 'error' && query.state.errorUpdatedAt >= started)
    // Slow retries of one screen must not keep the line on "Reconnecting": after a short wait the
    // health check decides, and queries still loading show their own progress.
    const refetch = queryClient.refetchQueries({ type: 'active' }).then(() => true as const)
    const settled = await Promise.race([refetch, wait(refreshWaitMs)])
    if (id !== run.current) return
    // A screen's own error (no access, a server fault on one call) is that screen's to show. Only
    // when something failed and the backend does not answer at all is it a connection problem.
    const failed =
      (errored() || !settled) &&
      !(await backendReachable(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_PUBLISHABLE_KEY))
    if (id !== run.current) return
    const next = connectionPhaseAfterRefresh({
      online: navigator.onLine,
      failed,
      settled,
      errored: errored(),
    })
    if (next !== 'back' || settled) {
      setPhase(next)
      return
    }
    // RYT-161: the network is back but a screen is still loading. Say only that the connection is
    // back, and "up to date" once everything on screen has refreshed.
    holding.current = true
    setPhase('back')
    const done = await Promise.race([refetch, wait(backHoldMs)])
    if (id !== run.current) return
    holding.current = false
    setPhase(done && !errored() ? 'recovered' : 'live')
  }, [queryClient])
  useEffect(() => {
    const up = () => void refresh()
    const down = () => {
      run.current += 1
      holding.current = false
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
    if (phase !== 'recovered' && phase !== 'back') return
    if (phase === 'back' && holding.current) return
    const timer = window.setTimeout(() => setPhase('live'), recoveredMs)
    return () => window.clearTimeout(timer)
  }, [phase])
  return { phase, retry: refresh }
}
