import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId, playerId } from './fixtures/identity.ts'
import { expectTouchTargets, capture, limitMatrix } from './fixtures/audit.ts'
import type { Page } from '@playwright/test'

/** RYT-025 moved secondary character actions into a per-card "More actions" menu. */
async function characterAction(page: Page, name: string, item: string, es = true) {
  await page
    .getByRole('button', { name: es ? `Más acciones para ${name}` : `More actions for ${name}` })
    .click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const)
    test(`${language} ${scheme} consolidated character management at 150%`, async ({
      page,
    }, info) => {
      limitMatrix(info, language === 'es' && scheme === 'dark')
      await page.addInitScript(
        ({ language, scheme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-color-scheme', scheme)
        },
        { language, scheme },
      )
      await identityFixture(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`./#/campaign/${campaignId}/party`)
      await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      const es = language === 'es'
      for (const screen of ['party', 'link', 'assigned', 'unlink', 'members', 'invite']) {
        if (screen === 'link')
          await characterAction(page, 'Arin', es ? 'Vincular jugador' : 'Link Player', es)
        if (screen === 'assigned') {
          await page.getByRole('combobox').selectOption(playerId)
          await page
            .getByRole('dialog')
            .getByRole('button', { name: es ? 'Vincular jugador' : 'Link Player', exact: true })
            .click()
          await expect(
            page.getByText(es ? 'Jugador: Arin' : 'Player: Arin', { exact: true }),
          ).toBeVisible()
        }
        if (screen === 'unlink')
          await characterAction(page, 'Arin', es ? 'Desvincular jugador' : 'Unlink Player', es)
        if (screen === 'members') {
          await page.keyboard.press('Escape')
          await page.goto(`./#/campaign/${campaignId}/members`)
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            es ? 'Centro de mando DM' : 'DM Command Center',
          )
          await expect(page.getByText('player@example.com', { exact: true })).toBeVisible()
          await expect(
            page.getByRole('button', { name: /Vincular|Desvincular|Link Player|Unlink Player/ }),
          ).toHaveCount(0)
        }
        if (screen === 'invite')
          await page
            .getByRole('button', { name: es ? 'Invitar jugador' : 'Invite player', exact: true })
            .click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect(
          (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
            .violations,
        ).toEqual([])
        await expectTouchTargets(
          page,
          'main button:visible:not(.glossary-term), [role="dialog"] button:visible:not(.glossary-term), [role="dialog"] select:visible',
        )
        await capture(page, info.outputPath(`${screen}-${language}-${scheme}-150.png`))
      }
    })

test('assignment explains unavailable Players and recovers from failed member reads', async ({
  page,
}, info) => {
  await identityFixture(page, { twoDms: true })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await characterAction(page, 'Arin', 'Vincular jugador')
  await expect(
    page.getByText('Todavía no hay miembros con rol Jugador.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Vincular jugador', exact: true }),
  ).toBeDisabled()
  await capture(page, info.outputPath('no-players.png'))
  await page.keyboard.press('Escape')
  let fail = true
  await page.route('**/rest/v1/rpc/list_campaign_members', async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unavailable' }),
      })
    else await route.fallback()
  })
  await page.reload()
  await characterAction(page, 'Arin', 'Vincular jugador')
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No se pudo cargar')
  await capture(page, info.outputPath('assignment-error.png'))
  fail = false
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(
    page.getByText('Todavía no hay miembros con rol Jugador.', { exact: false }),
  ).toBeVisible()
  await page.getByRole('dialog').getByRole('link', { name: 'Ir a Miembros e invitaciones' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
})

test('RYT-044 a linked Player can receive a second character, which waits in reserve', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await characterAction(page, 'Arin', 'Vincular jugador')
  await page.getByRole('combobox').selectOption(playerId)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Vincular jugador', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Crear personaje', exact: true }).click()
  await page.getByLabel('Nombre del personaje').fill('Second hero')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear personaje', exact: true })
    .click()
  await characterAction(page, 'Second hero', 'Vincular jugador')
  // Below the limit of four the linked Player is still offered.
  await page.getByRole('combobox').selectOption(playerId)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Vincular jugador', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Arin stays active; the new character leaves Party for the reserve.
  await expect(page.getByRole('heading', { name: 'Second hero', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Personajes de los jugadores, 1 en reserva' }).click()
  const arin = page.getByRole('region', { name: 'Arin' })
  await expect(arin.getByRole('group', { name: 'Arin' })).toContainText('Activo')
  await expect(arin.getByRole('group', { name: 'Second hero' })).toContainText('En reserva')
  await capture(page, info.outputPath('dm-roster.png'))
})

test('DM creates before assignment, edits whole homebrew units and recovers from a stale editor', async ({
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
  await arin.getByRole('button', { name: /Editar oro de Arin/ }).click()
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('26')
  await page.getByRole('button', { name: 'Guardar oro' }).click()
  await expect(arin.getByText('26', { exact: true })).toBeVisible()
  await characterAction(page, 'Arin', 'Editar recursos')
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('98')
  await page.getByRole('button', { name: 'Aumentar Oro', exact: true }).click()
  await page.getByRole('textbox', { name: 'Agotamiento', exact: true }).fill('12')
  await page.getByRole('button', { name: 'Guardar recursos' }).click()
  await expect(arin.getByText('99', { exact: true })).toBeVisible()
  await characterAction(page, 'Arin', 'Editar recursos')
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
  await expect(page.getByRole('button', { name: /Más acciones para/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Crear personaje' })).toHaveCount(0)
  const menu = page.getByRole('button', { name: /Sesión de player@example.com/ })
  await menu.click()
  // Wait for the dropdown before Escape; pressing it mid-transition left the menu open in CI.
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Sesión de player@example.com/ }).click()
  await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await page.getByRole('button', { name: /Sesión de player@example.com/ }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
})

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const)
    test(`${language} ${scheme} party, editor and account menu at 150% text`, async ({
      page,
    }, info) => {
      limitMatrix(info, language === 'es' && scheme === 'dark')
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
      await capture(page, info.outputPath(`party-${language}-${scheme}-100.png`))
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      for (const screen of ['party', 'editor', 'menu', 'settings', 'account']) {
        if (screen === 'editor')
          await characterAction(
            page,
            'Arin',
            language === 'es' ? 'Editar recursos' : 'Edit resources',
            language === 'es',
          )
        if (screen === 'menu') {
          await page.keyboard.press('Escape')
          await page
            .getByRole('button', {
              name: language === 'es' ? /Sesión de dm@example.com/ : /Signed in as dm@example.com/,
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
              name: language === 'es' ? /Sesión de dm@example.com/ : /Signed in as dm@example.com/,
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
        await capture(page, info.outputPath(`${screen}-${language}-${scheme}-150.png`))
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
  expect(
    await page
      .locator('.resource-cell')
      .evaluateAll((cells) => cells.every((el) => el.scrollWidth <= el.clientWidth)),
  ).toBe(true)
  await expect(page.locator('.resource-value').first()).toHaveText(
    Number.MAX_SAFE_INTEGER.toLocaleString('es'),
  )
  await capture(page, info.outputPath('max-resources-150.png'))
})

test('Party owns character assignment and Player preview hides DM actions', async ({
  page,
}, info) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(
    page.getByRole('button', { name: /Vincular|Desvincular|Crear personaje/ }),
  ).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Personajes sin jugador' })).toHaveCount(0)
  await expect(page.getByText('Oro', { exact: true })).toHaveCount(0)
  expect(f.calls.filter((c) => c.method === 'characters')).toHaveLength(0)
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Grupo', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  const card = page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Arin', exact: true }) })
  // Keyboard: open the card menu, pick the action, Escape returns focus to the menu trigger.
  const more = card.getByRole('button', { name: 'Más acciones para Arin', exact: true })
  await more.focus()
  await more.press('Enter')
  await page.getByRole('menuitem', { name: 'Vincular jugador', exact: true }).press('Enter')
  await expect(page.getByLabel('Jugador', { exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await characterAction(page, 'Arin', 'Vincular jugador')
  const linkDialog = page.getByRole('dialog', { name: 'Vincular jugador' })
  await linkDialog.getByLabel('Jugador', { exact: true }).selectOption(playerId)
  await linkDialog.getByRole('button', { name: 'Vincular jugador', exact: true }).click()
  await expect(card.getByText('Jugador: Arin', { exact: true })).toBeVisible()
  await expect(more).toBeFocused()
  await characterAction(page, 'Arin', 'Desvincular jugador')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(card.getByText('Sin jugador', { exact: true })).toBeVisible()
  await expect(more).toBeFocused()
  await expect(page.getByRole('button', { name: 'Crear personaje', exact: true })).toBeVisible()
  await expect(page.getByText('CAMPAÑA ACTUAL')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a mi cuenta', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invitar jugador', exact: true })).toHaveCount(0)
  // A single Player enters the preview directly; the banner makes the mode unmistakable.
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Estás viendo la mesa como Arin' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear personaje', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Más acciones para/ })).toHaveCount(0)
  await expect(page.getByText('Vista de Arin')).toBeVisible()
  await expect(page.getByText('Este jugador todavía no tiene personaje.')).toBeVisible()
  await capture(page, info.outputPath('player-preview.png'))
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await page.getByRole('button', { name: 'Volver a vista DM', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Vista jugador', exact: true })).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Más acciones para Arin' })).toBeVisible()
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
  const account = page.getByRole('button', { name: new RegExp(`Sesión de ${email}`) })
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

test('RYT-025 navigation and exhaustion track adapt to phones and laptops', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  const phone = (page.viewportSize()?.width ?? 1024) < 768
  const nav = page.getByRole('navigation', { name: 'Navegación principal' })
  await expect(nav).toHaveCount(1)
  if (phone) {
    await expect(page.locator('.bottom-nav')).toBeVisible()
    await expect(page.locator('.nav-tabs-row')).toBeHidden()
    const box = await page.locator('.bottom-nav').boundingBox()
    expect(box!.y + box!.height).toBeCloseTo(page.viewportSize()!.height, 0)
  } else {
    await expect(page.locator('.bottom-nav')).toBeHidden()
    // A single row of reachable modules; planned modules are not navigation items.
    const row = await page.locator('.nav-tabs').boundingBox()
    expect(row!.height).toBeLessThan(80)
  }
  await expect(nav.getByText('Misiones', { exact: false })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Grupo', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const arin = page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Arin', exact: true }) })
  await arin.getByRole('button', { name: 'Agotamiento nivel 2 · Arin', exact: true }).click()
  await expect(arin.locator('.exhaustion-pip[data-filled]')).toHaveCount(2)
  // Pressing the current top level steps down one level.
  await arin.getByRole('button', { name: 'Agotamiento nivel 2 · Arin', exact: true }).click()
  await expect(arin.locator('.exhaustion-pip[data-filled]')).toHaveCount(1)
  await capture(page, info.outputPath('ryt-025-party.png'))
})

test('RYT-025 keyboard focus stays on steppers, preview switch and More drawer choices', async ({
  page,
}) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  const arin = page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Arin', exact: true }) })
  const gold = arin.getByRole('button', { name: /Editar oro de Arin/ })
  await gold.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('2600')
  await page.keyboard.press('Enter')
  await expect(gold).toContainText('2600')
  await expect(gold).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('27')
  await page.keyboard.press('Escape')
  await expect(gold).toContainText('2600')
  await expect(gold).toBeFocused()
  const pip = arin.getByRole('button', { name: 'Agotamiento nivel 1 · Arin', exact: true })
  await pip.focus()
  await page.keyboard.press('Space')
  await expect(arin.locator('.exhaustion-pip[data-filled]')).toHaveCount(1)
  await expect(pip).toBeFocused()

  const preview = page.getByRole('switch', { name: 'Vista jugador', exact: true })
  await preview.focus()
  await page.keyboard.press('Space')
  const exit = page.getByRole('button', { name: 'Volver a vista DM', exact: true })
  await exit.focus()
  await page.keyboard.press('Enter')
  await expect(preview).toBeFocused()
  await expect(preview).not.toBeChecked()

  // RYT-035: planned modules cannot be enabled, so they never reach Player navigation.
  await page.goto(`./#/campaign/${campaignId}/members`)
  await page.getByRole('tab', { name: 'Módulos activos', exact: true }).click()
  // RYT-007: combat is implemented, so the DM can enable it like shops.
  for (const module of ['Tiendas', 'Combate'])
    await expect(
      page.getByRole('switch', { name: `${module}: visible para jugadores` }),
    ).toBeEnabled()
  for (const module of ['Misiones', 'Atlas'])
    await expect(
      page.getByRole('switch', { name: `${module}: visible para jugadores` }),
    ).toBeDisabled()
})

test('RYT-035 a planned module enabled by an old campaign row is not a destination', async ({
  page,
}) => {
  await identityFixture(page, { player: true, modules: ['party', 'quests', 'atlas', 'combat'] })
  await page.goto(`./#/campaign/${campaignId}/party`)
  const nav = page.getByRole('navigation', { name: /principal|Main/i }).first()
  await expect(nav.getByRole('link', { name: 'Grupo' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Misiones' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Atlas' })).toHaveCount(0)
  // RYT-007: an enabled, implemented module is a destination.
  await expect(nav.getByRole('link', { name: 'Combate' })).toHaveCount(1)
})

/** RYT-031: evidence screenshots (390px phone, 820px tablet) only when RYT_EVIDENCE is set. */
async function evidence(page: Page, project: string, name: string, fullPage = true) {
  const size =
    project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
  if (size && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-031/${name}-${size}.png`, fullPage })
}
async function axeAndTargets(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible:not(.glossary-term), [role="dialog"] button:visible:not(.glossary-term)',
  )
}

test('RYT-031 Player sees shared teammates live state without their resources', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const f = await identityFixture(page, { player: true, party: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  const party = page.getByRole('region', { name: 'Compañeros', exact: true })
  await expect(party).toBeVisible()
  const bea = party.getByRole('article', { name: 'Bea' })
  await expect(bea).toBeVisible()
  await expect(bea.getByText('/24', { exact: true })).toBeVisible()
  await expect(bea.getByText('+3 temporales', { exact: true })).toBeVisible()
  await expect(bea.getByRole('img', { name: 'Clase de armadura 16' })).toBeVisible()
  await expect(bea.getByRole('img', { name: 'Agotamiento: nivel 2 de 6' })).toBeVisible()
  await expect(bea.getByRole('list', { name: 'Estados de Bea' })).toContainText('Envenenado')
  await expect(bea.getByRole('progressbar', { name: '9 de 24 puntos de golpe' })).toBeVisible()
  await expect(party.getByRole('article', { name: 'Cato' })).toHaveCount(0)
  // Own card keeps resources; teammates never show gold, water or rations.
  await expect(party.getByText('777')).toHaveCount(0)
  await expect(page.getByText('Cato', { exact: true })).toHaveCount(0)
  expect(f.calls.some((c) => c.method === 'get_party_overview')).toBe(true)
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'party-player')
  // Polls while visible: the overview is requested again after ~10s.
  const before = f.calls.filter((c) => c.method === 'get_party_overview').length
  await expect
    .poll(() => f.calls.filter((c) => c.method === 'get_party_overview').length, {
      timeout: 15_000,
    })
    .toBeGreaterThan(before)
  expect(errors).toEqual([])
})

test('RYT-031 DM toggles live sharing per character with a labelled 44px control', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { party: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  // RYT-035: a labelled switch ("Visible al grupo") instead of an icon-only toggle.
  const cato = page.getByRole('switch', { name: 'Visible al grupo · Cato', exact: true })
  await expect(cato).not.toBeChecked()
  const bea = page.getByRole('switch', { name: 'Visible al grupo · Bea', exact: true })
  await expect(bea).toBeChecked()
  await bea.focus()
  await page.keyboard.press('Space')
  await expect(bea).not.toBeChecked()
  await expect(bea).toBeFocused()
  // The switch reflects the pending value at once; the RPC is recorded when the request lands.
  await expect
    .poll(() => f.calls.filter((c) => c.method === 'set_character_live_sharing').at(-1)?.body)
    .toEqual({ target_campaign: campaignId, target_character: expect.any(String), enabled: false })
  await cato.click({ force: true })
  await expect(cato).toBeChecked()
  const box = await page
    .locator('.character-card')
    .filter({ has: page.getByRole('heading', { name: 'Cato', exact: true }) })
    .locator('.live-share-toggle')
    .boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'party-dm')
})

test('RYT-031 DM opens the per-character history from the sheet; Players do not get it', async ({
  page,
}, info) => {
  await identityFixture(page, { party: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page
    .getByRole('switch', { name: 'Visible al grupo · Arin', exact: true })
    .click({ force: true })
  await page.goto(`./#/campaign/${campaignId}/party/${characterId}`)
  const open = page.getByRole('button', { name: 'Historial', exact: true })
  await open.click()
  const drawer = page.getByRole('dialog', { name: 'Historial de Arin' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('Recursos actualizados', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Oro: 15 → 25 (+10)', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Ahora oculto al grupo', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Bea', { exact: true })).toHaveCount(0)
  await axeAndTargets(page)
  await evidence(page, info.project.name, 'sheet-history', false)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(open).toBeFocused()
})

test('RYT-031 Player sheet has no history control', async ({ page }) => {
  await identityFixture(page, { player: true, party: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party/${characterId}`)
  await expect(page.getByRole('heading', { name: 'Arin', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Historial', exact: true })).toHaveCount(0)
})
