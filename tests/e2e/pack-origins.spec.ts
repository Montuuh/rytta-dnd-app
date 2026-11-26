import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture, rulePackState } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

// RYT-171 (ADR 051): species, backgrounds and feats come from the campaign's packs. A pack species
// and background are offered beside the SRD ones with their pack named, with what they grant.
const evidence = 'docs/evidence/ui-review/ryt-171'

async function audit(page: Page, scope = 'body') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(page.locator(scope).first(), 'button:visible, a:visible')
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(result.violations).toEqual([])
}
async function openWizard(page: Page, door: string, es: boolean) {
  await page.goto(`./campaign/${campaignId}/party`)
  await page.getByRole('button', { name: es ? 'Terminar ficha' : 'Finish sheet' }).click()
  // The quick door comes chosen.
  if (door !== 'Rápida') await page.getByRole('dialog').getByText(door, { exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: es ? 'Empezar' : 'Start' })
    .click()
}

test.beforeEach(() => {
  rulePackState.books = true
})
test.afterEach(() => {
  rulePackState.books = false
})

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const)
  test(`RYT-171 the origin step offers pack species and backgrounds (${language}, ${theme})`, async ({
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
    await identityFixture(page, { player: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openWizard(page, es ? 'Completa' : 'Full', es)
    await page
      .getByRole('radio', { name: es ? /Guerrero/ : /Fighter/ })
      .locator('xpath=..')
      .click()
    await page.getByRole('button', { name: es ? 'Siguiente' : 'Next' }).click()
    const species = page.getByRole('combobox', { name: es ? 'Especie' : 'Species' })
    await expect(
      species.locator('option', {
        hasText: es ? 'Tritón · Libros del dueño' : 'Triton · Owner books',
      }),
    ).toHaveCount(1)
    await species.selectOption({ label: es ? 'Tritón · Libros del dueño' : 'Triton · Owner books' })
    await expect(
      page.getByText(
        es
          ? 'Velocidad 30 pies. Rasgos: Anfibio, Emisario del mar.'
          : 'Speed 30 ft. Traits: Amphibious, Emissary of the Sea.',
      ),
    ).toBeVisible()
    // The option the pack species asks for.
    const option = page.getByRole('radiogroup', {
      name: es ? 'Emisario del mar' : 'Emissary of the Sea',
    })
    const tide = option.getByRole('radio', { name: es ? 'Marea' : 'Tide' })
    await tide.click()
    await expect(tide).toBeChecked()
    const background = page.getByRole('combobox', { name: es ? 'Trasfondo' : 'Background' })
    await background.selectOption({
      label: es ? 'Marinero · Libros del dueño' : 'Sailor · Owner books',
    })
    await expect(
      page.getByText(
        es
          ? 'Habilidades: Atletismo, Percepción. Dote: Pendenciero.'
          : 'Skills: Athletics, Perception. Feat: Brawler.',
      ),
    ).toBeVisible()
    // Only the background's three abilities can rise.
    await expect(
      page
        .getByRole('group', { name: es ? 'Aumentos de característica' : 'Ability score increases' })
        .getByRole('combobox'),
    ).toHaveCount(3)
    await audit(page)
    await capture(page, `${evidence}/origin-${language}-${theme}-${info.project.name}.png`)
  })

test('RYT-171 the quick sheet offers pack species with their pack', async ({ page }, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openWizard(page, 'Rápida', true)
  await page
    .getByRole('radio', { name: /Guerrero/ })
    .locator('xpath=..')
    .click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  const tile = page.locator('.choice-tile', { hasText: 'Tritón' })
  await expect(tile).toContainText('Libros del dueño')
  await expect(page.locator('.choice-tile', { hasText: 'Enano' })).toBeVisible()
  await tile.click()
  await expect(tile.getByRole('radio')).toBeChecked()
  await audit(page)
  await capture(page, `${evidence}/quick-species-${info.project.name}.png`)
})
