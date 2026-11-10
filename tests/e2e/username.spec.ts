import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'

// RYT-078: one username per account. After every sign-in a dialog asks for it while the account
// has none; once set, it changes only in Settings.
test('after signing in, a dialog asks for a username, suggests one and refuses a taken name', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { username: null })
  await page.goto('./')
  const dialog = page.getByRole('dialog', { name: 'Elige tu nombre de usuario' })
  await expect(dialog).toBeVisible()
  const field = dialog.getByRole('textbox', { name: 'Nombre de usuario' })
  // "dm" is too short to be a username, so the suggestion pads it neutrally; the field has focus.
  await expect(field).toHaveValue('dm_1')
  await expect(field).toBeFocused()
  await field.fill('dm')
  await dialog.getByRole('button', { name: 'Usar este nombre' }).click()
  await expect(dialog.getByText('Usa de 3 a 24 caracteres.')).toBeVisible()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  // The message describes the field, and the error state keeps AA contrast.
  const describedBy = (await field.getAttribute('aria-describedby'))!
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Usa de 3 a 24 caracteres.')
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  )
  // A reserved name is refused while typing: more typing cannot fix it.
  await field.fill('admin')
  await expect(dialog.getByText('Ese nombre está reservado. Prueba otro.')).toBeVisible()
  await field.fill('taken_name')
  await expect(dialog.getByText('Otra persona ya usa ese nombre. Prueba otro.')).toBeVisible()
  await field.fill('Dana_DM')
  await expect(dialog.getByText('Disponible')).toBeVisible()
  await expectTouchTargets(dialog, 'button, input')
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  )
  await capture(page, `docs/evidence/RYT-078/dialog-${info.project.name}.png`)
  await dialog.getByRole('button', { name: 'Usar este nombre' }).click()
  // The dialog confirms the name with focus on Close, then closes onto the page.
  const done = page.getByRole('dialog', { name: 'Ya tienes nombre de usuario' })
  await expect(done.getByRole('status')).toContainText('Tus DM te verán como Dana_DM.')
  await expect(done.getByRole('button', { name: 'Cerrar' })).toBeFocused()
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  )
  await page.keyboard.press('Enter')
  await expect(done).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  expect(fixture.calls.find((c) => c.method === 'set_my_username')?.body).toEqual({
    new_username: 'Dana_DM',
  })
  await page.getByRole('button', { name: /Perfil/ }).click()
  await expect(page.locator('.account-dropdown .user-name')).toHaveText('Dana_DM')
  // With a username, signing in again asks nothing.
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(dialog).toHaveCount(0)
})

test('the dialog appears on any page after signing in', async ({ page }) => {
  await identityFixture(page, { username: null })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('dialog', { name: 'Elige tu nombre de usuario' })).toBeVisible()
})

test('the dialog waits while Settings, which holds the same field, is open', async ({ page }) => {
  await identityFixture(page, { username: null })
  await page.goto('./#/settings')
  const drawer = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(drawer).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Elige tu nombre de usuario' })
  await expect(dialog).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(dialog).toBeVisible()
  // The dialog opens after the drawer has returned focus, so focus ends inside the dialog.
  const field = dialog.getByRole('textbox', { name: 'Nombre de usuario' })
  await expect(field).toBeFocused()
  await page.waitForTimeout(600)
  await expect(field).toBeFocused()
})

test('"Later" and Escape close it until the next sign-in', async ({ page }) => {
  await identityFixture(page, { username: null })
  await page.goto('./')
  const dialog = page.getByRole('dialog', { name: 'Elige tu nombre de usuario' })
  await dialog.getByRole('button', { name: 'Más tarde' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#main-content')).toBeFocused()
  // Same session: a reload does not ask again.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  // Sign out, then sign in again (the fixture restores the session on load): it asks again.
  await page.getByRole('button', { name: /Perfil/ }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  await page.reload()
  await expect(dialog).toBeVisible()
  // Escape is "Later" too.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(dialog).toHaveCount(0)
})

test('Settings shows and changes the username; no prompt once one is set', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Elige tu nombre de usuario' })).toHaveCount(0)
  await page.getByRole('button', { name: /Perfil/ }).click()
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Ajustes' })
  const field = drawer.getByRole('textbox', { name: 'Nombre de usuario' })
  await expect(field).toHaveValue('Table_Hero')
  await expect(drawer.getByText('Es tu nombre de usuario.')).toBeVisible()
  const save = drawer.getByRole('button', { name: 'Guardar nombre' })
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await field.fill('Peña')
  await field.blur()
  await expect(drawer.getByText('Usa solo letras sin tilde, números y _.')).toBeVisible()
  await field.fill('Table_Legend')
  await expect(drawer.getByText('Disponible')).toBeVisible()
  // Saving with the button keeps keyboard focus on it (aria-disabled, not native disabled).
  await save.focus()
  await page.keyboard.press('Enter')
  await expect(drawer.getByText('Guardado. Tus mesas ya ven este nombre.')).toBeVisible()
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await expect(save).toBeFocused()
  expect((await new AxeBuilder({ page }).include('.settings-panel').analyze()).violations).toEqual(
    [],
  )
  await capture(page, `docs/evidence/RYT-078/settings-${info.project.name}.png`)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('Settings offers a retry when the username cannot be loaded; focus survives the retry', async ({
  page,
}) => {
  await identityFixture(page)
  let attempts = 0
  await page.route('**/rest/v1/rpc/get_my_username', async (route) => {
    attempts += 1
    // Queries retry once (providers.tsx): the load and the first retry fail (two requests each);
    // the second retry answers slowly, then succeeds.
    if (attempts <= 4)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"x"}',
      })
    await new Promise((resolve) => setTimeout(resolve, 600))
    return route.fallback()
  })
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil/ }).click()
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(drawer.getByRole('alert')).toContainText('No pudimos cargar tu nombre de usuario.')
  const retry = drawer.getByRole('button', { name: 'Reintentar' })
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => attempts).toBe(4)
  await expect(retry).toBeFocused()
  await expect(retry).not.toHaveAttribute('aria-busy')
  await page.keyboard.press('Enter')
  await expect(retry).toHaveAttribute('aria-busy', 'true')
  await expect(retry).toBeFocused()
  const field = drawer.getByRole('textbox', { name: 'Nombre de usuario' })
  await expect(field).toHaveValue('Table_Hero')
  await expect(field).toBeFocused()
})
