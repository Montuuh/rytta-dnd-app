import { chromium, expect } from '@playwright/test'
import {
  identityFixture,
  campaignId,
  session,
  storageKey,
} from '../../../../tests/e2e/fixtures/identity.ts'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch()
const results = []
for (const email of [
  'alexander.adventurer@example.com',
  'alexander.adventurer.with.a.long.address@example.com',
]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await identityFixture(page)
  const value = session()
  value.user.email = email
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: storageKey,
    value,
  })
  await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await page.addStyleTag({ content: 'html {font-size:150%}' })
  await page.locator('header .account-button').click()
  await page.getByRole('menu').waitFor()
  results.push({
    email,
    bounds: await page.getByRole('menu').boundingBox(),
    width: await page.evaluate(() => document.documentElement.scrollWidth),
  })
  await page.screenshot({
    path: `docs/evidence/RYT-018/reviewer/final/account-email-${email.length}.png`,
    fullPage: true,
  })
  await context.close()
}
await browser.close()
writeFileSync(
  'docs/evidence/RYT-018/reviewer/final/account-email-results.json',
  JSON.stringify(results, null, 2),
)
console.log(results)
