import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { contentServer, srdPackId } from './fixtures/campaign-content.ts'

// RYT-162: the DM chooses the packs the campaign uses, reviews and accepts a new version, and
// hides single entries. Only categories a module already reads are offered (creatures).
async function audit(page: Page, scope = '#main-content') {
  await page
    .locator(scope)
    .first()
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(
    page.locator(scope).first(),
    'button:visible, a:visible, input[type="checkbox"]:visible',
  )
  // A switch is hit by its input: 44px wide as well as tall.
  await expectTouchTargets(page.locator(scope).first(), 'input[type="checkbox"]:visible', {
    width: 44,
    height: 44,
  })
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(axe.violations).toEqual([])
}
const panel = `./#/campaign/${campaignId}/members?panel=content`

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-162 the DM sees the campaign's packs and a pending update (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    await identityFixture(page)
    await contentServer().install(page)
    await page.goto(panel)
    const section = page.getByRole('region', { name: es ? 'Criaturas' : 'Creatures' })
    await expect(section).toBeVisible()
    // RYT-164: spells come from packs too, so they are offered.
    await expect(page.getByRole('region', { name: es ? 'Conjuros' : 'Spells' })).toBeVisible()
    const srd = section.getByRole('switch', {
      name: es ? 'Usar SRD 5.2.1 en criaturas' : 'Use SRD 5.2.1 for creatures',
    })
    await expect(srd).toBeChecked()
    await expect(section).toContainText(
      es ? 'Versión 1 · 3 registros · 1 oculto' : 'Version 1 · 3 entries · 1 hidden',
    )
    // RYT-180: the pending version is its own block, first, with the one filled button.
    const review = page.getByRole('region', { name: es ? 'Por revisar' : 'To review' })
    await expect(review).toContainText(es ? 'Versión 1 → 2' : 'Version 1 → 2')
    await expect(
      review.getByRole('button', {
        name: es ? 'Revisar cambios de SRD 5.2.1 en criaturas' : /^Review changes to SRD 5.2.1/,
      }),
    ).toHaveAttribute('data-variant', 'filled')
    expect(
      await page.evaluate(() => {
        const first = document.querySelector('#main-content section h3')
        return first?.id
      }),
    ).toBe('content-to-review')
    // Categories without packs are one muted line, not a section each.
    await expect(page.getByRole('region', { name: es ? 'Reglas' : 'Rules' })).toHaveCount(0)
    await expect(
      page.getByText(
        es
          ? 'Sin paquetes todavía: Personajes, Reglas, Objetos'
          : 'No packs yet: Characters, Rules, Items',
      ),
    ).toBeVisible()
    await expect(
      section.getByRole('button', {
        name: es
          ? 'Ver y ocultar registros de SRD 5.2.1 en criaturas'
          : /^Browse and hide creatures in SRD 5.2.1/,
      }),
    ).toBeVisible()
    await expect(
      section.getByRole('switch', { name: es ? /Bestias del Norte/ : /Northern Beasts/ }),
    ).not.toBeChecked()
    await audit(page)
    await capture(page, info.outputPath(`content-panel-${language}-${theme}.png`))
  })
}

test('RYT-162 the DM reviews a new version and accepts it', async ({ page }, info) => {
  await identityFixture(page)
  const server = contentServer()
  await server.install(page)
  await page.goto(panel)
  const review = page.getByRole('button', { name: 'Revisar cambios de SRD 5.2.1 en criaturas' })
  await review.click()
  const dialog = page.getByRole('dialog', { name: 'SRD 5.2.1 · versión 2' })
  await expect(dialog).toContainText(
    'Tu campaña usa la versión 1. Nada cambia hasta que actualices.',
  )
  // Withdrawn entries, and changes to entries the campaign has its own version of, show open.
  await expect(dialog.getByRole('button', { name: /Retirados/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(dialog.getByRole('button', { name: /Cambiados/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(dialog).toContainText('tienes tu versión')
  await expect(dialog.getByRole('button', { name: /Nuevos/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await dialog.getByRole('button', { name: /Nuevos/ }).click()
  await expect(dialog).toContainText('Oso lechuza')
  await audit(page, '[role="dialog"]')
  await capture(page, info.outputPath('content-review.png'))
  // Escape closes it and hands focus back to the button that opened it.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(review).toBeFocused()
  await review.click()
  await dialog.getByRole('button', { name: 'Actualizar a la versión 2' }).click()
  await expect(dialog).toHaveCount(0)
  expect(server.calls.find((c) => c.method === 'update_campaign_content')!.body).toMatchObject({
    target_pack: srdPackId,
    target_category: 'creatures',
    expected_version: 2,
  })
  await expect(
    page.getByRole('status').filter({ hasText: 'SRD 5.2.1: actualizado a la versión 2.' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Por revisar' })).toHaveCount(0)
  // Its Review button is gone: the pack's switch takes focus.
  await expect(page.getByRole('switch', { name: 'Usar SRD 5.2.1 en criaturas' })).toBeFocused()
})

test('RYT-162 a stale update says the pack changed', async ({ page }) => {
  await identityFixture(page)
  await contentServer({ stale: true }).install(page)
  await page.goto(panel)
  await page.getByRole('button', { name: 'Revisar cambios de SRD 5.2.1 en criaturas' }).click()
  const dialog = page.getByRole('dialog', { name: 'SRD 5.2.1 · versión 2' })
  await dialog.getByRole('button', { name: 'Actualizar a la versión 2' }).click()
  await expect(dialog.getByRole('alert')).toContainText('El paquete cambió mientras revisabas')
  await expect(dialog.getByRole('alert')).toBeFocused()
})

test('RYT-162 the DM finds, hides and shows entries', async ({ page }, info) => {
  await identityFixture(page)
  const server = contentServer()
  await server.install(page)
  await page.goto(panel)
  const browse = page.getByRole('button', {
    name: 'Ver y ocultar registros de SRD 5.2.1 en criaturas',
  })
  await browse.click()
  const dialog = page.getByRole('dialog', { name: 'Criaturas de SRD 5.2.1' })
  await expect(dialog.getByText('3 registros')).toBeVisible()
  await dialog.getByLabel('Buscar').fill('lob')
  await expect(dialog.getByText('1 registro')).toBeVisible()
  const eye = dialog.getByRole('button', { name: 'Ocultar Lobo' })
  await expect(eye).toHaveAttribute('aria-pressed', 'false')
  await eye.click()
  await expect(eye).toHaveAttribute('aria-pressed', 'true')
  expect(server.calls.find((c) => c.method === 'set_campaign_content_hidden')!.body).toMatchObject({
    target_kind: 'creature',
    target_key: 'wolf',
    hidden: true,
  })
  await audit(page, '[role="dialog"]')
  await capture(page, info.outputPath('content-entries.png'))
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(browse).toBeFocused()
})

test('RYT-162 turning packs off keeps their version; the SRD creatures ask first', async ({
  page,
}) => {
  await identityFixture(page)
  const server = contentServer()
  await server.install(page)
  await page.goto(panel)
  const srd = page.getByRole('switch', { name: 'Usar SRD 5.2.1 en criaturas' })
  await srd.click()
  const dialog = page.getByRole('dialog', { name: '¿Dejar de usar SRD 5.2.1 en criaturas?' })
  await expect(dialog).toContainText('se olvidan las que ocultaste y tus versiones de ellas')
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(server.calls.some((c) => c.method === 'set_campaign_content')).toBe(false)
  await srd.click()
  await dialog.getByRole('button', { name: 'Dejar de usar' }).click()
  await expect(srd).not.toBeChecked()
  // Turning it on again resumes version 1: the newer version still waits for review.
  await srd.click()
  await expect(srd).toBeChecked()
  await expect(page.getByRole('region', { name: 'Por revisar' })).toContainText('Versión 1 → 2')
  // Another pack turns on and off in one step: nothing is lost.
  const north = page.getByRole('switch', { name: 'Usar Bestias del Norte en criaturas' })
  await north.click()
  await expect(north).toBeChecked()
  await north.click()
  await expect(north).not.toBeChecked()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('RYT-162 one dialog after another opens and closes, with a fresh search', async ({ page }) => {
  await identityFixture(page)
  await contentServer().install(page)
  await page.goto(panel)
  const review = page.getByRole('button', { name: 'Revisar cambios de SRD 5.2.1 en criaturas' })
  const browse = page.getByRole('button', {
    name: 'Ver y ocultar registros de SRD 5.2.1 en criaturas',
  })
  await review.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await browse.click()
  const entries = page.getByRole('dialog', { name: 'Criaturas de SRD 5.2.1' })
  await entries.getByLabel('Buscar').fill('lob')
  await page.keyboard.press('Escape')
  await expect(entries).toHaveCount(0)
  await expect(browse).toBeFocused()
  await browse.click()
  await expect(entries.getByLabel('Buscar')).toHaveValue('')
  await entries.getByRole('button', { name: 'Cerrar' }).click()
  await expect(entries).toHaveCount(0)
  await review.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(review).toBeFocused()
})

test('RYT-180 with several versions waiting only the first row has the filled button', async ({
  page,
}, info) => {
  await identityFixture(page)
  await contentServer({ northUpdate: true }).install(page)
  await page.goto(panel)
  const review = page.getByRole('region', { name: 'Por revisar' })
  await expect(review.getByRole('listitem')).toHaveCount(2)
  const buttons = review.getByRole('button', { name: /^Revisar cambios de/ })
  await expect(buttons.nth(0)).toHaveAttribute('data-variant', 'filled')
  await expect(buttons.nth(1)).not.toHaveAttribute('data-variant', 'filled')
  await expect(
    page.locator('#main-content .mantine-Button-root[data-variant="filled"]'),
  ).toHaveCount(1)
  await audit(page)
  await capture(page, info.outputPath('content-two-reviews.png'))
})

test('RYT-180 without a waiting version there is no block to review and no filled button', async ({
  page,
}) => {
  await identityFixture(page)
  await contentServer().install(page)
  await page.goto(panel)
  await page.getByRole('button', { name: 'Revisar cambios de SRD 5.2.1 en criaturas' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Actualizar a la versión 2' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Por revisar' })).toHaveCount(0)
  await expect(
    page.locator('#main-content .mantine-Button-root[data-variant="filled"]'),
  ).toHaveCount(0)
  await audit(page)
})
