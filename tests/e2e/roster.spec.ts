import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  archivedIds,
  identityFixture,
  campaignId,
  characterId,
  reserveIds,
} from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'

// RYT-044: Player character roster, first-character onboarding, limit of four and the
// active character that alone appears in Party.

/** Evidence screenshots (390px phone, 820px tablet) only when RYT_EVIDENCE is set. */
async function evidence(page: Page, project: string, name: string) {
  const size =
    project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
  if (size && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-044/${name}-${size}.png`, fullPage: true })
}
async function axeAndTargets(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible:not(.glossary-term), main a.roster-link:visible, main a.roster-foot-link:visible, main a.roster-row-sheet:visible, [role="dialog"] button:visible',
  )
}
const rosterPath = `./#/campaign/${campaignId}/party/roster`

test('a Player without characters is guided to create the first one', async ({ page }, info) => {
  const f = await identityFixture(page, { player: true, noCharacters: true })
  await page.goto(`./#/campaign/${campaignId}`)
  await expect(page).toHaveURL(/\/party$/)
  const welcome = page.getByRole('region', { name: '¿Con quién vas a jugar?' })
  await expect(welcome).toBeVisible()
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'onboarding')
  await welcome.getByRole('button', { name: 'Crear mi personaje' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo personaje' })
  await expect(dialog.getByLabel('Nombre del personaje')).toBeFocused()
  await dialog.getByRole('button', { name: 'Crear y hacer la ficha' }).click()
  await expect(dialog.getByText('Escribe un nombre de entre 1 y 100 caracteres.')).toBeVisible()
  // Escape and Cancel close without creating anything and return focus to the call to action.
  const cta = welcome.getByRole('button', { name: 'Crear mi personaje' })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(cta).toBeFocused()
  await page.keyboard.press('Enter')
  await dialog.getByText('Cancelar', { exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(cta).toBeFocused()
  expect(f.calls.filter((c) => c.method === 'create_own_character')).toHaveLength(0)
  // The slot rings only picture the roster; the button is the one action.
  await expect(welcome.getByRole('button')).toHaveCount(1)
  // No lede that contradicts the onboarding.
  await expect(page.getByText('Pide a tu DM', { exact: false })).toHaveCount(0)
  await cta.click()
  await dialog.getByLabel('Nombre del personaje').fill('  Vex  ')
  await evidence(page, info.project.name, 'create-dialog')
  await dialog.getByLabel('Nombre del personaje').press('Enter')
  // The new character continues straight into the sheet wizard.
  await expect(page).toHaveURL(/\/party\/40000000-0000-4000-8000-0000000000e1\/create$/)
  const created = f.calls.filter((c) => c.method === 'create_own_character')
  expect(created).toHaveLength(1)
  expect(created[0]!.body).toMatchObject({ target_campaign: campaignId, character_name: 'Vex' })
  expect(created[0]!.body.request_id).toMatch(/^[0-9a-f-]{36}$/)
  // Back on Party the first character is the active one.
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Vex', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mis personajes, 1 en total' })).toBeVisible()
})

test('a Player creates characters up to the limit of four', async ({ page }, info) => {
  const f = await identityFixture(page, { player: true, reserve: ['Bram', 'Cora'] })
  await page.goto(rosterPath)
  await expect(page.getByRole('heading', { level: 1, name: 'Mis personajes' })).toBeVisible()
  const group = page.getByRole('radiogroup', { name: 'Personaje activo' })
  await expect(group.getByRole('radio')).toHaveCount(3)
  await expect(group.getByRole('radio', { name: 'Arin' })).toBeChecked()
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'roster')
  await page.getByRole('button', { name: 'Crear un personaje (hueco 4 de 4)' }).click()
  await page.getByRole('dialog').getByLabel('Nombre del personaje').fill('Dax')
  await page.getByRole('dialog').getByRole('button', { name: 'Crear y hacer la ficha' }).click()
  await expect(page).toHaveURL(/\/create$/)
  await page.goto(rosterPath)
  await expect(group.getByRole('radio')).toHaveCount(4)
  // New characters wait in reserve; Arin stays active.
  await expect(group.getByRole('radio', { name: 'Dax' })).not.toBeChecked()
  await expect(group.getByRole('radio', { name: 'Arin' })).toBeChecked()
  await expect(page.getByRole('button', { name: /Crear un personaje/ })).toHaveCount(0)
  await expect(
    page.getByText('Los cuatro huecos están ocupados. Archiva un personaje para liberar uno.'),
  ).toBeVisible()
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'roster-full')
  expect(f.calls.filter((c) => c.method === 'create_own_character')).toHaveLength(1)
})

test('switching the active character changes who appears in Party', async ({ page }, info) => {
  const f = await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    reserve: ['Bram'],
  })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bram', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Bea', exact: true })).toBeVisible()
  await evidence(page, info.project.name, 'party-entry')
  await page.getByRole('link', { name: 'Mis personajes, 2 en total' }).click()
  const group = page.getByRole('radiogroup', { name: 'Personaje activo' })
  // Keyboard: arrow keys move the native radio selection and switch at once.
  await group.getByRole('radio', { name: 'Arin' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(group.getByRole('radio', { name: 'Bram' })).toBeChecked()
  await expect(page.getByText('Ahora juegas con Bram.')).toBeVisible()
  expect(f.calls.filter((c) => c.method === 'set_active_character')).toEqual([
    {
      method: 'set_active_character',
      body: { target_campaign: campaignId, target_character: reserveIds[0] },
    },
  ])
  await evidence(page, info.project.name, 'roster-switched')
  await page.getByRole('link', { name: 'Volver a Grupo' }).click()
  await expect(page.getByRole('heading', { name: 'Bram', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toHaveCount(0)
  // Teammates keep showing only active, shared characters.
  await expect(page.getByRole('heading', { name: 'Bea', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cato', exact: true })).toHaveCount(0)
  // The benched character is still the owner's to edit.
  await page.goto(rosterPath)
  await page.getByRole('link', { name: 'Ficha de Arin' }).click()
  await expect(page).toHaveURL(new RegExp(`/party/${characterId}$`))
})

test('a blocked switch explains why in view and keeps the active character', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, reserve: ['Bram', 'Cora'] })
  await page.route('**/rest/v1/rpc/set_active_character', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Trade busy' }),
    }),
  )
  await page.goto(rosterPath)
  const group = page.getByRole('radiogroup', { name: 'Personaje activo' })
  // Tap the card in the second row, as a phone user would.
  await page.getByText('Cora', { exact: true }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Arin tiene un intercambio abierto')
  await expect(group.getByRole('radio', { name: 'Arin' })).toBeChecked()
  // The whole explanation is on screen and not under the phone bottom bar.
  const box = (await alert.boundingBox())!
  const viewport = page.viewportSize()!
  const covered = await page.evaluate(
    ({ x, top, bottom }) =>
      [top + 2, bottom - 2].some((y) => {
        const hit = document.elementFromPoint(x, y)
        return !hit || !hit.closest('[role="alert"]')
      }),
    { x: box.x + box.width / 2, top: box.y, bottom: box.y + box.height },
  )
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  expect(covered).toBe(false)
  await evidence(page, info.project.name, 'switch-blocked')
  await alert.getByRole('button', { name: 'Cerrar' }).click()
  await expect(alert).toHaveCount(0)
  // Closing the message returns focus to the active character's radio, not the document.
  await expect(group.getByRole('radio', { name: 'Arin' })).toBeFocused()
})

test('archiving frees a slot; restoring needs one', async ({ page }, info) => {
  const f = await identityFixture(page, {
    player: true,
    reserve: ['Bram', 'Cora', 'Dax'],
    archived: ['Old'],
  })
  await page.goto(rosterPath)
  const group = page.getByRole('radiogroup', { name: 'Personaje activo' })
  await expect(group.getByRole('radio')).toHaveCount(4)
  // Archived characters wait in a collapsed section; with four in the roster none fits back.
  const archive = page.getByRole('button', { name: /Archivados/ })
  await expect(archive).toHaveAttribute('aria-expanded', 'false')
  await archive.click()
  const restoreOld = page.getByRole('button', { name: 'Restaurar a Old' })
  await expect(restoreOld).toBeDisabled()
  await expect(page.getByText('Sin hueco libre')).toBeVisible()
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'roster-archive-full')
  // The active character cannot be archived; keyboard and screen readers reach the reason.
  await page.getByRole('button', { name: 'Más acciones para Arin' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  const blocked = page
    .getByRole('menu', { name: 'Más acciones para Arin' })
    .getByRole('menuitem', { name: 'Archivar personaje' })
  await expect(blocked).toBeFocused()
  await expect(blocked).toHaveAttribute('aria-disabled', 'true')
  await expect(blocked).toHaveAccessibleDescription(
    'Activa otro personaje para poder archivar este.',
  )
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // Archive a reserve character: the confirmation says it frees a slot.
  const bramMenu = page.getByRole('button', { name: 'Más acciones para Bram' })
  await bramMenu.click()
  await page
    .getByRole('menu', { name: 'Más acciones para Bram' })
    .getByRole('menuitem', { name: 'Archivar personaje' })
    .click()
  const dialog = page.getByRole('dialog', { name: '¿Archivar a Bram?' })
  await expect(dialog).toContainText('Libera un hueco')
  // The safe choice has initial focus.
  await expect(
    dialog.locator('.roster-dialog-actions').getByRole('button', { name: 'Cancelar' }),
  ).toBeFocused()
  await evidence(page, info.project.name, 'archive-dialog')
  // Cancel returns focus to the card menu.
  await dialog.getByText('Cancelar', { exact: true }).click()
  await expect(bramMenu).toBeFocused()
  await bramMenu.click()
  await page
    .getByRole('menu', { name: 'Más acciones para Bram' })
    .getByRole('menuitem', { name: 'Archivar personaje' })
    .click()
  await dialog.getByRole('button', { name: 'Archivar' }).click()
  await expect(page.getByText('Bram está archivado. Queda un hueco libre.')).toBeVisible()
  await expect(group.getByRole('radio')).toHaveCount(3)
  await expect(
    page.getByRole('button', { name: 'Crear un personaje (hueco 4 de 4)' }),
  ).toBeVisible()
  // Now Old fits back in the free slot and returns in reserve.
  await expect(restoreOld).toBeEnabled()
  await restoreOld.click()
  await expect(page.getByText('Old vuelve al plantel.')).toBeVisible()
  await expect(group.getByRole('radio', { name: 'Old' })).not.toBeChecked()
  await expect(group.getByRole('radio', { name: 'Arin' })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Restaurar a Bram' })).toBeDisabled()
  await evidence(page, info.project.name, 'roster-archived')
  expect(f.calls.filter((c) => /archive_character|restore_character/.test(c.method))).toEqual([
    {
      method: 'archive_character',
      body: { target_campaign: campaignId, target_character: reserveIds[0] },
    },
    {
      method: 'restore_character',
      body: { target_campaign: campaignId, target_character: archivedIds[0] },
    },
  ])
  // Archived characters stay out of Party.
  await page.getByRole('link', { name: 'Volver a Grupo' }).click()
  await expect(page.getByRole('link', { name: 'Mis personajes, 4 en total' })).toBeVisible()
})

test('the DM archives an unassigned character from Party and restores it', async ({
  page,
}, info) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  const more = page.getByRole('button', { name: 'Más acciones para Arin' })
  await more.click()
  await page.getByRole('menuitem', { name: 'Archivar personaje' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Archivar a Arin?' })
  await expect(dialog).toContainText('Sale de Grupo')
  await dialog.getByRole('button', { name: 'Archivar' }).click()
  // The card is gone; focus lands on the outcome message instead of the document body.
  await expect(page.getByRole('status').filter({ hasText: 'Arin está archivado.' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Personajes de los jugadores' }).click()
  await page.getByRole('button', { name: /Archivados/ }).click()
  const row = page.getByRole('group', { name: 'Arin' })
  await expect(row).toContainText('Sin jugador')
  // Let the accordion finish opening before the evidence capture.
  await page.waitForTimeout(400)
  await evidence(page, info.project.name, 'dm-archived')
  await page.getByRole('button', { name: 'Restaurar a Arin' }).click()
  await expect(page.getByText('Arin vuelve al plantel.')).toBeVisible()
  await page.getByRole('link', { name: 'Volver a Grupo' }).click()
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  expect(f.calls.filter((c) => /archive_character|restore_character/.test(c.method))).toHaveLength(
    2,
  )
})

test('a slow restore leaves focus where the user moved it', async ({ page }) => {
  await identityFixture(page, { player: true, archived: ['Old'] })
  await page.route('**/rest/v1/rpc/restore_character', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.fallback()
  })
  await page.goto(rosterPath)
  await page.getByRole('button', { name: /Archivados/ }).click()
  await page.getByRole('button', { name: 'Restaurar a Old' }).click()
  // The user moves on while the restore is pending; the outcome must not pull them back.
  const back = page.getByRole('link', { name: 'Volver a Grupo' })
  await back.focus()
  await expect(page.getByText('Old vuelve al plantel.')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(back).toBeFocused()
})

test('English light roster', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-color-scheme', 'light')
  })
  await identityFixture(page, { player: true, reserve: ['Bram'] })
  await page.goto(rosterPath)
  await expect(page.getByRole('heading', { level: 1, name: 'My characters' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Arin' })).toBeChecked()
  await expect(page.getByText('In reserve')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create a character (slot 3 of 4)' })).toBeVisible()
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'roster-en-light')
})

test('the DM Player preview shows the roster read-only', async ({ page }) => {
  const f = await identityFixture(page, { linkedPlayer: true, reserve: ['Bram'] })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await page.getByRole('link', { name: 'Mis personajes, 2 en total' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Personajes de Arin' })).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Bram' })).toContainText('En reserva')
  await expect(page.getByRole('button', { name: /Crear un personaje/ })).toHaveCount(0)
  expect(f.calls.filter((c) => c.method === 'set_active_character')).toHaveLength(0)
})

test('the DM sees every Player roster with active and reserve characters', async ({
  page,
}, info) => {
  await identityFixture(page, { linkedPlayer: true, party: true, reserve: ['Bram', 'Cora'] })
  await page.goto(`./#/campaign/${campaignId}/party`)
  // Party lists characters in play only.
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bram', exact: true })).toHaveCount(0)
  // The DM entry point counts the reserve, in words.
  const link = page.getByRole('link', { name: 'Personajes de los jugadores, 2 en reserva' })
  await expect(link).toContainText('2 en reserva')
  await link.click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Personajes de los jugadores' }),
  ).toBeVisible()
  const arin = page.getByRole('region', { name: 'Arin' })
  await expect(arin.getByRole('group')).toHaveCount(3)
  await expect(arin.getByRole('group', { name: 'Arin' })).toContainText('Activo')
  await expect(arin.getByRole('group', { name: 'Cora' })).toContainText('En reserva')
  await expect(arin.getByText('3 de 4 personajes')).toBeAttached()
  await expect(page.getByRole('region', { name: 'Bea P.' }).getByRole('group')).toHaveCount(1)
  // Compact lists: no empty placeholder tiles for the DM.
  await expect(page.locator('.roster-slot.is-empty')).toHaveCount(0)
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'dm-rosters')
})

test('a full roster with archived characters fits at 150% text', async ({ page }, info) => {
  await identityFixture(page, {
    player: true,
    reserve: ['Bram', 'Cora', 'Dax'],
    archived: ['Old'],
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(rosterPath)
  await expect(page.getByRole('radio', { name: 'Arin' })).toBeChecked()
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  await page.getByRole('button', { name: /Archivados/ }).click()
  await expect(page.getByRole('button', { name: 'Restaurar a Old' })).toBeVisible()
  await expect(page.getByText('Sin hueco libre')).toBeVisible()
  // No sideways scroll, even with "No free slot" and a disabled Restore in one row.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  // The corner menu never covers the medallion.
  const card = page
    .locator('.roster-slot')
    .filter({ has: page.getByRole('radio', { name: 'Arin' }) })
  const menu = (await card.getByRole('button', { name: 'Más acciones para Arin' }).boundingBox())!
  const medallion = (await card.locator('.portrait-medallion').boundingBox())!
  const overlap =
    menu.x < medallion.x + medallion.width &&
    medallion.x < menu.x + menu.width &&
    menu.y < medallion.y + medallion.height &&
    medallion.y < menu.y + menu.height
  expect(overlap).toBe(false)
  await evidence(page, info.project.name, 'roster-archive-150')
})

test('a Player with only archived characters can restore one or create another', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { player: true, noCharacters: true, archived: ['Old'] })
  await page.goto(`./#/campaign/${campaignId}/party`)
  const welcome = page.getByRole('region', { name: '¿Con quién vas a jugar?' })
  await expect(welcome).toContainText('Tus personajes están archivados.')
  await expect(welcome.getByRole('button', { name: 'Crear un personaje nuevo' })).toBeVisible()
  await evidence(page, info.project.name, 'onboarding-archived')
  await welcome.getByRole('link', { name: 'Ver personajes archivados' }).click()
  // No empty radio group; the archived section is already open.
  await expect(page.getByRole('radiogroup')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Archivados/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await axeAndTargets(page)
  await page.getByRole('button', { name: 'Restaurar a Old' }).click()
  await expect(page.getByText('Old vuelve al plantel.')).toBeVisible()
  // With no other character, the restored one becomes the active one.
  await expect(page.getByRole('radio', { name: 'Old' })).toBeChecked()
  expect(f.calls.filter((c) => c.method === 'restore_character')).toHaveLength(1)
})
