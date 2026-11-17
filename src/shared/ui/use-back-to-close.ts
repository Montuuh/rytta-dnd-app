import { useEffect, useRef } from 'react'

/**
 * Phone and browser Back closes the open overlay instead of leaving the page.
 *
 * ```tsx
 * const [opened, { open, close }] = useDisclosure(false)
 * useBackToClose(opened, close)
 * ```
 *
 * While `opened` is true the overlay owns one history entry (same URL, so the hash router sees no
 * navigation). Back pops that entry and calls `close`; closing by any other means (button, Escape,
 * success) removes the entry again with a silent `history.back()`. Nested overlays each own an
 * entry and close in reverse order. If the page navigates while an overlay is open (a link inside
 * a drawer), the leftover entry is skipped the first time Back reaches it.
 *
 * `close` should be idempotent: when it refuses (a request is in flight) the entry is already
 * gone, so Back leaves the page on the next press. Overlays that must not be left should disable
 * their own Cancel/Escape while busy, as the account dialog does.
 */
export function useBackToClose(opened: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!opened || typeof window === 'undefined') return
    return sharedStack().register(() => closeRef.current())
  }, [opened])
}

const STATE_KEY = 'ryttaOverlays'
/** A browser that never answers a programmatic back() must not freeze later overlays. */
const BACK_TIMEOUT_MS = 500

type HistoryState = Record<string, unknown> | null
export type BackStackWindow = {
  history: { readonly state: unknown; pushState(state: unknown, title: string): void; back(): void }
  addEventListener(type: 'popstate', listener: () => void): void
}

function overlayTokens(state: unknown): string[] {
  const list = (state as HistoryState)?.[STATE_KEY]
  return Array.isArray(list)
    ? list.filter((token): token is string => typeof token === 'string')
    : []
}

/** The registry behind `useBackToClose`; exported with an injectable window for unit tests. */
export function createBackStack(win: BackStackWindow) {
  const open = new Map<string, () => void>()
  const pushed = new Set<string>()
  /** Entries left behind by a navigation: Back skips them once. */
  const stale = new Set<string>()
  let pendingBack = false
  let queue: (() => void)[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let counter = 0

  const settle = () => {
    pendingBack = false
    clearTimeout(timer)
    const run = queue
    queue = []
    run.forEach((step) => step())
  }
  const goBack = () => {
    pendingBack = true
    clearTimeout(timer)
    timer = setTimeout(settle, BACK_TIMEOUT_MS)
    win.history.back()
  }
  // A push queued behind a pending back() would otherwise be popped by it.
  const whenIdle = (step: () => void) => (pendingBack ? queue.push(step) : step())

  win.addEventListener('popstate', () => {
    const live = overlayTokens(win.history.state)
    for (const [token, close] of [...open]) {
      // An overlay still waiting for its entry (queued behind a back) is not affected.
      if (!pushed.has(token) || live.includes(token)) continue
      open.delete(token)
      pushed.delete(token)
      close()
    }
    const top = live[live.length - 1]
    if (top && stale.has(top)) {
      stale.delete(top)
      goBack()
      return
    }
    if (pendingBack) settle()
  })

  return {
    /** Resolves once no programmatic back() is pending. */
    idle: () => new Promise<void>((resolve) => whenIdle(resolve)),
    /** Opens an overlay's entry; the returned function releases it. */
    register(onBack: () => void) {
      const token = `overlay-${++counter}`
      open.set(token, onBack)
      whenIdle(() => {
        if (!open.has(token)) return
        const base = overlayTokens(win.history.state).filter((id) => open.has(id) && id !== token)
        const current = win.history.state as HistoryState
        win.history.pushState({ ...current, [STATE_KEY]: [...base, token] }, '')
        pushed.add(token)
      })
      return () => {
        // Already closed by Back: its entry is gone.
        if (!open.delete(token)) return
        const wasPushed = pushed.delete(token)
        if (!wasPushed) return
        const live = overlayTokens(win.history.state)
        if (live[live.length - 1] === token) goBack()
        else stale.add(token)
      }
    },
  }
}

/**
 * For code that closes an overlay and then navigates (`replace` or `navigate(-1)`): await this, so the replace lands on the page's own entry instead
 * of on the overlay's.
 */
export const afterOverlayEntriesSettle = () =>
  typeof window === 'undefined'
    ? Promise.resolve()
    : // One task first: an overlay closed in the same event gives its entry back when React
      // commits, which is after the handler that is asking.
      new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => sharedStack().idle())

let shared: ReturnType<typeof createBackStack> | undefined
const sharedStack = () => (shared ??= createBackStack(window))
