import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from './fixtures/identity.ts'

test('DM creates before assignment, invites, edits whole homebrew units and recovers from a stale editor', async ({
  page,
}) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  const create = page.getByRole('button', { name: 'Crear personaje', exact: true })
  await create.click()
  await expect(page.getByLabel('Nombre del personaje')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(create).toBeFocused()
  await create.click()
  await page.getByLabel('Nombre del personaje').fill('New hero')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear personaje', exact: true })
    .click()
  const card = page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'New hero' }) })
  await expect(card.getByText('Sin jugador')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  const arin = page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Arin', exact: true }) })
  await arin.getByRole('button', { name: 'Editar recursos' }).click()
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('99')
  await page.getByRole('textbox', { name: 'Agotamiento', exact: true }).fill('12')
  await page.getByRole('button', { name: 'Guardar recursos' }).click()
  await expect(arin.getByText('99', { exact: true })).toBeVisible()
  await arin.getByRole('button', { name: 'Editar recursos' }).click()
  f.staleResources()
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('100')
  await page.getByRole('button', { name: 'Guardar recursos' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Otro DM')
  await expect(page.getByRole('button', { name: 'Guardar recursos' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(arin.getByText('70', { exact: true })).toBeVisible()
})

test('Player sees own resources read-only; account menu returns home without leaving membership', async ({
  page,
}) => {
  const f = await identityFixture(page, { player: true })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByText('Tu personaje', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar recursos' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toHaveCount(0)
  const menu = page.getByRole('button', { name: 'Abrir menú de ajustes' })
  await menu.click()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Sesión de player@example.com' }).click()
  await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await page.getByRole('button', { name: 'Sesión de player@example.com' }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
})

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const)
    test(`${language} ${scheme} party, editor and account menu at 150% text`, async ({
      page,
    }, info) => {
      await page.addInitScript(
        ({ language, scheme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-color-scheme', scheme)
        },
        { language, scheme },
      )
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await identityFixture(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`./#/campaign/${campaignId}/party`)
      await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
      await page.screenshot({
        path: info.outputPath(`party-${language}-${scheme}-100.png`),
        fullPage: true,
      })
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      for (const screen of ['party', 'editor', 'menu', 'settings', 'account']) {
        if (screen === 'editor')
          await page
            .getByRole('button', { name: language === 'es' ? 'Editar recursos' : 'Edit resources' })
            .click()
        if (screen === 'menu') {
          await page.keyboard.press('Escape')
          await page
            .getByRole('button', {
              name: language === 'es' ? 'Abrir menú de ajustes' : 'Open settings menu',
            })
            .click()
        }
        if (screen === 'settings')
          await page
            .getByRole('menuitem', {
              name: language === 'es' ? 'Ajustes' : 'App setup',
              exact: true,
            })
            .click()
        if (screen === 'account') {
          await page.keyboard.press('Escape')
          await page
            .getByRole('button', {
              name: language === 'es' ? 'Sesión de dm@example.com' : 'Signed in as dm@example.com',
            })
            .click()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect(
          (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
            .violations,
        ).toEqual([])
        await page.screenshot({
          path: info.outputPath(`${screen}-${language}-${scheme}-150.png`),
          fullPage: true,
        })
      }
      expect(errors).toEqual([])
    })

test('maximum valid resources remain readable within cards at 150% text', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page)
  fixture.maxResources()
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const cell of await page.locator('.resource-cell').all()) {
    expect(await cell.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await expect(page.locator('.resource-value').first()).toHaveText(
    Number.MAX_SAFE_INTEGER.toLocaleString('es'),
  )
  await page.screenshot({ path: info.outputPath('max-resources-150.png'), fullPage: true })
})

test('member assignment uses metadata only and Player preview hides DM actions', async ({
  page,
}, info) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await page.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
  await page.getByLabel('Jugador existente').selectOption('10000000-0000-4000-8000-000000000002')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Vincular personaje', exact: true })
    .click()
  await expect(page.getByText('Arin: Arin', { exact: true })).toBeVisible()
  await expect(page.getByText('Oro', { exact: true })).toHaveCount(0)
  const requests = f.calls.filter((c) => c.method === 'characters')
  expect(requests.length).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Desvincular jugador', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('Arin: Sin personaje', { exact: true })).toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('button', { name: 'Crear personaje', exact: true })).toBeVisible()
  await expect(page.getByText('CAMPAÑA ACTUAL')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a mi cuenta', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invitar jugador', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Vista Player', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Crear personaje', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar recursos', exact: true })).toHaveCount(0)
  await expect(page.getByText('Tu DM todavía no te ha asignado un personaje.')).toBeVisible()
  await page.screenshot({ path: info.outputPath('player-preview.png'), fullPage: true })
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await page.getByRole('button', { name: 'Volver a DM', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Editar recursos', exact: true })).toBeVisible()
})

test('long account email stays within the viewport and supports keyboard dismissal', async ({
  page,
}) => {
  await identityFixture(page)
  const email = 'alexander.adventurer.with.a.long.address@example.com'
  await page.addInitScript((email) => {
    const key = 'sb-rytta-test-auth-token'
    const value = JSON.parse(localStorage.getItem(key)!)
    value.user.email = email
    localStorage.setItem(key, JSON.stringify(value))
  }, email)
  await page.goto('./')
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const account = page.getByRole('button', { name: `Sesión de ${email}` })
  await account.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Mis campañas', exact: true })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const bounds = await page.getByRole('menu').boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual((await page.viewportSize())!.width)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(account).toBeFocused()
})

test('localhost sends all REST reads and RPC writes to the PRE schema', async ({ page }) => {
  const profiles: { method: string; schema: string | undefined }[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/'))
      profiles.push({
        method: request.method(),
        schema:
          request.headers()[request.method() === 'GET' ? 'accept-profile' : 'content-profile'],
      })
  })
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Crear personaje', exact: true }).click()
  await page.getByLabel('Nombre del personaje').fill('PRE only')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear personaje', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'PRE only', exact: true })).toBeVisible()
  expect(profiles.some((p) => p.method === 'GET')).toBe(true)
  expect(profiles.some((p) => p.method === 'POST')).toBe(true)
  expect(profiles.every((p) => p.schema === 'pre')).toBe(true)
})
