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
  // RYT-175: the card names its pack and the choice shows what the subclass gives now.
  await expect(
    group.locator('label.levelup-choice', { hasText: 'Colegio de los gigantes' }),
  ).toContainText('Libros del dueño')
  await expect(
    group.getByRole('region', { name: 'Rasgos que ganas a nivel 3' }).getByRole('listitem'),
  ).toContainText(['Poder del gigante'])
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

// RYT-175: the screens that choose a subclass read it from the campaign's packs.
const packEvidence = 'docs/evidence/ui-review/ryt-175'

test('RYT-175 a blank sheet at level 3 takes a pack subclass that gives spellcasting', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByText('En blanco', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  // The subclass is asked from the level the class gives it.
  await expect(page.getByRole('combobox', { name: 'Subclase' })).toHaveCount(0)
  const raise = page.getByRole('button', { name: 'Subir nivel', exact: true })
  await raise.click()
  await raise.click()
  const subclass = page.getByRole('combobox', { name: 'Subclase' })
  await expect(subclass).toHaveValue('Aún sin subclase')
  await subclass.click()
  await page.getByRole('option', { name: 'Filo arcano · Libros del dueño' }).click()
  await audit(page)
  await capture(page, `${packEvidence}/blank-subclass-${info.project.name}.png`)
  await page.getByRole('button', { name: 'Crear ficha' }).click()
  await expect(page.getByText('de nivel 3', { exact: false }).first()).toBeVisible()
  const body = JSON.stringify(sent(fixture.calls, 'b00c5000--spell-blade').at(-1)!.body)
  expect(body).toContain('"subclassKey":"b00c5000--spell-blade"')
  expect(body).toContain('"subclass":"Filo arcano"')
  expect(body).toContain('"casterKind":"third"')
  expect(body).toContain('"spellAbility":"int"')
  expect(body).toContain('feature.b00c5000--warding-blade')
})

test('RYT-175 the sheet library adds a feat once', async ({ page }, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: /^Rasgos/ }).click()
  await page.getByRole('button', { name: 'Añadir desde la biblioteca' }).click()
  const library = page.getByRole('dialog', { name: 'Biblioteca' })
  await library.getByRole('tab', { name: 'Dotes' }).click()
  // Feats have no class: the class filter leaves with the tab.
  await expect(library.getByRole('combobox', { name: 'Clase' })).toHaveCount(0)
  await expect(
    library.getByRole('switch', { name: 'Incluir dotes por encima de tu nivel' }),
  ).toBeAttached()
  await library.getByLabel('Buscar').fill('pendenciero')
  await expect(library.locator('.library-row')).toContainText('Libros del dueño')
  await audit(page, '[role="dialog"]')
  await capture(page, `${packEvidence}/library-feats-${info.project.name}.png`, {
    fullPage: false,
  })
  await library.getByRole('button', { name: 'Añadir Pendenciero', exact: true }).click()
  await expect(
    library.getByRole('button', { name: 'Pendenciero ya está en la ficha', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /^Rasgos/ })).toContainText('Pendenciero')
})
