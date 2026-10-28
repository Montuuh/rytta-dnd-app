import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from '../../../../tests/e2e/fixtures/identity.ts'
import { writeFileSync } from 'node:fs'
const out = 'docs/evidence/RYT-018/reviewer'
const browser = await chromium.launch()
const results = []
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  results.push({
    name,
    axe: (
      await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    ).violations.map((v) => v.id),
  })
}
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
})
const page = await ctx.newPage()
const requests = []
page.on('request', (r) => {
  if (r.url().includes('/rest/v1/characters')) requests.push(r.url())
})
await identityFixture(page)
await page.goto(`http://127.0.0.1:4175/rytta-dnd-app/#/campaign/${campaignId}/members`)
await page.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
await page.getByLabel('Correo de la cuenta de Google').fill('invalid')
await page.getByRole('dialog').getByRole('button', { name: 'Invitar jugador', exact: true }).click()
await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
await shot(page, 'state-invalid-email')
await page.getByLabel('Correo de la cuenta de Google').fill('future@example.com')
await ctx.setOffline(true)
await page.getByRole('dialog').getByRole('button', { name: 'Invitar jugador', exact: true }).click()
await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
await shot(page, 'state-offline-invite')
await ctx.setOffline(false)
await page.keyboard.press('Escape')
await expect(page.getByRole('button', { name: 'Vincular personaje', exact: true })).toBeFocused()
await page.getByRole('button', { name: 'Abrir navegación' }).click()
await expect(
  page.getByRole('dialog').getByRole('link', { name: 'Inventario', exact: true }),
).toHaveCount(0)
await expect(page.getByRole('dialog').getByText('Inventario', { exact: false })).toHaveAttribute(
  'aria-disabled',
  'true',
)
await shot(page, 'state-mobile-navigation')
await page.keyboard.press('Escape')
await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeFocused()
results.push({
  name: 'metadata-projection',
  requests,
  resourcesRequested: requests.some((url) => url.includes('character_resources')),
})
await ctx.close()
for (const opts of [{ signedIn: false }, { empty: true }]) {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const p = await c.newPage()
  await identityFixture(p, opts)
  await p.goto('http://127.0.0.1:4175/rytta-dnd-app/')
  await expect(p.getByRole('heading', { level: 1 })).toBeVisible()
  await p.getByRole('button', { name: 'Abrir menú de ajustes' }).click()
  await p.getByRole('dialog').getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(p.getByRole('dialog').getByRole('combobox')).toBeVisible()
  await shot(p, opts.empty ? 'state-empty-home-settings' : 'state-guest-settings')
  await c.close()
}
await browser.close()
writeFileSync(`${out}/states-results.json`, JSON.stringify(results, null, 2))
