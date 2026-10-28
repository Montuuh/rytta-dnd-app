import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
await identityFixture(page)
await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/party`)
await page.locator('header .account-button').click()
await page.getByRole('menu').waitFor()
const result = {
  html: await page.getByRole('menu').evaluate((n) => n.outerHTML),
  violations: (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations,
}
writeFileSync('docs/evidence/RYT-018/reviewer/account-axe.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result).slice(0, 8500))
await browser.close()
