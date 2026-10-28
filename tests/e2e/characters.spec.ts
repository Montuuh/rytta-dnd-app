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
  await card.getByRole('button', { name: 'Invitar jugador' }).click()
  await page.getByLabel('Correo de la cuenta de Google').fill('future@example.com')
  await page.getByRole('dialog').getByRole('button', { name: 'Invitar jugador' }).click()
  await expect(page.getByRole('status')).toContainText('Invitación creada')
  expect(
    f.calls.find((c) => c.method === 'invite_character_player')?.body.target_character,
  ).toBeTruthy()
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
  const menu = page.getByRole('button', { name: 'Abrir menú de cuenta y ajustes' })
  await menu.click()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page.getByRole('dialog').getByRole('link', { name: 'Sesión de player@example.com' }).click()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
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
      for (const screen of ['party', 'editor', 'menu']) {
        if (screen === 'editor')
          await page
            .getByRole('button', { name: language === 'es' ? 'Editar recursos' : 'Edit resources' })
            .click()
        if (screen === 'menu') {
          await page.keyboard.press('Escape')
          await page
            .getByRole('button', {
              name:
                language === 'es'
                  ? 'Abrir menú de cuenta y ajustes'
                  : 'Open account and settings menu',
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
