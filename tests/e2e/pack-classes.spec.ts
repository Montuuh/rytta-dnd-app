import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, characterId, identityFixture, rulePackState } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'

// RYT-168 (ADR 051): classes and subclasses come from the campaign's packs. A pack class is offered
// beside the SRD ones with its pack named; a pack subclass of an SRD class is offered at level up.
const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
const evidence = 'docs/evidence/ui-review/ryt-168'

async function audit(page: Page, scope = 'body') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(page.locator(scope).first(), 'button:visible, a:visible')
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(result.violations).toEqual([])
}
const sent = (calls: { method: string; body: Record<string, unknown> }[], text: string) =>
  calls.filter((call) => JSON.stringify(call.body).includes(text))

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
  test(`RYT-168 the full wizard offers a pack class with its pack (${language}, ${theme})`, async ({
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
    await page.goto(`./#/campaign/${campaignId}/party`)
    await page.getByRole('button', { name: es ? 'Terminar ficha' : 'Finish sheet' }).click()
    await page
      .getByRole('dialog')
      .getByText(es ? 'Completa' : 'Full', { exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: es ? 'Empezar' : 'Start' })
      .click()
    const card = page.getByRole('radio', { name: es ? /Caballero rúnico/ : /Rune Knight/ })
    await expect(card).toBeAttached()
    await expect(page.locator('.class-pick', { has: card })).toContainText(
      es ? 'Libros del dueño' : 'Owner books',
    )
    await card.locator('xpath=..').click()
    await expect(card).toBeChecked()
    await expect(page.getByRole('radio', { name: es ? /Guerrero/ : /Fighter/ })).toBeAttached()
    await audit(page)
    await capture(page, `${evidence}/wizard-${language}-${theme}-${info.project.name}.png`)
  })

test('RYT-168 a blank sheet takes a pack class with its table and first-level feature', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByText('En blanco', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('combobox', { name: 'Clase' }).click()
  await page.getByRole('option', { name: 'Caballero rúnico' }).click()
  await page.getByRole('button', { name: 'Crear ficha' }).click()
  await expect(page.getByText('Caballero rúnico de nivel 1', { exact: false })).toBeVisible()
  const call = sent(fixture.calls, 'b00c5000--rune-knight').at(-1)!
  const body = JSON.stringify(call.body)
  expect(body).toContain('"hitDie":10')
  expect(body).toContain('"saves":["str","con"]')
  expect(body).toContain('feature.b00c5000--rune-carver')
})

test('RYT-168 level up offers the SRD subclass and a pack subclass of the class', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 2,
    sheetSubclass: '',
    partyLevel: 3,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Subir a nivel 3' }).click()
  const dialog = page.getByRole('dialog', { name: 'Subir a nivel 3' })
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  const group = dialog.getByRole('group', { name: /Subclase/ })
  await expect(group.getByRole('radio', { name: 'Colegio del conocimiento' })).toBeAttached()
  const pack = group.getByRole('radio', { name: 'Colegio de los gigantes' })
  await pack.locator('xpath=..').click()
  await expect(pack).toBeChecked()
  await audit(page, '[role="dialog"]')
  await capture(page, `${evidence}/subclass-es-default-${info.project.name}.png`)
  const adds = dialog
    .getByRole('group', { name: /^Conjuros nuevos/ })
    .getByRole('button', { name: /^Añadir / })
  await adds.first().click()
  await next.click()
  await dialog.getByRole('button', { name: 'Confirmar nivel 3' }).click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 3' })).toBeVisible()
  const build = fixture.calls.filter((call) => call.method === 'apply_level_up').at(-1)!.body
    .new_build as { subclassKey: string; subclass: string; features: { ref?: string }[] }
  expect(build.subclassKey).toBe('b00c5000--giant-blood')
  expect(build.subclass).toBe('Colegio de los gigantes')
  expect(build.features.map((feature) => feature.ref)).toContain('feature.b00c5000--giant-might')
})
