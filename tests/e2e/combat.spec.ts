import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
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
const row = (page: Page, name: string) =>
  page.locator('.combat-rail .combat-row', { hasText: name }).first()

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

  // 2. The Player is asked for initiative automatically and types the d20 total.
  await arin.goto(`./#/campaign/${campaignId}/combat`)
  const ask = arin.getByRole('dialog', { name: 'Iniciativa de Arin' })
  await expect(ask).toBeVisible({ timeout: 15_000 })
  await expect(ask).toContainText('(+2)')
  await ask.getByLabel('Total').fill('18')
  await audit(arin)
  await evidence(arin, info.project.name, 'player-initiative')
  await ask.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(ask).toBeHidden()

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

  // 4. The Player sees and ends the own turn.
  await expect(arin.getByText('¡Te toca!')).toBeVisible({ timeout: 15_000 })
  await audit(arin)
  await evidence(arin, info.project.name, 'player-turn')
  await arin.getByRole('button', { name: 'Terminar mi turno' }).click()
  await expect(arin.getByText('Te toca dentro de 4 turnos')).toBeVisible({ timeout: 15_000 })
  await expect(bar).toContainText('Goblin 1', { timeout: 15_000 })

  // 5. Area damage: both goblins, one saves for half.
  await dm.getByRole('button', { name: 'Elegir objetivos' }).click()
  await dm.getByRole('checkbox', { name: 'Elegir a Goblin 1' }).check()
  await dm.getByRole('checkbox', { name: 'Elegir a Goblin 2' }).check()
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

  // 8. The table view is a read-only projection.
  const encounterId = server.encounters[0]!.id
  await dm.goto(`./#/campaign/${campaignId}/combat/${encounterId}/table`)
  await expect(dm.getByRole('link', { name: 'Salir de la vista de mesa' })).toBeVisible()
  // RYT-041: there is no full screen control for anyone.
  await expect(dm.getByRole('button', { name: 'Pantalla completa' })).toHaveCount(0)
  await expect(dm.locator('.combat-table-active')).toHaveText('Goblin 1')
  await expect(row(dm, 'Goblin 1')).toContainText('Malherido')
  await expect(dm.getByRole('button', { name: 'Siguiente turno' })).toHaveCount(0)
  await audit(dm)
  await evidence(dm, info.project.name, 'table')
  await dm.getByRole('link', { name: 'Salir de la vista de mesa' }).click()

  // 9. Ending the combat stores a summary that both sides see.
  await dm.getByRole('button', { name: 'Terminar combate' }).click()
  const end = dm.getByRole('dialog', { name: '¿Terminar este combate?' })
  await end.getByRole('button', { name: 'Terminar combate' }).click()
  await expect(dm.getByRole('heading', { name: 'Resumen del combate' })).toBeVisible()
  await audit(dm)
  await evidence(dm, info.project.name, 'summary')
  await expect(arin.getByRole('heading', { name: 'No hay combate ahora' })).toBeVisible({
    timeout: 20_000,
  })
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
  await expect(page.getByText('Your turn!')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Heal' })).toBeVisible()
  await audit(page)
  await evidence(page, info.project.name, 'player-turn-en-light')
  await page.getByRole('button', { name: 'Damage' }).click()
  const dialog = page.getByRole('dialog', { name: 'Apply damage: Arin' })
  await dialog.getByRole('textbox', { name: 'Amount' }).fill('5')
  await audit(page)
  await dialog.getByRole('button', { name: 'Apply' }).click()
  await expect(dialog).toBeHidden()
  // Focus returns to the control that opened the dialog.
  await expect(page.locator('.combat-own').getByRole('button', { name: 'Damage' })).toBeFocused()
  await expect(page.locator('.combat-own')).toContainText('19/24 HP')
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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)
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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)

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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)

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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)
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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)
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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)
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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)
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
  await page.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}`)
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
