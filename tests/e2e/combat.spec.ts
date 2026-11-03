import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { combatServer } from './fixtures/combat.ts'

const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
async function evidence(page: Page, project: string, name: string) {
  const s = size(project)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-007/${name}-${s}.png` })
}
async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  for (const control of await page.locator('[role="dialog"] button:visible').all()) {
    const box = await control.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
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
