import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'

// RYT-094 (ADR 051): the bestiary reads creatures from the packs the campaign enabled in Content,
// keeps its own versions of them, and hides single creatures.
const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
/** Phones open the stat block in a full screen sheet; from 48em it opens in a pane beside the list. */
const sheet = (info: TestInfo) => (info.project.use.viewport?.width ?? 1440) < 768
async function evidence(page: Page, info: TestInfo, name: string) {
  const s = size(info.project.name)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-094/${name}-${s}.png` })
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
const content = `#/campaign/${campaignId}/members?panel=content`

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
async function start(page: Page, server: ReturnType<typeof combatServer>) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
}

test('RYT-094 the bestiary reads the SRD pack, edits a creature in place and hides it', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await start(page, server)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)

  // The SRD creatures pack, loaded from the library at the campaign's version.
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 15_000 })
  // The way to the packs: an entry of the `···` menu beside Filters, at every width.
  await page.getByRole('button', { name: 'Más acciones del bestiario' }).click()
  await expect(page.getByRole('menuitem', { name: 'Paquetes de criaturas' })).toHaveAttribute(
    'href',
    content,
  )
  await page.keyboard.press('Escape')
  await audit(page)
  await evidence(page, info, 'list')

  // Edit in place: the change is a campaign version listed instead of the pack's wolf.
  let pane = await open(page, info, 'lobo', 'Lobo')
  await expect(pane.getByRole('button', { name: 'Personalizar' })).toHaveCount(0)
  await pane.getByRole('button', { name: 'Más acciones para Lobo' }).click()
  await page.getByRole('menuitem', { name: 'Editar', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Editar Lobo en esta campaña' })
  await editor.getByRole('textbox', { name: 'Clase de armadura' }).fill('14')
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(page.getByText('Guardado solo en esta campaña: Lobo.').first()).toBeVisible()
  await expect(detail(page, info).getByText('Modificada en esta campaña')).toBeVisible()
  await expect
    .poll(() => server.templates.filter((t) => t.srd_override === true).map((t) => t.srd_id))
    .toEqual(['wolf'])
  await closeSheet(page, info)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await expect(rows(page, 'Lobo')).toHaveCount(1)
  // The version still belongs to its pack's source.
  await page.locator('.bst-source label', { hasText: 'SRD' }).click()
  await expect(rows(page, 'Lobo')).toHaveCount(1)
  await page.locator('.bst-source label', { hasText: 'Todas' }).click()

  // Back to the pack's version: the campaign version is deleted after a question.
  pane = await open(page, info, 'lobo', 'Lobo')
  await expectTouchTargets(page, '.bst-version-note button')
  await audit(page, sheet(info) ? '.bst-sheet' : '.bst-detail')
  await evidence(page, info, 'version')
  await pane.getByRole('button', { name: 'Volver a la versión del paquete' }).click()
  const back = page.getByRole('dialog', { name: '¿Volver a la versión del paquete de Lobo?' })
  await audit(page, '[role="dialog"]')
  await back.getByRole('button', { name: 'Volver a la versión del paquete' }).click()
  await expect(page.getByText('Lobo vuelve a ser la versión del paquete.').first()).toBeVisible()
  await expect(
    detail(page, info).getByRole('button', { name: 'Más acciones para Lobo' }),
  ).toBeFocused()
  expect(server.templates.some((t) => t.srd_override === true)).toBe(false)

  // Hide one creature: no question, since Content shows it again.
  pane = detail(page, info)
  const more = pane.getByRole('button', { name: 'Más acciones para Lobo' })
  await more.click()
  await page.getByRole('menuitem', { name: 'Ocultar en esta campaña' }).click()
  await expect(
    page
      .getByText('Lobo ya no aparece en esta campaña. Puedes mostrarla de nuevo en Contenido.')
      .first(),
  ).toBeVisible()
  expect([...server.official.removed]).toEqual(['wolf'])
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await expect(rows(page, 'Lobo')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('RYT-094 with no creature pack, the bestiary and the fight screens lead to Content', async ({
  page,
}) => {
  const server = combatServer()
  server.official.downloaded = false
  await start(page, server)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)

  // No creatures at all: one invitation, nothing to search yet.
  const choose = page.getByRole('link', { name: 'Elegir en Contenido' })
  await expect(choose).toBeVisible({ timeout: 15_000 })
  await expect(choose).toHaveAttribute('href', content)
  await expect(page.getByText('Esta campaña aún no tiene criaturas')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Buscar criatura' })).toHaveCount(0)
  await expectTouchTargets(page, '.bst-official-empty a')
  await audit(page)

  // With its own creatures, a quiet line above them.
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
  await page.reload()
  await expect(page.getByText('Esta campaña no usa paquetes de criaturas.')).toBeVisible({
    timeout: 15_000,
  })
  await expect(rows(page, 'Capitán orco')).toHaveCount(1)
  await expectTouchTargets(page, '.bst-official-line a')
  await audit(page)

  // A fight: encounter ideas and adding combatants say why and lead to Content.
  const created = server.act('create_encounter', {
    encounter_name: 'Cripta',
    request_id: 'crypt',
  }) as { encounter_id: string }
  await page.goto(`./#/campaign/${campaignId}/combat/${created.encounter_id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Cripta' })).toBeVisible({
    timeout: 15_000,
  })
  const card = page.getByRole('region', { name: 'Dificultad del encuentro' })
  await card.getByRole('button', { name: 'Sugerir criaturas' }).click()
  const ideas = page.getByRole('dialog', { name: 'Sugerir criaturas para Cripta' })
  await expect(ideas).toContainText('Esta campaña no usa paquetes de criaturas.')
  await expect(ideas.getByRole('link', { name: 'Elegir en Contenido' })).toHaveAttribute(
    'href',
    content,
  )
  await audit(page, '[role="dialog"]')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Añadir combatientes' }).click()
  const link = page.getByRole('link', { name: 'Elegir en Contenido' })
  await expect(link).toHaveAttribute('href', content)
  expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44)
})

test('RYT-094 two creature packs: a source list, the pack on each row, its creatures in fights', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  server.official.north = true
  await start(page, server)
  const created = server.act('create_encounter', {
    encounter_name: 'Paso helado',
    request_id: 'pass',
  }) as { encounter_id: string }
  await page.goto(
    `./#/campaign/${campaignId}/members?panel=bestiary&encounter=${created.encounter_id}`,
  )
  await expect(page.getByText('332 criaturas', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('yeti')
  await expect(rows(page, 'Yeti')).toContainText('Bestias del Norte')
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('')

  // Several packs: one list of sources instead of segments.
  const source = page.getByRole('combobox', { name: 'Origen' })
  await source.click()
  await page.getByRole('option', { name: 'Bestias del Norte' }).click()
  await expect(page.getByText('2 criaturas', { exact: true })).toBeVisible()
  await audit(page)
  await evidence(page, info, 'two-packs')

  // A pack creature joins the fight with its pack reference.
  const pane = await open(page, info, 'yeti', 'Yeti')
  await pane.getByRole('button', { name: 'Añadir a Paso helado', exact: true }).click()
  const fight = server.encounters.find((e) => e.id === created.encounter_id)!
  await expect.poll(() => fight.combatants.map((c) => c.srd_id)).toEqual(['abcdef12--yeti'])
})

test('RYT-094 an unreachable library shows a retryable error, never the bundled creatures', async ({
  page,
}) => {
  const server = combatServer()
  server.official.unreachable = true
  await start(page, server)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  const retry = page.getByRole('button', { name: 'Reintentar' })
  await expect(retry).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.bst-row')).toHaveCount(0)
  // Only the error: no empty list, no filters that would suggest the bestiary was emptied.
  await expect(page.getByText('Aún no hay criaturas.')).toHaveCount(0)
  await expect(page.getByRole('searchbox', { name: 'Buscar criatura' })).toHaveCount(0)
  await audit(page)
  server.official.unreachable = false
  await retry.click()
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 15_000 })
})

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-094 two packs and no pack, in every theme and language (${language}, ${theme})`, async ({
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
    const server = combatServer()
    server.official.north = true
    await start(page, server)
    await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
    await expect(
      page.getByText(es ? '332 criaturas' : '332 creatures', { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    })
    await page
      .getByRole('searchbox', { name: es ? 'Buscar criatura' : 'Search creatures' })
      .fill('lob')
    await expect(page.locator('.bst-row').first()).toContainText('SRD')
    await audit(page)
    const shot = (name: string) =>
      process.env.RYT_EVIDENCE
        ? page.screenshot({
            path: `docs/evidence/ui-review/ryt-094/${name}-${language}-${theme}-${size(info.project.name)}.png`,
          })
        : Promise.resolve()
    await page.locator('.bst-row').first().scrollIntoViewIfNeeded()
    await shot('two-packs')
    server.official.downloaded = false
    server.official.north = false
    await page.reload()
    await expect(
      page.getByRole('link', { name: es ? 'Elegir en Contenido' : 'Choose in Content' }),
    ).toBeVisible({ timeout: 15_000 })
    await audit(page)
    await page.locator('.bst-official-empty').scrollIntoViewIfNeeded()
    await shot('no-packs')
  })
}
