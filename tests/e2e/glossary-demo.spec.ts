import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
})

test('the SRD glossary works without a backend, in English, with deep links', async ({ page }) => {
  const errors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('supabase')) requests.push(request.url())
  })
  await page.goto('./#/glossary')
  await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Glossary' }).first()).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search the glossary' }).fill('agarrado')
  await page.getByRole('searchbox').press('Enter')
  await expect(page.getByRole('heading', { name: 'Grappled', exact: true })).toBeVisible()
  await expect(page.getByText('Spanish:')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Grappled', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  // No homebrew outside a campaign.
  await expect(page.getByRole('button', { name: 'New entry' })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(requests).toEqual([])
})
