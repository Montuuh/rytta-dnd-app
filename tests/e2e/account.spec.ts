import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'

/** RYT-115: Settings > Your account: data export and self-service deletion. The RPCs are the
 * fixture's (tests/e2e/fixtures/identity.ts); their SQL is tested in tests/database. */
type Account = NonNullable<Parameters<typeof identityFixture>[1]>['account']

async function openSettings(page: Page, account?: Account) {
  const fixture = await identityFixture(page, { account })
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil|Abrir menú de ajustes/ }).click()
  await page.getByRole('menuitem', { name: 'Ajustes', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(settings).toHaveCSS('opacity', '1')
  const trigger = settings.getByRole('button', { name: 'Eliminar mi cuenta…' })
  await trigger.scrollIntoViewIfNeeded()
  return { settings, trigger, calls: fixture.calls }
}

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)

async function expectAxeClean(page: Page) {
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations.map((v) => v.id)).toEqual([])
}

test('the account section includes data controls and legal links and passes axe', async ({
  page,
}, testInfo) => {
  const { settings } = await openSettings(page)
  const section = settings.getByRole('region', { name: 'Tu cuenta' })
  await expect(section.getByRole('button', { name: 'Descargar mis datos' })).toBeVisible()
  await expect(section.getByRole('button', { name: 'Eliminar mi cuenta…' })).toBeVisible()
  await expect(section.getByRole('link', { name: 'Política de privacidad' })).toBeVisible()
  await expect(section.getByRole('link', { name: 'Condiciones de uso' })).toBeVisible()
  await expect(section).toContainText('te retira de todas tus campañas')
  await expectTouchTargets(section, 'button:visible, a:visible')
  expect(await noOverflow(page)).toBe(true)
  await expectAxeClean(page)
  await capture(page, testInfo.outputPath('account-section.png'))
})

test('Download my data saves a JSON file named after the export day', async ({ page }) => {
  const { settings } = await openSettings(page)
  const download = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Descargar mis datos' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('rytta-export-2026-11-17.json')
  const saved = JSON.parse(await readFile((await file.path())!, 'utf8'))
  expect(saved.format).toBe('rytta-account-export')
  expect(saved.memberships).toHaveLength(1)
  await expect(settings.getByRole('status').filter({ hasText: 'Guardado como' })).toContainText(
    'rytta-export-2026-11-17.json',
  )
})

test('a capped export names the cut sections in words, never table names', async ({ page }) => {
  const { settings } = await openSettings(page, {
    truncated: ['inventory_events', 'combat_events', 'future_table', 'other_table'],
  })
  const download = page.waitForEvent('download')
  await settings.getByRole('button', { name: 'Descargar mis datos' }).click()
  await download
  const status = settings.getByRole('status').filter({ hasText: 'Guardado como' })
  await expect(status).toContainText(
    'primeras 500 filas de: historial de inventario, historial de combate, otros apartados.',
  )
  await expect(status).not.toContainText('_')
})

test('a sole DM with other members sees the campaigns and no confirm control', async ({
  page,
}, testInfo) => {
  const { settings, trigger } = await openSettings(page, { blocked: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toHaveCSS('opacity', '1')
  await expect(dialog).toContainText('Eres el único DM de estas campañas')
  await expect(dialog.getByRole('listitem')).toHaveCount(2)
  await expect(dialog).toContainText('The Sunken Coast')
  await expect(dialog).toContainText('Otros miembros: 3')
  await expect(dialog).toContainText('pasar el rol de DM')
  await expect(dialog).toContainText('quitar a los demás miembros')
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /Eliminar mi cuenta/ })).toHaveCount(0)
  await expectTouchTargets(dialog, 'button:visible, a:visible')
  expect(await noOverflow(page)).toBe(true)
  await expectAxeClean(page)
  await capture(page, testInfo.outputPath('account-blocked.png'))
  const link = dialog.getByRole('link', { name: 'Miembros de The Sunken Coast' })
  await expect(link).toHaveAttribute('href', new RegExp(`/campaign/${campaignId}/members$`))
  await link.click()
  await expect(page).toHaveURL(new RegExp(`#/campaign/${campaignId}/members`))
  await expect(dialog).toBeHidden()
  await expect(settings).toBeHidden()
})

test('the delete button waits for the exact word; Escape returns focus to the trigger', async ({
  page,
}, testInfo) => {
  const { trigger } = await openSettings(page)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toHaveCSS('opacity', '1')
  await expect(dialog.getByRole('heading', { name: 'Qué se elimina' })).toBeVisible()
  await expect(dialog).toContainText('Tu perfil y tus membresías')
  await expect(dialog).toContainText('Qué se queda')
  await expect(dialog).toContainText('sin tu nombre')
  await expect(dialog).toContainText('El borrado de tu cuenta de Rytta es permanente')
  const confirm = dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' })
  const input = dialog.getByRole('textbox', { name: 'Escribe DELETE para confirmar' })
  await expect(confirm).toBeDisabled()
  // The instruction is tied to the locked button, and the locked button stays readable.
  const hint = await confirm.getAttribute('aria-describedby')
  await expect(page.locator(`#${hint}`)).toContainText('palabra en inglés')
  await expect(confirm).toHaveCSS('opacity', '1')
  await expectTouchTargets(dialog, 'button:visible, input:visible')
  // Both actions stack at full width on phones and tablets, never a ragged two-row wrap.
  const keep = await dialog.getByRole('button', { name: 'Conservar mi cuenta' }).boundingBox()
  const gone = await confirm.boundingBox()
  expect(Math.abs(keep!.x - gone!.x)).toBeLessThan(2)
  expect(Math.abs(keep!.width - gone!.width)).toBeLessThan(2)
  // RYT-121: the safe action comes first on screen and in the tab order.
  expect(keep!.y).toBeLessThan(gone!.y)
  expect(
    await dialog.evaluate(
      (node) =>
        getComputedStyle(node.querySelector('.account-dialog-scroll') ?? node).scrollPaddingBottom,
    ),
  ).not.toBe('auto')
  await capture(page, testInfo.outputPath('account-confirm-empty.png'))
  await input.fill('delet')
  await expect(confirm).toBeDisabled()
  // J1-29: case and stray spaces from a phone keyboard do not keep the button locked.
  await input.fill(' delete ')
  await expect(confirm).toBeEnabled()
  await input.fill('DELETE')
  await expect(confirm).toBeEnabled()
  await dialog.getByRole('button', { name: 'Conservar mi cuenta' }).focus()
  await page.keyboard.press('Tab')
  await expect(confirm).toBeFocused()
  await expectAxeClean(page)
  await capture(page, testInfo.outputPath('account-confirm-typed.png'))
  // Keyboard only: the dialog traps Tab.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible()
})

test('the dialog offers the export before deleting', async ({ page }) => {
  const { trigger } = await openSettings(page)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toHaveCSS('opacity', '1')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Descargar mis datos antes' }).click()
  expect((await download).suggestedFilename()).toBe('rytta-export-2026-11-17.json')
  await expect(dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' })).toBeDisabled()
})

test('deleting prepares, removes the images, deletes, signs out and the landing confirms it', async ({
  page,
}, testInfo) => {
  const { trigger } = await openSettings(page, { storageObjects: 2 })
  const order: string[] = []
  page.on('request', (r) => {
    const name = new URL(r.url()).pathname.split('/').at(-1)!
    if (
      ['prepare_account_deletion', 'delete_my_account'].includes(name) ||
      (r.method() === 'DELETE' && r.url().includes('/storage/v1/object/character-portraits'))
    )
      order.push(r.method() === 'DELETE' ? 'remove' : name)
  })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toHaveCSS('opacity', '1')
  await dialog.getByRole('textbox').fill('DELETE')
  const request = page.waitForRequest((r) => r.url().endsWith('/rpc/delete_my_account'))
  await dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' }).click()
  const body = (await request).postDataJSON()
  expect(body).toMatchObject({ confirmation: 'DELETE' })
  expect(typeof body.request_id).toBe('string')
  expect(order).toEqual(['prepare_account_deletion', 'remove', 'delete_my_account'])
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  const notice = page.getByRole('status').filter({ hasText: 'Tu cuenta se eliminó' })
  await expect(notice).toContainText('Tus datos y tu registro de acceso ya no existen')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Focus lands on the notice, not on a header button.
  await expect(notice).toBeFocused()
  // RYT-121: a notice focused by script after a click shows no ring; keyboard focus keeps one.
  await expect(notice).toHaveCSS('outline-style', 'none')
  expect(
    await page.evaluate(() => Object.keys(localStorage).some((k) => k.includes('auth-token'))),
  ).toBe(false)
  await expectTouchTargets(notice, 'button:visible, a:visible')
  expect(await noOverflow(page)).toBe(true)
  await expectAxeClean(page)
  await capture(page, testInfo.outputPath('account-deleted-landing.png'))
  // The local sign-out is not an expired session, before or after the notice is closed.
  await expect(page.getByRole('alert')).toHaveCount(0)
  await notice.getByRole('button', { name: 'Cerrar aviso' }).click()
  await expect(notice).toBeHidden()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a sign-in record that remains says so plainly and never points at a pending contact', async ({
  page,
}, testInfo) => {
  // 'disabled' (deleted: false), 'kept' (deleted: false) and 'shared' (deleted: true).
  const cases = [
    ['disabled', 'registro de acceso está desactivado'],
    ['kept', 'registro de acceso sigue ahí'],
    ['shared', 'registro de acceso sigue ahí'],
  ] as const
  for (const [authUser, shown] of cases) {
    await page.unrouteAll()
    const { trigger } = await openSettings(page, { authUser })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
    await expect(dialog).toHaveCSS('opacity', '1')
    await dialog.getByRole('textbox').fill('DELETE')
    await dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' }).click()
    const notice = page.getByRole('status').filter({ hasText: 'Tu cuenta se eliminó' })
    await expect(notice).toContainText(shown)
    // The fixture build publishes no VITE_CONTACT_EMAIL: no link, no "write to the contact" step.
    await expect(notice).toContainText(/datos de la aplicación/)
    await expect(notice).toContainText('cuando el servicio publique su dirección de contacto')
    await expect(notice.getByRole('link')).toHaveCount(0)
    await expect(notice).toBeFocused()
    if (authUser === 'disabled')
      await capture(page, testInfo.outputPath('account-deleted-disabled.png'))
  }
})

test('each server failure keeps the dialog open with its own message', async ({ page }) => {
  // Nine full page loads in one test.
  test.setTimeout(90_000)
  const cases: [Partial<NonNullable<Account>>, string][] = [
    [{ deleteError: 'Forbidden' }, 'Tu sesión terminó'],
    [{ deleteError: 'Unexpected' }, 'No pudimos eliminar tu cuenta'],
    [{ deleteError: 'Account deletion not prepared' }, 'No pudimos eliminar tu cuenta'],
    [{ deleteError: 'Request mismatch' }, 'No pudimos eliminar tu cuenta'],
    [{ deleteError: 'Confirmation required' }, 'La palabra no coincide'],
    [{ deleteError: 'Account deletion blocked' }, 'ahora no aparece ninguna'],
    [{ prepareError: 'Forbidden' }, 'Tu sesión terminó'],
    [{ prepareError: 'Account deletion blocked' }, 'ahora no aparece ninguna'],
    [{ prepareError: 'Unexpected' }, 'No pudimos eliminar tu cuenta'],
  ]
  for (const [account, shown] of cases) {
    await page.unrouteAll()
    const { trigger } = await openSettings(page, account)
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
    await expect(dialog).toHaveCSS('opacity', '1')
    await dialog.getByRole('textbox').fill('DELETE')
    await dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' }).click()
    await expect(dialog.getByRole('alert')).toContainText(shown)
    // A blocked retry reopens the form empty; every other failure keeps the typed word.
    if (!shown.includes('ahora no aparece')) {
      await expect(
        dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' }),
      ).toBeEnabled()
    } else {
      // The dialog re-checked and found nothing: focus stays inside it, on the message.
      await expect(dialog.getByRole('textbox')).toBeVisible()
      await expect(dialog.getByRole('alert')).toBeFocused()
      await expect(dialog.getByRole('alert')).not.toContainText('ábrelo de nuevo')
    }
  }
})

test('blockers found when deleting switch the dialog to the blocked state and keep focus', async ({
  page,
}, testInfo) => {
  const { trigger } = await openSettings(page, { blockOnPrepare: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toHaveCSS('opacity', '1')
  await dialog.getByRole('textbox').fill('DELETE')
  let deleteCalls = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/rpc/delete_my_account')) deleteCalls += 1
  })
  await dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' }).click()
  await expect(dialog).toContainText('Eres el único DM de estas campañas')
  await expect(dialog.getByRole('listitem')).toHaveCount(2)
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /Eliminar cuenta/ })).toHaveCount(0)
  expect(deleteCalls).toBe(0)
  // Focus stays inside the open dialog, never on the page behind it.
  await expect
    .poll(() => dialog.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true)
  expect(await noOverflow(page)).toBe(true)
  await expectAxeClean(page)
  await capture(page, testInfo.outputPath('account-blocked-on-delete.png'))
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('the account section reads in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
  await identityFixture(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Profile/ }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('button', { name: 'Delete my account…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account' })
  await expect(dialog.getByRole('textbox', { name: 'Type DELETE to confirm' })).toBeVisible()
  await expect(dialog).toContainText('This cannot be undone.')
})

// RYT-123 J1-01: a destructive action is never queued for when the network returns.
test('offline, confirming the deletion fails at once and never fires when the network returns', async ({
  page,
  context,
}) => {
  const { trigger, calls } = await openSettings(page)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toHaveCSS('opacity', '1')
  const confirm = dialog.getByRole('button', { name: 'Eliminar cuenta para siempre' })
  await dialog.getByRole('textbox').fill('DELETE')
  await expect(confirm).toBeEnabled()
  await context.setOffline(true)
  await confirm.click()
  // It does not wait: the failure is said now, and every way out stays usable.
  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('Sin conexión. No se envió nada')
  await expect(confirm).toBeEnabled()
  await expect(confirm).not.toHaveAttribute('aria-busy', 'true')
  await expect(dialog.getByRole('button', { name: 'Conservar mi cuenta' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeEnabled()
  // The network returns: a paused mutation would resume here. Nothing may be sent.
  await context.setOffline(false)
  await page.waitForTimeout(1500)
  expect(
    calls.filter((c) => ['prepare_account_deletion', 'delete_my_account'].includes(c.method)),
  ).toEqual([])
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  // Back online, the same confirmation works: one tap, one deletion.
  await trigger.click()
  await dialog.getByRole('textbox').fill('DELETE')
  await confirm.click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  expect(calls.filter((c) => c.method === 'delete_my_account')).toHaveLength(1)
})

test('J1-28 downloading the data offline says so', async ({ page, context }) => {
  const { settings } = await openSettings(page)
  await context.setOffline(true)
  await settings.getByRole('button', { name: 'Descargar mis datos' }).click()
  await expect(settings.getByRole('alert')).toContainText(
    'Sin conexión. Reconecta para descargar tus datos.',
  )
})

test('J1-11 Back closes the delete dialog, then the drawer, without leaving the page', async ({
  page,
}) => {
  const { settings, trigger } = await openSettings(page)
  const start = page.url()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Eliminar tu cuenta' })
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).toBeHidden()
  await expect(settings).toBeVisible()
  expect(page.url()).toBe(start)
  await page.goBack()
  await expect(settings).toBeHidden()
  expect(page.url()).toBe(start)
  await expect(page.getByRole('heading', { name: 'Mis campañas', level: 1 })).toBeVisible()
})
