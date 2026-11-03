import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture, playerId } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'

const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
async function evidence(page: Page, project: string, name: string, ticket = 'RYT-007') {
  const s = size(project)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/${ticket}/${name}-${s}.png` })
}
async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(page, '[role="dialog"] button:visible:not(.glossary-term)')
}
// The DM keeps both views mounted: only the visible one counts.
const row = (page: Page, name: string) =>
  page.locator('.combat-rail:visible .combat-row', { hasText: name }).first()
/** RYT-042: the DM's view switch, tapped like a person would (its radios are visually hidden). */
async function view(page: Page, name: 'Mesa' | 'Consola del DM' | 'Table' | 'DM console') {
  await page.locator('.combat-view-switch label', { hasText: name }).click()
  await expect(page.getByRole('radio', { name })).toBeChecked()
}

test('RYT-007 DM and Player run a shared encounter', async ({ browser }, info) => {
  test.setTimeout(180_000)
  const server = combatServer()
  const options = { viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch }
  const dmContext = await browser.newContext(options)
  const arinContext = await browser.newContext(options)
  const dm = await dmContext.newPage()
  const arin = await arinContext.newPage()
  const errors: string[] = []
  for (const page of [dm, arin]) {
    page.on('pageerror', (e) => errors.push(e.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
  const modules = ['party', 'combat']
  await identityFixture(dm, { party: true, linkedPlayer: true, sheet: 'complete', modules })
  await identityFixture(arin, { player: true, party: true, sheet: 'complete', modules })
  await server.install(dm)
  await server.install(arin)

  // 1. The DM prepares an encounter: the party in one tap and a group of goblins.
  await dm.goto(`./#/campaign/${campaignId}/combat`)
  await expect(dm.getByRole('heading', { level: 1, name: 'Combate' })).toBeVisible()
  await dm.getByLabel('Nuevo encuentro').fill('Emboscada en el puente')
  await dm.getByRole('button', { name: 'Crear' }).click()
  await dm.getByRole('link', { name: 'Abrir Emboscada en el puente' }).click()
  await expect(dm.getByRole('heading', { level: 1, name: 'Emboscada en el puente' })).toBeVisible()
  await dm.getByRole('button', { name: 'Añadir a todo el grupo' }).click()
  await expect(dm.getByText('3 combatientes añadidos.')).toBeVisible()
  await dm.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Goblin')
  await dm.getByLabel('Cuántas').fill('2')
  await dm.getByLabel('Puntos de golpe').fill('7')
  await dm.getByLabel('Clase de armadura').fill('15')
  await dm.getByLabel('Bonificador de iniciativa').fill('2')
  await dm.getByRole('button', { name: 'Añadir criatura' }).click()
  await expect(row(dm, 'Goblin 2')).toBeVisible()
  await audit(dm)
  await evidence(dm, info.project.name, 'dm-prepare')
  await dm.getByRole('button', { name: 'Pedir iniciativa' }).click()
  await expect(dm.getByText('Faltan 5 iniciativas')).toBeVisible()

  // 2. RYT-042: the Player's only screen is the table view; the own row opens into the initiative
  // entry (with the sheet bonus) and the d20 total is typed on its keypad.
  await arin.goto(`./#/campaign/${campaignId}/combat`)
  const entry = arin.getByRole('region', { name: 'Tu iniciativa' })
  await expect(entry).toBeVisible({ timeout: 15_000 })
  await expect(row(arin, 'Arin')).toContainText('Tu iniciativa')
  await expect(entry).toContainText('Tira d20 + 2')
  for (const name of ['Bea', 'Cato', 'Goblin 1']) {
    await expect(row(arin, name).getByRole('button')).toHaveCount(0)
    await expect(row(arin, name).getByRole('textbox')).toHaveCount(0)
  }
  await entry.getByRole('button', { name: '1', exact: true }).click()
  await entry.getByRole('button', { name: '8', exact: true }).click()
  await expect(entry.getByRole('textbox', { name: 'Total de iniciativa de Arin' })).toHaveValue(
    '18',
  )
  await audit(arin)
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(entry).toBeHidden()
  await expect(row(arin, 'Arin').locator('.combat-init')).toHaveText('18')

  // 3. The DM rolls for creatures, types the remaining totals and starts the fight.
  await expect(dm.getByText('Faltan 4 iniciativas')).toBeVisible({ timeout: 15_000 })
  await dm.getByRole('button', { name: 'Tirar por las criaturas' }).click()
  await expect(dm.getByText('Faltan 2 iniciativas')).toBeVisible()
  for (const [name, total] of [
    ['Bea', '10'],
    ['Cato', '5'],
  ] as const) {
    await row(dm, name).getByRole('button').first().click()
    const dialog = dm.getByRole('dialog', { name: `Iniciativa de ${name}` })
    await dialog.getByLabel('Total').fill(total)
    await dialog.getByRole('button', { name: 'Guardar iniciativa' }).click()
    await expect(dialog).toBeHidden()
  }
  await expect(dm.getByText('Todos tienen iniciativa.')).toBeVisible()
  await dm.getByRole('button', { name: 'Empezar combate' }).click()
  const bar = dm.getByRole('region', { name: 'Controles de turno' })
  await expect(bar).toContainText('Arin')
  await expect(dm.locator('.combat-rail [aria-current="step"]')).toContainText('Arin')
  await audit(dm)
  await evidence(dm, info.project.name, 'dm-active')

  // 4. The Player's table view says it is their turn; the turn itself belongs to the DM now.
  await expect(arin.locator('.combat-table-now')).toContainText('¡Te toca!', { timeout: 15_000 })
  await expect(arin.getByRole('button', { name: 'Terminar mi turno' })).toHaveCount(0)
  await audit(arin)
  await dm.getByRole('button', { name: 'Siguiente turno' }).click()
  await expect(arin.getByText('Te toca dentro de 4 turnos')).toBeVisible({ timeout: 15_000 })
  await expect(bar).toContainText('Goblin 1', { timeout: 15_000 })

  // 5. Area damage: both goblins, one saves for half. Switching to the table view and back in
  // the middle keeps the chosen targets (RYT-042).
  await dm.getByRole('button', { name: 'Elegir objetivos' }).click()
  await dm.getByRole('checkbox', { name: 'Elegir a Goblin 1' }).check()
  await dm.getByRole('checkbox', { name: 'Elegir a Goblin 2' }).check()
  await view(dm, 'Mesa')
  await expect(dm.locator('.combat-table-active')).toHaveText('Goblin 1')
  await view(dm, 'Consola del DM')
  await expect(dm.getByRole('checkbox', { name: 'Elegir a Goblin 1' })).toBeChecked()
  await expect(dm.getByRole('checkbox', { name: 'Elegir a Goblin 2' })).toBeChecked()
  await dm.getByRole('region', { name: 'Objetivos' }).getByRole('button', { name: 'Daño' }).click()
  const damage = dm.getByRole('dialog', { name: 'Aplicar daño' })
  await damage.getByRole('textbox', { name: 'Cantidad' }).fill('6')
  await damage.getByRole('checkbox', { name: 'Mitad (salvación): Goblin 2' }).check()
  await expect(damage).toContainText('Goblin 2: 3')
  await audit(dm)
  await evidence(dm, info.project.name, 'dm-area-damage')
  await damage.getByRole('button', { name: 'Aplicar' }).click()
  await expect(damage).toBeHidden()
  await expect(row(dm, 'Goblin 1')).toContainText('1/7 PG')
  await expect(row(dm, 'Goblin 2')).toContainText('4/7 PG')
  await dm.getByRole('button', { name: 'Dejar de elegir' }).click()

  // 6. The log shows both hits; undo the half damage.
  await dm.getByRole('tab', { name: 'Registro del combate' }).click()
  await expect(dm.getByText('Goblin 2 recibe 3 de daño')).toBeVisible()
  await dm.getByRole('button', { name: 'Deshacer: Goblin 2 recibe 3 de daño' }).click()
  await expect(row(dm, 'Goblin 2')).toContainText('7/7 PG')
  await expect(dm.getByText('Deshecho', { exact: true }).first()).toBeVisible()
  await audit(dm)
  await evidence(dm, info.project.name, 'dm-log')

  // 7. Players see descriptive enemy hit points, never the numbers.
  await expect(row(arin, 'Goblin 1')).toContainText('Malherido', { timeout: 15_000 })
  await expect(row(arin, 'Goblin 1')).not.toContainText('PG')
  await expect(row(arin, 'Cato')).toContainText('No compartido')
  await expect(row(arin, 'Bea')).toContainText('18/18 PG')

  // 8. The table view is a read-only projection; the DM reaches it with the view switch.
  await view(dm, 'Mesa')
  // RYT-041: there is no full screen control for anyone.
  await expect(dm.getByRole('button', { name: 'Pantalla completa' })).toHaveCount(0)
  await expect(dm.locator('.combat-table-active')).toHaveText('Goblin 1')
  await expect(row(dm, 'Goblin 1')).toContainText('Malherido')
  await expect(row(dm, 'Goblin 1')).not.toContainText('PG')
  await expect(dm.getByRole('button', { name: 'Siguiente turno' })).toHaveCount(0)
  await audit(dm)
  await view(dm, 'Consola del DM')

  // 9. Ending the combat stores a summary that both sides see in the table view.
  await dm.getByRole('button', { name: 'Terminar combate' }).click()
  const end = dm.getByRole('dialog', { name: '¿Terminar este combate?' })
  await end.getByRole('button', { name: 'Terminar combate' }).click()
  await expect(dm.getByRole('heading', { name: 'Resumen del combate' })).toBeVisible()
  await audit(dm)
  await view(dm, 'Mesa')
  await expect(dm.getByRole('heading', { name: 'Resumen del combate' })).toBeVisible()
  const recap = arin.getByRole('region', { name: 'Resumen del combate' })
  await expect(recap).toBeVisible({ timeout: 20_000 })
  await expect(recap.getByRole('region', { name: 'Grupo' })).toContainText('Arin')
  await expect(recap.getByRole('region', { name: 'Enemigos' })).toContainText('Goblin 1')
  await audit(arin)
  expect(errors).toEqual([])
})

test('RYT-007 Player combat screen passes axe in English and light theme', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-color-scheme', 'light')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  // The DM side is driven straight through the fixture: an active encounter on Arin's turn.
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat`)
  await expect(page.locator('.combat-table-now')).toContainText('Your turn!', { timeout: 15_000 })
  // RYT-042: the table view is the Player's only combat screen; it has no write controls here.
  await expect(page.getByRole('button', { name: 'Damage' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'End my turn' })).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'table-turn-en-light', 'RYT-042')
})

test('RYT-007 action errors stay in view next to the action and floating ones leave', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  // Later routes win: these two writes fail like a dropped connection.
  await page.route(/\/rest\/v1\/rpc\/(set_combat_condition|advance_turn)$/, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Service unavailable' }),
    }),
  )
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
  const message = 'No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.'

  // 1. Without a dialog the error floats, clears the turn bar and leaves on its own.
  await page.getByRole('button', { name: 'Siguiente turno' }).click()
  const toast = page.locator('.combat-toast').getByRole('alert')
  await expect(toast).toHaveText(message)
  const bar = await page.getByRole('region', { name: 'Controles de turno' }).boundingBox()
  const box = await toast.boundingBox()
  expect(box!.y + box!.height <= bar!.y || box!.y >= bar!.y + bar!.height).toBe(true)
  await audit(page)
  await evidence(page, info.project.name, 'error-toast')
  await expect(toast).toBeHidden({ timeout: 12_000 })
  // Dismissing with the keyboard returns focus to the control that failed.
  const next = page.getByRole('button', { name: 'Siguiente turno' })
  await next.click()
  await toast.getByRole('button', { name: 'Cancelar' }).focus()
  await page.keyboard.press('Enter')
  await expect(toast).toBeHidden()
  await expect(next).toBeFocused()

  // 2. A failed change in the detail keeps its error in view, inside the drawer on phones.
  await row(page, 'Goblin 1').getByRole('button').first().click()
  await page.getByRole('button', { name: 'Cambiar' }).click()
  await page.getByText('Derribado', { exact: true }).click()
  const inline =
    info.project.name === 'identity-desktop'
      ? page.locator('.combat-toast').getByRole('alert')
      : page.locator('.mantine-Drawer-body .combat-inline-error').getByRole('alert')
  await expect(inline).toHaveText(message)
  await expect(inline).toBeInViewport()
  if (info.project.name !== 'identity-desktop') {
    // The sticky error never covers the control that failed: it is scrolled into view above it.
    const chip = page.getByText('Derribado', { exact: true })
    await expect(chip).toBeInViewport()
    const chipBox = (await chip.boundingBox())!
    const alertBox = (await inline.boundingBox())!
    expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(alertBox.y)
    // Polling re-renders while the error is shown never pull the drawer back (N6).
    const drawer = page.locator('.mantine-Drawer-content')
    const scrolled = await drawer.evaluate((node) => {
      node.scrollTop = node.scrollHeight
      return node.scrollTop
    })
    await page.waitForTimeout(5_000)
    expect(await drawer.evaluate((node) => node.scrollTop)).toBe(scrolled)
  }
  await audit(page)
  await evidence(page, info.project.name, 'error-detail')
  // Errors inside a drawer wait for the person; dismissing returns to the same place.
  await inline.getByRole('button', { name: 'Cancelar' }).focus()
  await page.keyboard.press('Enter')
  await expect(inline).toBeHidden()
  await expect(page.getByRole('checkbox', { name: 'Derribado' })).toBeFocused()
  if (info.project.name !== 'identity-desktop') {
    // A control brought into view upward (keyboard focus in browsers that scroll to the nearest
    // edge, assistive tech) lands below the drawer's sticky header, not under it.
    const drawer = page.locator('.mantine-Drawer-content')
    await drawer.evaluate((node) => (node.scrollTop = node.scrollHeight))
    const damage = drawer.getByRole('button', { name: 'Daño' })
    await damage.evaluate((node) => node.scrollIntoView({ block: 'nearest' }))
    const header = (await drawer.locator('.mantine-Drawer-header').boundingBox())!
    expect((await damage.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height)
    // Also with 150% text, where the header grows with its title (N7).
    await page.evaluate(() => (document.documentElement.style.fontSize = '150%'))
    await drawer.evaluate((node) => (node.scrollTop = node.scrollHeight))
    await damage.evaluate((node) => node.scrollIntoView({ block: 'nearest' }))
    const large = (await drawer.locator('.mantine-Drawer-header').boundingBox())!
    expect((await damage.boundingBox())!.y).toBeGreaterThanOrEqual(large.y + large.height)
    await page.evaluate(() => (document.documentElement.style.fontSize = ''))
  }
})

test('RYT-007 Players reach combat only when the DM opened the module', async ({ page }) => {
  const server = combatServer()
  await identityFixture(page, { player: true, party: true, sheet: 'complete', modules: ['party'] })
  await server.install(page)
  server.seedActive()
  const id = server.encounters[0]!.id
  for (const path of ['combat', `combat/${id}`, `combat/${id}/table`]) {
    await page.goto(`./#/campaign/${campaignId}/${path}`)
    await expect(page.getByText('El DM todavía no ha abierto el combate.')).toBeVisible()
    await expect(page.getByText('¡Te toca!')).toHaveCount(0)
    await expect(page.locator('.combat-rail')).toHaveCount(0)
  }
  await audit(page)
})

test('RYT-039 combat conditions open their glossary definition in place', async ({
  page,
}, info) => {
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)

  // The DM marks Goblin 1 as prone and closes the picker: the condition becomes a reference.
  await row(page, 'Goblin 1').getByRole('button').first().click()
  await page.getByRole('button', { name: 'Cambiar' }).click()
  await page.getByText('Derribado', { exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Derribado' })).toBeChecked()
  await page.getByRole('button', { name: 'Listo' }).click()
  const term = page.getByRole('button', { name: 'Derribado: ver definición' })
  await expect(term).toBeVisible()
  await expect(page.getByRole('button', { name: 'Estados: ver definición' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Concentración: ver definición' })).toBeVisible()
  const s = size(info.project.name)
  if (s && process.env.RYT_EVIDENCE) {
    await term.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `docs/evidence/RYT-039/condition-terms-${s}.png` })
  }

  // Keyboard: Enter opens the definition above the combatant drawer.
  await term.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.gl-sheet-headword')).toHaveText('Derribado')
  await expect(page.getByRole('dialog', { name: 'Derribado' })).toBeVisible()
  await audit(page)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-039/condition-definition-${s}.png` })

  // The first Escape closes only the definition and returns focus to the term.
  await page.keyboard.press('Escape')
  await expect(page.locator('.gl-sheet-headword')).toHaveCount(0)
  await expect(term).toBeFocused()
  if (info.project.name !== 'identity-desktop') {
    // On phones and tablets the combatant drawer stays open until the next Escape.
    await expect(page.locator('.combat-drawer .mantine-Drawer-content')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(term).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test("RYT-039 an effect's condition opens its definition and removing the effect clears it", async ({
  page,
}) => {
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)

  // The DM adds a web that restrains Goblin 1.
  await row(page, 'Goblin 1').getByRole('button').first().click()
  await page.getByRole('button', { name: 'Añadir efecto' }).click()
  const dialog = page.getByRole('dialog', { name: 'Añadir efecto: Goblin 1' })
  await dialog.getByRole('textbox', { name: 'Efecto' }).fill('Telaraña')
  await dialog.getByRole('combobox', { name: 'Aplica el estado' }).click()
  await page.getByRole('option', { name: 'Apresado' }).click()
  await dialog.getByRole('button', { name: 'Añadir efecto' }).click()
  await expect(dialog).toBeHidden()

  // The effect line names the condition as a reference; the condition list shows it too.
  const effects = page.locator('.combat-effects')
  await expect(effects).toContainText('Telaraña')
  const term = effects.getByRole('button', { name: 'Apresado: ver definición' })
  await expect(term).toBeVisible()
  await expect(page.locator('.combat-tag', { hasText: 'Apresado' })).toBeVisible()

  await term.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.gl-sheet-headword')).toHaveText('Apresado')
  await audit(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('.gl-sheet-headword')).toHaveCount(0)
  await expect(term).toBeFocused()

  // Removing the effect ends the condition it granted.
  await effects.getByRole('button', { name: 'Quitar Telaraña' }).click()
  await expect(effects).toHaveCount(0)
  await expect(page.locator('.combat-tag', { hasText: 'Apresado' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('RYT-041 the DM changes the roster mid-combat and the detail follows the turn', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  // Arin 20, Bea 19, Goblin 1 18, Goblin 2 17; Arin acts. Cato is not in the fight.
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
  const wide = info.project.name === 'identity-desktop'
  const bar = page.getByRole('region', { name: 'Controles de turno' })
  const detailName = page.locator('.combat-detail-name')
  const sheet = page.locator('.combat-drawer .mantine-Drawer-content')
  /** The detail on screen: the side panel on laptops, the sheet opened from the turn bar elsewhere. */
  const expectDetail = async (name: string) => {
    // On laptops the side panel keeps the tab the DM chose; the detail tab shows who acts.
    if (wide) await page.getByRole('tab', { name: 'Detalle' }).click()
    else {
      // The acting name in the turn bar opens its detail.
      const now = bar.locator('button.combat-turn-now')
      await expect(now.locator('.combat-turn-name')).toHaveText(name)
      await now.click()
      await expect(sheet).toBeVisible()
    }
    await expect(detailName).toHaveText(name)
    if (!wide) {
      await page.keyboard.press('Escape')
      await expect(sheet).toHaveCount(0)
    }
  }

  // 1. The fight opens on the combatant whose turn it is.
  await expectDetail('Arin')
  // 2. Next turn moves the detail, announces it and keeps focus on the turn button.
  const next = page.getByRole('button', { name: 'Siguiente turno' })
  await next.click()
  await expect(bar).toContainText('Bea')
  await expect(next).toBeFocused()
  await expect(page.locator('.combat-console > [aria-live="polite"]')).toHaveText(
    'Turno de Bea. Ronda 1.',
  )
  if (wide) await expect(detailName).toHaveText('Bea')
  await evidence(page, info.project.name, 'turn-focus', 'RYT-041')
  await expectDetail('Bea')
  // 3. Picking another row still works between turns; the next turn takes the detail back.
  await row(page, 'Goblin 2').getByRole('button').first().click()
  await expect(detailName).toHaveText('Goblin 2')
  if (!wide) {
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  }
  await next.click()
  await expect(bar).toContainText('Goblin 1')
  await expectDetail('Goblin 1')

  // 4. Cato joins with initiative 15: after Goblin 2, still in this round.
  await page.getByRole('tab', { name: 'Añadir combatientes' }).click()
  await expect(page.getByRole('button', { name: 'Añadir a todo el grupo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Añadir a Cato' }).click()
  const join = page.getByRole('dialog', { name: 'Cato entra en combate' })
  await join.getByLabel('Total').fill('15')
  await expect(join).toContainText('Actúa en esta ronda, justo después de Goblin 2.')
  await audit(page)
  await evidence(page, info.project.name, 'join', 'RYT-041')
  // A total above the active slot waits for the next round.
  await join.getByLabel('Total').fill('19')
  await expect(join).toContainText('actúa a partir de la ronda 2')
  await join.getByLabel('Total').fill('15')
  await join.getByRole('button', { name: 'Añadir al combate' }).click()
  await expect(join).toBeHidden()
  await expect(page.locator('.combat-rail .combat-row-name')).toHaveText([
    'Arin',
    'Bea',
    'Goblin 1',
    'Goblin 2',
    'Cato',
  ])
  await expect(row(page, 'Cato')).toContainText('15')

  // 5. Removing the active combatant passes the turn on, after a confirmation.
  await page.getByRole('button', { name: 'Opciones de Goblin 1' }).click()
  await page.getByRole('menuitem', { name: 'Quitar del combate' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Quitar a Goblin 1 del combate?' })
  await expect(confirm).toContainText('Es su turno: pasa a Goblin 2.')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'remove-active', 'RYT-041')
  // Escape cancels without changes.
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(row(page, 'Goblin 1')).toBeVisible()
  await page.getByRole('button', { name: 'Opciones de Goblin 1' }).click()
  await page.getByRole('menuitem', { name: 'Quitar del combate' }).click()
  await confirm.getByRole('button', { name: 'Quitar del combate' }).click()
  await expect(confirm).toBeHidden()
  await expect(bar).toContainText('Goblin 2')
  await expect(page.locator('.combat-rail .combat-row', { hasText: 'Goblin 1' })).toHaveCount(0)
  // Focus lands on the neighbour row, not on the page.
  await expect(row(page, 'Goblin 2').getByRole('button').first()).toBeFocused()
  await expectDetail('Goblin 2')

  // 6. Holding a row opens the same menu (the touch alternative to its options button).
  const bea = row(page, 'Bea').getByRole('button').first()
  await bea.scrollIntoViewIfNeeded()
  const box = (await bea.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await page.getByRole('menuitem', { name: 'Quitar del combate' }).click()
  const removeBea = page.getByRole('dialog', { name: '¿Quitar a Bea del combate?' })
  await expect(removeBea).toContainText('El personaje conserva sus puntos de golpe y estados.')
  await removeBea.getByRole('button', { name: 'Quitar del combate' }).click()
  await expect(removeBea).toBeHidden()
  await expect(page.locator('.combat-rail .combat-row', { hasText: 'Bea' })).toHaveCount(0)
  await expect(bar).toContainText('Goblin 2')

  // 7. The newcomer acts this round.
  await next.click()
  // The bar already reads "Después: Cato"; wait for the turn itself before auditing.
  await expect(bar.locator('.combat-turn-name')).toHaveText('Cato')
  await expect(bar).toContainText('Ronda 1')
  await expect(next).not.toHaveAttribute('aria-disabled', 'true')
  await audit(page)
  await evidence(page, info.project.name, 'after-roster', 'RYT-041')
  expect(errors).toEqual([])
})

test('RYT-041 Players stay on the table view: no exit and no full screen', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}/table`)
  await expect(page.locator('.combat-table-active')).toHaveText('Arin')
  await expect(page.getByRole('link', { name: 'Salir de la vista de mesa' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pantalla completa' })).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'player-table', 'RYT-041')
})

test('RYT-041 roster dialogs pass axe in English and light theme', async ({ page }, info) => {
  const server = combatServer()
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-color-scheme', 'light')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
  await page.getByRole('tab', { name: 'Add combatants' }).click()
  await page.getByRole('button', { name: 'Add Cato' }).click()
  const join = page.getByRole('dialog', { name: 'Cato joins the fight' })
  await join.getByLabel('Total').fill('25')
  await expect(join).toContainText('Their place has passed this round: they act from round 2.')
  await audit(page)
  await evidence(page, info.project.name, 'join-en-light', 'RYT-041')
  await page.keyboard.press('Escape')
  await expect(join).toBeHidden()
  await page.getByRole('button', { name: 'Options for Arin' }).click()
  await page.getByRole('menuitem', { name: 'Remove from combat' }).click()
  const confirm = page.getByRole('dialog', { name: 'Remove Arin from combat?' })
  await expect(confirm).toContainText("It's their turn: it passes to Bea.")
  await expect(page.getByRole('menu')).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'remove-en-light', 'RYT-041')
})

test('RYT-041 dialogs from menus return focus to the menu; the sheet to its opener', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
  const options = page.getByRole('button', { name: 'Opciones de Goblin 1' })
  // Removal and initiative, each cancelled with Escape and with the Cancel button.
  for (const [item, dialogName] of [
    ['Quitar del combate', '¿Quitar a Goblin 1 del combate?'],
    ['Cambiar iniciativa', 'Iniciativa de Goblin 1'],
  ] as const) {
    for (const how of ['escape', 'cancel'] as const) {
      await options.focus()
      await page.keyboard.press('Enter')
      await page.getByRole('menuitem', { name: item }).click()
      const dialog = page.getByRole('dialog', { name: dialogName })
      await expect(dialog).toBeVisible()
      if (how === 'escape') await page.keyboard.press('Escape')
      else
        await dialog
          .locator('.combat-dialog-actions')
          .getByRole('button', { name: 'Cancelar' })
          .click()
      await expect(dialog).toBeHidden()
      await expect(options).toBeFocused()
    }
  }
  if (info.project.name === 'identity-desktop') {
    // The detail's own DM menu has its own name and gets focus back too.
    const more = page.getByRole('button', { name: 'Más controles del DM para Arin' })
    await more.click()
    await page.getByRole('menuitem', { name: 'Quitar del combate' }).click()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
  } else {
    // The sheet opened from the turn bar gives focus back to the turn bar.
    const now = page.locator('#combat-turn-now')
    await expect(now).toHaveAccessibleName('Ahora · Ronda 1, Arin, Después: Bea. Ver detalle')
    await now.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.combat-drawer .mantine-Drawer-content')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.combat-drawer .mantine-Drawer-content')).toHaveCount(0)
    await expect(now).toBeFocused()
  }
})

test('RYT-041 a real touch long press keeps the row menu open after lifting the finger', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'identity-desktop', 'touch emulation runs on tablet and phone')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
  const bea = row(page, 'Bea').getByRole('button').first()
  await bea.scrollIntoViewIfNeeded()
  const box = (await bea.boundingBox())!
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // Raw touch events, so Chromium also sends its compatibility mouse events on release.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await page.waitForTimeout(700)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(400)
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Quitar del combate' })).toBeVisible()
  // The long press did not also open the detail sheet.
  await expect(page.locator('.combat-drawer .mantine-Drawer-content')).toHaveCount(0)
  // A short tap still opens the detail.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('.combat-detail-name')).toHaveText('Bea')
})

test('RYT-041 dialog actions share a row or stack full width, also with 150% text', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
  /** Either one row (same top) or stacked full width with the action above Cancel. */
  const expectDeliberate = async (dialog: Locator, action: string) => {
    const actions = dialog.locator('.combat-dialog-actions')
    const cancel = (await actions.getByRole('button', { name: 'Cancelar' }).boundingBox())!
    const primary = (await actions.getByRole('button', { name: action }).boundingBox())!
    const row = (await actions.boundingBox())!
    if (Math.abs(cancel.y - primary.y) > 1) {
      expect(primary.y).toBeLessThan(cancel.y)
      for (const box of [cancel, primary]) expect(Math.abs(box.width - row.width)).toBeLessThan(2)
    }
  }
  for (const scale of ['', '150%']) {
    await page.evaluate((size) => (document.documentElement.style.fontSize = size), scale)
    const suffix = scale ? '-150' : ''
    await page.getByRole('button', { name: 'Opciones de Goblin 1' }).click()
    await page.getByRole('menuitem', { name: 'Quitar del combate' }).click()
    const remove = page.getByRole('dialog', { name: '¿Quitar a Goblin 1 del combate?' })
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expectDeliberate(remove, 'Quitar del combate')
    await evidence(page, info.project.name, `remove-dialog${suffix}`, 'RYT-041')
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: 'Añadir combatientes' }).click()
    await page.getByRole('button', { name: 'Añadir a Cato' }).click()
    const join = page.getByRole('dialog', { name: 'Cato entra en combate' })
    await join.getByLabel('Total').fill('15')
    await expectDeliberate(join, 'Añadir al combate')
    // The total chips keep room around two digits.
    for (const chip of await join.locator('.combat-join-init').all()) {
      const fits = await chip.evaluate((node) => node.scrollWidth <= node.clientWidth)
      expect(fits).toBe(true)
    }
    await evidence(page, info.project.name, `join-dialog${suffix}`, 'RYT-041')
    await page.keyboard.press('Escape')
    await expect(join).toBeHidden()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

/** RYT-042: sets totals and moves the encounter as the DM, straight through the fixture. */
function dmSets(server: ReturnType<typeof combatServer>, totals: Record<string, number>) {
  for (const [name, total] of Object.entries(totals))
    server.act('set_initiative', {
      target_combatant: server.encounters[0]!.combatants.find((c) => c.name === name)!.id,
      initiative_total: total,
      tiebreak_bonus: null,
      request_id: `dm-${name}-${total}`,
    })
}
const combatantId = (server: ReturnType<typeof combatServer>, name: string) =>
  server.encounters[0]!.combatants.find((c) => c.name === name)!.id

test('RYT-042 Players only have the table view: own initiative, nobody else, then the summary', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  const id = server.seedInitiative()
  await page.goto(`./#/campaign/${campaignId}/combat`)
  await expect(page.getByRole('heading', { level: 1, name: 'Bridge ambush' })).toBeVisible({
    timeout: 15_000,
  })
  // One screen: no console, no view switch, no turn or hit point controls.
  await expect(page.getByRole('radio', { name: 'Consola del DM' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Vista de mesa' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Terminar mi turno|Daño|Curar/ })).toHaveCount(0)
  const banner = page.locator('.combat-table-now')
  await expect(banner).toContainText('Tirad iniciativa')
  await expect(banner).toContainText('0 de 4 listos')

  // The own row is the only entry; teammates and creatures have no control at all.
  const entry = page.getByRole('region', { name: 'Tu iniciativa' })
  await expect(entry).toHaveCount(1)
  await expect(row(page, 'Arin')).toContainText('Tu iniciativa')
  for (const name of ['Bea', 'Goblin 1', 'Goblin 2']) {
    await expect(row(page, name).getByRole('button')).toHaveCount(0)
    await expect(row(page, name).getByRole('textbox')).toHaveCount(0)
  }
  const total = entry.getByRole('textbox', { name: 'Total de iniciativa de Arin' })
  await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toBeDisabled()
  await entry.getByRole('button', { name: '9', exact: true }).click()
  await entry.getByRole('button', { name: '1', exact: true }).click()
  await expect(total).toHaveValue('91')
  await entry.getByRole('button', { name: 'Borrar último dígito' }).click()
  await entry.getByRole('button', { name: '7', exact: true }).click()
  await expect(total).toHaveValue('97')
  // Escape clears an unsaved entry; the keyboard types directly.
  await total.focus()
  await page.keyboard.press('Escape')
  await expect(total).toHaveValue('')
  await total.fill('17')
  await expectTouchTargets(page, '.combat-entry button:visible')
  await audit(page)
  await evidence(page, info.project.name, 'player-initiative', 'RYT-042')
  await page.keyboard.press('Enter')
  await expect(entry).toHaveCount(0)
  const edit = page.getByRole('button', { name: 'Editar la iniciativa de Arin' })
  await expect(edit).toBeFocused()
  await expect(row(page, 'Arin').locator('.combat-init')).toHaveText('17')
  await expect(page.getByText('Arin: iniciativa 17 guardada.')).toBeAttached()
  await expect(banner).toContainText('1 de 4 listos')
  await evidence(page, info.project.name, 'player-saved', 'RYT-042')

  // While initiative is collected the Player can correct it; Escape keeps the saved total.
  await edit.click()
  await expect(entry).toBeVisible()
  await expect(total).toHaveValue('17')
  await total.fill('5')
  await page.keyboard.press('Escape')
  await expect(entry).toHaveCount(0)
  await expect(edit).toBeFocused()
  await expect(row(page, 'Arin').locator('.combat-init')).toHaveText('17')

  // Another character's total is refused (the SQL tests cover the real RPC).
  const request = (target: string, key: string) =>
    server.act(
      'set_initiative',
      { target_combatant: target, initiative_total: 3, tiebreak_bonus: null, request_id: key },
      playerId,
    )
  expect(request(combatantId(server, 'Bea'), 'r1')).toEqual({ error: 'Forbidden' })
  expect(request(combatantId(server, 'Goblin 1'), 'r2')).toEqual({ error: 'Forbidden' })

  // 150% text: the reopened entry still fits the screen.
  await edit.click()
  await page.evaluate(() => (document.documentElement.style.fontSize = '150%'))
  await expect(entry).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await evidence(page, info.project.name, 'player-initiative-150', 'RYT-042')
  await page.evaluate(() => (document.documentElement.style.fontSize = ''))
  await entry.getByRole('button', { name: 'Cancelar' }).click()
  await expect(edit).toBeFocused()

  // The fight starts: the own total is locked and the turn banner takes over.
  dmSets(server, { Bea: 15, 'Goblin 1': 12 })
  server.act('set_encounter_status', { target_encounter: id, new_status: 'active' })
  await expect(banner).toContainText('¡Te toca!', { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Editar la iniciativa de Arin' })).toHaveCount(0)
  await expect(entry).toHaveCount(0)
  expect(request(combatantId(server, 'Arin'), 'r3')).toEqual({ error: 'Initiative closed' })
  await audit(page)
  await evidence(page, info.project.name, 'player-turn', 'RYT-042')

  // The DM ends the fight: the same screen becomes the summary.
  server.act('apply_combat_hp', {
    target_encounter: id,
    hp_mode: 'damage',
    hits: [{ combatant_id: combatantId(server, 'Goblin 1'), amount: 7 }],
    request_id: 'hit',
  })
  server.act('set_encounter_status', { target_encounter: id, new_status: 'ended' })
  const recap = page.getByRole('region', { name: 'Resumen del combate' })
  await expect(recap).toBeVisible({ timeout: 15_000 })
  await expect(recap).toContainText('Más daño hecho: Arin, 7')
  await expect(recap.getByRole('region', { name: 'Grupo' })).toContainText('Arin')
  await expect(recap.getByRole('region', { name: 'Enemigos' })).toContainText('Goblin 1')
  await expect(page.locator('.combat-rail')).toHaveCount(0)
  await audit(page)
  await evidence(page, info.project.name, 'player-summary', 'RYT-042')

  // Every combat route is the table view for a Player; the old table link lands on it too.
  await page.goto(`./#/campaign/${campaignId}/combat/${id}/table`)
  await expect(page).toHaveURL(new RegExp(`/combat/${id}$`))
  await expect(page.getByRole('region', { name: 'Resumen del combate' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Consola del DM' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('RYT-042 the DM opens the table view and switches to the console without losing state', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  server.seedActive()
  const id = server.encounters[0]!.id
  await page.goto(`./#/campaign/${campaignId}/combat/${id}`)
  // The table view is the default: the table projection, no console controls.
  const tableRadio = page.getByRole('radio', { name: 'Mesa' })
  const consoleRadio = page.getByRole('radio', { name: 'Consola del DM' })
  await expect(tableRadio).toBeChecked()
  await expect(page.locator('.combat-table-active')).toHaveText('Arin')
  await expect(row(page, 'Goblin 1')).toContainText('Ileso')
  await expect(row(page, 'Goblin 1')).not.toContainText('PG')
  await expect(page.getByRole('button', { name: 'Siguiente turno' })).toHaveCount(0)
  await expectTouchTargets(page, '.combat-view-switch label')
  await audit(page)
  await evidence(page, info.project.name, 'dm-table', 'RYT-042')

  // Keyboard: arrows move between the two views; focus stays on the switch.
  await tableRadio.focus()
  await page.keyboard.press('ArrowRight')
  await expect(consoleRadio).toBeChecked()
  await expect(consoleRadio).toBeFocused()
  await expect(page).toHaveURL(/view=console/)
  await evidence(page, info.project.name, 'dm-switch-keyboard', 'RYT-042')
  const next = page.getByRole('button', { name: 'Siguiente turno' })
  await expect(next).toBeVisible()
  // Console state: the turn moved once and targets are being chosen.
  await next.click()
  await expect(page.getByRole('region', { name: 'Controles de turno' })).toContainText('Bea')
  await page.getByRole('button', { name: 'Elegir objetivos' }).click()
  await page.getByRole('checkbox', { name: 'Elegir a Goblin 2' }).check()
  await audit(page)
  await evidence(page, info.project.name, 'dm-console', 'RYT-042')

  // Touch: tap the table view, then come back with the keyboard; nothing was lost.
  await view(page, 'Mesa')
  await expect(page.locator('.combat-table-active')).toHaveText('Bea')
  await expect(page.getByRole('checkbox', { name: 'Elegir a Goblin 2' })).toHaveCount(0)
  await tableRadio.focus()
  await page.keyboard.press('ArrowRight')
  await expect(consoleRadio).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Elegir a Goblin 2' })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Dejar de elegir' })).toBeVisible()

  // A reload keeps the chosen view.
  await page.reload()
  await expect(consoleRadio).toBeChecked()
  await expect(next).toBeVisible()
  expect(errors).toEqual([])
})

test('RYT-042 table view entry and summary pass axe in English and light theme', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-color-scheme', 'light')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  const id = server.seedInitiative()
  await page.goto(`./#/campaign/${campaignId}/combat`)
  const entry = page.getByRole('region', { name: 'Your initiative' })
  await expect(entry).toBeVisible({ timeout: 15_000 })
  await expect(entry).toContainText('Roll d20 + 2')
  await expect(page.locator('.combat-table-now')).toContainText('Roll initiative')
  await entry.getByRole('textbox', { name: 'Initiative total for Arin' }).fill('14')
  await audit(page)
  await evidence(page, info.project.name, 'player-initiative-en-light', 'RYT-042')
  dmSets(server, { Arin: 14, Bea: 10, 'Goblin 1': 8 })
  server.act('set_encounter_status', { target_encounter: id, new_status: 'active' })
  await expect(page.locator('.combat-table-now')).toContainText('Your turn!', { timeout: 15_000 })
  server.act('set_encounter_status', { target_encounter: id, new_status: 'ended' })
  const recap = page.getByRole('region', { name: 'Combat summary' })
  await expect(recap).toBeVisible({ timeout: 15_000 })
  await expect(recap).toContainText('Standing')
  await audit(page)
  await evidence(page, info.project.name, 'summary-en-light', 'RYT-042')
})
