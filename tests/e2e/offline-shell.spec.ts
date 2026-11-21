import { test, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

// RYT-128 and RYT-013 run against the production subpath build with its service worker.
test.use({ serviceWorkers: 'allow' })

const backend = /\/(rest|auth|storage)\/v1\//
// Back online but the backend still fails: data calls and its health check.
const failing = /\/(rest\/v1\/|auth\/v1\/health)/

async function axeClean(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations.map((v) => v.id)).toEqual([])
}

/** After one online visit the worker controls the page and holds the shell. */
async function shellReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      )
  })
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const names = await caches.keys()
        return names.filter((name) => name.startsWith('rytta-shell-')).length
      }),
    )
    .toBe(1)
}

test('RYT-128 a reload without signal opens the app with its offline line, then recovers', async ({
  page,
  context,
}, info) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await shellReady(page)

  // The fixture answers backend calls even offline; without signal they cannot reach anything.
  const unreachable = (route: Route) => route.abort('internetdisconnected')
  await page.route(backend, unreachable)
  await context.setOffline(true)
  await page.reload()
  const strip = page.locator('.connection-strip')
  await expect(strip).toContainText('Sin conexión · lo que ves puede estar desactualizado')
  await expect(
    page.locator('[aria-live="polite"]').filter({ hasText: 'Sin conexión' }),
  ).toBeAttached()
  await expect(page.locator('.app-header')).toBeVisible()
  const placeholder = page.locator('.offline-placeholder')
  await expect(placeholder).toContainText('Esta pantalla necesita conexión')
  await expect(placeholder).toContainText('Se cargará sola cuando vuelva la red.')
  await expectTouchTargets(page, '.offline-placeholder button')
  await axeClean(page)
  await capture(page, `test-results/ryt-128-offline-${info.project.name}.png`)

  // Only the app's own static files are cached: no backend, Auth or Storage response.
  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) urls.push(request.url)
    }
    return urls
  })
  expect(cached.length).toBeGreaterThan(2)
  for (const url of cached) {
    const parsed = new URL(url)
    expect(parsed.origin).toBe('http://127.0.0.1:4174')
    expect(parsed.pathname.startsWith('/rytta-dnd-app/')).toBe(true)
    expect(parsed.search).toBe('')
    expect(url).not.toMatch(/supabase\.co|\/(rest|auth|storage|realtime)\/v1\/|version\.json/)
  }

  // The network returns: the screen loads by itself and the line confirms, then goes away.
  await page.unroute(backend, unreachable)
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.getByText('The Sunken Coast').first()).toBeVisible()
  await expect(strip).toContainText('Conexión recuperada · datos al día')
  await capture(page, `test-results/ryt-013-recovered-${info.project.name}.png`)
  await expect(strip).toHaveCount(0, { timeout: 6000 })
})

test('RYT-013 a refresh that fails after reconnecting offers Retry, which reloads the screen', async ({
  page,
  context,
}, info) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.getByText('The Sunken Coast').first()).toBeVisible()
  await context.setOffline(true)
  const strip = page.locator('.connection-strip')
  await expect(strip).toContainText('Sin conexión')
  // Back online, but the backend still fails once.
  let fail = true
  await page.route(failing, async (route) => {
    if (!fail) return route.fallback()
    await route.fulfill({ status: 503, body: '{}' })
  })
  await context.setOffline(false)
  await expect(strip).toContainText('No se pudo actualizar')
  // What was on screen stays, marked by the line as possibly out of date.
  await expect(page.getByText('The Sunken Coast').first()).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  const retry = strip.getByRole('button', { name: 'Reintentar' })
  await expect(retry).toHaveAccessibleDescription('No se pudo actualizar')
  await expectTouchTargets(strip, 'button')
  await axeClean(page)
  await capture(page, `test-results/ryt-013-failed-${info.project.name}.png`)
  fail = false
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(strip).toContainText('Conexión recuperada · datos al día')
  // Retry went away with the problem: focus lands on the main content, never on <body>.
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(strip).toHaveCount(0, { timeout: 6000 })
})

test('RYT-013 one screen failing on its own is not a connection problem', async ({
  page,
  context,
}) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.getByText('The Sunken Coast').first()).toBeVisible()
  await context.setOffline(true)
  const strip = page.locator('.connection-strip')
  await expect(strip).toContainText('Sin conexión')
  // Back online: the invitations fail on the server, the campaigns load.
  await page.route('**/rest/v1/rpc/list_my_invitations', (route) =>
    route.fulfill({ status: 500, body: '{}' }),
  )
  await context.setOffline(false)
  await expect(strip).toContainText('Conexión recuperada · datos al día')
  await expect(page.getByText('The Sunken Coast').first()).toBeVisible()
  await expect(strip).toHaveCount(0, { timeout: 6000 })
})

test('RYT-128 the version notice reloads into the new build with the worker in place', async ({
  page,
}) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await shellReady(page)
  await page.route('**/version.json*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"id":"next-build"}' }),
  )
  await page.reload()
  const update = page.locator('.update-notice')
  await expect(update).toBeVisible()
  const started = Date.now()
  await Promise.all([
    page.waitForEvent('load'),
    update.getByRole('button', { name: 'Recargar' }).click(),
  ])
  expect(Date.now() - started).toBeLessThan(5000)
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
})

for (const [language, theme] of [
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-013 the connection line and offline placeholder (${language}, ${theme})`, async ({
    page,
    context,
  }, info) => {
    limitMatrix(info, false)
    const es = language === 'es'
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    await identityFixture(page)
    await page.goto('./')
    await expect(page.locator('main h1')).toBeVisible()
    await shellReady(page)
    const unreachable = (route: Route) => route.abort('internetdisconnected')
    await page.route(backend, unreachable)
    await context.setOffline(true)
    await page.reload()
    const strip = page.locator('.connection-strip')
    await expect(strip).toContainText(
      es
        ? 'Sin conexión · lo que ves puede estar desactualizado'
        : 'Offline · what you see may be out of date',
    )
    await expect(page.locator('.offline-placeholder')).toContainText(
      es ? 'Esta pantalla necesita conexión' : 'This screen needs a connection',
    )
    await axeClean(page)
    await capture(page, `test-results/ryt-013-offline-${language}-${theme}.png`)
    await page.unroute(backend, unreachable)
    let fail = true
    await page.route(failing, (route) =>
      fail ? route.fulfill({ status: 503, body: '{}' }) : route.fallback(),
    )
    await context.setOffline(false)
    await expect(strip).toContainText(es ? 'No se pudo actualizar' : 'Could not update')
    await axeClean(page)
    await capture(page, `test-results/ryt-013-failed-${language}-${theme}.png`)
    fail = false
    await strip.getByRole('button', { name: es ? 'Reintentar' : 'Try again' }).click()
    await expect(strip).toContainText(
      es ? 'Conexión recuperada · datos al día' : 'Connection back · up to date',
    )
    await axeClean(page)
    await capture(page, `test-results/ryt-013-recovered-${language}-${theme}.png`)
  })
}

test('RYT-013 inside a campaign a failed refresh keeps its header and navigation', async ({
  page,
  context,
}, info) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/20000000-0000-4000-8000-000000000001`)
  const header = page.locator('.app-header')
  await expect(header).toContainText('The Sunken Coast')
  const nav = page.locator('nav.bottom-nav, nav.nav-tabs').filter({ visible: true }).first()
  await expect(nav).toBeVisible()
  await context.setOffline(true)
  const strip = page.locator('.connection-strip')
  await expect(strip).toContainText('Sin conexión')
  await page.route(failing, (route) => route.fulfill({ status: 503, body: '{}' }))
  await context.setOffline(false)
  await expect(strip).toContainText('No se pudo actualizar')
  await expect(header).toContainText('The Sunken Coast')
  await expect(nav).toBeVisible()
  await axeClean(page)
  await capture(page, `test-results/ryt-013-failed-campaign-${info.project.name}.png`)
})
