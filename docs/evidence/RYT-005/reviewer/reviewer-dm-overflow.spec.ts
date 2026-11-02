import { test } from '@playwright/test'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { shopsFixture } from '../../../../tests/e2e/fixtures/shops.ts'

// Locate the elements that overflow a 390px phone at 150% text (DM shops admin).
test('overflow culprits at 150%', async ({ page }) => {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style')
      s.textContent = 'html { font-size: 150% !important; }'
      document.head.appendChild(s)
    })
  })
  for (const route of ['./#/campaign/' + campaignId + '/shops', './#/campaign/' + campaignId + '/inventory']) {
    await page.goto(route)
    await page.waitForTimeout(1500)
    if (route.endsWith('shops')) await page.locator('.stock-row-main').first().click()
    await page.waitForTimeout(300)
    const out = await page.evaluate(() => {
      const w = innerWidth
      return {
        scrollWidth: document.documentElement.scrollWidth,
        culprits: [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > w + 1 && !(el.parentElement && el.parentElement.getBoundingClientRect().right > w + 1))
          .slice(0, 8)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 70)} right=${Math.round(el.getBoundingClientRect().right)}`),
      }
    })
    console.log(`[overflow] ${test.info().project.name} ${route.split('/').pop()}: ${JSON.stringify(out)}`)
  }
})
