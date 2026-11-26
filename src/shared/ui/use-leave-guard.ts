import { useEffect } from 'react'
import { routeOf } from '@/shared/lib/app-path'

/** Unsaved edits: links ask before leaving the page, and the browser warns before unloading.
 * Links are intercepted in the capture phase, before the router handles them; `ask` gets the
 * route to open (`/campaign/x/party`) once the person agrees. */
export function useLeaveGuard(dirty: boolean, ask: (route: string) => void) {
  useEffect(() => {
    if (!dirty) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      if (link.target && link.target !== '_self') return
      if (link.hasAttribute('download')) return
      const route = routeOf(link.href, window.location.origin, import.meta.env.BASE_URL)
      if (!route) return
      // The same page, or an in-page anchor such as the skip link: nothing is left.
      if (link.pathname === window.location.pathname && link.search === window.location.search)
        return
      event.preventDefault()
      event.stopPropagation()
      ask(route)
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
