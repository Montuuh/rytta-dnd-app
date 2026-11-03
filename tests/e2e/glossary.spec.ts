import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, characterId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'

const glossaryUrl = `./#/campaign/${campaignId}/glossary`
const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
/** Below 62em the reader replaces the index (phones and portrait tablets). */
const narrow = (page: Page) => page.viewportSize()!.width < 992
const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null

/** RYT-008 evidence: screenshots for 390px and tablet, opt-in with RYT_EVIDENCE. */
async function evidence(page: Page, project: string, name: string, ticket = 'RYT-008') {
  const s = size(project)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({
      path: `docs/evidence/${ticket}/${name}-${s}.png`,
      // Fixed sheets and drawers only make sense against the viewport.
      fullPage: (await page.getByRole('dialog').count()) === 0,
    })
}
/** Below 48em the bottom bar replaces the top row and entry actions fold into one menu. */
const phone = (page: Page) => page.viewportSize()!.width < 768
/** Edit and delete are icon buttons from 48em; on phones they live in the entry's menu. */
async function entryAction(page: Page, scope: Locator, name: string, action: 'edit' | 'delete') {
  if (phone(page)) {
    await scope.getByRole('button', { name: `Acciones de «${name}»` }).click()
    await page
      .getByRole('menuitem', { name: action === 'edit' ? 'Editar entrada' : 'Eliminar entrada' })
      .click()
  } else
    await scope
      .getByRole('button', { name: `${action === 'edit' ? 'Editar' : 'Eliminar'} «${name}»` })
      .click()
}
/** Where focus returns after an entry action's overlay closes. */
const actionTrigger = (page: Page, scope: Locator, name: string, action: 'edit' | 'delete') =>
  phone(page)
    ? scope.getByRole('button', { name: `Acciones de «${name}»` })
    : scope.getByRole('button', {
        name: `${action === 'edit' ? 'Editar' : 'Eliminar'} «${name}»`,
      })
const houseRuleId = '50000000-0000-4000-8000-000000000001'
async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  // Controls are 44px; inline term links keep text flow and get a 44px hit area instead.
  await expectTouchTargets(
    page,
    'main button:visible:not(.glossary-term), [role="dialog"] button:visible:not(.glossary-term)',
  )
  const hits = await page.locator('.glossary-term:visible').evaluateAll((terms) =>
    terms.map((el) => {
      const after = getComputedStyle(el, '::after')
      return el.getBoundingClientRect().height - parseFloat(after.top) - parseFloat(after.bottom)
    }),
  )
  for (const hit of hits) expect(hit).toBeGreaterThanOrEqual(44)
}

test('keyboard search finds a condition in either language and shows its quick facts', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await identityFixture(page, { player: true, modules: ['party', 'glossary'], sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(glossaryUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Glosario' })).toBeVisible()
  await expect(page.getByText('550 entradas')).toBeVisible()
  await evidence(page, info.project.name, 'index')
  await page.locator('body').press('/')
  const search = page.getByRole('searchbox', { name: 'Buscar en el glosario' })
  await expect(search).toBeFocused()
  // English name in a Spanish interface.
  // Real typing on the 550-entry "All" tab must keep every keystroke (ui-ux F1).
  await search.pressSequentially('grappled', { delay: 40 })
  await expect(search).toHaveValue('grappled')
  await expect(page.getByText('1 entrada', { exact: true })).toBeVisible()
  await search.press('Enter')
  await expect(page).toHaveURL(/glossary\/condition\.grappled/)
  const headword = page.getByRole('heading', { name: 'Agarrado', exact: true })
  await expect(headword).toBeVisible()
  // Enter moves focus to the opened headword (ui-ux F6).
  await expect(headword).toBeFocused()
  await expect(page.getByText('Inglés:')).toBeVisible()
  const facts = page.getByRole('region', { name: 'De un vistazo' })
  await expect(facts).toContainText('Escapar')
  await expect(facts).toContainText('Atletismo')
  await expect(facts).toContainText('CD 8 + modificador por Fuerza')
  // The 2014 rule is folded and opens on demand.
  await page.getByRole('button', { name: /Regla 2014/ }).click()
  await expect(page.getByText('no puede beneficiarse de ningún bonificador')).toBeVisible()
  await audit(page)
  await evidence(page, info.project.name, 'entry-grappled')
  // Search by alias, empty state and category tabs.
  if (narrow(page)) {
    // Back from the reader returns to the same row of the index (ui-ux F4).
    await page.getByRole('link', { name: 'Todas las entradas' }).click()
    await expect(page.getByRole('link', { name: /^Agarrado/ })).toBeFocused()
  }
  await search.fill('agotamiento')
  await expect(page.getByRole('link', { name: /Cansancio/ })).toBeVisible()
  // Arrow keys move between the search field and the results (ui-ux F5).
  await search.press('ArrowDown')
  await expect(page.getByRole('link', { name: /Cansancio/ })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(search).toBeFocused()
  await search.fill('zzzz')
  await expect(page.getByText('Ninguna entrada coincide con «zzzz».')).toBeVisible()
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await page.getByRole('tab', { name: /Conjuros/ }).click()
  await expect(page.getByText('339 entradas')).toBeVisible()
  await page.getByRole('button', { name: 'Filtros de conjuros' }).click()
  await page.getByLabel('Solo rituales').check()
  await expect(page.getByRole('button', { name: /Ver conjuros/ })).toBeVisible()
  await audit(page)
  await evidence(page, info.project.name, 'spell-filters')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '1 filtro activo' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a rules term on the character sheet opens its definition in place', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  const term = page.getByRole('button', { name: 'Atletismo: ver definición' })
  await term.click()
  const sheet = page.getByRole('dialog', { name: 'Atletismo' })
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Prueba de Fuerza (Atletismo).')
  await page.keyboard.press('Escape')
  await expect(term).toBeFocused()
  // Nested terms keep a history with a back control.
  const armor = page.getByRole('button', { name: /^Clase de armadura: ver definición$/i })
  await armor.click()
  await page
    .getByRole('dialog', { name: /Clase de armadura/i })
    .getByRole('button', { name: 'tirada de ataque: ver definición' })
    .click()
  const headword = page.locator('.gl-sheet-headword')
  await expect(headword).toHaveText('Tirada de ataque')
  await expect(headword).toBeFocused()
  await audit(page)
  await evidence(page, info.project.name, 'sheet-reference')
  await page.getByRole('button', { name: /^Volver a Clase de armadura$/i }).click()
  // Going back keeps keyboard focus on the restored headword (ui-ux F3).
  await expect(headword).toHaveText(/^Clase de armadura$/i)
  await expect(headword).toBeFocused()
  // With the module off for Players there is no page link, but definitions still work.
  await expect(page.getByRole('link', { name: 'Abrir en el glosario' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(armor).toBeFocused()
  await expect(page.getByRole('link', { name: 'Glosario' })).toHaveCount(0)
})

test('Players with the module off see a clear note instead of the glossary page', async ({
  page,
}) => {
  await identityFixture(page, { player: true })
  await page.goto(glossaryUrl)
  await expect(page.getByText('Tu DM aún no ha abierto el glosario a los jugadores.')).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)
})

test('a Player creates, edits and deletes campaign homebrew; house rules join SRD entries', async ({
  page,
}, info) => {
  // Long flow (create, edit, delete) with axe audits.
  test.setTimeout(60_000)
  await identityFixture(page, { player: true, modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  const article = page.locator('article.gl-entry')
  await expect(article.getByRole('heading', { name: 'Descanso largo' })).toBeVisible()
  await expect(article.getByRole('complementary', { name: 'Regla de la casa' })).toContainText(
    'Un descanso largo dura una semana',
  )
  await evidence(page, info.project.name, 'house-rule')
  if (narrow(page)) await page.getByRole('link', { name: 'Todas las entradas' }).click()
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  const editor = page.getByRole('dialog', { name: 'Nueva entrada' })
  await editor.getByRole('textbox', { name: /^Nombre/ }).fill('Mano Hundida')
  await editor.getByLabel('Otros nombres').fill('La fortaleza, la Mano')
  await editor.getByLabel('Resumen').fill('La fortaleza del grupo, hundida en la marisma.')
  await editor.getByLabel('Descripción').fill('Quien entra queda agarrado por el barro.')
  await editor.getByRole('button', { name: 'Añadir un dato' }).click()
  await editor.getByLabel('Etiqueta').fill('Ubicación')
  await editor.getByLabel('Valor').fill('Marisma de Rytta')
  await audit(page)
  await evidence(page, info.project.name, 'homebrew-editor')
  await editor.getByRole('button', { name: 'Guardar entrada' }).click()
  await expect(page.getByRole('heading', { name: 'Mano Hundida' })).toBeVisible()
  // Saving moves focus to the saved headword (ui-ux F6).
  await expect(page.getByRole('heading', { name: 'Mano Hundida' })).toBeFocused()
  // User text is plain and still links rules terms.
  await expect(
    page.locator('article.gl-entry').getByRole('button', { name: 'agarrado: ver definición' }),
  ).toBeVisible()
  await entryAction(page, article, 'Mano Hundida', 'edit')
  await page
    .getByRole('dialog', { name: 'Editar entrada' })
    .getByRole('textbox', { name: /^Nombre/ })
    .fill('Mano Hundida (fortaleza)')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('heading', { name: 'Mano Hundida (fortaleza)' })).toBeVisible()
  await entryAction(page, article, 'Mano Hundida (fortaleza)', 'delete')
  await page
    .getByRole('dialog', { name: '¿Eliminar «Mano Hundida (fortaleza)»?' })
    .getByRole('button', { name: 'Eliminar entrada' })
    .click()
  await expect(page).not.toHaveURL(/homebrew\./)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('tab', { name: /Homebrew/ }).click()
  await expect(page.getByRole('link', { name: /Descanso duro/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mano Hundida/ })).toHaveCount(0)
})

test('the DM edits a house rule where it appears and recovers from a stale revision', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const f = await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  const house = page.getByRole('complementary', { name: 'Regla de la casa' })
  await expect(house).toContainText('Un descanso largo dura una semana')
  await evidence(page, info.project.name, 'house-rule-actions', 'RYT-040')
  // The SRD entry itself only offers a new house rule; the house rule offers edit and delete.
  const addRule = page.getByRole('button', {
    name: 'Añadir una regla de la casa a «Descanso largo»',
  })
  await expect(addRule).toBeVisible()
  // A visible label, not a bare glyph (ui-ux F5).
  await expect(addRule).toContainText('Regla de la casa')
  await entryAction(page, house, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  await expect(editor.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Descanso duro')
  await editor.getByLabel('Resumen').fill('Una semana, y en un lugar seguro.')
  await audit(page)
  await evidence(page, info.project.name, 'editor-edit', 'RYT-040')
  // Another member saves first: the form explains it and offers both ways out.
  f.changeHomebrew(houseRuleId, { summary: 'Cambiado por otra persona.' })
  await editor.getByRole('button', { name: 'Guardar cambios' }).click()
  const conflict = editor.getByRole('alert')
  await expect(conflict).toContainText('Esta entrada ha cambiado')
  // The conflict takes focus so its recovery actions are reachable (ui-ux F2), not body or H1.
  await expect(conflict).toBeFocused()
  await audit(page)
  await evidence(page, info.project.name, 'edit-conflict', 'RYT-040')
  await conflict.getByRole('button', { name: 'Cargar la actual' }).click()
  await expect(editor.getByLabel('Resumen')).toHaveValue('Cambiado por otra persona.')
  await expect(editor.getByRole('alert')).toHaveCount(0)
  // After loading the current version focus continues in the form.
  await expect(editor.getByRole('textbox', { name: /^Nombre/ })).toBeFocused()
  // A second conflict, this time saving over the other version.
  await editor.getByLabel('Resumen').fill('Una semana, en un lugar seguro.')
  f.changeHomebrew(houseRuleId, { body: 'Otro cambio.' })
  await editor.getByRole('button', { name: 'Guardar cambios' }).click()
  await editor.getByRole('button', { name: 'Guardar la mía' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(house).toContainText('Una semana, en un lugar seguro.')
  // The edit stays on the SRD entry and focus moves to its headword.
  await expect(page).toHaveURL(/glossary\/rule\.long-rest/)
  await expect(page.getByRole('heading', { name: 'Descanso largo', exact: true })).toBeFocused()
  const saves = f.calls.filter((call) => call.method === 'save_glossary_entry')
  expect(saves.map((call) => call.body.expected_revision)).toEqual([1, 2, 3])
  // Deleted by someone else while editing: the form says so and offers a way out (F4).
  await entryAction(page, house, 'Descanso duro', 'edit')
  f.removeHomebrew(houseRuleId)
  await editor.getByLabel('Resumen').fill('Ya no existe.')
  await editor.getByRole('button', { name: 'Guardar cambios' }).click()
  const gone = editor.getByRole('alert')
  await expect(gone).toContainText('Alguien eliminó esta entrada mientras la editabas.')
  await expect(gone).toBeFocused()
  await expect(editor.getByRole('button', { name: 'Eliminar entrada' })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'edit-gone', 'RYT-040')
  // Closing discards (after asking, the form is dirty); focus falls back to the headword (F6).
  await editor.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByRole('dialog', { name: '¿Descartar los cambios?' }).waitFor()
  await page.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(house).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Descanso largo', exact: true })).toBeFocused()
})

test('a deleted entry being edited can be saved as a new one', async ({ page }) => {
  test.setTimeout(60_000)
  const f = await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  const house = page.getByRole('complementary', { name: 'Regla de la casa' })
  await entryAction(page, house, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  f.removeHomebrew(houseRuleId)
  await editor.getByLabel('Resumen').fill('Recuperada como nueva.')
  await editor.getByRole('button', { name: 'Guardar cambios' }).click()
  await editor.getByRole('button', { name: 'Guardar como nueva' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(house).toContainText('Recuperada como nueva.')
  const saves = f.calls.filter((call) => call.method === 'save_glossary_entry')
  expect(saves.at(-1)?.body.expected_revision).toBeNull()
  expect(saves.at(-1)?.body.entry_id).not.toBe(houseRuleId)
})

test('background refreshes keep focus and typed text in the open editor', async ({ page }) => {
  test.setTimeout(60_000)
  await page.clock.install()
  const f = await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  const house = page.getByRole('complementary', { name: 'Regla de la casa' })
  await entryAction(page, house, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  const summary = editor.getByLabel('Resumen')
  await summary.fill('')
  await summary.pressSequentially('abc')
  // Another member saves and the list refreshes (the 60 s poll or a refocused tab).
  const before = f.calls.filter((call) => call.method === 'glossary_entries').length
  f.changeHomebrew(houseRuleId, { body: 'Otro cambio.' })
  await page.clock.fastForward(61_000)
  await expect
    .poll(() => f.calls.filter((call) => call.method === 'glossary_entries').length)
    .toBeGreaterThan(before)
  await page.waitForTimeout(400)
  await expect(summary).toBeFocused()
  await summary.pressSequentially('def')
  await expect(summary).toHaveValue('abcdef')
})

test('the editor footer reflows at 150% text on a phone without clipping Save', async ({
  page,
}, info) => {
  await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  await page.addStyleTag({ content: 'html { font-size: 150% }' })
  const house = page.getByRole('complementary', { name: 'Regla de la casa' })
  await entryAction(page, house, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  const save = editor.getByRole('button', { name: 'Guardar cambios' })
  await expect(save).toBeVisible()
  const width = page.viewportSize()!.width
  // The drawer may still be sliding in; measure once it has settled inside the viewport.
  await expect
    .poll(async () => {
      const b = await save.boundingBox()
      return b ? b.x + b.width : Infinity
    })
    .toBeLessThanOrEqual(width)
  const box = (await save.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.height).toBeGreaterThanOrEqual(44)
  const overflow = await editor
    .locator('.gl-editor-footer')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(editor.getByRole('button', { name: 'Eliminar entrada' })).toBeVisible()
  await evidence(page, info.project.name, 'editor-150', 'RYT-040')
})

for (const scale of [100, 150]) {
  test(`focused fields stay clear of the sticky editor footer at ${scale}% text`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000)
    await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${glossaryUrl}/rule.long-rest`)
    if (scale !== 100) await page.addStyleTag({ content: `html { font-size: ${scale}% }` })
    const house = page.getByRole('complementary', { name: 'Regla de la casa' })
    await entryAction(page, house, 'Descanso duro', 'edit')
    const editor = page.getByRole('dialog', { name: 'Editar entrada' })
    await editor.getByRole('button', { name: 'Añadir un dato' }).click()
    await editor.getByRole('button', { name: 'Añadir un dato' }).click()
    // The footer keeps the trash beside Cancel: two rows at most, even at large text. Count rows
    // by button centre (the row centres its items) rather than pixels: system fonts differ per
    // platform and the Linux runner already wraps at 100%.
    const footerRows = await editor.locator('.gl-editor-footer').evaluate((el) => {
      const centres = [...el.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect()
        return (r.top + r.bottom) / 2
      })
      return centres.filter((c, i) => centres.findIndex((o) => Math.abs(o - c) < 4) === i).length
    })
    expect(footerRows).toBeLessThanOrEqual(2)
    await editor.getByRole('textbox', { name: /^Nombre/ }).focus()
    let checked = 0
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      const probe = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const footer = document.querySelector('.gl-editor-footer')
        const drawer = document.querySelector('.gl-editor-drawer')
        if (!el || !footer || !drawer?.contains(el) || footer.contains(el)) return null
        const box = el.getBoundingClientRect()
        const visible = Math.min(box.bottom, footer.getBoundingClientRect().top) - box.top
        return {
          name: el.getAttribute('aria-label') || el.id || el.tagName,
          need: Math.min(box.height, 44),
          visible,
        }
      })
      if (!probe) continue
      checked++
      expect(probe.visible, `${probe.name} is under the footer`).toBeGreaterThanOrEqual(probe.need)
    }
    expect(checked).toBeGreaterThan(10)
    // Focus the last control above the footer, then audit that state.
    await editor.getByRole('button', { name: 'Añadir un dato' }).focus()
    await audit(page)
    await evidence(page, info.project.name, `editor-focus-${scale}`, 'RYT-040')
  })
}

test('a failed "Guardar como nueva" shows why instead of staying silent', async ({ page }) => {
  test.setTimeout(60_000)
  const f = await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  const house = page.getByRole('complementary', { name: 'Regla de la casa' })
  await entryAction(page, house, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  f.removeHomebrew(houseRuleId)
  await editor.getByLabel('Resumen').fill('Texto a rescatar.')
  await editor.getByRole('button', { name: 'Guardar cambios' }).click()
  const saveNew = editor.getByRole('button', { name: 'Guardar como nueva' })
  await expect(saveNew).toBeVisible()
  await page.context().setOffline(true)
  await saveNew.click()
  await expect(editor.getByRole('alert').filter({ hasText: 'No hay conexión' })).toBeVisible()
  // The deleted notice stays, and the edits are kept for another try.
  await expect(editor.getByText('Alguien eliminó esta entrada')).toBeVisible()
  await expect(editor.getByLabel('Resumen')).toHaveValue('Texto a rescatar.')
  await page.context().setOffline(false)
  await saveNew.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(house).toContainText('Texto a rescatar.')
})

test('closing a dirty editor asks before discarding the edits', async ({ page }) => {
  await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/homebrew.${houseRuleId}`)
  const article = page.locator('article.gl-entry')
  await entryAction(page, article, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  // Untouched: closes at once.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await entryAction(page, article, 'Descanso duro', 'edit')
  await editor.getByLabel('Resumen').fill('Cambio sin guardar.')
  await editor.getByRole('button', { name: 'Cancelar' }).click()
  const ask = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await expect(ask.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  // Escape closes only the question; the typed text is still there.
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(editor.getByLabel('Resumen')).toHaveValue('Cambio sin guardar.')
  await page.keyboard.press('Escape')
  await expect(ask).toBeVisible()
  await expect(ask.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  if (phone(page)) {
    // Phones share the delete confirmation's layout: two full-width rows (ui-ux N3).
    const keep = (await ask.getByRole('button', { name: 'Seguir editando' }).boundingBox())!
    const drop = (await ask.getByRole('button', { name: 'Descartar cambios' }).boundingBox())!
    expect(Math.abs(keep.x - drop.x)).toBeLessThan(1)
    expect(Math.abs(keep.width - drop.width)).toBeLessThan(1)
    await evidence(page, 'identity-mobile', 'discard-confirm', 'RYT-040')
  }
  await ask.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    phone(page)
      ? article.getByRole('button', { name: 'Acciones de «Descanso duro»' })
      : article.getByRole('button', { name: 'Editar «Descanso duro»' }),
  ).toBeFocused()
})

test('deleting homebrew asks first, names the entry and removes it from the glossary', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const f = await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/homebrew.${houseRuleId}`)
  const article = page.locator('article.gl-entry')
  await expect(article.getByRole('heading', { name: 'Descanso duro' })).toBeVisible()
  await evidence(page, info.project.name, 'entry-homebrew', 'RYT-040')
  await entryAction(page, article, 'Descanso duro', 'delete')
  const dialog = page.getByRole('dialog', { name: '¿Eliminar «Descanso duro»?' })
  await expect(dialog).toContainText('No se puede deshacer')
  // Cancel holds the initial focus: Enter never deletes by accident.
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  // On phones the ⋯ menu closes behind the dialog; audit once it is gone.
  await expect(page.getByRole('menu')).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'delete-confirm', 'RYT-040')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(f.calls.some((call) => call.method === 'delete_glossary_entry')).toBe(false)
  await expect(actionTrigger(page, article, 'Descanso duro', 'delete')).toBeFocused()
  // Confirming deletes the revision on screen and leaves the entry.
  await entryAction(page, article, 'Descanso duro', 'delete')
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar entrada' }).click()
  await expect(page).not.toHaveURL(/homebrew\./)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Entrada eliminada')).toBeVisible()
  expect(
    f.calls.find((call) => call.method === 'delete_glossary_entry')?.body.expected_revision,
  ).toBe(1)
  // Gone from the index, from search and from the SRD entry it was attached to.
  await page.getByRole('searchbox').fill('descanso duro')
  await expect(page.getByRole('link', { name: /Descanso duro/ })).toHaveCount(0)
  await page.getByRole('searchbox').press('Escape')
  await page.getByRole('tab', { name: /Homebrew/ }).click()
  await expect(page.getByText('Aún no hay homebrew')).toBeVisible()
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  await expect(page.getByRole('heading', { name: 'Descanso largo', exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Regla de la casa' })).toHaveCount(0)
})

test('a homebrew definition opened in place edits and deletes above the reference sheet', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/rule.long-rest`)
  // The house rule's title links to its own definition.
  const term = page
    .getByRole('complementary', { name: 'Regla de la casa' })
    .getByRole('button', { name: 'Descanso duro: ver definición' })
    .first()
  await term.click()
  const sheet = page.getByRole('dialog', { name: 'Descanso duro' })
  await expect(sheet).toBeVisible()
  await evidence(page, info.project.name, 'sheet-actions', 'RYT-040')
  await entryAction(page, sheet, 'Descanso duro', 'edit')
  const editor = page.getByRole('dialog', { name: 'Editar entrada' })
  await expect(editor).toBeVisible()
  // The editor sits above the sheet: Escape closes only the editor.
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(sheet).toBeVisible()
  // Deleting from the definition leaves the sheet and the entry behind.
  await entryAction(page, sheet, 'Descanso duro', 'delete')
  await page
    .getByRole('dialog', { name: '¿Eliminar «Descanso duro»?' })
    .getByRole('button', { name: 'Eliminar entrada' })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Regla de la casa' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Descanso largo', exact: true })).toBeFocused()
})

test('the edit and delete overlays read well in English and the light theme', async ({
  page,
}, info) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    localStorage.setItem('rytta-color-scheme', 'light')
    localStorage.setItem('rytta-language', 'en')
  })
  await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/homebrew.${houseRuleId}`)
  const article = page.locator('article.gl-entry')
  const act = async (action: 'Edit' | 'Delete') => {
    if (phone(page)) {
      await article.getByRole('button', { name: 'Actions for “Descanso duro”' }).click()
      await page.getByRole('menuitem', { name: `${action} entry` }).click()
      await expect(page.getByRole('menu')).toHaveCount(0)
    } else await article.getByRole('button', { name: `${action} “Descanso duro”` }).click()
  }
  await act('Edit')
  const editor = page.getByRole('dialog', { name: 'Edit entry' })
  await expect(editor.getByRole('button', { name: 'Save changes' })).toBeVisible()
  await audit(page)
  await evidence(page, info.project.name, 'editor-edit-light-en', 'RYT-040')
  await editor.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await act('Delete')
  const dialog = page.getByRole('dialog', { name: 'Delete “Descanso duro”?' })
  await expect(dialog).toContainText('This can’t be undone')
  await audit(page)
  await evidence(page, info.project.name, 'delete-confirm-light-en', 'RYT-040')
})

test('deleting from the editor replaces the form with the confirmation', async ({ page }) => {
  await identityFixture(page, { modules: ['party', 'glossary'], homebrew: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${glossaryUrl}/homebrew.${houseRuleId}`)
  const article = page.locator('article.gl-entry')
  await entryAction(page, article, 'Descanso duro', 'edit')
  await page
    .getByRole('dialog', { name: 'Editar entrada' })
    .getByRole('button', { name: 'Eliminar entrada' })
    .click()
  const dialog = page.getByRole('dialog', { name: '¿Eliminar «Descanso duro»?' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Editar entrada' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Eliminar entrada' }).click()
  await expect(page).not.toHaveURL(/homebrew\./)
})

test('the DM reaches the glossary from navigation and the module switch lists it', async ({
  page,
}, info) => {
  await identityFixture(page, { modules: ['party'] })
  await page.goto(`./#/campaign/${campaignId}/members?panel=modules`)
  await expect(page.getByRole('switch', { name: /Glosario/ })).toBeVisible()
  await page.goto(glossaryUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Glosario' })).toBeVisible()
  await page.locator('html').evaluate((el) => el.setAttribute('data-mantine-color-scheme', 'light'))
  await page.getByRole('searchbox').fill('bola de fuego')
  await page.getByRole('searchbox').press('Enter')
  await expect(page.getByText('Conjuro de evocación de nivel 3')).toBeVisible()
  await expect(page.locator('.gl-spell-traits')).toContainText('Salvación de Destreza')
  await audit(page)
  await evidence(page, info.project.name, 'spell-light')
})

test('Escape closes a definition opened from an item card before the card itself', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/inventory`)
  await page.getByRole('button', { name: /Espada larga, (cantidad|quantity) 1/ }).click()
  const card = page.getByRole('dialog', { name: /Espada larga|Objeto/ }).first()
  await expect(card).toBeVisible()
  const term = page.getByRole('button', { name: 'cortante: ver definición' })
  await term.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.gl-sheet-headword')).toHaveText('Cortante')
  // First Escape closes only the definition and returns focus to the term (ui-ux R2-1).
  await page.keyboard.press('Escape')
  await expect(page.locator('.gl-sheet-headword')).toHaveCount(0)
  await expect(term).toBeVisible()
  await expect(term).toBeFocused()
  // The next Escape closes the card.
  await page.keyboard.press('Escape')
  await expect(term).toHaveCount(0)
})

test('a search change from outside the field (the nav item) resets the field', async ({ page }) => {
  await identityFixture(page, { player: true, modules: ['party', 'glossary'] })
  await page.goto(glossaryUrl)
  const search = page.getByRole('searchbox', { name: 'Buscar en el glosario' })
  await search.pressSequentially('fire', { delay: 20 })
  await expect(page).toHaveURL(/q=fire/)
  // Tapping the active Glosario destination drops ?q= (ui-ux R2-2).
  await page.goto(glossaryUrl)
  await expect(search).toHaveValue('')
  await page.waitForTimeout(500)
  await expect(page).not.toHaveURL(/q=fire/)
})

// CI (slow renders) showed the delayed ?q= write dropping ?cat= while the tab change was still
// rendering; the write now reads the live URL. Locally the race is rarely hit, so this test
// pins the intended outcome rather than reproducing the timing.
test('a category chosen right after typing survives the delayed ?q= update', async ({ page }) => {
  await identityFixture(page, { player: true, modules: ['party', 'glossary'] })
  await page.goto(glossaryUrl)
  const search = page.getByRole('searchbox', { name: 'Buscar en el glosario' })
  await expect(page.getByText('550 entradas')).toBeVisible()
  await search.fill('a')
  await page.waitForTimeout(250)
  // Choose a tab just before the 300 ms search mirror writes ?q= (it used to drop ?cat=).
  await page.getByRole('tab', { name: /Conjuros/ }).click()
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL(/cat=spell/)
  await expect(page).toHaveURL(/q=a/)
  await expect(page.getByRole('tab', { name: /Conjuros/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Filtros de conjuros' })).toBeVisible()
})
