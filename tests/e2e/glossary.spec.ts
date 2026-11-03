import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, characterId, identityFixture } from './fixtures/identity.ts'

const glossaryUrl = `./#/campaign/${campaignId}/glossary`
const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
/** Below 62em the reader replaces the index (phones and portrait tablets). */
const narrow = (page: Page) => page.viewportSize()!.width < 992
const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null

/** RYT-008 evidence: screenshots for 390px and tablet, opt-in with RYT_EVIDENCE. */
async function evidence(page: Page, project: string, name: string) {
  const s = size(project)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({
      path: `docs/evidence/RYT-008/${name}-${s}.png`,
      // Fixed sheets and drawers only make sense against the viewport.
      fullPage: (await page.getByRole('dialog').count()) === 0,
    })
}
async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  // Controls are 44px; inline term links keep text flow and get a 44px hit area instead.
  for (const control of await page
    .locator(
      'main button:visible:not(.glossary-term), [role="dialog"] button:visible:not(.glossary-term)',
    )
    .all()) {
    const box = await control.boundingBox()
    expect(
      box!.height,
      await control.evaluate((el) => el.outerHTML.slice(0, 200)),
    ).toBeGreaterThanOrEqual(44)
  }
  for (const term of await page.locator('.glossary-term:visible').all()) {
    const hit = await term.evaluate((el) => {
      const after = getComputedStyle(el, '::after')
      return el.getBoundingClientRect().height - parseFloat(after.top) - parseFloat(after.bottom)
    })
    expect(hit).toBeGreaterThanOrEqual(44)
  }
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
  await page.getByRole('button', { name: 'Acciones de Mano Hundida' }).click()
  await page.getByRole('menuitem', { name: 'Editar entrada' }).click()
  await page
    .getByRole('dialog', { name: 'Editar entrada' })
    .getByRole('textbox', { name: /^Nombre/ })
    .fill('Mano Hundida (fortaleza)')
  await page.getByRole('button', { name: 'Guardar entrada' }).click()
  await expect(page.getByRole('heading', { name: 'Mano Hundida (fortaleza)' })).toBeVisible()
  await page.getByRole('button', { name: 'Acciones de Mano Hundida (fortaleza)' }).click()
  await page.getByRole('menuitem', { name: 'Eliminar entrada' }).click()
  await page
    .getByRole('dialog', { name: 'Eliminar entrada' })
    .getByRole('button', { name: 'Eliminar entrada' })
    .click()
  await expect(page).not.toHaveURL(/homebrew\./)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('tab', { name: /Homebrew/ }).click()
  await expect(page.getByRole('link', { name: /Descanso duro/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Mano Hundida/ })).toHaveCount(0)
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
