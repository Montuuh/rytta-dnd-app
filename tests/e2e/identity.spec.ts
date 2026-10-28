import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  identityFixture,
  campaignId,
  otherCampaignId,
  storageKey,
  session,
  playerId,
} from './fixtures/identity.ts'

test('Google sign-in uses PKCE and an exact Pages callback; no private requests while signed out', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { signedIn: false })
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: 'Tu próxima aventura empieza aquí.' }),
  ).toBeVisible()
  expect(fixture.calls.filter((c) => c.method.startsWith('list_'))).toEqual([])
  const request = page.waitForRequest('https://rytta-test.supabase.co/auth/v1/authorize**')
  await page.getByRole('button', { name: 'Continuar con Google' }).click()
  const url = new URL((await request).url())
  expect(url.searchParams.get('provider')).toBe('google')
  expect(url.searchParams.get('code_challenge_method')).toMatch(/s256/i)
  expect(url.searchParams.get('redirect_to')).toMatch(
    /^http:\/\/127\.0\.0\.1:4174\/rytta-dnd-app\/(?:\?sb_flow_id=[^#]+)?$/,
  )
})

test('callback is consumed once and invalid/reused callbacks offer a new sign-in', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { signedIn: false })
  await page.addInitScript(
    (key) => localStorage.setItem(`${key}-code-verifier`, JSON.stringify('fixture-verifier')),
    storageKey,
  )
  await page.goto('./?code=fixture-code')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  expect(fixture.calls.filter((c) => c.method === 'token')).toHaveLength(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  expect(fixture.calls.filter((c) => c.method === 'token')).toHaveLength(1)
})
test('expired callback and provider denial remain usable and scrub the URL', async ({ page }) => {
  await identityFixture(page, { signedIn: false, callbackError: true })
  await page.addInitScript(
    (key) => localStorage.setItem(`${key}-code-verifier`, JSON.stringify('fixture-verifier')),
    storageKey,
  )
  for (const query of [
    '?code=expired',
    '?error=access_denied&error_description=provider-private',
  ]) {
    await page.goto(`./${query}`)
    await expect(page.getByRole('alert')).toContainText('ha caducado')
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeEnabled()
    expect(page.url()).not.toContain('code=')
    expect(page.url()).not.toContain('provider-private')
    await expect(page.locator('body')).not.toContainText('provider-private')
  }
})

test('empty hub creates a DM campaign, accepts a Player invitation and signs out', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await identityFixture(page, { empty: true })
  await page.goto('./')
  await expect(page.getByText('Tu mesa te espera.')).toBeVisible()
  const create = page.locator('main').getByRole('button', { name: 'Crear campaña', exact: true })
  await create.click()
  await expect(page.getByLabel('Nombre de la campaña')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(create).toBeFocused()
  await create.click()
  await page.getByLabel('Nombre de la campaña').fill('Our new table')
  await page.getByRole('dialog').getByRole('button', { name: 'Crear campaña', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Our new table' })).toBeVisible()
  await page.getByRole('button', { name: 'Aceptar invitación' }).click()
  await expect(page.getByRole('heading', { name: 'The Amber Road' })).toBeVisible()
  await page.getByRole('link', { name: 'Abrir campaña: Our new table' }).click()
  await expect(page.getByRole('heading', { name: 'Our new table', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Our new table', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Volver a mi cuenta', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Our new table' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('DM invites, cancels and hands over before leaving; campaign routes stay scoped', async ({
  page,
}) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByRole('heading', { name: 'Tu mesa', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abandonar campaña', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: 'Personajes y recursos', exact: true }).click()
  await page.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
  await page.getByLabel('Correo de la cuenta de Google').fill('new@example.com')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Invitar jugador', exact: true })
    .click()
  await expect(page.getByText('Invitación creada.', { exact: false })).toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByText('new@example.com', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar invitación', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('No hay invitaciones pendientes para esta campaña.')).toBeVisible()
  await page.getByRole('button', { name: 'Nombrar DM', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Nombrar DM', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Abandonar campaña', exact: true })).toBeEnabled()
  await page.getByRole('link', { name: 'Volver a mi cuenta', exact: true }).click()
  await page.getByRole('link', { name: 'Abrir campaña: Winter at the Keep' }).click()
  expect(page.url()).toContain(otherCampaignId)
  const mobileMenu = page.getByRole('button', { name: 'Abrir menú de cuenta y ajustes' })
  const drawer = await mobileMenu.isVisible()
  if (drawer) await mobileMenu.click()
  const currentNav = drawer
    ? page.getByRole('dialog').getByRole('navigation')
    : page.locator('.sidebar nav')
  await expect(currentNav.getByRole('link', { name: 'Inventario', exact: true })).toHaveAttribute(
    'href',
    `#/campaign/${otherCampaignId}/inventory`,
  )
  if (drawer) await page.keyboard.press('Escape')
  await page.goto(`./#/campaign/${campaignId}/members`)
  await page.getByRole('button', { name: 'Abandonar campaña', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
  expect(
    f.calls.some((c) => c.method === 'change_campaign_member' && c.body.new_role === null),
  ).toBe(true)
})

test('Player has no management payload or controls; revoked campaign fails closed', async ({
  page,
}) => {
  const f = await identityFixture(page, { player: true })
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  expect(
    f.calls.filter((c) => ['list_campaign_members', 'campaign_invitations'].includes(c.method)),
  ).toEqual([])
  f.revokeAccess()
  await page.reload()
  await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
})

test('account change and session expiry remove the previous private screen', async ({ page }) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByText('dm@example.com', { exact: true })).toBeVisible()
  const next = session(playerId)
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
      const channel = new BroadcastChannel(key)
      channel.postMessage({ event: 'SIGNED_IN', session: value })
      channel.close()
    },
    { key: storageKey, value: next },
  )
  await page.getByRole('button', { name: 'Abrir menú de cuenta y ajustes' }).click()
  await expect(page.getByText('Sesión de player@example.com')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  await expect(page.getByText('dm@example.com', { exact: true })).toHaveCount(0)
  // SDK event is real, backend identity switching is covered in SQL; end session across tabs.
  await page.evaluate((key) => {
    localStorage.removeItem(key)
    const channel = new BroadcastChannel(key)
    channel.postMessage({ event: 'SIGNED_OUT', session: null })
    channel.close()
  }, storageKey)
  await expect(page.getByText('Tu sesión ha terminado.')).toBeVisible()
  await expect(page.getByText('dm@example.com', { exact: true })).toHaveCount(0)
})

test('self-demotion clears management views and offline actions are not queued', async ({
  page,
  context,
}) => {
  const f = await identityFixture(page, { twoDms: true })
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByRole('heading', { name: 'Tu mesa', exact: true })).toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
  await context.setOffline(true)
  await page.getByLabel('Correo de la cuenta de Google').fill('offline@example.com')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Invitar jugador', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'No se pudo completar la acción',
  )
  await context.setOffline(false)
  expect(f.calls.filter((c) => c.method === 'invite_character_player')).toHaveLength(0)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const self = page
    .locator('.mantine-Paper-root')
    .filter({ has: page.getByText('Table DM · Tú', { exact: true }) })
  await self.getByRole('button', { name: 'Cambiar a Player', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
})

test('failed refresh hides cached campaign content and offers recovery', async ({ page }) => {
  const f = await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toBeVisible()
  f.failCampaigns()
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(page.getByRole('alert').first()).toContainText('No se pudo cargar')
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeEnabled()
})

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const) {
    test(`${language} ${scheme} sign-in, hub and member screens fit and pass axe at 150% text`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript(
        ({ language, scheme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-color-scheme', scheme)
        },
        { language, scheme },
      )
      await identityFixture(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      for (const [screen, route] of [
        ['hub', './'],
        ['members', `./#/campaign/${campaignId}/members`],
      ] as const) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(
          page.getByText(screen === 'hub' ? 'The Sunken Coast' : 'Arin', { exact: true }),
        ).toBeVisible()
        await page.screenshot({
          path: testInfo.outputPath(`${screen}-${language}-${scheme}-100.png`),
          fullPage: true,
          scale: 'css',
        })
        await page.addStyleTag({ content: 'html { font-size: 150%; }' })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const audit = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
        expect(
          audit.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        ).toEqual([])
        await page.screenshot({
          path: testInfo.outputPath(`${screen}-${language}-${scheme}-150.png`),
          fullPage: true,
          scale: 'css',
        })
      }
      await page
        .getByRole('link', {
          name: language === 'es' ? 'Volver a mi cuenta' : 'Back to my account',
          exact: true,
        })
        .click()
      await page
        .getByRole('button', {
          name: language === 'es' ? 'Cerrar sesión' : 'Sign out',
          exact: true,
        })
        .click()
      await expect(
        page.getByRole('button', {
          name: language === 'es' ? 'Continuar con Google' : 'Continue with Google',
        }),
      ).toBeVisible()
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(audit.violations).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath(`sign-in-${language}-${scheme}-150.png`),
        fullPage: true,
        scale: 'css',
      })
    })
  }
