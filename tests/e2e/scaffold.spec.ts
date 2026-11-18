import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { capture } from './fixtures/audit.ts'

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
  // RYT-112: without a backend the Glossary is the only page that ships, so it is the landing.
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/#\/glossary$/)
  await expect(page.locator('header')).not.toContainText('Preview · sample data')
  await capture(page, testInfo.outputPath('glossary.png'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  // Pages that have not shipped say so plainly, never in ticket ids, and lead home.
  await page.goto('./#/quests')
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  await expect(page.getByText('RYT-006')).toHaveCount(0)
  await page.getByRole('link', { name: 'Go to the start' }).click()
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})

test('responsive layout and accessible overview', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
})

test('the settings gear opens the drawer from the keyboard and returns focus', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.sidebar')).toHaveCount(0)
  const menu = page.getByRole('button', { name: 'Settings', exact: true })
  // The start route redirects to the glossary; wait for it so the header is not replaced under
  // the key press.
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  // Language and theme live in the Settings drawer (RYT-033, RYT-069); signed out the gear opens it.
  await menu.focus()
  await page.keyboard.press('Enter')
  const drawer = page.getByRole('dialog', { name: 'Settings' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('radiogroup', { name: 'Language' })).toBeVisible()
  // The drawer sits over the page: the route and title stay, Escape hands focus back.
  await expect(page).toHaveTitle('Glossary · Rytta')
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(menu).toBeFocused()
})

test('large text and reduced motion retain usable navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./#/inventory')
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('link', { name: 'Go to the start' }).click()
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
})

// RYT-117: an open tab learns about a newer deploy and lets the user choose when to reload.
test('a newer published build shows a quiet notice; Not now dismisses it and Reload reloads', async ({
  page,
}) => {
  await page.route('**/version.json*', (route) =>
    route.fulfill({ json: { id: 'older-build', builtAt: '2026-01-01T00:00:00Z' } }),
  )
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  const notice = page.getByRole('status').filter({ hasText: 'A new version is available' })
  await expect(notice).toBeVisible()
  // It never takes focus and never reloads by itself.
  await expect(notice.getByRole('button', { name: 'Reload' })).not.toBeFocused()
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1)
  await expect(notice.getByRole('button', { name: 'Reload' })).toHaveCSS('min-height', '44px')
  // On a phone the notice is one row, and the icon-only dismiss keeps a 44px target and its name.
  const dismiss = (await notice.getByRole('button', { name: 'Not now' }).boundingBox())!
  expect(dismiss.height).toBeGreaterThanOrEqual(44)
  expect(dismiss.width).toBeGreaterThanOrEqual(44 - 1e-6)
  if ((page.viewportSize()?.width ?? 1000) < 768)
    expect((await notice.boundingBox())!.height).toBeLessThanOrEqual(56)
  // Dismissed for the session: a reload in the same tab stays quiet.
  await notice.getByRole('button', { name: 'Not now' }).click()
  await expect(notice).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  await expect(notice).toBeHidden()
  // A fresh session shows it again; Reload loads the page anew.
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await expect(notice).toBeVisible()
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
  await notice.getByRole('button', { name: 'Reload' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { marker?: number }).marker))
    .toBeUndefined()
})

test('the same build published as the running one shows nothing', async ({ page }) => {
  const published = await (await page.request.get('./version.json')).json()
  await page.route('**/version.json*', (route) => route.fulfill({ json: published }))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Glossary', exact: true })).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page.getByText('A new version is available')).toHaveCount(0)
})

test('the update notice is quiet, accessible, clear of the bottom bar and returns focus on dismiss', async ({
  page,
}) => {
  await page.route('**/version.json*', (route) =>
    route.fulfill({ json: { id: 'older-build', builtAt: '2026-01-01T00:00:00Z' } }),
  )
  await page.goto('./')
  const search = page.getByRole('searchbox', { name: 'Search the glossary' })
  await search.focus()
  const notice = page.getByRole('status').filter({ hasText: 'A new version is available' })
  await expect(notice).toBeVisible()
  // It never takes focus, and it stays inside the viewport.
  await expect(search).toBeFocused()
  const box = (await notice.boundingBox())!
  const view = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(view.width)
  expect(box.y + box.height).toBeLessThanOrEqual(view.height)
  // The two actions read and tab in the same order: dismiss first, reload last.
  const buttons = notice.getByRole('button')
  await expect(buttons.nth(0)).toHaveText('Not now')
  await expect(buttons.nth(1)).toHaveText('Reload')
  const first = (await buttons.nth(0).boundingBox())!
  const second = (await buttons.nth(1).boundingBox())!
  expect(first.x + first.width).toBeLessThanOrEqual(second.x + 1)
  expect(
    (
      await new AxeBuilder({ page })
        .include('.update-notice')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  // Dismissed from the keyboard, focus goes back to where it was, not to the page.
  await buttons.nth(0).focus()
  await page.keyboard.press('Enter')
  await expect(notice).toBeHidden()
  await expect(search).toBeFocused()
})
