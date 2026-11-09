import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'

// RYT-078: one username per account, asked on the hub and edited in Settings.
test('the hub asks for a username, suggests one from the email and refuses a taken name', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { username: null })
  await page.goto('./')
  const prompt = page.getByRole('region', { name: 'Elige tu nombre de usuario' })
  await expect(prompt).toBeVisible()
  const field = prompt.getByRole('textbox', { name: 'Nombre de usuario' })
  // "dm" is too short to be a username, so the suggestion pads it.
  await expect(field).toHaveValue('dm_player')
  await field.fill('dm')
  await prompt.getByRole('button', { name: 'Usar este nombre' }).click()
  await expect(prompt.getByText('Usa de 3 a 24 caracteres.')).toBeVisible()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  // The message describes the field, and the error state keeps AA contrast.
  const describedBy = (await field.getAttribute('aria-describedby'))!
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Usa de 3 a 24 caracteres.')
  expect((await new AxeBuilder({ page }).include('.username-prompt').analyze()).violations).toEqual(
    [],
  )
  // A reserved name is refused while typing: more typing cannot fix it.
  await field.fill('admin')
  await expect(prompt.getByText('Ese nombre está reservado. Prueba otro.')).toBeVisible()
  await field.fill('taken_name')
  await expect(prompt.getByText('Otra persona ya usa ese nombre. Prueba otro.')).toBeVisible()
  await field.fill('Dana_DM')
  await expect(prompt.getByText('Disponible')).toBeVisible()
  await expectTouchTargets(prompt, 'button, input')
  expect((await new AxeBuilder({ page }).include('.username-prompt').analyze()).violations).toEqual(
    [],
  )
  await capture(page, `docs/evidence/RYT-078/hub-prompt-${info.project.name}.png`)
  await prompt.getByRole('button', { name: 'Usar este nombre' }).click()
  // The card confirms the name and takes focus, then closes.
  const done = prompt.getByRole('status')
  await expect(done).toContainText('Listo: tus DM te verán como Dana_DM.')
  await expect(done).toBeFocused()
  await prompt.getByRole('button', { name: 'Cerrar' }).click()
  await expect(prompt).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeFocused()
  expect(fixture.calls.find((c) => c.method === 'set_my_username')?.body).toEqual({
    new_username: 'Dana_DM',
  })
  await page.getByRole('button', { name: /Perfil/ }).click()
  await expect(page.locator('.account-dropdown .user-name')).toHaveText('Dana_DM')
})

test('"Later" hides the prompt for this session', async ({ page }) => {
  await identityFixture(page, { username: null })
  await page.goto('./')
  await page.getByRole('button', { name: 'Más tarde' }).click()
  await expect(page.getByRole('region', { name: 'Elige tu nombre de usuario' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Elige tu nombre de usuario' })).toHaveCount(0)
})

test('Settings shows and changes the username; no prompt once one is set', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Elige tu nombre de usuario' })).toHaveCount(0)
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
