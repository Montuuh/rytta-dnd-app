import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

// RYT-167 (owner choice P2 A) in both languages and themes: the content step of a new campaign,
// its keyboard path and the state when the packs cannot be loaded.
const evidence = 'docs/evidence/ui-review/ryt-167'

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

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-167 the content step of a new campaign (${language}, ${theme})`, async ({
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
    await identityFixture(page, { empty: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('./')
    const create = page
      .locator('main')
      .getByRole('button', { name: es ? 'Crear campaña' : 'Create campaign', exact: true })
    // The packs cannot be loaded at first; the step says so and retries in place.
    let unreachable = true
    await page.route('**/rest/v1/rpc/get_content_choices', (route) =>
      unreachable ? route.fulfill({ status: 500, body: '{}' }) : route.fallback(),
    )
    await create.click()
    const dialog = page.getByRole('dialog')
    const name = dialog.getByLabel(es ? 'Nombre de la campaña' : 'Campaign name')
    await expect(name).toBeFocused()
    await name.fill('La Costa Hundida')
    await page.keyboard.press('Enter')
    const heading = dialog.getByRole('heading', {
      name: es ? 'Contenido de la campaña' : 'Campaign content',
    })
    await expect(heading).toBeFocused()
    const alert = dialog.getByRole('alert')
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await expect(
      dialog.getByRole('button', { name: es ? 'Crear campaña' : 'Create campaign' }),
    ).toBeDisabled()
    await audit(page)
    await capture(page, shot('content-error'))
    unreachable = false
    await alert.getByRole('button', { name: es ? 'Reintentar' : 'Try again' }).click()
    await expect(alert).toHaveCount(0)

    // The SRD in every category and the Rytta basics in items come ticked.
    const items = dialog.getByRole('group', { name: es ? 'Objetos' : 'Items' })
    await expect(items.getByRole('checkbox')).toHaveCount(2)
    for (const box of await dialog.getByRole('checkbox').all()) await expect(box).toBeChecked()
    await audit(page)
    await capture(page, shot('content'))

    // The whole row is the checkbox: its entry count toggles it too.
    const basics = items.getByRole('checkbox', { name: /Rytta/ })
    await basics.locator('.content-choice-meta').click()
    await expect(basics).not.toBeChecked()
    await basics.locator('.content-choice-meta').click()
    await expect(basics).toBeChecked()
    // With nothing ticked, the step says what the campaign starts without.
    for (const box of await dialog.getByRole('checkbox').all()) await box.click()
    await expect(
      dialog.getByText(es ? /La campaña empezará sin criaturas/ : /will start with no creatures/),
    ).toBeVisible()

    // Back keeps the name; Escape closes and gives focus back to the button that opened it.
    await dialog.getByRole('button', { name: es ? 'Atrás' : 'Back' }).click()
    await expect(name).toHaveValue('La Costa Hundida')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(create).toBeFocused()
  })
