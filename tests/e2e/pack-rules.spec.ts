import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, characterId, identityFixture, rulePackState } from './fixtures/identity.ts'

// RYT-164, RYT-165 (ADR 051): spells, class features and rules come from the campaign's packs.
// A hidden entry is no longer offered but stays where a character has it; without the library the
// sheet keeps working and rule texts offer a retry.
const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
}

test.beforeEach(() => {
  rulePackState.hidden = []
  rulePackState.unreachable = false
})
test.afterEach(() => {
  rulePackState.hidden = []
  rulePackState.unreachable = false
})

test('RYT-164 a hidden spell stays on the sheet that has it and is no longer offered', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.hp-current')).toHaveText('30')
  await page.getByRole('button', { name: /^Conjuros/ }).click()
  await page.getByRole('button', { name: 'Añadir desde la biblioteca' }).click()
  const library = page.getByRole('dialog', { name: 'Biblioteca' })
  await library.getByLabel('Buscar').fill('curar heridas')
  await library.getByRole('button', { name: 'Añadir Curar heridas', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Conjuros' })).toContainText('Curar heridas')

  // The DM hides it: the sheet keeps it, the library no longer offers it.
  rulePackState.hidden = ['spell.cure-wounds']
  await page.reload()
  await expect(page.locator('.hp-current')).toHaveText('30')
  await page.getByRole('button', { name: /^Conjuros/ }).click()
  const spells = page.getByRole('dialog', { name: 'Conjuros' })
  await expect(spells).toContainText('Curar heridas')
  await spells.getByRole('button', { name: 'Añadir desde la biblioteca' }).click()
  await library.getByLabel('Buscar').fill('curar heridas')
  await expect(library.getByRole('button', { name: /Curar heridas/ })).toHaveCount(0)
  // Other spells are still offered.
  await library.getByLabel('Buscar').fill('')
  await expect(library.getByRole('button', { name: /^Añadir / }).first()).toBeVisible()
  await audit(page)
})

test('RYT-165 a hidden rule leaves the glossary search but keeps its definition where it is linked', async ({
  page,
}) => {
  rulePackState.hidden = ['condition.grappled']
  await identityFixture(page, { player: true, modules: ['party', 'glossary'], sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/glossary`)
  // One entry fewer than the 838 of the SRD.
  await expect(page.getByText('837 entradas')).toBeVisible({ timeout: 15_000 })
  const search = page.getByRole('searchbox').first()
  await expect(search).toBeVisible({ timeout: 15_000 })
  await search.fill('agarrado')
  await expect(page.getByRole('link', { name: /^Agarrado/ })).toHaveCount(0)
  await search.fill('cegado')
  await expect(page.getByRole('link', { name: /^Cegado/ }).first()).toBeVisible()
  await audit(page)
})

test('RYT-164 without the library the sheet keeps working and rule texts offer a retry', async ({
  page,
}) => {
  rulePackState.unreachable = true
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  // Hit points, stored choices and rolls come from the character itself.
  await expect(page.locator('.hp-current')).toHaveText('30', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Iniciativa: ver definición' }).click()
  const retry = page
    .getByRole('dialog', { name: 'Glosario' })
    .getByRole('button', { name: 'Reintentar' })
  await expect(retry).toBeVisible()
  await audit(page)
  if (process.env.RYT_EVIDENCE)
    await page.screenshot({
      path: `docs/evidence/ui-review/ryt-164/offline-definition-${test.info().project.name}.png`,
    })
  // The library returns: the definition loads.
  rulePackState.unreachable = false
  await retry.click()
  await expect(page.locator('.gl-sheet-headword')).toHaveText('Iniciativa')
  await expect(page.locator('.gl-sheet-headword')).toBeFocused()
})

test('RYT-164 a blank sheet waits for the library with a retry, then creates the character', async ({
  page,
}) => {
  rulePackState.unreachable = true
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByText('En blanco', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ficha en blanco')
  // RYT-167: the classes come from the library too, so none is offered until it answers.
  const wait = page.getByRole('alert').filter({ hasText: 'No se pudieron cargar las reglas' })
  await expect(wait).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Crear ficha' })).toBeDisabled()
  await audit(page)
  if (process.env.RYT_EVIDENCE)
    await page.screenshot({
      path: `docs/evidence/ui-review/ryt-164/blank-wait-${test.info().project.name}.png`,
    })
  rulePackState.unreachable = false
  await wait.getByRole('button', { name: 'Reintentar' }).click()
  await expect(wait).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Clase' }).click()
  await page.getByRole('option', { name: 'Paladín' }).click()
  await page.getByRole('button', { name: 'Crear ficha' }).click()
  await expect(page.getByText('Paladín de nivel 1', { exact: false })).toBeVisible()
})

test('RYT-167 the class step says the classes are loading and retries when the library fails', async ({
  page,
}, info) => {
  rulePackState.unreachable = true
  try {
    await identityFixture(page, { player: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`./#/campaign/${campaignId}/party`)
    await page.getByRole('button', { name: 'Terminar ficha' }).click()
    await page.getByRole('dialog').getByText('Completa', { exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
    const wait = page
      .getByRole('alert')
      .filter({ hasText: 'No se pudieron cargar las clases de la campaña.' })
    await expect(wait).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('radio', { name: /Guerrero/ })).toHaveCount(0)
    await audit(page)
    if (process.env.RYT_CAPTURE)
      await page.screenshot({
        path: `docs/evidence/ui-review/ryt-167/classes-wait-${info.project.name}.png`,
      })
    rulePackState.unreachable = false
    await wait.getByRole('button', { name: 'Reintentar' }).click()
    await expect(wait).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /Guerrero/ })).toBeAttached()
  } finally {
    rulePackState.unreachable = false
  }
})
