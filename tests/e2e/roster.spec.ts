import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId, reserveIds } from './fixtures/identity.ts'
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
    'main button:visible:not(.glossary-term), main a.roster-link:visible, main a.roster-sheet:visible, [role="dialog"] button:visible',
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
  // Escape closes without creating anything.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  expect(f.calls.filter((c) => c.method === 'create_own_character')).toHaveLength(0)
  await welcome.getByRole('button', { name: 'Crear mi personaje' }).click()
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
  await expect(page.getByText('Cuatro personajes es el máximo por campaña.')).toBeVisible()
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

test('a blocked switch explains why and keeps the active character', async ({ page }) => {
  await identityFixture(page, { player: true, reserve: ['Bram'] })
  await page.route('**/rest/v1/rpc/set_active_character', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Trade busy' }),
    }),
  )
  await page.goto(rosterPath)
  const group = page.getByRole('radiogroup', { name: 'Personaje activo' })
  await group.getByRole('radio', { name: 'Bram' }).check({ force: true })
  await expect(page.getByRole('alert')).toContainText('Arin tiene un intercambio abierto')
  await expect(group.getByRole('radio', { name: 'Arin' })).toBeChecked()
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
  await page.getByRole('link', { name: 'Personajes de los jugadores, 2 en total' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Personajes de los jugadores' }),
  ).toBeVisible()
  const arin = page.getByRole('region', { name: 'Arin' })
  await expect(arin.getByRole('group')).toHaveCount(3)
  await expect(arin.getByRole('group', { name: 'Arin' })).toContainText('Activo')
  await expect(arin.getByRole('group', { name: 'Cora' })).toContainText('En reserva')
  await expect(page.getByRole('region', { name: 'Bea P.' }).getByRole('group')).toHaveCount(1)
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'dm-rosters')
})
