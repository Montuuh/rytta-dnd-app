import { test, expect, type Locator, type Page } from '@playwright/test'
import { beaId, campaignId, characterId, identityFixture, peerId } from './fixtures/identity.ts'
import { combatServer } from './fixtures/combat.ts'
import { shopsFixture } from './fixtures/shops.ts'
import { tabletopServer } from './fixtures/tabletop.ts'
import { tradeServer } from './fixtures/trades.ts'

// Phone and browser Back closes the open overlay and leaves the page where it is (useBackToClose).
// One journey per feature area; the overlays come from `@/shared/ui/overlays`.
const base = `./#/campaign/${campaignId}`

/** Back closes `overlay`; the URL and the page behind it stay. */
async function backCloses(page: Page, overlay: Locator, urlBefore: string) {
  await expect(overlay).toBeVisible()
  await page.goBack()
  await expect(overlay).toHaveCount(0)
  expect(page.url()).toBe(urlBefore)
}

test('RYT-125 Back closes the item card and stays in the inventory', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${base}/inventory`)
  const potion = page.getByRole('button', { name: /Poción de curación, (cantidad|quantity) 3/ })
  await expect(potion).toBeVisible()
  const url = page.url()
  await potion.click()
  await backCloses(page, page.getByRole('dialog'), url)
  await expect(potion).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible()
})

test('RYT-125 Back closes the listing picture first, then the listing, and stays in the shops', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    modules: ['party', 'inventory', 'shops'],
  })
  fixture.inventory.definitions.find((d) => d.name === 'Flecha')!.image_path =
    `pre/${campaignId}/items/arrow.webp`
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${base}/shops`)
  const arrow = page.locator('.listing-card', { hasText: 'Flecha' })
  await expect(arrow).toBeVisible()
  const url = page.url()
  await arrow.locator('.listing-main').click()
  const detail = page.getByRole('dialog', { name: 'Flecha' }).filter({ hasText: 'Precio' })
  await detail.getByRole('button', { name: 'Ver la imagen de Flecha' }).click()
  const viewer = page.locator('.image-viewer-content')
  await expect(viewer).toBeVisible()
  // Nested overlays close one at a time, the top one first.
  await page.goBack()
  await expect(viewer).toHaveCount(0)
  await expect(detail).toBeVisible()
  await backCloses(page, detail, url)
  await expect(arrow).toBeVisible()
})

test('RYT-125 Back closes a rules definition and stays on the sheet', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${base}/party/${characterId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Arin' })).toBeVisible()
  const url = page.url()
  await page.getByRole('button', { name: 'Iniciativa: ver definición' }).click()
  await backCloses(page, page.getByRole('dialog', { name: 'Iniciativa' }), url)
  await expect(page.getByRole('heading', { level: 1, name: 'Arin' })).toBeVisible()
})

test('RYT-125 Back closes the DM combat sheet and stays in the fight', async ({ page }, info) => {
  test.skip(info.project.name === 'identity-desktop', 'the sheet is a drawer on phones and tablets')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`${base}/combat/${server.encounters[0]!.id}?view=console`)
  const now = page
    .getByRole('region', { name: 'Controles de turno' })
    .locator('button.combat-turn-now')
  await expect(now).toBeVisible()
  const url = page.url()
  await now.click()
  await backCloses(page, page.locator('.combat-drawer .mantine-Drawer-content'), url)
  await expect(now).toBeVisible()
})

test('RYT-125 Back closes the table setup dialog and stays in the tabletop', async ({ page }) => {
  const server = tabletopServer({})
  const combat = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat', 'tabletop'],
    player: false,
  })
  await combat.install(page)
  await server.install(page)
  await page.goto(`${base}/tabletop`)
  const launch = page.getByRole('button', { name: 'Abrir pantalla para jugadores' })
  await launch.click()
  const projection = page.getByRole('dialog', { name: 'Pantalla para jugadores' })
  const setupButton = projection.getByRole('button', { name: 'Configurar la mesa' })
  await expect(setupButton).toBeVisible({ timeout: 15_000 })
  const url = page.url()
  await setupButton.click()
  await backCloses(
    page,
    page.getByRole('dialog', { name: 'Configuración de la pantalla de mesa' }),
    url,
  )
  await expect(setupButton).toBeFocused()
  await backCloses(page, projection, url)
  await expect(launch).toBeFocused()
})

test('RYT-125 Back closes the trade item picker first and keeps the trade window', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const server = tradeServer()
  const options = { viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch }
  const arinContext = await browser.newContext(options)
  const beaContext = await browser.newContext(options)
  try {
    const arin = await arinContext.newPage()
    const bea = await beaContext.newPage()
    await identityFixture(arin, { player: true, party: true, sheet: 'complete' })
    await identityFixture(bea, { player: true, party: true, sheet: 'complete', as: peerId })
    await server.install(arin, characterId)
    await server.install(bea, beaId)
    await bea.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
    await arin.goto(`${base}/party`)
    await bea.goto(`${base}/party`)
    await arin
      .getByRole('article', { name: 'Bea' })
      .getByRole('button', { name: 'Comerciar con Bea' })
      .click()
    await bea
      .getByRole('dialog', { name: 'Arin wants to trade with you' })
      .getByRole('button', { name: 'Open the trade' })
      .click({ timeout: 15_000 })
    const win = arin.getByRole('dialog', { name: 'Trueque con Bea' })
    await expect(win).toBeVisible({ timeout: 10_000 })
    await win.getByRole('button', { name: 'Añadir un objeto' }).click()
    const picker = arin.getByRole('dialog', { name: 'Elige qué das' })
    await expect(picker).toBeVisible()
    const url = arin.url()
    await arin.goBack()
    await expect(picker).toHaveCount(0)
    await expect(win).toBeVisible()
    expect(arin.url()).toBe(url)
  } finally {
    await arinContext.close()
    await beaContext.close()
  }
})
