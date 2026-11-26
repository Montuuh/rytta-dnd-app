import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import {
  contentServer,
  northPackId,
  srdPackId,
  type ContentOptions,
} from './fixtures/campaign-content.ts'

// RYT-162, RYT-184: the DM chooses the packs the campaign uses, one card per pack, reads one notice
// when a pack has news, and hides single entries from a sheet.
const panel = `./#/campaign/${campaignId}/members?panel=content`

type Look = { language: 'es' | 'en'; theme: 'default' | 'parchment' }
async function open(
  page: Page,
  options: ContentOptions = {},
  look: Look = { language: 'es', theme: 'default' },
) {
  await page.addInitScript(({ language, theme }) => {
    localStorage.setItem('rytta-language', language)
    localStorage.setItem('rytta-theme', theme)
  }, look)
  await identityFixture(page)
  const server = contentServer(options)
  await server.install(page)
  await page.goto(panel)
  return server
}

async function settled(page: Page, scope = 'body') {
  await page
    .locator(scope)
    .first()
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
}

async function audit(page: Page, scope = '#main-content') {
  await settled(page, scope)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const root = page.locator(scope).first()
  await expectTouchTargets(root, 'button:visible, a:visible')
  // A switch is hit by its input: 44px wide as well as tall.
  await expectTouchTargets(root, 'input[type="checkbox"]:visible', { width: 44, height: 44 })
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(axe.violations).toEqual([])
}

const sheet = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name })
const filled = (page: Page) =>
  page.locator('#main-content .mantine-Button-root[data-variant="filled"]')
const rytta = (page: Page, es = true) =>
  page.getByRole('switch', { name: es ? 'Usar Rytta en la campaña' : 'Use Rytta in the campaign' })
const north = (page: Page) =>
  page.getByRole('switch', { name: 'Usar Bestias del Norte en la campaña' })

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-184 the DM sees one card per pack, the notice first (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    await open(page, {}, { language, theme })
    const base = es ? 'Rytta' : 'Rytta'
    await expect(page.getByRole('heading', { name: base, level: 3, exact: true })).toBeVisible()
    // What the pack brings, in one line: numbers for creatures, spells and classes. No versions,
    // never the word "registros".
    const lines = page.getByTestId('pack-line')
    await expect(lines.nth(0)).toHaveText(
      es
        ? '330 criaturas, 339 conjuros, 12 clases, reglas y objetos'
        : '330 creatures, 339 spells, 12 classes, rules, and items',
    )
    await expect(lines.nth(1)).toHaveText(es ? '42 criaturas' : '42 creatures')
    await expect(page.locator('#main-content')).not.toContainText(
      /registros|records|[Vv]ersi[oó]n \d/,
    )
    // Two packs in use; three folded behind one disclosure.
    await expect(
      page.getByRole('switch', {
        name: es ? 'Usar Rytta en la campaña' : 'Use Rytta in the campaign',
      }),
    ).toBeChecked()
    await expect(
      page.getByRole('switch', {
        name: es ? 'Usar Bestias del Norte en la campaña' : 'Use Northern Beasts in the campaign',
      }),
    ).toBeChecked()
    const fold = page.getByRole('button', { name: es ? 'Más paquetes (3)' : 'More packs (3)' })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.content-panel').getByRole('switch')).toHaveCount(2)
    // The notice is the first thing on the panel, with the panel's one filled button.
    const notice = page.getByRole('region', {
      name: es ? 'Rytta tiene novedades' : 'Rytta has news',
    })
    await expect(notice).toContainText(
      es
        ? '3 entradas nuevas, 34 cambiadas, 1 retirada. 2 tocan criaturas que editaste.'
        : '3 new entries, 34 changed, 1 withdrawn. 2 touch creatures you edited.',
    )
    await expect(filled(page)).toHaveCount(1)
    await expect(
      notice.getByRole('button', { name: es ? 'Actualizar Rytta' : 'Update Rytta' }),
    ).toHaveAttribute('data-variant', 'filled')
    expect(
      await page.evaluate(() => {
        const main = document.querySelector('#main-content')!
        const news = main.querySelector('[aria-labelledby^="content-news"]')!
        const cards = main.querySelector('.content-packs')!
        return Boolean(news.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING)
      }),
    ).toBe(true)
    await audit(page)
    await fold.click()
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.content-panel').getByRole('switch')).toHaveCount(5)
    await expect(page.getByTestId('pack-line').nth(2)).toHaveText(
      es ? '18 criaturas y 24 conjuros' : '18 creatures and 24 spells',
    )
    await audit(page)
    await capture(page, info.outputPath(`content-panel-${language}-${theme}.png`))
  })
}

test('RYT-184 five packs fit in the first two phone screens', async ({ page }, info) => {
  test.skip(!info.project.name.endsWith('mobile'), 'The phone screens are the measure')
  await open(page)
  await page.getByRole('button', { name: 'Más paquetes (3)' }).click()
  await settled(page)
  const bottom = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#main-content .content-packs > li')]
    return Math.max(...cards.map((card) => card.getBoundingClientRect().bottom + scrollY))
  })
  expect(bottom).toBeLessThanOrEqual(2 * 844)
})

test('RYT-184 a pack turns on and off with one switch; the base pack asks first', async ({
  page,
}) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) warnings.push(message.text())
  })
  const server = await open(page)
  // Another pack: no question, nothing lost.
  await north(page).click()
  await expect(north(page)).not.toBeChecked()
  expect(server.calls.find((c) => c.method === 'set_campaign_content_pack')!.body).toMatchObject({
    target_pack: northPackId,
    enabled: false,
  })
  await north(page).click()
  await expect(north(page)).toBeChecked()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The base pack asks, in words about the whole pack.
  await rytta(page).click()
  const dialog = page.getByRole('dialog', { name: '¿Dejar de usar Rytta?' })
  await expect(dialog).toContainText('La campaña pierde sus criaturas')
  await expect(dialog).toContainText('tus versiones de ellas')
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(rytta(page)).toBeFocused()
  expect(
    server.calls.filter(
      (c) => c.method === 'set_campaign_content_pack' && c.body.target_pack === srdPackId,
    ),
  ).toHaveLength(0)
  await rytta(page).click()
  await dialog.getByRole('button', { name: 'Dejar de usar' }).click()
  await expect(rytta(page)).not.toBeChecked()
  await expect(page.getByTestId('pack-line').first()).toHaveText(/criaturas.*conjuros|Rytta/)
  // Turning it on again needs no question and brings every category back.
  await rytta(page).click()
  await expect(rytta(page)).toBeChecked()
  expect(warnings.filter((text) => /centered/.test(text))).toEqual([])
})

test('RYT-184 a pack no longer offered says so and asks before it is turned off', async ({
  page,
}, info) => {
  const server = await open(page, { withdrawn: true })
  const line = page.getByTestId('pack-line').nth(1)
  await expect(line).toHaveText('Ya no se ofrece. Si dejas de usarlo no podrás recuperarlo.')
  await expect(page.getByRole('button', { name: 'Personalizar Bestias del Norte' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Personalizar Rytta' })).toBeVisible()
  await north(page).click()
  const dialog = page.getByRole('dialog', { name: '¿Dejar de usar Bestias del Norte?' })
  await expect(dialog).toContainText('Ya no se ofrece')
  await expect(dialog).toContainText('no podrás volver a activarlo')
  await audit(page, '[role="dialog"]')
  await capture(page, info.outputPath('content-confirm-gone.png'))
  await dialog.getByRole('button', { name: 'Dejar de usar' }).click()
  // It leaves the panel for good: it cannot be turned on again. The keyboard stays on the panel.
  await expect(north(page)).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Bestias del Norte ya no está en la campaña.' }),
  ).toBeAttached()
  await expect(rytta(page)).toBeFocused()
  expect(server.calls.some((c) => c.method === 'set_campaign_content_pack')).toBe(true)
})

test('RYT-184 packs not in use are folded and turn on from their own card', async ({ page }) => {
  const server = await open(page)
  const fold = page.getByRole('button', { name: 'Más paquetes (3)' })
  await expect(page.getByText('Tomo de ceniza')).toBeHidden()
  await fold.click()
  const ash = page.getByRole('switch', { name: 'Usar Tomo de ceniza en la campaña' })
  await expect(ash).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Personalizar Tomo de ceniza' })).toHaveCount(0)
  await ash.click()
  await expect(ash).toBeChecked()
  expect(server.calls.find((c) => c.method === 'set_campaign_content_pack')!.body).toMatchObject({
    enabled: true,
  })
  // It stays where it was found, now with its own Personalizar; the fold keeps its count.
  await expect(page.getByRole('button', { name: 'Más paquetes (3)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Personalizar Tomo de ceniza' })).toBeVisible()
  await expect(ash).toBeFocused()
})

test('RYT-184 Personalizar opens the categories; entries open above it and Escape walks back', async ({
  page,
}, info) => {
  const server = await open(page)
  const opener = page.getByRole('button', { name: 'Personalizar Rytta' })
  await opener.click()
  const detail = sheet(page, 'Rytta')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('Clases y orígenes')
  await expect(detail).not.toContainText('Personajes')
  await expect(detail.getByRole('switch')).toHaveCount(5)
  // The sheet is a real dialog with a title, a 44px close button with a name, and trapped focus.
  const close = detail.getByRole('button', { name: 'Cerrar' })
  const box = (await close.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  await audit(page, '[role="dialog"]')
  await capture(page, info.outputPath('content-detail.png'))
  // A category turns off on its own, with no question outside the base creatures.
  const rules = detail.getByRole('switch', { name: 'Usar reglas de Rytta' })
  await rules.click()
  await expect(rules).not.toBeChecked()
  expect(server.calls.find((c) => c.method === 'set_campaign_content')!.body).toMatchObject({
    target_category: 'rules',
    enabled: false,
  })
  await rules.click()
  await expect(rules).toBeChecked()
  // The base creatures ask first, inside the sheet.
  const creatures = detail.getByRole('switch', { name: 'Usar criaturas de Rytta' })
  await creatures.click()
  await expect(detail.getByRole('alert')).toContainText('Las criaturas salen del bestiario')
  await detail.getByRole('button', { name: 'Cancelar' }).click()
  await expect(creatures).toBeChecked()
  // Entries: "1 oculta" shows only where something is hidden.
  const pick = detail.getByRole('button', { name: /^Ver y ocultar criaturas/ })
  await expect(pick).toContainText('1 oculta')
  await expect(detail.getByRole('button', { name: /^Ver y ocultar conjuros$/ })).toBeVisible()
  await pick.click()
  const entries = sheet(page, 'Criaturas de Rytta')
  await expect(entries).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(entries).toHaveCount(0)
  await expect(detail).toBeVisible()
  await expect(pick).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(detail).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('RYT-184 the DM finds, hides and shows entries', async ({ page }, info) => {
  const server = await open(page)
  // One number for the creatures everywhere: the card, the category row, the tab and the list.
  await expect(page.getByTestId('pack-line').nth(0)).toContainText('330 criaturas')
  await page.getByRole('button', { name: 'Personalizar Rytta' }).click()
  await expect(sheet(page, 'Rytta').getByText('330 en el paquete')).toBeVisible()
  await sheet(page, 'Rytta')
    .getByRole('button', { name: /^Ver y ocultar criaturas/ })
    .click()
  const entries = sheet(page, 'Criaturas de Rytta')
  const all = entries.getByRole('radio', { name: 'Todas 330' })
  await expect(all).toBeChecked()
  await expect(entries.getByRole('radio', { name: 'Ocultas 1' })).toBeAttached()
  // Nothing was searched: no search result is announced.
  await expect(entries.getByText('Nada coincide con tu búsqueda.')).toHaveCount(0)
  await entries.getByRole('textbox', { name: 'Buscar' }).fill('zzzz')
  await expect(entries.getByText('Nada coincide con tu búsqueda.')).toHaveCount(1)
  await entries.getByRole('textbox', { name: 'Buscar' }).fill('')
  await expect(entries.getByText('Nada coincide con tu búsqueda.')).toHaveCount(0)
  // Rows: picture, name, one line, a switch meaning "in the campaign".
  const row = entries.getByRole('listitem').filter({ hasText: 'Dragón rojo adulto' })
  await expect(row).toContainText('Dragón, desafío 17')
  await expect(entries.getByRole('switch', { name: 'Usar Kobold en la campaña' })).not.toBeChecked()
  // Search and the views stay in view while the list scrolls.
  await entries.getByRole('textbox', { name: 'Buscar' }).fill('lobo')
  await expect(entries.getByText('1 resultado')).toBeVisible()
  const wolf = entries.getByRole('switch', { name: 'Usar Lobo en la campaña' })
  await expect(wolf).toBeChecked()
  await wolf.click()
  await expect(wolf).not.toBeChecked()
  await expect
    .poll(() => server.calls.find((c) => c.method === 'set_campaign_content_hidden')?.body)
    .toMatchObject({ target_kind: 'creature', target_key: 'wolf', hidden: true })
  await expect(entries.getByRole('radio', { name: 'Ocultas 2' })).toBeAttached()
  // The sheet under it is scaled by the nested sheet, so only the top one is measured.
  await audit(page, '[role="dialog"]:not([data-nested-drawer-open])')
  await capture(page, info.outputPath('content-entries.png'))
  // The hidden view lists what was hidden and restores in one tap.
  await entries.getByRole('textbox', { name: 'Buscar' }).fill('')
  await entries.getByText('Ocultas 2').click()
  await expect(entries.getByRole('switch')).toHaveCount(2)
  await entries.getByRole('switch', { name: 'Usar Kobold en la campaña' }).click()
  await expect(entries.getByRole('switch')).toHaveCount(1)
  await expect(entries.getByRole('radio', { name: 'Ocultas 1' })).toBeAttached()
  await capture(page, info.outputPath('content-entries-hidden.png'))
  await entries.getByText('Todas 330').click()
  // 330 creatures page by a hundred, with "Ver más" at the end.
  const more = entries.getByRole('button', { name: 'Ver más' })
  await more.click()
  await expect(entries.getByRole('switch')).toHaveCount(200)
  await more.click()
  await more.click()
  await expect(entries.getByRole('switch')).toHaveCount(330)
  await expect(more).toHaveCount(0)
})

test('RYT-184 the views agree in gender with the category (spells are masculine)', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'Personalizar Rytta' }).click()
  await sheet(page, 'Rytta')
    .getByRole('button', { name: /^Ver y ocultar conjuros/ })
    .click()
  const entries = sheet(page, 'Conjuros de Rytta')
  await expect(entries.getByRole('radio', { name: 'Todos 339' })).toBeChecked()
  await expect(entries.getByRole('radio', { name: 'Ocultos 0' })).toBeAttached()
  // An untouched hidden view says so once, and no search result is announced.
  await entries.getByText('Ocultos 0').click()
  await expect(entries.getByText('Nada coincide con tu búsqueda.')).toHaveCount(0)
})

test('RYT-184 a category row counts what its sheet lists (classes hold more than classes)', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'Personalizar Rytta' }).click()
  const detail = sheet(page, 'Rytta')
  await expect(detail.getByText('60 en el paquete')).toBeVisible()
  await detail.getByRole('button', { name: /^Ver y ocultar clases/ }).click()
  await expect(
    sheet(page, 'Clases y orígenes de Rytta').getByRole('radio', { name: 'Todos 60' }),
  ).toBeChecked()
})

test('RYT-184 a refused hide keeps its message in the sheet', async ({ page }) => {
  await open(page, { hideInvalid: true })
  await page.getByRole('button', { name: 'Personalizar Rytta' }).click()
  await sheet(page, 'Rytta')
    .getByRole('button', { name: /^Ver y ocultar criaturas/ })
    .click()
  const entries = sheet(page, 'Criaturas de Rytta')
  await entries.getByRole('switch', { name: 'Usar Lobo en la campaña' }).click()
  await expect(entries.getByRole('alert')).toContainText('ya no está disponible')
  await expect(entries.getByRole('switch', { name: 'Usar Lobo en la campaña' })).toBeChecked()
})

test('RYT-184 the notice updates the whole pack at once', async ({ page }) => {
  const server = await open(page)
  const update = page.getByRole('button', { name: 'Actualizar Rytta' })
  await update.click()
  await expect
    .poll(() => server.calls.find((c) => c.method === 'update_campaign_content_pack')?.body)
    .toMatchObject({ target_pack: srdPackId, expected_version: 3 })
  await expect(page.getByRole('status').filter({ hasText: 'Rytta está al día.' })).toBeAttached()
  await expect(page.getByRole('region', { name: 'Rytta tiene novedades' })).toHaveCount(0)
  // Its button is gone: the pack's switch takes focus.
  await expect(rytta(page)).toBeFocused()
  await expect(filled(page)).toHaveCount(0)
})

test('RYT-184 "Ver qué cambia" leads with what affects the campaign and keeps Actualizar in view', async ({
  page,
}, info) => {
  const server = await open(page)
  const opener = page.getByRole('button', { name: 'Ver qué cambia en Rytta' })
  await opener.click()
  const review = sheet(page, 'Novedades de Rytta')
  await expect(review).toContainText('Nada cambia en tu campaña hasta que actualices.')
  const affects = review.getByRole('region', { name: 'Te afecta' })
  const items = affects.getByRole('listitem')
  await expect(items).toHaveCount(3)
  await expect(items.nth(0)).toContainText('Lobo')
  await expect(items.nth(0)).toContainText('cambiada; tu versión se conserva')
  await expect(items.nth(2)).toContainText('retirada; deja de estar entre las ocultas')
  const rest = review.getByRole('region', { name: 'El resto' })
  await expect(rest).toContainText('Criaturas: 3 nuevas, 30 cambiadas, 1 retirada')
  await expect(rest).toContainText('Conjuros: 4 cambiados')
  // The footer stays in view: its button is inside the sheet, below the list.
  const footerButton = review.getByRole('button', { name: 'Actualizar' })
  await expect(footerButton).toBeInViewport()
  await audit(page, '[role="dialog"]')
  await capture(page, info.outputPath('content-review.png'))
  await page.keyboard.press('Escape')
  await expect(review).toHaveCount(0)
  await expect(opener).toBeFocused()
  await opener.click()
  await footerButton.click()
  await expect(review).toHaveCount(0)
  expect(server.calls.find((c) => c.method === 'update_campaign_content_pack')!.body).toMatchObject(
    {
      expected_version: 3,
    },
  )
  await expect(page.getByRole('status').filter({ hasText: 'Rytta está al día.' })).toBeAttached()
  await expect(rytta(page)).toBeFocused()
})

test('RYT-184 a stale update keeps its message and puts focus on it', async ({ page }) => {
  await open(page, { stale: true })
  await page.getByRole('button', { name: 'Ver qué cambia en Rytta' }).click()
  const review = sheet(page, 'Novedades de Rytta')
  await review.getByRole('button', { name: 'Actualizar' }).click()
  await expect(review.getByRole('alert')).toContainText('El paquete cambió mientras revisabas')
  await expect(review.getByRole('alert')).toBeFocused()
  await expect(review).toBeVisible()
})

test('RYT-184 with several notices only the first has the filled button', async ({
  page,
}, info) => {
  await open(page, { northUpdate: true })
  await expect(page.getByRole('region', { name: /tiene novedades/ })).toHaveCount(2)
  await expect(filled(page)).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Actualizar Bestias del Norte' }),
  ).not.toHaveAttribute('data-variant', 'filled')
  await audit(page)
  await capture(page, info.outputPath('content-two-notices.png'))
})

test('RYT-184 without news there is no notice and no filled button', async ({ page }) => {
  await open(page, { upToDate: true })
  await expect(rytta(page)).toBeVisible()
  await expect(page.getByRole('region', { name: /tiene novedades/ })).toHaveCount(0)
  await expect(filled(page)).toHaveCount(0)
  await audit(page)
})

test('RYT-184 a digest that cannot be read shows one line and one retry', async ({ page }) => {
  const server = await open(page, { failDigest: true })
  const notice = page.getByRole('region', { name: 'Rytta tiene novedades' })
  await expect(notice).toContainText('No se pudieron cargar las novedades.')
  await expect(notice.getByRole('button')).toHaveCount(1)
  await expect(notice.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  server.flags.failDigest = false
  await notice.getByRole('button', { name: 'Reintentar' }).click()
  await expect(notice).toContainText('3 entradas nuevas, 34 cambiadas')
  await expect(notice.getByRole('button', { name: 'Actualizar Rytta' })).toBeEnabled()
  await expect(notice.getByRole('button', { name: 'Ver qué cambia en Rytta' })).toBeEnabled()
})

test('RYT-184 loading, error with retry, forbidden and empty states', async ({ page }, info) => {
  // Loading: a skeleton of two cards, not a spinner.
  const slow = await open(page, { delay: 1500 })
  await expect(page.getByRole('status', { name: 'Cargando…' })).toBeVisible()
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible()
  await capture(page, info.outputPath('content-loading.png'))
  await expect(rytta(page)).toBeVisible()
  expect(slow.calls.length).toBeGreaterThan(0)
})

test('RYT-184 the list fails and loads again on retry', async ({ page }, info) => {
  const server = await open(page, { failList: true })
  const alert = page.getByRole('alert').filter({ hasText: 'No se pudo cargar el contenido.' })
  await expect(alert).toBeVisible()
  await audit(page)
  await capture(page, info.outputPath('content-error.png'))
  server.flags.failList = false
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(rytta(page)).toBeVisible()
})

test('RYT-184 a reader who cannot change the content is told so', async ({ page }) => {
  await open(page, { forbidden: true })
  await expect(page.getByRole('alert')).toContainText('Solo quien dirige la campaña')
  await expect(page.locator('.content-panel').getByRole('switch')).toHaveCount(0)
  await audit(page)
})

test('RYT-184 a campaign with no packs says so and offers no action it cannot back', async ({
  page,
}) => {
  await open(page, { nothing: true })
  await expect(
    page.getByText(
      'No hay paquetes publicados para esta campaña. Aparecerán aquí cuando haya uno.',
    ),
  ).toBeVisible()
  await expect(page.locator('.content-panel').getByRole('button')).toHaveCount(0)
  await audit(page)
})

test('RYT-184 the base pack with its long title is shortened to SRD', async ({ page }) => {
  await open(page, { longBase: true })
  await expect(page.getByRole('heading', { name: 'SRD', level: 3, exact: true })).toBeVisible()
  await expect(page.locator('#main-content')).not.toContainText('Documento de referencia')
})

test('RYT-184 keyboard: tab order, Escape and focus return in the sheets', async ({ page }) => {
  await open(page)
  // Tab order: the notice (Actualizar, Ver qué cambia), then each card (switch, Personalizar), then the fold.
  const names = async (count: number) => {
    const found: string[] = []
    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab')
      found.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement
          return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''
        }),
      )
    }
    return found
  }
  await page.locator('#campaign-content-title').evaluate((node) => {
    const link = document.createElement('a')
    link.id = 'tab-start'
    link.href = '#'
    link.textContent = 'start'
    node.after(link)
    link.focus()
  })
  const order = await names(7)
  expect(order.slice(0, 7)).toEqual([
    'Actualizar Rytta',
    'Ver qué cambia en Rytta',
    'Usar Rytta en la campaña',
    'Personalizar Rytta',
    'Usar Bestias del Norte en la campaña',
    'Personalizar Bestias del Norte',
    'Más paquetes (3)',
  ])
  // Focus stays inside an open sheet however long Tab is held.
  await page.getByRole('button', { name: 'Personalizar Bestias del Norte' }).click()
  const detail = sheet(page, 'Bestias del Norte')
  await expect(detail).toBeVisible()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    // The trap's guard hands focus back within a frame.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    expect(await detail.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(detail).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Personalizar Bestias del Norte' })).toBeFocused()
})

test('RYT-184 the sheet: above the app, Back closes it, the page does not scroll, reduced motion', async ({
  page,
}, info) => {
  const phone = info.project.name.endsWith('mobile')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  const url = page.url()
  await page.getByRole('button', { name: 'Personalizar Rytta' }).click()
  const detail = sheet(page, 'Rytta')
  await expect(detail).toBeVisible()
  await settled(page)
  // From the bottom on phones, from the right at tablet width.
  const box = (await detail.boundingBox())!
  const viewport = page.viewportSize()!
  // Desktop Chrome keeps a 15px scrollbar gutter that phones do not have.
  const gutter = 16
  if (phone) {
    expect(Math.round(box.x)).toBe(0)
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - gutter)
    expect(Math.round(box.y + box.height)).toBe(viewport.height)
  } else {
    expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.width - gutter)
    expect(box.width).toBeLessThan(viewport.width)
    expect(Math.round(box.height)).toBe(viewport.height)
  }
  // Above the app header and the bottom navigation: what is hit over them is the sheet's own layer.
  const covered = await page.evaluate(() => {
    const popup = document.querySelector('[data-slot="drawer-popup"]')!
    const layers = ['.app-header', '.bottom-nav']
      .map((selector) => document.querySelector(selector))
      .filter((node): node is Element => Boolean(node))
    return layers.map((layer) => {
      const rect = layer.getBoundingClientRect()
      // The sheet may cover only part of the header (the tablet's side sheet): probe the left edge.
      const hit = document.elementFromPoint(
        4,
        Math.min(innerHeight - 2, rect.top + rect.height / 2),
      )
      return (
        hit !== null &&
        !layer.contains(hit) &&
        (popup.contains(hit) || hit.closest('[data-slot^="drawer"]') !== null)
      )
    })
  })
  expect(covered.every(Boolean)).toBe(true)
  // The page behind does not scroll while the sheet is open.
  const locked = await page.evaluate(() => getComputedStyle(document.body).overflow)
  expect(['hidden', 'clip']).toContain(locked)
  // Reduced motion: neither the sheet nor its backdrop transitions anything.
  const motion = await page.evaluate(() =>
    ['[data-slot="drawer-popup"]', '[data-slot="drawer-overlay"]'].map((selector) => {
      const style = getComputedStyle(document.querySelector(selector)!)
      return style.transitionProperty === 'none' || parseFloat(style.transitionDuration) === 0
    }),
  )
  expect(motion).toEqual([true, true])
  // The phone's Back button closes the sheet and the page stays.
  await page.goBack()
  await expect(detail).toHaveCount(0)
  expect(page.url()).toBe(url)
  await expect(page.getByRole('button', { name: 'Personalizar Rytta' })).toBeFocused()
})

test('RYT-184 text at 150% keeps the panel and its sheets whole', async ({ page }, info) => {
  await open(page)
  await page.addStyleTag({ content: 'html { font-size: 150% !important; }' })
  await page.getByRole('button', { name: 'Más paquetes (3)' }).click()
  await audit(page)
  if (process.env.RYT_EVIDENCE)
    await page.screenshot({
      path: `docs/evidence/RYT-184/content/panel-text150-${info.project.name.endsWith('mobile') ? '390' : '820'}-es-hearth.png`,
      fullPage: true,
    })
  await page.getByRole('button', { name: 'Personalizar Rytta' }).click()
  await sheet(page, 'Rytta')
    .getByRole('button', { name: /^Ver y ocultar criaturas/ })
    .click()
  const entries = sheet(page, 'Criaturas de Rytta')
  await expect(entries.getByRole('switch', { name: 'Usar Lobo en la campaña' })).toBeVisible()
  await audit(page, '[role="dialog"]:not([data-nested-drawer-open])')
  if (process.env.RYT_EVIDENCE) {
    await settled(page)
    await page.screenshot({
      path: `docs/evidence/RYT-184/content/entries-text150-${info.project.name.endsWith('mobile') ? '390' : '820'}-es-hearth.png`,
    })
  }
})

// Evidence: the screens of the delivery at both widths, both themes, both languages.
for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-184 evidence captures (${language}, ${theme})`, async ({ page }, info) => {
    test.skip(!process.env.RYT_EVIDENCE, 'Evidence screenshots are written only with RYT_EVIDENCE')
    test.setTimeout(90_000)
    const es = language === 'es'
    const width = info.project.name.endsWith('mobile') ? '390' : '820'
    const name = (what: string) =>
      `docs/evidence/RYT-184/content/${what}-${width}-${language}-${theme === 'default' ? 'hearth' : 'parchment'}.png`
    const shot = async (what: string, full = false, scope?: Locator) => {
      // The pointer rests away from the controls, so none shows its hover state.
      await page.mouse.move(0, 0)
      await settled(page)
      if (scope) await scope.screenshot({ path: name(what) })
      else await page.screenshot({ path: name(what), fullPage: full })
    }
    await open(page, { northUpdate: false }, { language, theme })
    await expect(rytta(page, es)).toBeVisible()
    await shot('panel', true)
    await page.getByRole('button', { name: es ? 'Más paquetes (3)' : 'More packs (3)' }).click()
    await shot('fold', true)
    await page
      .getByRole('button', { name: es ? 'Ver qué cambia en Rytta' : 'See what changes in Rytta' })
      .click()
    await shot('review')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: es ? 'Personalizar Rytta' : 'Customise Rytta' }).click()
    await shot('personalise')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: es ? /^Ver y ocultar criaturas/ : /^Show or hide creatures/ })
      .click()
    await shot('entries')
    await page.getByText(es ? /^Ocultas \d/ : /^Hidden \d/).click()
    await shot('entries-hidden')
    await page.keyboard.press('Escape')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: es ? /^Ver y ocultar conjuros/ : /^Show or hide spells/ })
      .click()
    await shot('entries-spells')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await rytta(page, es).click()
    await shot('confirm')
  })
