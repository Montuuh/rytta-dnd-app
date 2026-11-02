import { useEffect, useRef, useState } from 'react'

/**
 * Coalescing auto-save for revisioned rows. Every change is kept; changes made while a save
 * is in flight are merged and sent once the server row has caught up (its revision moved
 * past the one the previous save used), so nothing is dropped and no save goes stale.
 * The view shows pending and in-flight values until the server confirms them.
 */
export function useAutoSave<T extends object>({
  server,
  revision,
  save,
}: {
  server: T
  revision: number
  save: (value: T, revision: number) => Promise<unknown>
}) {
  const [pending, setPending] = useState<Partial<T>>({})
  const [inflight, setInflight] = useState<{ patch: Partial<T>; base: number } | null>(null)
  const state = useRef({
    server,
    revision,
    pending: {} as Partial<T>,
    inflight: null as { patch: Partial<T>; base: number } | null,
    sending: false,
    timer: 0,
  })
  useEffect(() => {
    state.current.server = server
    state.current.revision = revision
  })
  useEffect(() => () => window.clearTimeout(state.current.timer), [])
  const confirmed = (base: number) => revision > base
  const view: T = {
    ...server,
    ...(inflight && !confirmed(inflight.base) ? inflight.patch : {}),
    ...pending,
  }

  const flush = () => {
    const s = state.current
    window.clearTimeout(s.timer)
    if (s.sending || (s.inflight && s.revision <= s.inflight.base)) {
      s.timer = window.setTimeout(flush, 150)
      return
    }
    const patch = s.pending
    if (Object.keys(patch).length === 0) return
    s.pending = {}
    setPending({})
    const next = { patch, base: s.revision }
    s.inflight = next
    setInflight(next)
    s.sending = true
    save({ ...s.server, ...patch }, s.revision)
      .catch(() => {
        // The caller reports the error; show the server value again.
        s.inflight = null
        setInflight(null)
      })
      .finally(() => {
        s.sending = false
      })
  }

  /** Record a change; `delay` coalesces bursts such as arrow keys on a slider. */
  const change = (patch: Partial<T>, delay = 0) => {
    const s = state.current
    s.pending = { ...s.pending, ...patch }
    setPending(s.pending)
    window.clearTimeout(s.timer)
    s.timer = window.setTimeout(flush, delay)
  }
  return { view, change }
}
