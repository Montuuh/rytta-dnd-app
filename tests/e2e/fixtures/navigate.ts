import type { Page } from '@playwright/test'

/**
 * RYT-186: opens a route inside the running app, as a link does, without reloading the page.
 * With hash routes `page.goto('./#/…')` did that; a path `goto` loads the app again and drops
 * in-memory state such as the DM's Player view. `route` is relative to the base (`campaign/x`).
 */
export async function openInApp(page: Page, route: string) {
  await page.evaluate((route) => {
    const manifest = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '/'
    const base = manifest.replace(/manifest\.webmanifest$/, '')
    history.pushState(null, '', `${base}${route.replace(/^\.?\/+/, '')}`)
    dispatchEvent(new PopStateEvent('popstate'))
  }, route)
}
