import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

// RYT-167 (owner choice P2 A) and RYT-184 (finding 22): creating a campaign is one step; its content
// is one line until "Change" opens the checkboxes. Both languages and themes, the keyboard path,
// the choices sent and the state when the packs cannot be loaded.
const evidence = 'docs/evidence/RYT-184/creation'
const basePack = '80000000-0000-4000-8000-000000000001'

async function audit(page: Page) {
  const dialog = page.getByRole('dialog')
  await dialog.evaluate((node) =>
    Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(dialog, 'button:visible, .content-choice-pack:visible')
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include('[role="dialog"]')
    .analyze()
  expect(axe.violations).toEqual([])
}

async function open(page: Page, es: boolean, name = 'La Costa Hundida') {
  await page.goto('./')
  const create = page
    .locator('main')
    .getByRole('button', { name: es ? 'Crear campaña' : 'Create campaign', exact: true })
  await create.click()
  const dialog = page.getByRole('dialog')
  const field = dialog.getByLabel(es ? 'Nombre de la campaña' : 'Campaign name')
  await expect(field).toBeFocused()
  await field.fill(name)
  return { create, dialog, field }
}

/** The create button is reachable without scrolling the dialog or the page. */
async function expectCreateInView(page: Page, es: boolean) {
  const button = page
    .getByRole('dialog')
    .getByRole('button', { name: es ? 'Crear campaña' : 'Create campaign', exact: true })
  const box = (await button.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
}

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-184 the content line of a new campaign (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    const es = language === 'es'
    const shot = (name: string) =>
      `${evidence}/${name}-${language}-${theme}-${info.project.name}.png`
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    const f = await identityFixture(page, { empty: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // The packs cannot be loaded at first; the dialog says so and retries in place.
    let unreachable = true
    await page.route('**/rest/v1/rpc/get_content_choices', (route) =>
      unreachable ? route.fulfill({ status: 500, body: '{}' }) : route.fallback(),
    )
    const { create, dialog, field } = await open(page, es)
    const alert = dialog.getByRole('alert')
    await expect(alert).toBeVisible({ timeout: 15_000 })
    const submit = dialog.getByRole('button', {
      name: es ? 'Crear campaña' : 'Create campaign',
      exact: true,
    })
    await expect(submit).toBeDisabled()
    await audit(page)
    await capture(page, shot('error'))
    unreachable = false
    await alert.getByRole('button', { name: es ? 'Reintentar' : 'Try again' }).click()
    await expect(alert).toHaveCount(0)

    // One line: what the campaign starts with, and what that means. The checkboxes are folded.
    const line = dialog.getByRole('status').filter({ hasText: es ? 'Contenido:' : 'Content:' })
    await expect(line).toContainText(
      es ? 'Contenido: SRD y Rytta · Objetos básicos' : 'Content: SRD and Rytta · Basic items',
    )
    await expect(
      dialog.getByText(es ? 'Todo el paquete base' : 'The whole base pack'),
    ).toBeVisible()
    const change = dialog.getByRole('button', { name: es ? 'Cambiar' : 'Change' })
    await expect(change).toHaveAttribute('aria-expanded', 'false')
    await expect(dialog.getByRole('checkbox')).toHaveCount(0)
    await expect(dialog.getByText(/registros|entries/)).toHaveCount(0)
    await expectCreateInView(page, es)
    await audit(page)
    await capture(page, shot('closed'))

    // "Change" opens the checkboxes, all ticked, with what each pack holds named in words.
    await change.click()
    await expect(change).toHaveAttribute('aria-expanded', 'true')
    const items = dialog.getByRole('group', { name: es ? 'Objetos' : 'Items' })
    await expect(items.getByRole('checkbox')).toHaveCount(2)
    for (const box of await dialog.getByRole('checkbox').all()) await expect(box).toBeChecked()
    await expect(dialog.getByRole('group', { name: es ? 'Criaturas' : 'Creatures' })).toContainText(
      es ? '330 criaturas' : '330 creatures',
    )
    await expect(items).toContainText(es ? '3 objetos' : '3 items')
    await audit(page)
    await dialog.getByRole('button', { name: es ? 'Cambiar' : 'Change' }).scrollIntoViewIfNeeded()
    await capture(page, shot('open'))

    // The whole row is the checkbox: its count toggles it too, and the line follows.
    const basics = items.getByRole('checkbox', { name: /Rytta/ })
    await basics.locator('.content-choice-meta').click()
    await expect(basics).not.toBeChecked()
    await expect(line).toHaveText(es ? 'Contenido: SRD' : 'Content: SRD')
    await expect(dialog.getByText(es ? 'Todas las categorías' : 'Every category')).toBeVisible()
    await basics.locator('.content-choice-meta').click()
    await expect(basics).toBeChecked()

    // Creating sends the choice and closes the dialog on the new campaign.
    await field.fill('La Costa Hundida')
    await submit.click()
    await expect(page.getByRole('heading', { name: 'La Costa Hundida' })).toBeVisible()
    expect(f.calls.some((call) => call.method === 'create_campaign_with_content')).toBe(true)
    void create
  })

test('RYT-184 unticking changes the line and what is sent, down to nothing', async ({
  page,
}, info) => {
  limitMatrix(info, true)
  await identityFixture(page, { empty: true })
  const sent: unknown[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rpc/create_campaign_with_content'))
      sent.push(request.postDataJSON())
  })
  const { dialog } = await open(page, true)
  const line = dialog.getByRole('status').filter({ hasText: 'Contenido:' })
  await dialog.getByRole('button', { name: 'Cambiar' }).click()
  // Only creatures and spells: the other categories and the basic items go.
  for (const category of ['Conjuros', 'Criaturas'])
    await expect(dialog.getByRole('group', { name: category }).getByRole('checkbox')).toBeChecked()
  for (const category of ['Clases y orígenes', 'Reglas', 'Objetos'])
    for (const box of await dialog
      .getByRole('group', { name: category })
      .getByRole('checkbox')
      .all())
      await box.uncheck()
  await expect(line).toHaveText('Contenido: SRD')
  await expect(dialog.getByText('Solo criaturas y conjuros')).toBeVisible()
  await capture(page, `${evidence}/some-es-default-${info.project.name}.png`)
  await dialog.getByRole('button', { name: 'Crear campaña', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'La Costa Hundida' })).toBeVisible()
  expect(sent).toHaveLength(1)
  expect((sent[0] as { chosen: unknown }).chosen).toEqual([
    { pack: basePack, category: 'creatures' },
    { pack: basePack, category: 'spells' },
  ])
})

test('RYT-184 with nothing picked the campaign starts without content', async ({ page }, info) => {
  limitMatrix(info, true)
  const f = await identityFixture(page, { empty: true })
  const { dialog } = await open(page, true)
  await dialog.getByRole('button', { name: 'Cambiar' }).click()
  await expect(dialog.getByRole('checkbox')).toHaveCount(6)
  for (const box of await dialog.getByRole('checkbox').all()) await box.uncheck()
  await expect(dialog.getByRole('status').filter({ hasText: 'Contenido:' })).toHaveText(
    'Contenido: ninguno',
  )
  await expect(dialog.getByText('Sin contenido')).toBeVisible()
  await audit(page)
  await capture(page, `${evidence}/nothing-es-default-${info.project.name}.png`)
  await dialog.getByRole('button', { name: 'Crear campaña', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'La Costa Hundida' })).toBeVisible()
  const call = f.calls.find((item) => item.method === 'create_campaign_with_content')!
  expect(call.body.chosen).toEqual([])
})

test('RYT-184 keyboard: Change opens the checkboxes in reading order, Escape gives focus back', async ({
  page,
}, info) => {
  limitMatrix(info, true)
  await identityFixture(page, { empty: true })
  const { create, dialog, field } = await open(page, true)
  // Name, description, then the Change button.
  await page.keyboard.press('Tab')
  await expect(dialog.getByLabel('Descripción')).toBeFocused()
  await page.keyboard.press('Tab')
  const change = dialog.getByRole('button', { name: 'Cambiar' })
  await expect(change).toBeFocused()
  await expect(change).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await expect(change).toHaveAttribute('aria-expanded', 'true')
  await expect(change).toHaveAttribute('aria-controls', /.+/)
  // The first checkbox follows the button; Space unticks it and the line follows.
  const first = dialog.getByRole('group', { name: 'Criaturas' }).getByRole('checkbox')
  await expect(first).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Space')
  await expect(first).not.toBeChecked()
  await expect(dialog.getByText('Solo conjuros, clases y orígenes, reglas y objetos')).toBeVisible()
  // Closing it again hides the checkboxes from the tab order and keeps the choice.
  await change.focus()
  await page.keyboard.press('Enter')
  await expect(change).toHaveAttribute('aria-expanded', 'false')
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await field.focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(create).toBeFocused()
})
