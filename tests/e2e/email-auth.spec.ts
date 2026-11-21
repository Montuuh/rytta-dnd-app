import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, passwordFixture, storageKey } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'

async function axe(page: Page) {
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
}
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

async function openSheet(page: Page) {
  await page.goto('./')
  const open = page.getByRole('button', { name: 'Continuar con email' })
  await open.click()
  const sheet = page.getByRole('dialog', { name: 'Entrar con email' })
  await expect(sheet).toBeVisible()
  return { open, sheet }
}

test('RYT-157 signs in with email and password from the landing sheet', async ({ page }, info) => {
  const fixture = await identityFixture(page, { signedIn: false })
  const { open, sheet } = await openSheet(page)
  // The email field takes focus; password managers get the usual hints.
  const email = sheet.getByRole('textbox', { name: 'Email' })
  await expect(email).toBeFocused()
  await expect(email).toHaveAttribute('autocomplete', 'username')
  const password = sheet.getByRole('textbox', { name: 'Contraseña', exact: true })
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  // The password box is the target; its inner input sits inside it.
  await expectTouchTargets(
    sheet,
    'button:visible, input[type=email]:visible, .mantine-PasswordInput-input:visible',
  )
  await axe(page)
  await noOverflow(page)
  await capture(page, info.outputPath('email-sign-in.png'))
  // A wrong password gets one generic message.
  await email.fill('ana@example.com')
  await password.fill('wrong password')
  await sheet.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(sheet.getByRole('alert')).toHaveText('El email o la contraseña no son correctos.')
  // Show and hide the password.
  await sheet.getByRole('button', { name: 'Mostrar contraseña' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await sheet.getByRole('button', { name: 'Ocultar contraseña' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  // Escape closes the sheet and focus returns to the button that opened it.
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(open).toBeFocused()
  await open.click()
  await sheet.getByRole('textbox', { name: 'Email' }).fill(' ana@example.com ')
  await sheet.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(passwordFixture)
  await sheet.getByRole('button', { name: 'Entrar', exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  const login = fixture.calls.filter((c) => c.method === 'token')
  expect(login.at(-1)?.body).toMatchObject({ email: 'ana@example.com', password: passwordFixture })
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).not.toBeNull()
})

test('RYT-157 creates an account, shows the one password rule and waits for the email', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { signedIn: false })
  const { sheet } = await openSheet(page)
  await sheet.getByRole('textbox', { name: 'Email' }).fill('nuevo@example.com')
  await sheet.getByRole('button', { name: 'Crear una' }).click()
  const create = page.getByRole('dialog', { name: 'Crear cuenta' })
  // The typed email stays and takes focus; the new password gets its hint and the rule.
  await expect(create.getByRole('textbox', { name: 'Email' })).toHaveValue('nuevo@example.com')
  await expect(create.getByRole('textbox', { name: 'Email' })).toBeFocused()
  const password = create.getByRole('textbox', { name: 'Contraseña', exact: true })
  await expect(password).toHaveAttribute('autocomplete', 'new-password')
  const rule = create.getByText('10 caracteres o más')
  await expect(password).toHaveAttribute('aria-describedby', /.+/)
  await password.fill('corta')
  await create.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  // Refused: a cross as well as the colour, and focus back on the password.
  await expect(rule).toHaveAttribute('data-state', 'missing')
  await expect(password).toBeFocused()
  expect(fixture.calls.filter((c) => c.method === 'signup')).toHaveLength(0)
  await password.fill('una frase larga')
  await expect(rule).toHaveAttribute('data-state', 'met')
  await axe(page)
  await capture(page, info.outputPath('email-sign-up.png'))
  await create.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  const check = page.getByRole('dialog', { name: 'Revisa tu correo' })
  await expect(check).toContainText('nuevo@example.com')
  // The message is announced and holds focus.
  await expect(check.getByRole('status').first()).toBeFocused()
  const signup = fixture.calls.find((c) => c.method === 'signup')
  expect(signup?.body).toMatchObject({ email: 'nuevo@example.com', password: 'una frase larga' })
  // Resend waits out its cooldown first.
  await expect(check.getByRole('button', { name: /Reenviar en \d+ s/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await axe(page)
  await noOverflow(page)
  await capture(page, info.outputPath('email-check.png'))
  await check.getByRole('button', { name: 'Cambiar el email' }).click()
  await expect(page.getByRole('dialog', { name: 'Crear cuenta' })).toBeVisible()
})

test('RYT-157 an unconfirmed account can ask for the confirmation email again', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { signedIn: false })
  const { sheet } = await openSheet(page)
  await sheet.getByRole('textbox', { name: 'Email' }).fill('unconfirmed@example.com')
  await sheet.getByRole('textbox', { name: 'Contraseña', exact: true }).fill(passwordFixture)
  await sheet.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText('Todavía no has confirmado este email')
  await sheet.getByRole('button', { name: 'Reenviar el correo' }).click()
  const check = page.getByRole('dialog', { name: 'Revisa tu correo' })
  await expect(check.getByRole('status').filter({ hasText: 'Correo reenviado.' })).toBeVisible()
  expect(fixture.calls.filter((c) => c.method === 'resend')).toHaveLength(1)
})

test('RYT-157 a password reset never says whether the account exists', async ({ page }, info) => {
  const fixture = await identityFixture(page, { signedIn: false })
  const { sheet } = await openSheet(page)
  await sheet.getByRole('button', { name: '¿Olvidaste la contraseña?' }).click()
  const forgot = page.getByRole('dialog', { name: 'Recuperar la contraseña' })
  await forgot.getByRole('textbox', { name: 'Email' }).fill('nadie')
  await forgot.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(forgot.getByRole('alert')).toHaveText('Escribe un email válido.')
  await forgot.getByRole('textbox', { name: 'Email' }).fill('quien-sea@example.com')
  await forgot.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(forgot.getByRole('status')).toContainText('Si hay una cuenta con ese email')
  const recover = fixture.calls.find((c) => c.method === 'recover')
  expect(recover?.body).toMatchObject({ email: 'quien-sea@example.com' })
  await axe(page)
  await capture(page, info.outputPath('email-reset-sent.png'))
  await expect(forgot.getByRole('status')).toBeFocused()
  await forgot.getByRole('button', { name: 'Volver a entrar' }).click()
  const back = page.getByRole('dialog', { name: 'Entrar con email' })
  await expect(back.getByRole('textbox', { name: 'Email' })).toBeFocused()
})

test('RYT-157 too many attempts are explained without detail', async ({ page }) => {
  await identityFixture(page, { signedIn: false })
  const { sheet } = await openSheet(page)
  await sheet.getByRole('textbox', { name: 'Email' }).fill('ana@example.com')
  await sheet.getByRole('textbox', { name: 'Contraseña', exact: true }).fill('too-many')
  await sheet.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(sheet.getByRole('alert')).toHaveText(
    'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
  )
})

test('RYT-157 the reset link signs in and asks for a new password first', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { signedIn: false })
  await page.addInitScript(
    (key) => localStorage.setItem(`${key}-code-verifier`, JSON.stringify('fixture-verifier')),
    storageKey,
  )
  await page.goto('./?code=fixture-code&auth=recovery')
  const dialog = page.getByRole('dialog', { name: 'Nueva contraseña' })
  await expect(dialog).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  const field = dialog.getByRole('textbox', { name: 'Nueva contraseña', exact: true })
  await expect(field).toBeFocused()
  await field.fill('same-as-before-1')
  await dialog.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(dialog.getByRole('alert')).toHaveText(
    'La nueva contraseña tiene que ser distinta de la anterior.',
  )
  await axe(page)
  await capture(page, info.outputPath('email-recovery.png'))
  await field.fill('mi nueva frase segura')
  await dialog.getByRole('button', { name: 'Guardar contraseña' }).click()
  // Saved is said before the dialog goes; Continue takes focus.
  await expect(dialog.getByRole('status')).toHaveText('Contraseña guardada.')
  const go = dialog.getByRole('button', { name: 'Continuar' })
  await expect(go).toBeFocused()
  await go.click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('body')).not.toBeFocused()
  const update = fixture.calls.filter((c) => c.method === 'user' && c.body.password)
  expect(update.at(-1)?.body).toMatchObject({ password: 'mi nueva frase segura' })
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
})

test('RYT-157 a signed-in user adds or changes the password in the settings', async ({ page }) => {
  const fixture = await identityFixture(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil|Abrir menú de ajustes/ }).click()
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(settings).toHaveCSS('opacity', '1')
  // A Google-only account adds a password; the field takes focus, Cancel returns it.
  const add = settings.getByRole('button', { name: 'Añadir contraseña' })
  await add.click()
  const field = settings.getByRole('textbox', { name: 'Nueva contraseña', exact: true })
  await expect(field).toBeFocused()
  await settings.getByRole('button', { name: 'Cancelar' }).click()
  await expect(add).toBeFocused()
  await add.click()
  await field.fill('una frase larga para mi cuenta')
  await settings.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(
    settings.getByRole('status').filter({ hasText: 'Contraseña guardada' }),
  ).toBeVisible()
  expect(fixture.calls.filter((c) => c.method === 'user' && c.body.password)).toHaveLength(1)
  await expect(settings.getByRole('button', { name: 'Cambiar contraseña' })).toBeFocused()
  // Once saved it stays a password account in this view, also after Cancel.
  await settings.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(settings.getByText('Para entrar también con tu email')).toHaveCount(0)
  await settings.getByRole('button', { name: 'Cancelar' }).click()
  await expect(settings.getByRole('button', { name: 'Cambiar contraseña' })).toBeFocused()
  await axe(page)
})
