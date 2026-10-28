import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  identityFixture,
  campaignId,
  characterId,
} from '../../../../tests/e2e/fixtures/identity.ts'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch()
const out = 'docs/evidence/RYT-003/reviewer'
const results = []
try {
  for (const [width, language, scheme] of [
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
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    await identityFixture(page)
    for (const [kind, amounts] of [
      ['max', [9007199254740991, 2147483647, 2147483647, 2147483647]],
      ['boundary', [999999999, 999999999, 999999999, 999999999]],
      ['normal', [25, 3, 4, 0]],
    ]) {
      await page.route('**/rest/v1/characters?**', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: characterId,
              campaign_id: campaignId,
              user_id: null,
              name: 'Arin',
              character_resources: [
                {
                  gold: amounts[0],
                  water_units: amounts[1],
                  rations: amounts[2],
                  exhaustion: amounts[3],
                  revision: 0,
                },
              ],
            },
          ]),
        }),
      )
      await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/party`)
      await page.reload()
      await page.getByRole('heading', { name: 'Arin', exact: true }).waitFor()
      await page.addStyleTag({ content: 'html{font-size:150%}' })
      const layout = await page.locator('.resource-cell').evaluateAll((cells) => ({
        viewport: innerWidth,
        scroll: document.documentElement.scrollWidth,
        cells: cells.map((cell) => {
          const box = cell.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(cell.querySelector('.resource-value'))
          const rects = [...range.getClientRects()]
          return {
            text: cell.querySelector('.resource-value').textContent,
            width: box.width,
            top: box.top,
            left: box.left,
            right: box.right,
            bottom: box.bottom,
            contained: rects.every(
              (r) =>
                r.left >= box.left - 1 &&
                r.right <= box.right + 1 &&
                r.top >= box.top - 1 &&
                r.bottom <= box.bottom + 1,
            ),
          }
        }),
      }))
      expect(layout.scroll).toBeLessThanOrEqual(width)
      expect(layout.cells.every((c) => c.contained)).toBe(true)
      expect(layout.cells.map((c) => c.text)).toEqual(
        amounts.map((n) => n.toLocaleString(language)),
      )
      if (kind === 'normal') expect(layout.cells[0].top).toBe(layout.cells[1].top)
      const axe = (
        await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      ).violations.map((v) => v.id)
      expect(axe).toEqual([])
      const name = `recheck-${kind}-${width}-${language}-${scheme}`
      await page.locator('.character-card').screenshot({ path: `${out}/${name}.png` })
      results.push({ name, layout, axe, errors })
    }
    await context.close()
  }
} finally {
  await browser.close()
}
writeFileSync(`${out}/recheck-results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results))
