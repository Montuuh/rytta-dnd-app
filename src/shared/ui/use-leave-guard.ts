import { useEffect } from 'react'

/** Unsaved edits: links ask before leaving the page, and the browser warns before unloading.
 * The router is a HashRouter, so links are intercepted instead of using a route blocker. */
export function useLeaveGuard(dirty: boolean, ask: (href: string) => void) {
  useEffect(() => {
    if (!dirty) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      if (link.target && link.target !== '_self') return
      // HashRouter routes are "#/…"; in-page anchors such as the skip link are not navigation.
      if (link.origin !== window.location.origin || !link.hash.startsWith('#/')) return
      if (link.hash === window.location.hash) return
      event.preventDefault()
      event.stopPropagation()
      ask(link.href)
    }
    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    document.addEventListener('click', onClick, true)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [dirty, ask])
}
