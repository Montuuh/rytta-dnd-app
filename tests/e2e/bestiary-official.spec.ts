import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'

// RYT-089 (ADR 039): each campaign downloads the official bestiary and keeps its own versions.
const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
/** Below 62em the stat block opens in a full screen sheet instead of the side pane. */
const sheet = (info: TestInfo) => (info.project.use.viewport?.width ?? 1440) < 992
async function evidence(page: Page, info: TestInfo, name: string) {
  const s = size(info.project.name)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-089/${name}-${s}.png` })
}
async function audit(page: Page, scope = 'body') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .include(scope)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}
const detail = (page: Page, info: TestInfo): Locator =>
  sheet(info) ? page.locator('.bst-sheet') : page.locator('.bst-detail')
/** List rows by the creature's own name (not its gloss in the other language or its monogram). */
const rows = (page: Page, name: string) =>
  page.locator('.bst-row').filter({ has: page.getByText(name, { exact: true }) })

async function open(page: Page, info: TestInfo, query: string, name: string) {
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill(query)
  await rows(page, name).first().locator('.bst-row-main').click()
  return detail(page, info)
}
async function closeSheet(page: Page, info: TestInfo) {
  if (!sheet(info)) return
  await page.keyboard.press('Escape')
  await expect(page.locator('.bst-sheet')).toHaveCount(0)
}

test('RYT-089 the DM downloads the official bestiary, edits a creature in place and removes it', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const server = combatServer()
  server.official.downloaded = false
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)

  // A campaign without creatures: one invitation, nothing to search yet.
  const download = page.getByRole('button', { name: 'Descargar bestiario oficial' })
  await expect(download).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Esta campaña aún no tiene criaturas')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Buscar criatura' })).toHaveCount(0)
  await expectTouchTargets(page, '.bst-official-empty button')
  await audit(page)
  await evidence(page, info, 'empty')

  // Download: a question with the count, then the 330 official creatures.
  await download.click()
  const ask = page.getByRole('dialog', { name: '¿Descargar el bestiario oficial?' })
  await expect(ask).toContainText('330 criaturas del SRD 5.2.1')
  await audit(page, '[role="dialog"]')
  await evidence(page, info, 'download')
  await ask.getByRole('button', { name: 'Cancelar' }).click()
  await expect(ask).toHaveCount(0)
  await expect(download).toBeFocused()
  expect(server.official.downloaded).toBe(false)
  await download.click()
  await ask.getByRole('button', { name: 'Descargar 330 criaturas' }).click()
  await expect(page.getByText('Bestiario oficial descargado: 330 criaturas.')).toBeVisible()
  expect(server.official.downloaded).toBe(true)
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible()

  // Edit in place: the change is a campaign version listed instead of the official wolf.
  let pane = await open(page, info, 'lobo', 'Lobo')
  await expect(pane.getByRole('button', { name: 'Personalizar' })).toHaveCount(0)
  await pane.getByRole('button', { name: 'Editar', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar Lobo en esta campaña' })
  await expect(editor).toBeVisible()
  // Saved untouched it stays the official wolf: no version.
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(editor).toHaveCount(0)
  expect(server.templates.some((t) => t.srd_override === true)).toBe(false)
  await pane.getByRole('button', { name: 'Editar', exact: true }).click()
  await editor.getByRole('textbox', { name: 'Clase de armadura' }).fill('14')
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(page.getByText('Guardado solo en esta campaña: Lobo.').first()).toBeVisible()
  // The sheet or pane stays on the creature, now its version, with focus back on Edit.
  await expect(detail(page, info).getByText('Modificada en esta campaña')).toBeVisible()
  await expect(
    detail(page, info).getByRole('button', { name: 'Editar', exact: true }),
  ).toBeFocused()
  await expect
    .poll(() => server.templates.filter((t) => t.srd_override === true).map((t) => t.srd_id))
    .toEqual(['wolf'])
  await closeSheet(page, info)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await expect(rows(page, 'Lobo')).toHaveCount(1)
  await expect(rows(page, 'Lobo').first()).toContainText('Modificada')
  // The version is still part of the official catalogue tab.
  await page.locator('.bst-source label', { hasText: 'SRD' }).click()
  await expect(rows(page, 'Lobo')).toHaveCount(1)
  await page.locator('.bst-source label', { hasText: 'Todas' }).click()

  // Back to the official creature: the version is deleted after a question.
  pane = await open(page, info, 'lobo', 'Lobo')
  await expect(pane.getByText('Modificada en esta campaña')).toBeVisible()
  await expectTouchTargets(page, '.bst-version-note button')
  await audit(page, sheet(info) ? '.bst-sheet' : '.bst-detail')
  await evidence(page, info, 'version')
  await pane.getByRole('button', { name: 'Volver a la versión oficial' }).click()
  const back = page.getByRole('dialog', { name: '¿Volver a la versión oficial de Lobo?' })
  await back.getByRole('button', { name: 'Volver a la versión oficial' }).click()
  await expect(page.getByText('Lobo vuelve a ser la versión oficial.').first()).toBeVisible()
  // Focus stays on the creature: its Edit button, now the official wolf's.
  await expect(
    detail(page, info).getByRole('button', { name: 'Editar', exact: true }),
  ).toBeFocused()
  expect(server.templates.some((t) => t.srd_override === true)).toBe(false)

  // Remove one official creature from the campaign.
  pane = detail(page, info)
  await pane.getByRole('button', { name: 'Más acciones para Lobo' }).click()
  await page.getByRole('menuitem', { name: 'Quitar de esta campaña' }).click()
  const remove = page.getByRole('dialog', { name: '¿Quitar Lobo de esta campaña?' })
  await audit(page, '[role="dialog"]')
  await remove.getByRole('button', { name: 'Quitar Lobo' }).click()
  await expect(
    page.getByText('Lobo ya no está en el bestiario de la campaña.').first(),
  ).toBeVisible()
  expect([...server.official.removed]).toEqual(['wolf'])
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await expect(rows(page, 'Lobo')).toHaveCount(0)

  // The official bestiary's menu brings it back, or removes the whole official bestiary.
  const menu = page.getByRole('button', { name: 'Bestiario oficial', exact: true })
  await expectTouchTargets(page, '.bst-head-actions button')
  await menu.click()
  await page.getByRole('menuitem', { name: 'Recuperar 1 criatura quitada' }).click()
  await page
    .getByRole('dialog', { name: '¿Recuperar las criaturas quitadas?' })
    .getByRole('button', { name: 'Recuperar 1 criatura' })
    .click()
  await expect(page.getByText('Recuperada 1 criatura oficial.')).toBeVisible()
  await expect(rows(page, 'Lobo')).toHaveCount(1)
  await menu.click()
  await page.getByRole('menuitem', { name: 'Quitar el bestiario oficial' }).click()
  const all = page.getByRole('dialog', { name: '¿Quitar el bestiario oficial de esta campaña?' })
  await all.getByRole('button', { name: 'Quitar el bestiario oficial' }).click()
  await expect(page.getByText('Bestiario oficial quitado de la campaña.')).toBeVisible()
  expect(server.official.downloaded).toBe(false)
  await expect(download).toBeVisible()
  await expect(download).toBeFocused()
  expect(errors).toEqual([])
})

test('RYT-089 a campaign with its own creatures and no official bestiary keeps them listed', async ({
  page,
}) => {
  const server = combatServer()
  server.official.downloaded = false
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  server.act('save_combatant_template', {
    target_template: null,
    expected_revision: null,
    data: {
      name: 'Capitán orco',
      side: 'enemy',
      max_hp: 40,
      armor_class: 16,
      initiative_bonus: 1,
      legendary_max: 0,
      notes: '',
    },
    request_id: crypto.randomUUID(),
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByText('El bestiario oficial no está en esta campaña.')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('1 criatura', { exact: true })).toBeVisible()
  await expect(rows(page, 'Capitán orco')).toHaveCount(1)
  await expectTouchTargets(page, '.bst-official-line button')
  await audit(page)
})

test('RYT-089 without the official bestiary, the fight screens say why and lead to the bestiary', async ({
  page,
}) => {
  const server = combatServer()
  server.official.downloaded = false
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  const created = server.act('create_encounter', {
    encounter_name: 'Cripta',
    request_id: 'crypt',
  }) as { encounter_id: string }
  await page.goto(`./#/campaign/${campaignId}/combat/${created.encounter_id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Cripta' })).toBeVisible({
    timeout: 15_000,
  })
  const bestiary = `#/campaign/${campaignId}/members?panel=bestiary`

  // Encounter ideas: the reason and the way, instead of advice about creature types.
  const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
  await card.getByRole('button', { name: 'Sugerir criaturas' }).click()
  const ideas = page.getByRole('dialog', { name: 'Sugerir criaturas para Cripta' })
  await expect(ideas).toContainText('Esta campaña no tiene el bestiario oficial.')
  await expect(ideas).not.toContainText('Prueba otro tipo')
  await expect(ideas.getByRole('link', { name: 'Abrir el bestiario' })).toHaveAttribute(
    'href',
    bestiary,
  )
  await audit(page, '[role="dialog"]')
  await page.keyboard.press('Escape')

  // Adding combatants: the search names the campaign's creatures and links to the bestiary.
  await page.getByRole('tab', { name: 'Añadir combatientes' }).click()
  await expect(page.getByText('Escribe para buscar entre tus criaturas.')).toBeVisible()
  const link = page.getByRole('link', { name: 'Abrir el bestiario' })
  await expect(link).toHaveAttribute('href', bestiary)
  expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await link.click()
  await expect(page.getByRole('button', { name: 'Descargar bestiario oficial' })).toBeVisible({
    timeout: 15_000,
  })
})
