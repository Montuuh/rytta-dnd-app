import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'

// RYT-005 DM redesign focused re-review probes (D1-D8). Observations are logged.
const shops = `./#/campaign/${campaignId}/shops`
const log = (label: string, value: unknown) =>
  console.log(`[dm2] ${test.info().project.name} ${label}: ${JSON.stringify(value)}`)
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
  log(`overflow ${label}`, await page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
}
async function setup(page: Page, opts: { lang?: 'en' | 'es'; scheme?: 'light' | 'dark'; big?: boolean } = {}) {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.addInitScript(
    ({ lang, scheme, big }) => {
      localStorage.setItem('rytta-language', lang)
      localStorage.setItem('rytta-color-scheme', scheme)
      if (big)
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style')
          s.textContent = 'html { font-size: 150% !important; }'
          document.head.appendChild(s)
        })
    },
    { lang: opts.lang ?? 'es', scheme: opts.scheme ?? 'dark', big: !!opts.big },
  )
  const calls: { method: string; body: string }[] = []
  page.on('request', (r) => {
    const m = r.url().match(/rpc\/(save_shop|set_shop_modifier|save_listing|respond_order)/)
    if (m) calls.push({ method: m[1]!, body: r.postData() ?? '' })
  })
  return calls
}
async function slow(page: Page, ms: number) {
  await page.route(/rest\/v1\/rpc\/(save_shop|set_shop_modifier|save_listing|respond_order|revert_order)/, async (route) => {
    await new Promise((r) => setTimeout(r, ms))
    await route.fallback()
  })
}
const pill = (page: Page) => page.locator('.save-pill')
async function pillState(page: Page) {
  const p = pill(page)
  if (!(await p.count())) return null
  const box = await p.boundingBox()
  const vp = page.viewportSize()!
  return { text: (await p.innerText()).trim(), inViewport: !!box && box.y >= 0 && box.y + box.height <= vp.height, y: box && Math.round(box.y), h: box && Math.round(box.height) }
}

test('D1/D2 latency: rapid changes, slider bursts, modifier queue, pill', async ({ page }, info) => {
  const calls = await setup(page)
  await slow(page, 1200)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  log('autosave hint', await page.locator('.shop-controls').getByText(/se guardan solos/).count())
  await page.locator('.shop-controls').getByText('Oculta', { exact: true }).click()
  await page.waitForTimeout(150)
  await page.locator('.shop-controls').getByText('Con aprobación del DM', { exact: true }).click()
  await page.waitForTimeout(200)
  log('pill during save', await pillState(page))
  await page.screenshot({ path: info.outputPath('pill-saving.png') })
  await page.waitForTimeout(4000)
  log('active segments after settle', await page.locator('.shop-controls label[data-active], .shop-controls [data-active] label').allInnerTexts())
  log('save_shop bodies (vis/mode)', calls.filter((c) => c.method === 'save_shop').map((c) => [c.body.match(/"(?:new_|target_)?visibility"?:"(\w+)"/)?.[1], c.body.match(/"(?:new_|target_)?mode"?:"(\w+)"/)?.[1]]))
  log('pill after settle', await pillState(page))
  // Reload to verify persistence in the fixture
  // Resale arrow burst
  const resale = page.locator('.shop-controls [role="slider"]')
  await resale.focus()
  const n0 = calls.filter((c) => c.method === 'save_shop').length
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  log('resale right after burst', { now: await resale.getAttribute('aria-valuenow'), text: await resale.getAttribute('aria-valuetext') })
  await page.waitForTimeout(4000)
  log('resale after settle', { now: await resale.getAttribute('aria-valuenow'), text: await resale.getAttribute('aria-valuetext'), focus: await focused(page) })
  log('resale saves', calls.filter((c) => c.method === 'save_shop').slice(n0).map((c) => c.body.match(/resale_percent"?:\s*(\d+)/)?.[1]))
  // Modifier: two presses while nothing in flight, then two more during flight
  const mod = page.locator('[role="slider"]').last()
  await mod.focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(800)
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(150)
  log('modifier during flight', { now: await mod.getAttribute('aria-valuenow'), text: await mod.getAttribute('aria-valuetext') })
  log('pill near modifier', await pillState(page))
  await page.screenshot({ path: info.outputPath('pill-modifier.png') })
  await page.waitForTimeout(4500)
  log('modifier after settle', { now: await mod.getAttribute('aria-valuenow'), text: await mod.getAttribute('aria-valuetext') })
  log('modifier calls', calls.filter((c) => c.method === 'set_shop_modifier').map((c) => c.body.match(/new_percent"?:\s*(-?\d+)/)?.[1]))
  log('pill final', await pillState(page))
  await page.waitForTimeout(5500)
  log('pill after 5s', await pillState(page))
})

test('D1 error: failed save reverts and pill reports it', async ({ page }, info) => {
  await setup(page)
  await page.route(/rest\/v1\/rpc\/save_shop/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
  )
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  await page.locator('.shop-controls').getByText('Con aprobación del DM', { exact: true }).click()
  await page.waitForTimeout(1500)
  log('segments after error', await page.locator('.shop-controls label[data-active]').allInnerTexts())
  log('pill on error', await pillState(page))
  log('alert role count', await page.locator('.save-pill[role="alert"]').count())
  await page.screenshot({ path: info.outputPath('pill-error.png') })
})

test('D3/D8 ledger panels: focus, Escape, reject confirm', async ({ page }, info) => {
  await setup(page)
  await slow(page, 700)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await page.getByRole('tab', { name: /Bitácora/ }).click()
  await expect(page.locator('.order-card').first()).toBeVisible()
  const counter = page.getByRole('button', { name: /^Contraofertar$/ }).first()
  await counter.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  log('focus after counter open', await focused(page))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  log('after Escape: panels / focus', [await page.locator('.inline-panel').count(), await focused(page)])
  // Reject confirm
  const reject = page.getByRole('button', { name: /^Rechazar$/ }).first()
  await reject.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  log('after reject tap: focus / text', [await focused(page), (await page.locator('.order-card').first().innerText()).slice(-160)])
  await page.locator('.order-card').first().screenshot({ path: info.outputPath('reject-confirm.png') })
  await axe(page, 'reject-confirm')
  log('confirm button colors', await page.getByRole('button', { name: /Sí, rechazar/ }).first().evaluate((el) => { const c = getComputedStyle(el); return [c.color, c.backgroundColor, c.opacity] }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  log('reject confirm after Escape', [await page.getByRole('button', { name: /Sí, rechazar/ }).count(), await focused(page)])
  await page.getByRole('button', { name: /^Rechazar$/ }).first().click()
  await page.waitForTimeout(200)
  const no = page.getByRole('button', { name: /^No$/ })
  if (await no.count()) {
    await no.first().click()
    await page.waitForTimeout(250)
    log('after No: focus', await focused(page))
  }
  // Counter send with latency
  await page.getByRole('button', { name: /^Contraofertar$/ }).first().click()
  await page.getByRole('button', { name: /^Mitad/ }).first().click()
  await page.getByRole('button', { name: /^Contraofertar \d+/ }).first().click()
  log('focus right after send', await focused(page))
  await page.waitForTimeout(120)
  log('focus 120ms after send (in flight)', await focused(page))
  await page.waitForTimeout(2000)
  log('focus after counter settled', await focused(page))
  log('cards in view', await page.locator('.order-card h3').allInnerTexts())
  log('pill', await pillState(page))
  await page.screenshot({ path: info.outputPath('after-counter.png'), fullPage: true })
  // Revert
  await page.locator('.ledger-views label', { hasText: /Historial/ }).click()
  const rv = page.getByRole('button', { name: /^Revertir$/ }).first()
  await rv.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  log('focus after revert open', await focused(page))
  await page.locator('.order-card', { has: page.locator('.revert-panel') }).screenshot({ path: info.outputPath('revert-panel.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  log('after revert Escape', [await page.locator('.revert-panel').count(), await focused(page)])
  await rv.click()
  await page.locator('.hold-seal').focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2200)
  log('focus after revert settled', await focused(page))
  log('pill after revert', await pillState(page))
})

test('D4-D7: 150% EN light overflow, sliders, picker hidden, unsaved badge', async ({ page }, info) => {
  await setup(page, { lang: 'en', scheme: 'light', big: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await axe(page, 'admin-150')
  log('slider thumbs', await page.locator('[role="slider"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const after = getComputedStyle(e, '::after'); return { w: Math.round(r.width), text: e.getAttribute('aria-valuetext'), afterW: after.width, afterH: after.height } })))
  await page.screenshot({ path: info.outputPath('admin-150.png'), fullPage: true })
  // Stock editor at 150
  const row = page.locator('.stock-row-main').first()
  await row.click()
  await axe(page, 'stock-150')
  await page.locator('.stock-row.is-expanded').screenshot({ path: info.outputPath('stock-150.png') })
  // D7 unsaved edits
  await page.getByRole('button', { name: /^Raise Price|Increase Price|Price up/ }).first().click().catch(async () => {
    await page.locator('.stock-row.is-expanded .stock-stepper button').nth(1).click()
  })
  const priceVal = await page.locator('.stock-row.is-expanded .stepper-input').first().inputValue()
  await row.click()
  await page.waitForTimeout(300)
  log('collapsed dirty row text', await page.locator('.stock-row').first().innerText())
  await row.click()
  log('reopened price', { edited: priceVal, now: await page.locator('.stock-row.is-expanded .stepper-input').first().inputValue() })
  await row.click()
  // D5 picker
  await page.getByRole('button', { name: 'Add item' }).click()
  const picker = page.getByRole('dialog')
  await expect(picker).toBeVisible()
  log('picker help', await picker.locator('.pick-dock').innerText())
  await axe(page, 'picker-150')
  await page.screenshot({ path: info.outputPath('picker-150.png') })
  await picker.locator('.pick-tile', { hasText: 'Escudo' }).click()
  await picker.getByRole('button', { name: /Add 1/ }).click()
  await page.waitForTimeout(1200)
  log('pill after no-value add', await pillState(page))
  log('escudo row', await page.locator('.stock-row', { hasText: 'Escudo' }).innerText().catch(() => null))
  await page.screenshot({ path: info.outputPath('after-add-150.png'), fullPage: true })
  // Ledger counter at 150
  await page.getByRole('tab', { name: /Ledger/ }).click()
  await page.getByRole('button', { name: /^Counter-offer$/ }).first().click()
  await axe(page, 'counter-150')
  await page.screenshot({ path: info.outputPath('counter-150.png'), fullPage: true })
})
