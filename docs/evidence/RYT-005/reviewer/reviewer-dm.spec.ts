import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'

// RYT-005 DM redesign review probes. Observations are logged; setup steps are hard expectations.
const shops = `./#/campaign/${campaignId}/shops`
const log = (label: string, value: unknown) =>
  console.log(`[dm] ${test.info().project.name} ${label}: ${JSON.stringify(value)}`)
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    return `${el.tagName}[${el.getAttribute('role') ?? ''}] "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 50)}"`
  })
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations
  log(`axe ${label}`, v.map((x) => `${x.id}(${x.nodes.length}) ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`))
  log(`overflow ${label}`, await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main button, main [role="slider"], main a, [role="dialog"] button')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && (r.height < 44 || r.width < 24))
      .map(({ el, r }) => `${(el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('role') ?? '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`),
  )
  log(`small targets ${label}`, small)
}
async function prefs(page: Page, lang: 'en' | 'es', scheme: 'light' | 'dark') {
  await page.addInitScript(
    ({ lang, scheme }) => {
      localStorage.setItem('rytta-language', lang)
      localStorage.setItem('rytta-color-scheme', scheme)
    },
    { lang, scheme },
  )
}
async function big(page: Page) {
  await page.addInitScript(() => {
    const add = () => {
      const s = document.createElement('style')
      s.textContent = 'html { font-size: 150% !important; }'
      document.head.appendChild(s)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  })
}
async function setup(page: Page) {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  const calls: { method: string; body: unknown }[] = []
  page.on('request', (r) => {
    const m = r.url().match(/rpc\/(save_shop|set_shop_modifier|save_listing)/)
    if (m) calls.push({ method: m[1]!, body: r.postDataJSON() })
  })
  return calls
}
async function slow(page: Page, ms: number) {
  await page.route(/rest\/v1\/rpc\/(save_shop|set_shop_modifier|save_listing|respond_order|revert_order)/, async (route) => {
    await new Promise((r) => setTimeout(r, ms))
    await route.fallback()
  })
}

test('ES dark: inline controls, feedback, stepper hold, picker, ledger, seal', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await setup(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  await axe(page, 'admin')
  await page.screenshot({ path: info.outputPath('admin.png'), fullPage: true })
  // Slider semantics
  log('sliders', await page.locator('[role="slider"]').evaluateAll((els) => els.map((e) => ({ label: e.getAttribute('aria-label'), now: e.getAttribute('aria-valuenow'), text: e.getAttribute('aria-valuetext') }))))
  // Feedback visibility: save a modifier from the bottom of the page via keyboard.
  const mod = page.locator('[role="slider"]').last()
  await mod.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(600)
  const notice = page.getByRole('status').first()
  const box = await notice.boundingBox().catch(() => null)
  const vp = page.viewportSize()!
  log('notice after modifier save', { text: await notice.textContent().catch(() => null), inViewport: !!box && box.y >= 0 && box.y < vp.height, y: box?.y })
  log('focus after modifier save', await focused(page))
  await page.screenshot({ path: info.outputPath('modifier-saved-viewport.png') })
  // Stock row: expand, stepper hold
  const potionRow = page.getByRole('button', { name: /Poción de curación/ })
  await potionRow.click()
  const price = page.getByLabel('Precio', { exact: true })
  const before = await price.inputValue()
  const up = page.getByRole('button', { name: 'Subir Precio' })
  const b = (await up.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1500)
  await page.mouse.up()
  log('stepper hold 1.5s', { before, after: await price.inputValue() })
  await up.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  log('stepper keyboard Enter+Space', await price.inputValue())
  await axe(page, 'stock-editor')
  await page.locator('.stock-row.is-expanded').screenshot({ path: info.outputPath('stock-editor.png') })
  // Unsaved edits when collapsing the row?
  await potionRow.click()
  await page.waitForTimeout(300)
  log('collapsed with unsaved edits; notice/prompt?', await page.getByRole('dialog').count())
  await potionRow.click()
  log('reopened price (draft discarded?)', await page.getByLabel('Precio', { exact: true }).inputValue())
  await potionRow.click()
  // Picker
  const addBtn = page.getByRole('button', { name: 'Añadir objeto' })
  await addBtn.focus()
  await page.keyboard.press('Enter')
  const picker = page.getByRole('dialog')
  await expect(picker).toBeVisible()
  log('picker tiles', await picker.locator('.pick-tile').allInnerTexts())
  log('picker tile size', await picker.locator('.pick-tile').first().boundingBox())
  await axe(page, 'picker')
  await page.screenshot({ path: info.outputPath('picker.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  log('focus after picker Escape', await focused(page))
  // Ledger
  await page.getByRole('tab', { name: /Bitácora/ }).click()
  await expect(page.locator('.order-card').first()).toBeVisible()
  log('ledger views', await page.locator('.ledger-views label').allInnerTexts())
  await axe(page, 'ledger')
  await page.screenshot({ path: info.outputPath('ledger.png'), fullPage: true })
  await page.getByRole('button', { name: /^Contraofertar/ }).first().click()
  await page.waitForTimeout(300)
  log('focus after opening counter panel', await focused(page))
  await axe(page, 'counter-panel')
  await page.locator('.order-card', { has: page.locator('.inline-panel') }).screenshot({ path: info.outputPath('counter-panel.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  log('counter panel open after Escape', await page.locator('.inline-panel').count())
  // History + revert seal
  await page.locator('.ledger-views label', { hasText: /Historial/ }).click()
  await page.getByRole('button', { name: /^Revertir/ }).first().click()
  await page.waitForTimeout(300)
  log('focus after opening revert panel', await focused(page))
  const seal = page.locator('.hold-seal')
  log('seal', { label: await seal.getAttribute('aria-label'), box: await seal.boundingBox() })
  await axe(page, 'revert-panel')
  await page.locator('.order-card', { has: page.locator('.revert-panel') }).screenshot({ path: info.outputPath('revert-panel.png') })
  // Quick tap (not a hold) must not revert
  const sb = (await seal.boundingBox())!
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
  await page.waitForTimeout(400)
  log('after quick tap on seal: panel still open', await page.locator('.revert-panel').count())
  log('page text near seal', (await page.locator('.revert-panel').innerText().catch(() => '')).slice(0, 300))
  await page.screenshot({ path: info.outputPath('revert-after-tap.png') })
  log('errors', errors)
})

test('auto-save under latency: ignored changes and slider keyboard', async ({ page }, info) => {
  const calls = await setup(page)
  await slow(page, 1200)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  // Two quick changes: visibility then mode.
  await page.locator('.shop-controls').getByText('Oculta', { exact: true }).click()
  await page.waitForTimeout(150)
  await page.locator('.shop-controls').getByText('Con aprobación del DM', { exact: true }).click()
  await page.waitForTimeout(150)
  log('during save: any saving indicator', await page.locator('.shop-controls [data-loading], .shop-controls .mantine-Loader, [aria-busy="true"]').count())
  await page.screenshot({ path: info.outputPath('during-save.png') })
  await page.waitForTimeout(2500)
  const active = await page.locator('.shop-controls .mantine-SegmentedControl-control[data-active] , .shop-controls label[data-active]').allInnerTexts()
  log('segmented after settle', active)
  log('mode help after settle', await page.locator('.shop-controls').innerText().then((t) => t.slice(0, 600)))
  log('save_shop calls', calls.filter((c) => c.method === 'save_shop').map((c) => { const d = (c.body as { draft?: Record<string, unknown> }).draft ?? c.body; return { visibility: (d as Record<string, unknown>).visibility ?? (d as Record<string, unknown>).target_visibility, mode: (d as Record<string, unknown>).mode ?? (d as Record<string, unknown>).target_mode } }))
  log('notices', await page.getByRole('status').allInnerTexts())
  // Resale slider via keyboard: three quick presses.
  const resale = page.locator('.shop-controls [role="slider"]')
  const start = await resale.getAttribute('aria-valuenow')
  await resale.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  log('resale shown right after 3 presses', { start, now: await resale.getAttribute('aria-valuenow') })
  await page.waitForTimeout(3500)
  log('resale shown after settle', await resale.getAttribute('aria-valuenow'))
  log('resale label text', await page.locator('.shop-controls').getByText(/%/).allInnerTexts())
  log('save_shop resale bodies', calls.filter((c) => c.method === 'save_shop').map((c) => JSON.stringify(c.body).match(/resale_percent"?:\s*(\d+)/)?.[1]))
  // Modifier slider: two quick presses.
  const mod = page.locator('[role="slider"]').last()
  const mstart = await mod.getAttribute('aria-valuenow')
  await mod.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(150)
  log('modifier right after 2 presses', { mstart, now: await mod.getAttribute('aria-valuenow') })
  await page.waitForTimeout(3000)
  log('modifier after settle', await mod.getAttribute('aria-valuenow'))
  log('modifier calls', calls.filter((c) => c.method === 'set_shop_modifier').map((c) => c.body))
  await page.screenshot({ path: info.outputPath('after-latency.png'), fullPage: true })
})

test('EN light and 150% text', async ({ page }, info) => {
  await setup(page)
  await prefs(page, 'en', 'light')
  await big(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await axe(page, 'admin-en-light-150')
  await page.screenshot({ path: info.outputPath('admin-en-light-150.png'), fullPage: true })
  await page.locator('.stock-row-main').first().click()
  await axe(page, 'stock-en-light-150')
  await page.locator('.stock-row.is-expanded').screenshot({ path: info.outputPath('stock-en-light-150.png') })
  await page.getByRole('tab', { name: /Ledger/ }).click()
  await expect(page.locator('.order-card').first()).toBeVisible()
  log('ledger views en', await page.locator('.ledger-views label').allInnerTexts())
  await page.getByRole('button', { name: /^Counter/ }).first().click()
  await axe(page, 'counter-en-light-150')
  await page.screenshot({ path: info.outputPath('ledger-counter-en-light-150.png'), fullPage: true })
  await page.locator('.ledger-views label', { hasText: /History/ }).click()
  await page.getByRole('button', { name: /^Revert/ }).first().click()
  await axe(page, 'revert-en-light-150')
  await page.locator('.order-card', { has: page.locator('.revert-panel') }).screenshot({ path: info.outputPath('revert-en-light-150.png') })
})
