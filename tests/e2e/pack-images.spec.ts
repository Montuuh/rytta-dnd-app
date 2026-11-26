import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { libraryServer, srdLibraryPackId } from './fixtures/library.ts'

// RYT-172: library entries carry their own picture, published with the pack; campaigns show it.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
  'base64',
)
// The fixture build runs against PRE (localhost), so its storage paths start with pre/.
const packPath = `pre/${srdLibraryPackId}/7a000000-0000-4000-8000-000000000001.webp`

async function audit(page: Page) {
  await page
    .locator('#main-content')
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(page.locator('#main-content'), 'button:visible, a:visible')
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include('#main-content')
    .analyze()
  expect(axe.violations).toEqual([])
}

for (const [language, scheme] of [
  ['es', 'dark'],
  ['en', 'light'],
] as const)
  test(`RYT-172 an editor uploads, sees and removes an item picture (${language}, ${scheme})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000)
    limitMatrix(info, language === 'es')
    const es = language === 'es'
    await page.addInitScript(
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    await identityFixture(page)
    const server = libraryServer({ srd: true })
    await server.install(page)
    await page.goto(`./library/${srdLibraryPackId}/item`)
    await page.getByRole('searchbox').fill(es ? 'espada larga' : 'longsword')
    // The list shows each item's picture: its category painting until it has its own.
    const row = page.getByRole('link', { name: es ? /^Espada larga/ : /^Longsword/ })
    await expect(row.locator('.lib-row-thumb img')).toHaveAttribute('src', /items\/thumbs\/weapon/)
    await row.click()
    const picture = page.getByRole('region', { name: es ? 'Imagen' : 'Picture' })
    await expect(picture).toContainText(
      es ? 'Pintura de su categoría.' : 'Its category’s painting.',
    )
    await picture
      .locator('input[type=file]')
      .setInputFiles({ name: 'sword.png', mimeType: 'image/png', buffer: png })
    const editor = page.getByRole('dialog', {
      name: es ? 'Imagen de Espada larga' : 'Picture of Longsword',
    })
    await expect(editor).toBeVisible()
    // The crop guide and previews are square, as the app shows the picture.
    await expect(editor.locator('.portrait-stage')).toHaveAttribute('data-shape', 'square')
    await capture(page, `test-results/ryt-172-crop-${language}-${scheme}-${info.project.name}.png`)
    await editor.getByRole('button', { name: es ? 'Usar esta imagen' : 'Use this picture' }).click()
    await expect(editor).toHaveCount(0)
    await expect(picture).toContainText(
      es
        ? 'Imagen del paquete. Si la quitas, se usa la pintura de su categoría.'
        : 'Pack picture. If removed, its category’s painting is shown.',
    )
    const change = picture.getByRole('button', { name: es ? 'Cambiar' : 'Change', exact: true })
    await expect(change).toBeFocused()
    await expect(
      picture.getByRole('img', { name: es ? 'Imagen de Espada larga' : 'Picture of Longsword' }),
    ).toHaveAttribute('src', /public-test/)
    await audit(page)
    await capture(
      page,
      `test-results/ryt-172-library-${language}-${scheme}-${info.project.name}.png`,
    )
    await page.getByRole('button', { name: es ? 'Guardar' : 'Save', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: es ? /Guardado/ : /Saved/ }),
    ).toBeVisible()
    const saved = server.entries().find((e) => e.kind === 'item' && e.key === 'longsword')!
    const image = (saved.data as { index: { image: string } }).index.image
    expect(image).toMatch(new RegExp(`^pre/${srdLibraryPackId}/[0-9a-f-]{36}\\.webp$`))
    // The list sits beside the entry on a tablet; on a phone the entry takes the screen.
    if (!info.project.name.endsWith('mobile'))
      await expect(row.locator('.lib-row-thumb img')).toHaveAttribute('src', /public-test/)
    // Removing it goes back to the category painting.
    await picture.getByRole('button', { name: es ? 'Quitar' : 'Remove', exact: true }).click()
    await expect(picture).toContainText(
      es ? 'Pintura de su categoría.' : 'Its category’s painting.',
    )
    await expect(change).toHaveCount(0)
    await expect(
      picture.getByRole('button', { name: es ? 'Subir' : 'Upload', exact: true }),
    ).toBeFocused()
  })

test('RYT-172 an inventory tile shows the pack picture of the item it came from', async ({
  page,
}, info) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    packImages: [{ kind: 'item', id: 'longsword', path: packPath }],
  })
  const signed: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/storage/v1/object/sign/pack-images')) signed.push(request.url())
  })
  await page.goto(`./campaign/${campaignId}/inventory`)
  const sword = page.getByRole('button', { name: /Espada larga/ }).first()
  await expect(sword.locator('img')).toHaveAttribute('src', /public-test/)
  expect(signed.length).toBeGreaterThan(0)
  // Items without a pack picture keep their category painting.
  await expect(
    page
      .getByRole('button', { name: /Poción de curación/ })
      .first()
      .locator('img'),
  ).toHaveAttribute('src', /items\/thumbs\/consumable/)
  await capture(page, `test-results/ryt-172-inventory-${info.project.name}.png`)
})
