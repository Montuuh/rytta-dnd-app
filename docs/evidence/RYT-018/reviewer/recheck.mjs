import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, playerId } from '../../../../tests/e2e/fixtures/identity.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
const out = 'docs/evidence/RYT-018/reviewer/final'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const results = []
async function capture(page, name) {
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  const axe = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  ).violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) }))
  const small = await page.locator('button,a,input,select,[role="radio"]').evaluateAll((nodes) =>
    nodes
      .filter(
        (n) =>
          n.getBoundingClientRect().width &&
          n.getBoundingClientRect().height &&
          getComputedStyle(n).visibility !== 'hidden' &&
          n.getAttribute('tabindex') !== '-1',
      )
      .map((n) => ({
        text: n.getAttribute('aria-label') || n.textContent?.trim(),
        w: n.getBoundingClientRect().width,
        h: n.getBoundingClientRect().height,
      }))
      .filter((n) => n.w < 43.5 || n.h < 43.5),
  )
  results.push({ name, overflow, axe, small })
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
}
for (const [width, lang, theme] of [
  [390, 'es', 'dark'],
  [390, 'en', 'light'],
  [820, 'es', 'light'],
  [820, 'en', 'dark'],
]) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(
    ({ lang, theme }) => {
      localStorage.setItem('rytta-language', lang)
      localStorage.setItem('rytta-color-scheme', theme)
    },
    { lang, theme },
  )
  const fixture = await identityFixture(page)
  const es = lang === 'es'
  const menuName = es ? 'Abrir menú de ajustes' : 'Open settings menu'
  await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await page.addStyleTag({ content: 'html {font-size:150%}' })
  await capture(page, `party-${width}-${lang}-${theme}`)
  const menu = page.getByRole('button', { name: menuName })
  await menu.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await capture(page, `menu-${width}-${lang}-${theme}`)
  expect(await page.getByRole('dialog').getByRole('button').count()).toBe(2)
  const box = await page.getByRole('dialog').boundingBox()
  expect(Math.round(box.x + box.width)).toBe(width)
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: es ? 'Ajustes' : 'App setup', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('combobox')).toBeVisible()
  await capture(page, `settings-${width}-${lang}-${theme}`)
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
      true,
    )
  }
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  // Use the actual account accessible name from header, independent of translation wording.
  const accountButton = page.locator('header .account-button')
  const accountBox = await accountButton.boundingBox()
  const menuBox = await menu.boundingBox()
  expect(
    Math.abs(accountBox.y + accountBox.height / 2 - menuBox.y - menuBox.height / 2),
  ).toBeLessThan(8)
  expect(accountBox.x + accountBox.width).toBeLessThanOrEqual(menuBox.x)
  await accountButton.focus()
  await accountButton.press('Enter')
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem').last()).toBeFocused()
  await capture(page, `account-${width}-${lang}-${theme}`)
  await page.keyboard.press('Escape')
  await expect(accountButton).toBeFocused()
  await page.getByRole('button', { name: es ? 'Vista Player' : 'Player view', exact: true }).click()
  await expect(
    page.getByRole('button', { name: es ? 'Editar recursos' : 'Edit resources' }),
  ).toHaveCount(0)
  await capture(page, `preview-${width}-${lang}-${theme}`)
  await page.getByRole('button', { name: es ? 'Volver a DM' : 'Return to DM', exact: true }).click()
  await expect(
    page.getByRole('button', { name: es ? 'Editar recursos' : 'Edit resources' }),
  ).toBeVisible()
  await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/members`)
  await expect(
    page.getByRole('button', { name: es ? 'Vincular personaje' : 'Link character', exact: true }),
  ).toBeVisible()
  await page.addStyleTag({ content: 'html {font-size:150%}' })
  await capture(page, `members-${width}-${lang}-${theme}`)
  await page
    .getByRole('button', { name: es ? 'Vincular personaje' : 'Link character', exact: true })
    .click()
  await capture(page, `link-${width}-${lang}-${theme}`)
  await page.getByRole('dialog').getByRole('combobox').selectOption(playerId)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: es ? 'Vincular personaje' : 'Link character', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('Arin: Arin', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: es ? 'Desvincular jugador' : 'Unlink Player', exact: true })
    .click()
  await capture(page, `unlink-${width}-${lang}-${theme}`)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: es ? 'Confirmar' : 'Confirm', exact: true })
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(fixture.calls.filter((c) => c.method === 'assign_character')).toHaveLength(1)
  expect(fixture.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  results.push({ name: `errors-${width}-${lang}-${theme}`, errors })
  await context.close()
}
await browser.close()
writeFileSync(`${out}/probe-results.json`, JSON.stringify(results, null, 2))
