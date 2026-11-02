import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture, shopIds } from '../../../../tests/e2e/fixtures/shops.ts'

// RYT-005 focused re-review probes. Observations are logged; setup steps are hard expectations.
const shops = `./#/campaign/${campaignId}/shops`
const modules = ['party', 'inventory', 'shops']
const log = (label: string, value: unknown) =>
  console.log(`[rereview] ${test.info().project.name} ${label}: ${JSON.stringify(value)}`)
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    return `${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 50)}"`
  })
async function axe(page: Page, label: string) {
  const v = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations
  log(`axe ${label}`, v.map((x) => `${x.id}(${x.nodes.length}) ${x.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`))
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
// Simulate real latency on mutating shop RPCs so focus is judged after the list re-renders.
async function slowMutations(page: Page) {
  await page.route(/rest\/v1\/rpc\/(respond|revert|archive|answer)/, async (route) => {
    await new Promise((r) => setTimeout(r, 700))
    await route.fallback()
  })
}

test('player fixes: inventory link, cart load, sell zero, 150% purse bar', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const fixture = await identityFixture(page, { player: true, sheet: 'complete', inventory: true, modules })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.locator('.purse-bar')).toBeVisible()
  const potion = page.locator('.listing-card', { hasText: 'Poción de curación' })
  const link = potion.getByRole('link')
  log('owned link', { count: await link.count(), name: await link.first().textContent(), href: await link.first().getAttribute('href'), h: (await link.first().boundingBox())?.height })
  await potion.locator('.listing-main').click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  log('drawer links', await drawer.getByRole('link').allInnerTexts())
  log('drawer link height', (await drawer.getByRole('link').first().boundingBox())?.height)
  await page.screenshot({ path: info.outputPath('listing-drawer.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  log('purse cart button visible with dock', await page.locator('.purse-bar button').isVisible())
  log('dock visible', await page.locator('.cart-dock button').isVisible())
  await page.locator('.cart-dock button').click()
  const cart = page.getByRole('dialog')
  await expect(cart).toBeVisible()
  log('cart summary', await cart.locator('.cart-summary').innerText())
  await axe(page, 'cart')
  await page.screenshot({ path: info.outputPath('cart.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  log('focus after dock cart Escape', await focused(page))
  // Sell, auto shop
  await page.getByRole('tab', { name: 'Vender' }).click()
  await expect(page.locator('.sell-row').first()).toBeVisible()
  log('sell rows', await page.locator('.sell-row').allInnerTexts())
  log('sell panel text', (await page.getByRole('tabpanel').innerText()).slice(0, 700))
  await axe(page, 'sell')
  log('sell button disabled with nothing chosen', await page.getByRole('tabpanel').getByRole('button').last().isDisabled())
  await page.screenshot({ path: info.outputPath('sell.png'), fullPage: true })
  // Orders copy
  await page.goto(`${shops}?shop=${shopIds.smith}&tab=orders`)
  await expect(page.locator('.order-card').first()).toBeVisible()
  log('player order titles', await page.locator('.order-card h3').allInnerTexts())
  log('player order lines', await page.locator('.order-lines li').allInnerTexts())
  await page.screenshot({ path: info.outputPath('orders.png'), fullPage: true })
  log('errors', errors)
})

test('player 150% text: purse bar and switcher', async ({ page }, info) => {
  const fixture = await identityFixture(page, { player: true, sheet: 'complete', inventory: true, modules })
  await shopsFixture(page, fixture)
  await page.addInitScript(() => {
    const add = () => {
      const s = document.createElement('style')
      s.textContent = 'html { font-size: 150% !important; }'
      document.head.appendChild(s)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  })
  await page.goto(shops)
  await expect(page.locator('.purse-bar')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  await axe(page, 'storefront-150')
  await page.screenshot({ path: info.outputPath('storefront-150.png'), fullPage: true })
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(300)
  await page.screenshot({ path: info.outputPath('storefront-150-scrolled.png') })
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('.purse-bar button, .cart-dock button')].map((b) => {
      const label = b.querySelector('.mantine-Button-label') as HTMLElement | null
      return label ? label.scrollWidth > label.clientWidth + 1 : null
    }),
  )
  log('cart button label clipped', clipped)
})

test('DM fixes: focus, archive confirm, ledger sections (EN light, slow RPCs)', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await slowMutations(page)
  await prefs(page, 'en', 'light')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Shop editor Escape
  const edit = page.locator('.admin-shop-detail').getByRole('button', { name: /Edit/ }).first()
  await edit.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(400)
  log('focus after shop editor Escape', await focused(page))
  // Listing archive confirm
  const removeListing = page.getByRole('button', { name: /Remove .*Flecha|Flecha/ }).filter({ has: page.locator('svg') }).last()
  await removeListing.focus()
  await page.keyboard.press('Enter')
  const confirm = page.getByRole('dialog')
  await expect(confirm).toBeVisible()
  await page.waitForTimeout(400)
  log('listing archive dialog', { title: await confirm.locator('.mantine-Modal-title').innerText(), text: await confirm.innerText(), focus: await focused(page) })
  await page.screenshot({ path: info.outputPath('archive-listing-confirm.png') })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  log('focus after archive-listing Escape', await focused(page))
  // Shop archive confirm then confirm (the vault has no orders; the fixture cannot list orders of archived shops)
  await page.locator('.admin-shop-item', { hasText: 'contrabandista' }).click()
  await page.locator('.admin-shop-detail').getByRole('button', { name: /^Archive/ }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  log('shop archive dialog', await page.getByRole('dialog').innerText())
  await axe(page, 'archive-confirm')
  await page.screenshot({ path: info.outputPath('archive-shop-confirm.png') })
  const before = await page.locator('.admin-shop-item').count()
  await page.getByRole('dialog').getByRole('button', { name: /^Archive/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 5000 })
  await page.waitForTimeout(1200)
  log('shops before/after archive', [before, await page.locator('.admin-shop-item').count()])
  log('focus after archive confirm (settled)', await focused(page))
  log('notices', await page.getByRole('status').allInnerTexts())
  await page.screenshot({ path: info.outputPath('after-archive.png'), fullPage: true })
  // Ledger
  await page.getByRole('tab', { name: /Ledger/ }).click()
  await expect(page.locator('.order-card').first()).toBeVisible()
  log('ledger tab', await page.getByRole('tab', { name: /Ledger/ }).innerText())
  log('ledger headings', await page.locator('main h2').allInnerTexts())
  log('ledger titles', await page.locator('.order-card h3').allInnerTexts())
  await axe(page, 'ledger')
  await page.screenshot({ path: info.outputPath('ledger.png'), fullPage: true })
  // Counter: focus after the order moves sections (with latency)
  await page.getByRole('button', { name: /^Counter/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Send counter/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  log('focus right after counter submit', await focused(page))
  await page.waitForTimeout(1500)
  log('focus after counter (settled)', await focused(page))
  log('ledger headings after counter', await page.locator('main h2').allInnerTexts())
  // Revert
  await page.getByRole('button', { name: /^Revert/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: /Revert/ }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.waitForTimeout(1500)
  log('focus after revert (settled)', await focused(page))
  await page.screenshot({ path: info.outputPath('ledger-after.png'), fullPage: true })
  log('errors', errors)
})
