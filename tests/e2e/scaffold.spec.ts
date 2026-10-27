import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
})

test('preview loads without a backend and routes survive a Pages reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('supabase')) requests.push(request.url())
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
  await expect(page.getByText('Preview · sample data')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('camp.png'), fullPage: true })
  await page.getByRole('link', { name: 'Explore the party' }).click()
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('RYT-003')).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('responsive layout and accessible overview', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
})

test('mobile drawer supports Escape and returns focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile drawer only')
  await page.goto('./')
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(menu).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByRole('link', { name: 'Inventory', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
})

test('large text and reduced motion retain usable navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#/inventory')
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('link', { name: 'Back to camp' }).click()
  await expect(page.getByRole('heading', { name: /Every adventure starts/ })).toBeVisible()
})
