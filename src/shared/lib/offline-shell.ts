/**
 * RYT-128: registers the offline shell worker (`sw.js`, written by the build) for production
 * builds only. Development servers never register it, and a page opened with `?no-sw` unregisters
 * it (see docs/offline-shell.md).
 */
export function registerOfflineShell(base: string, production: boolean) {
  if (!production || !('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  if (new URLSearchParams(window.location.search).has('no-sw')) {
    void container.getRegistrations().then((all) => all.forEach((one) => void one.unregister()))
    return
  }
  const start = () =>
    void container
      .register(`${base}sw.js`, { scope: base })
      .then(() => container.ready)
      .then(async (registration) => {
        // The first visit loaded files before the worker controlled the page, and requests already
        // in flight when it took over still bypass it. Hand those over: what is loaded now, then
        // whatever finishes during the next minute (the worker skips what it already holds).
        if (!container.controller)
          await new Promise((resolve) =>
            container.addEventListener('controllerchange', resolve, { once: true }),
          )
        const own = (url: string) => url.startsWith(`${location.origin}${base}`)
        const report = (urls: string[]) => {
          const mine = urls.filter(own)
          if (mine.length) registration.active?.postMessage({ type: 'rytta-loaded', urls: mine })
        }
        report(performance.getEntriesByType('resource').map((entry) => entry.name))
        if (typeof PerformanceObserver !== 'function') return
        const observer = new PerformanceObserver((list) =>
          report(list.getEntries().map((entry) => entry.name)),
        )
        observer.observe({ type: 'resource' })
        window.setTimeout(() => observer.disconnect(), 60_000)
      })
      .catch(() => {})
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

/**
 * Before the version notice reloads: let the newer worker take over so the next load drops the
 * old build's cache. Bounded, so Reload never hangs; navigations go to the network first anyway.
 */
export async function activateNewerShell(timeoutMs = 3000) {
  if (!('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  const settled = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs))
  const takeOver = (async () => {
    const registration = await container.getRegistration()
    if (!registration || !container.controller) return
    await registration.update().catch(() => {})
    const worker = registration.waiting ?? registration.installing
    if (!worker) return
    const changed = new Promise<void>((resolve) =>
      container.addEventListener('controllerchange', () => resolve(), { once: true }),
    )
    if (worker.state === 'installing')
      await new Promise<void>((resolve) =>
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installing') resolve()
        }),
      )
    worker.postMessage('rytta-activate')
    await changed
  })()
  await Promise.race([takeOver, settled])
}
