import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture, shopIds } from '../../../../tests/e2e/fixtures/shops.ts'

// RYT-005 independent ui-ux reviewer probes. Observations are logged, not asserted, so that
// one finding does not hide the next; only setup steps are hard expectations.
const shops = `./#/campaign/${campaignId}/shops`
const modules = ['party', 'inventory', 'shops']
const log = (label: string, value: unknown) =>
  console.log(`[review] ${test.info().project.name} ${label}: ${JSON.stringify(value)}`)
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return el ? `${el.tagName}.${el.className.toString().slice(0, 60)} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60)}"` : null
  })
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations
  log(`axe ${label}`, v.map((x) => `${x.id}(${x.nodes.length}) ${x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
  log(`overflow ${label}`, await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
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

test('player storefront in English + light, keyboard and focus return', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const fixture = await identityFixture(page, { player: true, sheet: 'complete', inventory: true, modules })
  await shopsFixture(page, fixture)
  await prefs(page, 'en', 'light')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.purse-bar')).toBeVisible()
  log('h1', await page.getByRole('heading', { level: 1 }).textContent())
  log('lang', await page.evaluate(() => document.documentElement.lang))
  await axe(page, 'storefront-en-light')
  await page.screenshot({ path: info.outputPath('storefront-en-light.png'), fullPage: true })
  // Is the "You have N" badge a link to the inventory?
  const potion = page.locator('.listing-card', { hasText: 'Poción de curación' })
  log('owned badge is link', await potion.locator('.owned-badge a, a.owned-badge').count())
  // Listing drawer: open via keyboard, Escape, focus return.
  await potion.locator('.listing-main').focus()
  await page.keyboard.press('Enter')
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  log('focus in listing drawer', await focused(page))
  await page.screenshot({ path: info.outputPath('listing-drawer-en-light.png') })
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await page.waitForTimeout(300)
  log('focus after listing Escape', await focused(page))
  // Add two items and open cart via keyboard.
  await page.getByRole('button', { name: /Add .*Poción de curación/ }).click()
  await page.getByRole('button', { name: /Add .*Flecha/ }).click()
  const cartButton = page.locator('.purse-bar button')
  await cartButton.focus()
  await page.keyboard.press('Enter')
  const cart = page.getByRole('dialog')
  await expect(cart).toBeVisible()
  log('cart title', await cart.locator('h2, .mantine-Drawer-title').first().textContent())
  log('cart summary text', await cart.locator('.cart-summary').innerText())
  await axe(page, 'cart-en-light')
  await page.screenshot({ path: info.outputPath('cart-en-light.png') })
  await page.keyboard.press('Escape')
  await expect(cart).toHaveCount(0)
  await page.waitForTimeout(300)
  log('focus after cart Escape', await focused(page))
  // Dock button path (phone): open from the sticky dock and close.
  const dock = page.locator('.cart-dock button')
  if (await dock.isVisible()) {
    await dock.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    log('focus after dock cart Escape', await focused(page))
  }
  // Sell tab in an auto shop: rows with a zero buyback.
  await page.getByRole('tab', { name: /Sell/ }).click()
  const rows = await page.locator('.sell-row').allInnerTexts()
  log('auto-shop sell rows', rows)
  const arrow = page.getByLabel(/Flecha/)
  if (await arrow.count()) {
    await arrow.fill('5')
    const button = page.locator('.storefront button.mantine-Button-root').filter({ hasText: /Sell/ }).last()
    log('sell button for zero-value', { text: await button.textContent(), enabled: await button.isEnabled() })
    await page.screenshot({ path: info.outputPath('sell-zero-en-light.png'), fullPage: true })
  }
  // Orders tab copy for a pending request.
  await page.goto(`${shops}?shop=${shopIds.smith}&tab=orders`)
  await expect(page.locator('.order-card').first()).toBeVisible()
  log('order headings', await page.locator('.order-card h3').allInnerTexts())
  await axe(page, 'orders-en-light')
  await page.screenshot({ path: info.outputPath('orders-en-light.png'), fullPage: true })
  log('errors', errors)
})

test('player storefront at 150% text in dark Spanish', async ({ page }, info) => {
  const fixture = await identityFixture(page, { player: true, sheet: 'complete', inventory: true, modules })
  await shopsFixture(page, fixture)
  await page.addInitScript(() => {
    const style = () => {
      const s = document.createElement('style')
      s.textContent = 'html { font-size: 150% !important; }'
      document.head.appendChild(s)
    }
    if (document.head) style()
    else document.addEventListener('DOMContentLoaded', style)
  })
  await page.goto(shops)
  await expect(page.locator('.purse-bar')).toBeVisible()
  await axe(page, 'storefront-150')
  await page.screenshot({ path: info.outputPath('storefront-150.png'), fullPage: true })
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  await page.locator('.purse-bar button').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await axe(page, 'cart-150')
  await page.screenshot({ path: info.outputPath('cart-150.png') })
  await page.keyboard.press('Escape')
  await page.goto(`${shops}?shop=${shopIds.smith}&tab=orders`)
  await expect(page.locator('.order-card').first()).toBeVisible()
  await axe(page, 'orders-150')
  await page.screenshot({ path: info.outputPath('orders-150.png'), fullPage: true })
  // Sticky purse bar after scrolling.
  await page.goto(shops)
  await expect(page.locator('.purse-bar')).toBeVisible()
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(300)
  await page.screenshot({ path: info.outputPath('storefront-150-scrolled.png') })
})

test('DM dialogs: Escape and focus return, archive, ledger counts, light English', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await prefs(page, 'en', 'light')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await axe(page, 'admin-en-light')
  await page.screenshot({ path: info.outputPath('admin-en-light.png'), fullPage: true })
  // Edit shop modal
  const edit = page.locator('.admin-shop-detail').getByRole('button', { name: /Edit/ }).first()
  await edit.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  log('focus in shop editor', await focused(page))
  await page.screenshot({ path: info.outputPath('shop-editor-en-light.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(400)
  log('focus after shop editor Escape', await focused(page))
  // New listing modal
  const addListing = page.getByRole('button', { name: /Add item/ })
  await addListing.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  log('focus after listing editor Escape', await focused(page))
  // Ledger counts
  await page.getByRole('tab', { name: /Ledger|Log/ }).click()
  log('ledger tab label', await page.getByRole('tab', { name: /Ledger|Log/ }).innerText())
  log('ledger headings', await page.locator('.storefront h2, main h2').allInnerTexts())
  await axe(page, 'ledger-en-light')
  await page.screenshot({ path: info.outputPath('ledger-en-light.png'), fullPage: true })
  // Counter modal Escape/focus
  const counterBtn = page.getByRole('button', { name: /^Counter/ }).first()
  await counterBtn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  log('focus after counter Escape', await focused(page))
  // Submit a counter and see where focus lands
  await page.getByRole('button', { name: /^Counter/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Send counter/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(500)
  log('focus after counter submit', await focused(page))
  log('ledger headings after counter', await page.locator('main h2').allInnerTexts())
  log('ledger tab after counter', await page.getByRole('tab', { name: /Ledger|Log/ }).innerText())
  // Revert focus after submit
  await page.getByRole('button', { name: /^Revert/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Revert/ }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(500)
  log('focus after revert submit', await focused(page))
  // Archive: is there a confirmation?
  await page.getByRole('tab', { name: /Shops/ }).click()
  const before = await page.locator('.admin-shop-item').count()
  await page.locator('.admin-shop-detail').getByRole('button', { name: /Archive/ }).first().click()
  await page.waitForTimeout(600)
  log('dialog after archive click', await page.getByRole('dialog').count())
  log('shops before/after archive', [before, await page.locator('.admin-shop-item').count()])
  await page.screenshot({ path: info.outputPath('after-archive-en-light.png'), fullPage: true })
  log('errors', errors)
})

test('DM Player-view preview of the storefront', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const fixture = await identityFixture(page, { inventory: true, modules, sheet: 'complete' })
  await shopsFixture(page, fixture)
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await page.waitForTimeout(800)
  log('preview h1', await page.getByRole('heading', { level: 1 }).innerText())
  log('preview text', (await page.locator('main').innerText()).slice(0, 600))
  log('add buttons in preview', await page.getByRole('button', { name: /Añadir/ }).count())
  await axe(page, 'preview')
  await page.screenshot({ path: info.outputPath('player-preview.png'), fullPage: true })
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(300)
  await page.screenshot({ path: info.outputPath('player-preview-scrolled.png') })
  log('errors', errors)
})
