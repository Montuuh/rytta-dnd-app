import { test, expect, type Page } from '@playwright/test'
import { campaignId, characterId, identityFixture } from './fixtures/identity.ts'
import { combatServer } from './fixtures/combat.ts'
import { shopsFixture } from './fixtures/shops.ts'
import { tabletopServer } from './fixtures/tabletop.ts'

// RYT-116: the production build, served with the headers of the generated `_headers` file (see
// scripts/serve-with-headers.mjs and the third web server in playwright.config.ts), is walked
// through the app's media, worker and lazy-chunk paths. Zero CSP violations is the bar; the
// controls at the end prove the policy actually blocks what it should.
const party = `./#/campaign/${campaignId}/party`
const modules = ['party', 'inventory', 'shops', 'combat', 'glossary', 'tabletop']

/** Every `securitypolicyviolation` event (and CSP console error) of the page and its workers. */
async function watch(page: Page) {
  const violations: string[] = []
  await page.exposeBinding('__rytta_csp', (_source, report: string) => void violations.push(report))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      ;(window as unknown as { __rytta_csp(report: string): void }).__rytta_csp(
        `${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'} at ${event.sourceFile}:${event.lineNumber}`,
      )
    })
  })
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      violations.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    if (/Content Security Policy/i.test(error.message))
      violations.push(`pageerror: ${error.message}`)
  })
  return violations
}

const shows = (page: Page, name: string, alt: string) =>
  page
    .getByRole('dialog', { name, exact: true })
    .getByRole('img', { name: alt })
    .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)

test('the headers and the hashed boot script reach the browser as generated', async ({
  page,
  request,
}) => {
  const home = await request.get('./')
  const csp = home.headers()['content-security-policy']!
  expect(csp).toContain("script-src 'self' 'sha256-")
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
  expect(csp).toContain('https://rytta-test.supabase.co')
  expect(csp).toContain('wss://rytta-test.supabase.co')
  expect(home.headers()).toMatchObject({
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
  })
  expect(home.headers()['cache-control']).toBe('no-cache')
  expect(home.headers()['permissions-policy']).toContain('camera=()')
  const cache = async (path: string) => (await request.get(path)).headers()['cache-control']
  for (const path of ['version.json', 'manifest.webmanifest'])
    expect(await cache(path)).toBe('no-cache')
  expect(await cache('art/brand/emblem.webp')).toMatch(/max-age=604800/)
  expect(await cache('art/brand/emblem.webp')).not.toMatch(/immutable/)
  const asset = (await home.text()).match(/(?:src|href)="(\/assets\/[^"]+\.js)"/)![1]!
  expect(await cache(asset)).toBe('public, max-age=31536000, immutable')

  // The boot script still sets the theme before the app runs: block every bundle and look.
  await page.route('**/assets/**', (route) => route.abort())
  await page.addInitScript(() => localStorage.setItem('rytta-theme', 'druid'))
  const violations = await watch(page)
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('data-rytta-theme', 'druid')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0c110b')
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--boot-bg')),
  ).toBe('#0c110b')
  expect(violations).toEqual([])
})

test('signed out: landing, privacy, language and theme, and the update notice', async ({
  page,
}) => {
  const violations = await watch(page)
  await identityFixture(page, { signedIn: false })
  await page.route('**/version.json*', (route) =>
    route.fulfill({ json: { id: 'older-build', builtAt: '2026-01-01T00:00:00Z' } }),
  )
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Hay una versión nueva' })).toBeVisible()
  await page.goto('./#/privacy')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('./#/settings')
  const settings = page.getByRole('dialog', { name: 'Ajustes' })
  // The English catalogue is a lazy chunk; a theme change swaps the colour tokens.
  await settings
    .getByRole('radiogroup', { name: 'Tema' })
    .getByText('Mago', { exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light')
  await settings
    .getByRole('radiogroup', { name: 'Idioma' })
    .getByText('English', { exact: true })
    .click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  expect(violations).toEqual([])
})

test('a Player: sheet, rest with 3D dice, portrait upload, inventory and shop pictures', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const violations = await watch(page)
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    party: true,
    modules,
  })
  const named = (name: string) => fixture.inventory.definitions.find((d) => d.name === name)!
  named('Espada larga').image_path = `pre/${campaignId}/items/sword.webp`
  await shopsFixture(page, fixture, { shopImage: true })
  // No reduced motion: the dice roll in WebGL, in a worker, with WebAssembly physics.
  await page.goto(`${party}/${characterId}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arin')

  await test.step('portrait upload', async () => {
    const photo = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 900
      canvas.height = 1200
      const context = canvas.getContext('2d')!
      context.fillStyle = '#8c5a2b'
      context.fillRect(0, 0, 900, 1200)
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((result) => resolve(result!), 'image/png'),
      )
      let binary = ''
      for (const byte of new Uint8Array(await blob.arrayBuffer()))
        binary += String.fromCharCode(byte)
      return btoa(binary)
    })
    const uploaded = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/storage/v1/object/character-portraits/'),
    )
    await page.locator('.sheet-plate input[type=file]').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(photo, 'base64'),
    })
    const editor = page.getByRole('dialog', { name: 'Retrato de Arin' })
    await editor.getByRole('button', { name: 'Guardar retrato' }).click()
    await uploaded
  })

  await test.step('short rest rolls 3D dice', async () => {
    await page.getByRole('button', { name: 'Descanso corto' }).click()
    await page
      .getByRole('dialog', { name: '¿Pedir un descanso corto al grupo?' })
      .getByRole('button', { name: 'Pedir descanso' })
      .click()
    const dice = page
      .getByRole('dialog', { name: 'Descanso del grupo' })
      .getByRole('group', { name: /Dados de golpe que gastas/ })
    await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
    await dice.getByRole('button', { name: 'Tirar por mí' }).click()
    await expect(page.locator('#rytta-dice-stage canvas')).toHaveCount(1, { timeout: 60_000 })
    // A blocked worker or WebAssembly module would stall the roll: report that first.
    await page.waitForTimeout(10_000)
    expect(violations).toEqual([])
    await expect(dice.getByRole('textbox', { name: 'Tu tirada' })).not.toHaveValue('', {
      timeout: 60_000,
    })
  })

  await test.step('inventory picture opens the viewer', async () => {
    await page.goto(`./#/campaign/${campaignId}/inventory`)
    await page.getByRole('button', { name: /Espada larga, cantidad 1/ }).click()
    await page.getByRole('button', { name: 'Ver la imagen de Espada larga' }).click()
    await expect.poll(() => shows(page, 'Espada larga', 'Imagen de Espada larga')).toBe(true)
    await page.keyboard.press('Escape')
  })

  await test.step('shop banner picture opens the viewer', async () => {
    await page.goto(`./#/campaign/${campaignId}/shops`)
    const banner = page.locator('.shop-banner')
    await expect(banner).toContainText('Tienda de abastos')
    await banner
      .getByRole('button', { name: 'Ver la imagen de Mercado del puerto' })
      .click({ position: { x: 24, y: 12 } })
    await expect
      .poll(() => shows(page, 'Mercado del puerto', 'Imagen de Mercado del puerto'))
      .toBe(true)
  })
  expect(violations).toEqual([])
})

test('the DM: party, bestiary art, glossary, combat, tabletop map and table view', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const violations = await watch(page)
  const combat = combatServer()
  const table = tabletopServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules })
  await combat.install(page)
  await table.install(page)

  await page.goto(party)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await page.locator('.bst-row', { hasText: /^Lobo/ }).first().locator('.bst-row-main').click()
  await page
    .locator('.bst-detail, .bst-sheet')
    .getByRole('button', { name: 'Ver la imagen de Lobo', exact: true })
    .click()
  const art = page.locator('.image-viewer-content').getByRole('img', { name: 'Imagen de Lobo' })
  await expect
    .poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true)
  await page.keyboard.press('Escape')

  await page.goto(`./#/campaign/${campaignId}/glossary/rule.long-rest`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Descanso largo').first()).toBeVisible({ timeout: 20_000 })

  await page.goto(`./#/campaign/${campaignId}/combat`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  // A scene with a painted prop and a textured ground on the table.
  const scene = table.act('save_tabletop_scene', {
    target_campaign: campaignId,
    target_scene: null,
    expected_revision: null,
    request_id: 'scene',
    fields: {
      name: 'Puente de Vado',
      map_kind: 'blank',
      ground: 'grass',
      cols: 20,
      rows: 12,
      fog_enabled: false,
      rooms: [{ id: 'ford', rects: [[0, 0, 20, 12]] }],
      items: [
        { kind: 'token', x: 4, y: 4, w: 1, h: 1, label: 'Centinela', data: { color: 'crimson' } },
        { kind: 'prop', x: 3, y: 7, w: 1, h: 1, data: { prop: 'campfire' } },
      ],
    },
  }) as { id: string }
  table.act('set_tabletop_live', {
    target_campaign: campaignId,
    request_id: 'live',
    patch: {
      scene_id: scene.id,
      view_x: 10,
      view_y: 6,
      screen: { diagonal_in: 32, px_w: 1920, px_h: 1080, base_mm: 25.4, fine: 1, flip: false },
    },
  })
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mesa' })).toBeVisible({
    timeout: 20_000,
  })
  await page
    .getByRole('button', { name: /Puente de Vado/ })
    .first()
    .click({ timeout: 5_000 })
    .catch(() => undefined)

  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  const start = page.getByRole('dialog', { name: 'Pantalla de mesa' })
  await expect(start).toBeVisible({ timeout: 20_000 })
  await start.getByRole('button', { name: 'Empezar' }).click()
  const board = page.locator('.tt-table')
  await expect(board.locator('.tt-token', { hasText: 'Centinela' })).toBeVisible()
  await expect(board.locator('img, image').first()).toBeAttached()
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('.tt-table img')].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)
  expect(violations).toEqual([])
})

test('controls: the policy blocks what it must and allows the backend origin', async ({ page }) => {
  const violations = await watch(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const backend = 'https://rytta-test.supabase.co'
  await page.route(`${backend}/**`, (route) => route.fulfill({ status: 404, body: '' }))
  const attempt = async (code: string) => {
    const before = violations.length
    await page.evaluate(code)
    await page.waitForTimeout(300)
    return violations.slice(before)
  }
  // Allowed: images, audio and data from the configured backend (the probes are not blocked).
  expect(
    await attempt(
      `(async () => {
        new Image().src = '${backend}/storage/v1/object/sign/probe.webp'
        new Audio('${backend}/storage/v1/object/sign/probe.mp3')
        await fetch('${backend}/rest/v1/probe').catch(() => {})
        new Image().src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
      })()`,
    ),
  ).toEqual([])
  // Blocked: foreign origins for every kind of request, inline script and eval.
  const blocked = async (code: string, directive: string) => {
    const found = await attempt(code)
    expect(found.join('\n'), code).toContain(`${directive} blocked`)
  }
  await blocked(`new Image().src = 'https://evil.example/x.png'`, 'img-src')
  await blocked(`new Audio('https://evil.example/x.mp3')`, 'media-src')
  await blocked(`fetch('https://evil.example/x').catch(() => {})`, 'connect-src')
  await blocked(
    `{ const s = document.createElement('script'); s.textContent = 'window.pwned = 1'; document.head.append(s) }`,
    'script-src-elem',
  )
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  await blocked(
    `{ const s = document.createElement('script'); s.src = 'https://evil.example/x.js'; document.head.append(s) }`,
    'script-src-elem',
  )
  await blocked(`setTimeout("window.evaluated = 1", 0)`, 'script-src')
  await blocked(
    `{ const f = document.createElement('iframe'); f.src = 'https://evil.example/'; document.body.append(f) }`,
    'frame-src',
  )
})
