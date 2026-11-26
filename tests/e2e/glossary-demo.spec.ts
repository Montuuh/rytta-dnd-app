import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'

// RYT-167: outside a campaign the glossary reads the published SRD of the library; the SRD is no
// longer bundled in the app.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
})

test('the SRD glossary works outside a campaign, in English, with deep links', async ({ page }) => {
  const errors: string[] = []
  const reads: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/rpc/')) reads.push(request.url().split('/rpc/')[1]!)
  })
  await identityFixture(page)
  await page.goto('./glossary')
  await expect(page.getByRole('heading', { level: 1, name: 'Glossary' })).toBeVisible()
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
  // No homebrew outside a campaign, and only the published SRD is read.
  await expect(page.getByRole('button', { name: 'New entry' })).toHaveCount(0)
  expect(errors).toEqual([])
  expect(reads.filter((read) => read.startsWith('get_srd_rule_pack')).length).toBeGreaterThan(0)
})
