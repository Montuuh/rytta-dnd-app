import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  identityFixture,
  campaignId,
  otherCampaignId,
  storageKey,
  session,
  playerId,
  dmId,
} from './fixtures/identity.ts'
import { capture, expectTouchTargets, focusAcrossFrames, limitMatrix } from './fixtures/audit.ts'

/** The sheet a row's `···` opens (RYT-180) and its rows; the confirmation is a dialog of its own. */
const memberSheet = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true })
const confirmation = (page: Page) =>
  page.getByRole('dialog', { name: 'Confirmar cambio de miembros', exact: true })
const openMemberSheet = async (page: Page, member: string) => {
  const trigger = page.getByRole('button', { name: `Acciones de ${member}`, exact: true })
  await trigger.click()
  const sheet = memberSheet(page, member)
  await expect(sheet).toBeVisible()
  return { trigger, sheet }
}

test('Google sign-in uses PKCE and an exact Pages callback; no private requests while signed out', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { signedIn: false })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Rytta', exact: true })).toBeVisible()
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

test('a DM copies invitation instructions and a player accepts from a separate browser', async ({
  page: dm,
  browser,
  baseURL,
}, testInfo) => {
  const accountEmail = 'player@example.com'
  const invitedCampaign = {
    id: campaignId,
    name: 'The Sunken Coast',
    description: '',
    created_at: '2026-10-27T00:00:00Z',
    role: 'player',
  }
  const invitation = {
    id: '30000000-0000-4000-8000-000000000019',
    campaign_id: campaignId,
    campaign_name: invitedCampaign.name,
    character_id: null,
    character_name: null,
    email: accountEmail,
    expires_at: '2099-10-27T00:00:00Z',
  }
  let pending = false
  let joined = false
  let copied = ''
  await dm.exposeFunction('recordCopiedInstructions', (text: string) => {
    copied = text
  })
  await dm.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (
          window as Window & { recordCopiedInstructions?: (text: string) => Promise<void> }
        ).recordCopiedInstructions,
      },
    })
  })
  await identityFixture(dm, { free: ['Eira'] })
  await dm.route('**/rest/v1/rpc/invite_campaign_member', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      target_campaign: campaignId,
      invite_email: accountEmail,
    })
    pending = true
    await route.fulfill({ json: invitation.id })
  })
  await dm.route('**/rest/v1/campaign_invitations?*', (route) =>
    route.fulfill({ json: pending ? [invitation] : [] }),
  )
  await dm.route('**/rest/v1/rpc/list_campaign_members', (route) =>
    route.fulfill({
      json: [
        { user_id: dmId, role: 'dm', email: 'dm@example.com', display_name: 'Table DM' },
        ...(joined
          ? [{ user_id: playerId, role: 'player', email: accountEmail, display_name: 'Arin' }]
          : []),
      ],
    }),
  )

  const recipient = await browser.newContext({ baseURL, viewport: testInfo.project.use.viewport })
  try {
    const player = await recipient.newPage()
    const fixture = await identityFixture(player, { signedIn: false, player: true })
    await player.route('**/rest/v1/rpc/list_my_campaigns_with_modules', (route) =>
      route.fulfill({ json: joined ? [invitedCampaign] : [] }),
    )
    await player.route('**/rest/v1/rpc/list_my_invitations', (route) =>
      route.fulfill({ json: pending ? [invitation] : [] }),
    )
    await player.route('**/rest/v1/rpc/respond_campaign_invitation', async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        invitation_id: invitation.id,
        accept_invitation: true,
      })
      pending = false
      joined = true
      await route.fulfill({ json: campaignId })
    })

    await dm.goto(`./#/campaign/${campaignId}/members`)
    await dm.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
    const dialog = dm.getByRole('dialog', { name: 'Invitar jugador' })
    await dialog.getByRole('textbox', { name: 'Correo del jugador' }).fill(accountEmail)
    await dialog.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
    await dialog.getByRole('button', { name: 'Copiar instrucciones' }).click()
    await expect(dialog.getByRole('status')).toHaveText('Instrucciones copiadas')
    expect(copied).toContain(accountEmail)
    expect(copied).toContain('acepta la invitación en Mis campañas')
    const address = copied.match(/https?:\/\/[^, ]+/)?.[0]
    expect(address).toBe(baseURL)
    await capture(dm, testInfo.outputPath('invitation-instructions.png'), { fullPage: false })
    await dialog.getByRole('button', { name: 'Listo' }).click()

    await player.goto(address!)
    const authorise = player.waitForRequest('https://rytta-test.supabase.co/auth/v1/authorize**')
    await player.getByRole('button', { name: 'Continuar con Google' }).click()
    await authorise
    // This callback stands in for the recipient's Google flow; the app still exchanges its code.
    await player.goto('./?code=fixture-code')
    await expect(player.getByRole('heading', { name: 'Mis campañas' })).toBeVisible()
    await player.getByRole('button', { name: 'Aceptar invitación' }).click()
    await expect(
      player.getByRole('heading', { level: 2, name: invitedCampaign.name }),
    ).toBeVisible()
    expect(fixture.calls.filter(({ method }) => method === 'token')).toHaveLength(1)

    await dm.reload()
    const member = dm.locator('.member-row', { hasText: 'Arin' })
    const { sheet } = await openMemberSheet(dm, 'Arin')
    await expect(sheet).toContainText(accountEmail)
    await sheet.getByRole('button', { name: /^Vincular personaje/ }).click()
    await sheet.getByRole('button', { name: 'Eira', exact: true }).click()
    await expect(member.getByRole('link', { name: 'Ficha de Eira' })).toBeVisible()
  } finally {
    await recipient.close()
  }
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

test('a visitor can compare the three views of one turn without signing in', async ({
  page,
}, testInfo) => {
  const fixture = await identityFixture(page, { signedIn: false })
  await page.goto('./')
  const open = page.getByRole('button', { name: 'Ver una partida de ejemplo' })
  await expect(open).toBeInViewport()
  await open.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Un turno, tres vistas' })
  const view = dialog.getByRole('tabpanel')
  const context = dialog.getByText('Emboscada en el puente · Ronda 1 · Turno de Arin')
  await expect(context).toBeVisible()
  for (const [name, file, detail] of [
    ['DM', 'dm', 'El DM sigue la iniciativa'],
    ['Jugador', 'player', 'En su móvil, Arin ve'],
    ['Pantalla compartida', 'table', 'Todo el grupo ve el mapa'],
  ]) {
    await dialog.getByRole('tab', { name, exact: true }).click()
    await expect(view).toContainText(detail!)
    await expect(context).toBeVisible()
    await expect(view.locator('img')).toHaveAttribute('src', new RegExp(`es-${file}\\.webp$`))
    await view.locator('img').evaluate((img: HTMLImageElement) => img.decode())
  }
  await expectTouchTargets(dialog, 'button:visible', { width: 44, height: 44 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await capture(page, testInfo.outputPath('example-turn.png'), { fullPage: false })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(open).toBeFocused()
  expect(fixture.calls.filter((c) => c.method.startsWith('list_'))).toEqual([])
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

test('campaign selection shows full similar names, roles and local visits', async ({ page }) => {
  await identityFixture(page)
  const common = 'Cartas de las tierras del norte y los antiguos guardianes del reino'
  const names = [`${common} · Libro primero`, `${common} · Libro segundo`]
  await page.route('**/rest/v1/rpc/list_my_campaigns_with_modules', (route) =>
    route.fulfill({
      json: [campaignId, otherCampaignId].map((id, index) => ({
        id,
        name: names[index],
        description: '',
        created_at: '2026-10-27T00:00:00Z',
        role: index === 0 ? 'dm' : 'player',
      })),
    }),
  )
  await page.goto('./')
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const first = page.locator('.campaign-card', { hasText: names[0]! })
  const second = page.locator('.campaign-card', { hasText: names[1]! })
  await expect(first.getByRole('heading', { name: names[0], exact: true })).toBeVisible()
  await expect(second.getByRole('heading', { name: names[1], exact: true })).toBeVisible()
  await expect(first.getByText('DM', { exact: true })).toBeVisible()
  await expect(second.getByText('Jugador', { exact: true })).toBeVisible()
  await expect(page.getByText('Sin visitas previas en este dispositivo')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await second.getByRole('link', { name: `Abrir campaña: ${names[1]}` }).click()
  await expect(page).toHaveURL(new RegExp(otherCampaignId))
  await expect(page.getByRole('heading', { name: 'Grupo', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'RYTTA · Mis campañas' }).click()
  await expect(first.getByText('Sin visitas previas en este dispositivo')).toBeVisible()
  await expect(
    second.getByText('Última visita en este dispositivo', { exact: false }),
  ).toBeVisible()
})

test('empty hub creates a DM campaign, accepts a Player invitation and signs out', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const f = await identityFixture(page, { empty: true })
  await page.goto('./')
  // An invitation is waiting: it leads the page and creating a campaign steps back.
  await expect(page.getByRole('region', { name: 'Unirse a una campaña' })).toBeVisible()
  await expect(page.getByText('Aún no tienes campañas')).toHaveCount(0)
  const create = page.locator('main').getByRole('button', { name: 'Crear campaña', exact: true })
  await create.click()
  await expect(page.getByLabel('Nombre de la campaña')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(create).toBeFocused()
  await create.click()
  await page.getByLabel('Nombre de la campaña').fill('Our new table')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Siguiente', exact: true }).click()
  // RYT-167: the campaign's content, with the SRD and the Rytta basics ticked.
  await expect(dialog.getByRole('heading', { name: 'Contenido de la campaña' })).toBeFocused()
  const creatures = dialog.getByRole('group', { name: 'Criaturas' })
  await expect(creatures.getByRole('checkbox', { name: /Documento de referencia/ })).toBeChecked()
  const basics = dialog
    .getByRole('group', { name: 'Objetos' })
    .getByRole('checkbox', { name: /Rytta · Objetos básicos/ })
  await expect(basics).toBeChecked()
  await basics.uncheck()
  await expectTouchTargets(dialog, 'button:visible, .content-choice-pack:visible')
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  if (process.env.RYT_CAPTURE)
    await page.screenshot({
      path: `docs/evidence/ui-review/ryt-167/create-content-${test.info().project.name}.png`,
    })
  await dialog.getByRole('button', { name: 'Crear campaña', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Our new table' })).toBeVisible()
  const sent = f.calls.find((call) => call.method === 'create_campaign_with_content')!.body
  expect(sent.chosen).toEqual([
    { pack: '80000000-0000-4000-8000-000000000001', category: 'creatures' },
    { pack: '80000000-0000-4000-8000-000000000001', category: 'spells' },
    { pack: '80000000-0000-4000-8000-000000000001', category: 'classes' },
    { pack: '80000000-0000-4000-8000-000000000001', category: 'rules' },
    { pack: '80000000-0000-4000-8000-000000000001', category: 'items' },
  ])
  await page.getByRole('button', { name: 'Aceptar invitación' }).click()
  await expect(page.getByRole('button', { name: 'Aceptar invitación' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'The Amber Road', level: 2 })).toBeVisible()
  await page.getByRole('link', { name: 'Abrir campaña: Our new table' }).click()
  await expect(page.locator('header').getByText('Our new table', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('header').getByText('Our new table', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Sesión de/ }).click()
  await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  await page.getByRole('button', { name: /Sesión de dm@example.com/ }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Our new table' })).toHaveCount(0)
  expect(errors).toEqual([])
})

async function finishArinPreview(page: Page) {
  const banner = page.getByText('Viendo como jugador · Arin')
  const picker = page.getByRole('dialog', { name: 'Ver como jugador' })
  await expect(banner.or(picker)).toBeVisible()
  if (await picker.isVisible())
    await picker.getByRole('button', { name: 'Arin', exact: true }).click()
  await expect(banner).toBeVisible()
}

async function openHandoverDialog(page: Page) {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const { trigger: arinMenu, sheet } = await openMemberSheet(page, 'Arin')
  await sheet.getByRole('button', { name: 'Nombrar DM', exact: true }).click()
  await expect(confirmation(page)).toBeVisible()
  return arinMenu
}

test('a members dialog closed with Escape returns focus to its trigger', async ({ page }) => {
  const arinMenu = await openHandoverDialog(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(arinMenu).toBeFocused()
  // And it stays there: no second return pulls it again later.
  await page.waitForTimeout(2_000)
  await expect(arinMenu).toBeFocused()
})

test('Shift+Tab while the dialog is closing keeps focus on the control the person moved to', async ({
  page,
}) => {
  const arinMenu = await openHandoverDialog(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await page.keyboard.press('Shift+Tab')
  const moved = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200))
  // Whatever the dialog's last frames did, 2s later (past any second return) focus has not been pulled
  // back to the trigger from where the person moved it.
  await page.waitForTimeout(2_000)
  expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200))).toBe(moved)
  expect(await arinMenu.evaluate((el) => el === document.activeElement)).toBe(false)
})

test('DM invites, cancels and hands over before leaving; campaign routes stay scoped', async ({
  page,
}) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  // RYT-179: inside a panel the phone bar names the screen; the h1 stays for assistive technology.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
  // RYT-180: leaving is a row of the sheet of the DM's own member row, blocked for the only DM
  // with its reason on the second line.
  const own = await openMemberSheet(page, 'Table DM')
  const leaveRow = own.sheet.getByRole('button', { name: /^Abandonar campaña/ })
  await expect(leaveRow).toHaveAttribute('aria-disabled', 'true')
  await expect(leaveRow).toContainText('Nombra a otro DM antes de irte.')
  await expect(own.sheet.getByRole('button', { name: /^Retirar miembro/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(own.sheet).toHaveCount(0)
  await expect(own.trigger).toBeFocused()
  await page.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
  await page.getByLabel('Correo del jugador').fill('new@example.com')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Invitar jugador', exact: true })
    .click()
  const instructions = page.getByRole('textbox', {
    name: 'Comparte estas instrucciones con el jugador.',
  })
  await expect(instructions).toHaveValue(
    /The Sunken Coast.*\/rytta-dnd-app\/.*new@example\.com.*Mis campañas/,
  )
  await expect(
    page.getByRole('button', { name: 'Copiar instrucciones', exact: true }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Listo', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByText('new@example.com', { exact: true })).toBeVisible()
  // A sent invitation is a row of the same list; its sheet is titled with the email.
  await page.getByRole('button', { name: 'Opciones de la invitación para new@example.com' }).click()
  const invitation = memberSheet(page, 'new@example.com')
  await expect(invitation.getByRole('button')).toContainText([
    'Compartir de nuevo',
    'Cancelar invitación',
  ])
  await invitation.getByRole('button', { name: 'Cancelar invitación', exact: true }).click()
  await confirmation(page).getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('new@example.com', { exact: true })).toHaveCount(0)
  // There is no "Pending invitations" section, and no sentence for an empty one.
  await expect(page.getByText('Invitaciones pendientes')).toHaveCount(0)
  await expect(page.getByText('No hay invitaciones pendientes para esta campaña.')).toHaveCount(0)
  expect(f.calls.some((c) => c.method === 'invite_campaign_member')).toBe(true)
  const { trigger: arinMenu, sheet: arinSheet } = await openMemberSheet(page, 'Arin')
  await arinSheet.getByRole('button', { name: 'Nombrar DM', exact: true }).click()
  // Escape closes the dialog once it is open (pressed while it is still opening, it can be lost).
  await expect(confirmation(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(arinMenu).toBeFocused()
  await arinMenu.click()
  await memberSheet(page, 'Arin').getByRole('button', { name: 'Nombrar DM', exact: true }).click()
  await confirmation(page).getByRole('button', { name: 'Confirmar', exact: true }).click()
  await page.getByRole('button', { name: 'Acciones de Table DM', exact: true }).click()
  await expect(
    memberSheet(page, 'Table DM').getByRole('button', { name: /^Abandonar campaña/ }),
  ).not.toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Sesión de/ }).click()
  await page.getByRole('menuitem', { name: 'Mis campañas', exact: true }).click()
  await page.getByRole('link', { name: 'Abrir campaña: Winter at the Keep' }).click()
  expect(page.url()).toContain(otherCampaignId)
  const currentNav = page.getByRole('navigation', { name: 'Navegación principal' })
  // RYT-112: a Player with a single destination (Party) gets no navigation bar; the DM-only
  // and disabled modules are not offered anywhere in the header.
  const header = page.locator('header')
  await expect(page).toHaveURL(new RegExp(`/campaign/${otherCampaignId}`))
  await expect(currentNav).toHaveCount(0)
  await expect(header.getByRole('link', { name: 'Campamento' })).toHaveCount(0)
  await expect(header.getByText('Inventario', { exact: false })).toHaveCount(0)
  await expect(header.getByText('Centro de mando DM', { exact: false })).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/members`)
  // RYT-095: the command center uses the same confirmation as My campaigns.
  await page.getByRole('button', { name: 'Acciones de Table DM', exact: true }).click()
  await memberSheet(page, 'Table DM')
    .getByRole('button', { name: /^Abandonar campaña/ })
    .click()
  await page
    .getByRole('dialog', { name: '¿Abandonar The Sunken Coast?' })
    .getByRole('button', { name: 'Abandonar campaña', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Has abandonado The Sunken Coast.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toHaveCount(0)
  expect(
    f.calls.some((c) => c.method === 'change_campaign_member' && c.body.new_role === null),
  ).toBe(true)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
})

const phone = (page: Page) => page.viewportSize()!.width < 768
const homeUrl = `./#/campaign/${campaignId}`
const liveEncounter = {
  id: '90000000-0000-4000-8000-000000000001',
  name: 'The bridge',
  status: 'active',
  round: 1,
  updated_at: '2026-11-18T00:00:00Z',
  started_at: '2026-11-18T00:00:00Z',
  ended_at: null,
  combatants: 3,
  needs_initiative: false,
}

/** RYT-179: the command centre's links. The side navigation from 48em; on phones the panel name
 * opens them in a sheet. */
async function panelLinks(page: Page) {
  if (!phone(page)) return page.getByRole('navigation', { name: 'Centro de mando DM' })
  await page.getByRole('button', { name: /cambiar de panel/ }).click()
  return page
    .getByRole('dialog', { name: 'Centro de mando DM' })
    .getByRole('navigation', { name: 'Centro de mando DM' })
}

/** The open panel is marked: the switcher names it on phones, the side navigation elsewhere. */
async function expectCurrentPanel(page: Page, name: string) {
  if (phone(page))
    await expect(page.getByRole('button', { name: /cambiar de panel/ })).toHaveAccessibleName(
      `${name}, cambiar de panel`,
    )
  else
    await expect(
      page
        .getByRole('navigation', { name: 'Centro de mando DM' })
        .getByRole('link', { name, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
}

/** Back to the home: the bar's back link on phones, Summary in the side navigation elsewhere. */
async function goHome(page: Page) {
  await page.getByRole('link', { name: /^(Centro de mando|Resumen)$/ }).click()
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}$`))
}

const shellControls =
  '.dm-side-nav a:visible, .dm-phone-bar a:visible, .dm-phone-bar button:visible, [role="dialog"] a:visible'

test('RYT-029 RYT-179: the campaign index is the DM home, Summary current, with no empty block', async ({
  page,
}, info) => {
  await identityFixture(page, { linkedPlayer: true })
  await page.goto(homeUrl)
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
  // No live encounter and nothing pending: neither block is rendered.
  await expect(page.getByRole('region', { name: 'Campaña' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Ahora' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Pendiente' })).toHaveCount(0)
  const table = page.getByRole('region', { name: 'En la mesa' })
  for (const name of [
    'Bestiario',
    'Almacén de objetos',
    'Repartir botín',
    'Diario de sesión',
    'Abrir la mesa',
  ])
    await expect(table.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(table.getByRole('link', { name: 'Repartir botín' })).toHaveAttribute(
    'href',
    /members\?panel=items&do=loot$/,
  )
  await expect(table.getByRole('button', { name: 'Ensayar en solitario' })).toBeVisible()
  const settings = page.getByRole('region', { name: 'Campaña' })
  await expect(
    settings.getByRole('link', { name: 'Miembros', exact: true }),
  ).toHaveAccessibleDescription(/^\d+ miembros?$/)
  await expect(settings.getByRole('link', { name: 'Nivel del grupo Sin fijar' })).toHaveAttribute(
    'href',
    /members\?panel=level$/,
  )
  await expect(settings.getByRole('link', { name: 'Módulos activos 1 visible' })).toBeVisible()
  await expect(settings.getByRole('link', { name: 'Dados Dados físicos' })).toBeVisible()
  if (phone(page)) {
    // The home has no panel bar: its blocks are the way into every panel.
    await expect(page.getByRole('button', { name: /cambiar de panel/ })).toHaveCount(0)
  } else {
    await expectCurrentPanel(page, 'Resumen')
  }
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Campamento' })).toHaveCount(0)
  await axeClean(page)
  await expectTouchTargets(page, 'main a:visible, main button:visible')
  await capture(page, info.outputPath('landing-dm.png'))
})

test('RYT-179 the home lists the first-session steps left, rehearses alone and drops a step once done', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { free: ['Eira'] })
  await page.goto(homeUrl)
  const pending = page.getByRole('region', { name: 'Pendiente' })
  // Arin has joined and Party is visible: only linking a character is left.
  await expect(pending.getByRole('link', { name: 'Invitar al primer jugador' })).toHaveCount(0)
  await expect(pending.getByRole('link', { name: 'Elegir qué ven los jugadores' })).toHaveCount(0)
  const link = pending.getByRole('link', { name: 'Vincular un personaje a cada jugador' })
  await expect(link).toHaveAccessibleDescription('1 jugador sin personaje')
  await axeClean(page)
  await capture(page, info.outputPath('home-pending.png'))

  const tile = page
    .getByRole('region', { name: 'En la mesa' })
    .getByRole('button', { name: 'Ensayar en solitario' })
  await tile.click()
  const rehearsal = page.getByRole('dialog', { name: 'Ensayar en solitario' })
  await expect(rehearsal).toContainText('Turno de Arin. Ronda 1.')
  for (let turn = 0; turn < 3; turn++)
    await rehearsal.getByRole('button', { name: 'Siguiente turno' }).click()
  await expect(rehearsal).toContainText('Turno de Arin. Ronda 2.')
  await rehearsal.getByRole('button', { name: 'Reiniciar ensayo' }).click()
  await expect(rehearsal).toContainText('Turno de Arin. Ronda 1.')
  await page.keyboard.press('Escape')
  await expect(rehearsal).toHaveCount(0)
  await expect(tile).toBeFocused()

  await link.click()
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}/members$`))
  await expectCurrentPanel(page, 'Miembros')
  // RYT-180: linking a character is three taps: the row's `···`, Link character, the character.
  const person = page.locator('.member-row').filter({ hasText: 'Arin' })
  const { trigger, sheet } = await openMemberSheet(page, 'Arin')
  await sheet.getByRole('button', { name: /^Vincular personaje/ }).click()
  await expect(sheet.locator('[data-pick]').first()).toBeFocused()
  await sheet.getByRole('button', { name: 'Eira', exact: true }).click()
  await expect(person.getByRole('link', { name: 'Ficha de Eira' })).toBeVisible()
  await expect(sheet).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(fixture.calls.find((call) => call.method === 'assign_character')?.body.target_user).toBe(
    playerId,
  )
  await capture(page, info.outputPath('preparation-members.png'))
  // The three steps are done: the block goes.
  await goHome(page)
  await expect(page.getByRole('region', { name: 'Campaña' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Pendiente' })).toHaveCount(0)
})

test('RYT-179 a live encounter leads the home and every panel is two taps from any campaign screen', async ({
  page,
}, info) => {
  await identityFixture(page, { linkedPlayer: true })
  await page.route('**/rest/v1/rpc/list_encounters', (route) =>
    route.fulfill({ json: [liveEncounter] }),
  )
  const mainNav = page.getByRole('navigation', { name: 'Navegación principal' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await mainNav.getByRole('link', { name: 'Centro de mando DM' }).click()
  const now = page.getByRole('region', { name: 'Ahora' })
  const resume = now.getByRole('link', { name: 'Continuar encuentro' })
  await expect(resume).toHaveAttribute('href', new RegExp(`/combat/${liveEncounter.id}$`))
  await expect(resume).toHaveAccessibleDescription('The bridge')
  await expect(now).toContainText('Ronda 1')
  // The resume action is the one filled accent control of the home.
  const filled = await page.evaluate(() => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--app-accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return [...document.querySelectorAll<HTMLElement>('main a, main button')]
      .filter((el) => el.offsetParent && getComputedStyle(el).backgroundColor === accent)
      .map((el) => el.textContent?.trim())
  })
  expect(filled).toEqual(['Continuar encuentro'])
  await axeClean(page)
  await expectTouchTargets(page, 'main a:visible, main button:visible')
  await capture(page, info.outputPath('home-live.png'))

  for (const [name, panel] of [
    ['Almacén de objetos', 'items'],
    ['Bestiario', 'bestiary'],
    ['Miembros', 'members'],
    ['Nivel del grupo', 'level'],
    ['Módulos activos', 'modules'],
    ['Dados', 'dice'],
    ['Auditoría', 'audit'],
  ] as const) {
    await page.goto(`./#/campaign/${campaignId}/party`)
    await mainNav.getByRole('link', { name: 'Centro de mando DM' }).click()
    await page
      .locator('.dm-home')
      .getByRole('link', { name: new RegExp(`^${name}`) })
      .click()
    await expect(page).toHaveURL(
      panel === 'members' ? /\/members$/ : new RegExp(`/members\\?panel=${panel}$`),
    )
    await expectCurrentPanel(page, name)
  }
})

test('RYT-179 old preparation links open the home, which says what waits on the players', async ({
  page,
}) => {
  await identityFixture(page, { twoDms: true })
  await page.route('**/rest/v1/campaign_invitations?**', (route) =>
    route.fulfill({
      json: [
        {
          id: '90000000-0000-4000-8000-000000000002',
          email: 'wait@example.com',
          expires_at: '2099-01-01T00:00:00Z',
        },
      ],
    }),
  )
  await page.goto(`./#/campaign/${campaignId}/members?panel=prepare`)
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}$`))
  const pending = page.getByRole('region', { name: 'Pendiente' })
  const invites = pending.getByRole('link', { name: 'Invitaciones por aceptar' })
  await expect(invites).toHaveAccessibleDescription('1 invitación por aceptar')
  // The invitation is out: inviting is not asked again, and no player can get a character yet.
  await expect(pending.getByRole('link', { name: 'Invitar al primer jugador' })).toHaveCount(0)
  await expect(pending.getByRole('link', { name: /Vincular/ })).toHaveCount(0)
  await invites.click()
  await expect(page.getByText('wait@example.com', { exact: true })).toBeVisible()
  const links = await panelLinks(page)
  await expect(
    links.getByRole('link', { name: 'Miembros', exact: true }),
  ).toHaveAccessibleDescription('1 invitación por aceptar')
})

test('RYT-179 a new campaign asks for the first player and the modules; the invite opens once', async ({
  page,
}) => {
  await identityFixture(page, { twoDms: true, modules: [] })
  await page.goto(homeUrl)
  const pending = page.getByRole('region', { name: 'Pendiente' })
  await expect(pending.getByRole('link', { name: 'Elegir qué ven los jugadores' })).toHaveAttribute(
    'href',
    /members\?panel=modules$/,
  )
  await pending.getByRole('link', { name: 'Invitar al primer jugador' }).click()
  const dialog = page.getByRole('dialog', { name: 'Invitar jugador' })
  await expect(dialog).toBeVisible()
  // The action is consumed: the address no longer carries it.
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}/members$`))
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Invitar jugador', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Invitar jugador', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('RYT-179 panels are links with a current mark; the phone sheet opens, chooses and closes', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=audit`)
  // One h1 for the screen, one h2 for the panel.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
  await expect(page.locator('.dm-shell-panel h2')).toHaveCount(1)
  await expect(page.locator('.dm-shell-panel h2')).toHaveText('Auditoría')
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeVisible()
  await expectCurrentPanel(page, 'Auditoría')
  if (phone(page)) {
    const switcher = page.getByRole('button', { name: /cambiar de panel/ })
    await expect(switcher).toHaveAttribute('aria-haspopup', 'dialog')
    await expect(switcher).toHaveAttribute('aria-expanded', 'false')
    await switcher.click()
    const sheet = page.getByRole('dialog', { name: 'Centro de mando DM' })
    await expect(sheet).toBeVisible()
    await expect(switcher).toHaveAttribute('aria-expanded', 'true')
    const current = sheet.getByRole('link', { name: 'Auditoría', exact: true })
    await expect(current).toHaveAttribute('aria-current', 'page')
    await expect(current).toBeFocused()
    for (const group of ['En la mesa', 'Grupo', 'Ajustes'])
      await expect(sheet.getByRole('list', { name: group, exact: true })).toBeVisible()
    await axeClean(page)
    await expectTouchTargets(page, shellControls)
    await capture(page, info.outputPath('sheet-open.png'))
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(switcher).toBeFocused()
    // Back closes the sheet and stays on the panel.
    await switcher.click()
    await expect(sheet).toBeVisible()
    await page.goBack()
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(/panel=audit$/)
    // A choice loads that panel and gives focus back to the switcher, now naming it.
    await switcher.click()
    await sheet.getByRole('link', { name: 'Dados', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(/panel=dice$/)
    await expect(switcher).toHaveAccessibleName('Dados, cambiar de panel')
    await expect(switcher).toBeFocused()
  } else {
    const nav = page.getByRole('navigation', { name: 'Centro de mando DM' })
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    for (const group of ['En la mesa', 'Grupo', 'Ajustes'])
      await expect(nav.getByRole('list', { name: group, exact: true })).toBeVisible()
    await nav.getByRole('link', { name: 'Dados', exact: true }).click()
    await expect(page).toHaveURL(/panel=dice$/)
    await expectCurrentPanel(page, 'Dados')
    await expect(nav.getByRole('link', { name: 'Auditoría', exact: true })).not.toHaveAttribute(
      'aria-current',
    )
  }
  // Refresh only where it refetches what is on screen.
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toHaveCount(0)
  // Back returns to the previous panel.
  await page.goBack()
  await expect(page).toHaveURL(/panel=audit$/)
  await expectCurrentPanel(page, 'Auditoría')
  await axeClean(page)
  await expectTouchTargets(page, shellControls)
  await capture(page, info.outputPath('shell.png'))
})

test('RYT-179 the party level is its own panel', async ({ page }) => {
  await identityFixture(page, { party: true, sheet: 'complete', partyLevel: 7 })
  await page.goto(homeUrl)
  const below = page.getByRole('region', { name: 'Pendiente' }).getByRole('link', {
    name: 'Personajes por debajo del nivel del grupo',
  })
  await expect(below).toHaveAccessibleDescription(
    /^\d+ personajes? por debajo del nivel del grupo$/,
  )
  await below.click()
  await expect(page).toHaveURL(/panel=level$/)
  await expect(page.getByRole('region', { name: /Nivel del grupo/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByRole('button', { name: 'Invitar jugador', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: /Nivel del grupo/ })).toHaveCount(0)
  // The panel's first control is in the first screen (on phones, under the bar that names it).
  const invite = await page
    .getByRole('button', { name: 'Invitar jugador', exact: true })
    .boundingBox()
  expect(invite!.y).toBeLessThan(phone(page) ? 200 : page.viewportSize()!.height / 3)
})

test('RYT-144 the DM changes the active character from the member sheet, where the reserves are listed', async ({
  page,
}) => {
  await identityFixture(page, { linkedPlayer: true, reserve: ['Eira'], archived: ['Nico'] })
  await page.goto(`./#/campaign/${campaignId}/members`)
  const person = page.locator('.member-row').filter({ hasText: 'Arin' })
  // From tablets up the row says who is in reserve; the phone's row stays two lines.
  if (!phone(page)) await expect(person.getByText('En reserva · Eira')).toBeVisible()
  const { trigger, sheet } = await openMemberSheet(page, 'Arin')
  const switchRow = sheet.getByRole('button', { name: /^Cambiar activo/ })
  await expect(switchRow).toContainText('Eira')
  await switchRow.click()
  // The list replaces the actions: a back row first, then the reserve as a tappable row.
  await expect(sheet.getByRole('button', { name: 'Cambiar activo', exact: true })).toBeVisible()
  await expect(sheet.getByRole('combobox')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Eira', exact: true }).click()
  await expect(person.getByRole('link', { name: 'Ficha de Eira' })).toBeVisible()
  await expect(trigger).toBeFocused()
  // The previous active character is now the reserve.
  await trigger.click()
  await expect(
    memberSheet(page, 'Arin').getByRole('button', { name: /^Cambiar activo/ }),
  ).toContainText('Arin')
})

test('RYT-180 a member sheet that cannot change a character says what failed and stays open', async ({
  page,
}) => {
  await identityFixture(page, { linkedPlayer: true, reserve: ['Eira'] })
  await page.route('**/rest/v1/rpc/set_active_character', (route) =>
    route.fulfill({ status: 500, json: { message: 'boom' } }),
  )
  await page.goto(`./#/campaign/${campaignId}/members`)
  const { sheet } = await openMemberSheet(page, 'Arin')
  await sheet.getByRole('button', { name: /^Cambiar activo/ }).click()
  await sheet.getByRole('button', { name: 'Eira', exact: true }).click()
  await expect(sheet.getByRole('alert')).toBeVisible()
  await expect(sheet).toBeVisible()
  // The list is as it was: the character can be chosen again.
  await expect(sheet.getByRole('button', { name: 'Eira', exact: true })).toBeVisible()
})

test('RYT-029: Players land on Party with no Camp entry and no discoveries section', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true })
  await page.goto(`./#/campaign/${campaignId}`)
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}/party$`))
  // RYT-112: Party is the Player's only destination, so there is no navigation bar to offer
  // Camp in; the Party page itself is what they land on.
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Campamento' })).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()
  await expect(page.getByText('Descubrimientos de la campaña')).toHaveCount(0)
  await capture(page, info.outputPath('landing-player.png'))
})

test('Player has no management payload or controls; revoked campaign fails closed', async ({
  page,
}) => {
  const f = await identityFixture(page, { player: true })
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
  expect(
    f.calls.filter((c) =>
      ['list_campaign_members', 'campaign_invitations', 'character_events'].includes(c.method),
    ),
  ).toEqual([])
  f.revokeAccess()
  await page.reload()
  await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
})

test('DM command center manages modules, the item storeroom, audit log and player preview mode', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const mainNav = page.getByRole('navigation', { name: 'Navegación principal' })
  // RYT-027: the DM Command Center comes first; phones show the short "DM" label.
  await expect(mainNav.getByRole('link').nth(0)).toHaveAccessibleName('Centro de mando DM')
  // RYT-112: running a session comes next (Combat, then the Table), then the other modules.
  await expect(mainNav.getByRole('link').nth(1)).toHaveAccessibleName('Combate')
  await expect(mainNav.getByRole('link', { name: 'Grupo', exact: true })).toBeVisible()
  await expect(mainNav.getByRole('link', { name: 'Campamento' })).toHaveCount(0)
  await expect(mainNav.getByRole('link', { name: /Almacén|Objetos de campaña/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
  // RYT-025, RYT-179: one panel at a time behind links; members is the default.
  await expectCurrentPanel(page, 'Miembros')
  await expect(page.getByRole('region', { name: 'Módulos activos', exact: true })).toHaveCount(0)
  await (await panelLinks(page)).getByRole('link', { name: 'Auditoría', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Auditoría', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Miembros', exact: true })).toHaveCount(0)
  await expect(page.getByText('Recursos actualizados', { exact: true })).toBeVisible()
  await expect(page.getByText('Personaje creado', { exact: true })).toBeVisible()
  await expect(page.getByText('Oro: 15 → 25 (+10)', { exact: true })).toBeVisible()
  await expect(page.getByText('Raciones de comida: 2 → 4 (+2)', { exact: true })).toBeVisible()
  await expect(page.getByText('Por Table DM', { exact: false }).first()).toBeVisible()
  const auditFilter = page.locator('.audit-filter label')
  await auditFilter.filter({ hasText: /^Recursos$/ }).click()
  await expect(page.getByText('Oro: 15 → 25 (+10)', { exact: true })).toBeVisible()
  await expect(page.getByText('Personaje creado', { exact: true })).toHaveCount(0)
  await auditFilter.filter({ hasText: /^Todos$/ }).click()

  await (await panelLinks(page)).getByRole('link', { name: 'Módulos activos', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Módulos activos', exact: true })).toBeVisible()
  const shops = page.getByRole('switch', { name: 'Tiendas: visible para jugadores', exact: true })
  await expect(shops).not.toBeChecked()
  await shops.focus()
  await page.keyboard.press('Space')
  await expect(shops).toBeChecked()
  expect(f.calls.some((c) => c.method === 'set_campaign_modules')).toBe(true)

  // RYT-029: the revelations queue is gone; the item storeroom is a panel with a deep link.
  const links = await panelLinks(page)
  await expect(links.getByRole('link', { name: /revelaciones/i })).toHaveCount(0)
  await links.getByRole('link', { name: 'Almacén de objetos', exact: true }).click()
  await expect(page).toHaveURL(/panel=items/)
  await expect(page.getByRole('heading', { name: 'Almacén de objetos', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abandonar campaña' })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture(page, info.outputPath('dm-command-center.png'))
  await page.reload()
  await expectCurrentPanel(page, 'Almacén de objetos')

  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).focus()
  await page.keyboard.press('Space')
  await finishArinPreview(page)
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Navegación principal' })
  await expect(nav.getByText('Centro de mando DM', { exact: false })).toHaveCount(0)
  await expect(nav.getByText('Tiendas', { exact: false })).toBeVisible()
  await expect(nav.getByText('Inventario', { exact: false })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture(page, info.outputPath('dm-player-preview-mode.png'))
  await page.getByRole('button', { name: 'Volver a vista DM', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
})

test('account change and session expiry remove the previous private screen', async ({ page }) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(
    page.getByRole('button', { name: 'Acciones de Table DM', exact: true }),
  ).toBeVisible()
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
  await expect(page.getByRole('button', { name: /Sesión de player@example.com/ })).toBeVisible()
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
  // RYT-179: inside a panel the phone bar names the screen; the h1 stays for assistive technology.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Centro de mando DM')
  await page.getByRole('button', { name: 'Invitar jugador', exact: true }).click()
  await context.setOffline(true)
  await page.getByLabel('Correo del jugador').fill('offline@example.com')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Invitar jugador', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'No se pudo completar la acción',
  )
  await context.setOffline(false)
  expect(f.calls.filter((c) => c.method === 'invite_campaign_member')).toHaveLength(0)
  await page.keyboard.press('Escape')
  await page.goto(`./#/campaign/${campaignId}/members`)
  await page.getByRole('button', { name: 'Acciones de Table DM', exact: true }).click()
  await memberSheet(page, 'Table DM')
    .getByRole('button', { name: 'Cambiar a jugador', exact: true })
    .click()
  await confirmation(page).getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invitar jugador' })).toHaveCount(0)
})

// RYT-013: a failed refresh keeps what was on screen and says so above it, with Retry.
test('failed refresh keeps cached campaign content and offers recovery', async ({ page }) => {
  const f = await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toBeVisible()
  f.failCampaigns()
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  // RYT-161: one quiet line with Retry over the kept list, not a red alert.
  const line = page.locator('.stale-line')
  await expect(line).toContainText('No se pudo actualizar')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Reintentar' })).toBeEnabled()
})

test('home uses a compact settings menu and accessible theme icons', async ({ page }, info) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeVisible()
  await expect(page.locator('main').getByText('Mi cuenta', { exact: true })).toHaveCount(0)
  await expect(page.locator('main').getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0)
  const trigger = page.getByRole('button', { name: /Sesión de dm@example.com/ })
  await trigger.focus()
  await trigger.press('Enter')
  const campaignsItem = page.getByRole('menuitem', { name: 'Mis campañas', exact: true })
  const settings = page.getByRole('menuitem', { name: 'Ajustes', exact: true })
  await expect(campaignsItem).toBeFocused()
  // My campaigns, Settings and Sign out; language and theme live in Settings (RYT-033).
  await expect(page.getByRole('menuitem')).toHaveCount(3)
  const bounds = await page.getByRole('menu').boundingBox()
  expect(bounds!.height).toBeLessThan(260)
  expect(bounds!.width).toBeLessThanOrEqual(260)
  await capture(page, info.outputPath('compact-settings-menu.png'))
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('heading', { name: 'Mis campañas', exact: true }).click()
  await expect(page.getByRole('menu')).not.toBeVisible()
  await trigger.click()
  await settings.click()
  // RYT-069: Settings opens as a drawer over the current page.
  const drawer = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(drawer).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mis campañas', exact: true })).toBeAttached()
  const themes = drawer.getByRole('radiogroup', { name: 'Tema' })
  await expect(themes.getByRole('radio', { name: 'Hoguera', exact: true })).toBeChecked()
  await expect(themes.getByRole('radio', { name: 'Pergamino', exact: true })).not.toBeChecked()
  await expectTouchTargets(themes, 'label', {
    height: 44,
    width: 44,
  })
  await themes.locator('label').filter({ hasText: 'Pergamino' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light')
  await expect(themes.getByRole('radio', { name: 'Pergamino', exact: true })).toBeChecked()
  await capture(page, info.outputPath('icon-theme-preferences.png'))
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('invitation panel distinguishes loading, empty and failed refresh with recovery', async ({
  page,
}, info) => {
  await identityFixture(page)
  let fail = false
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    'https://rytta-test.supabase.co/rest/v1/rpc/list_my_invitations',
    async (route) => {
      await pending
      await route.fulfill({
        status: fail ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(fail ? { message: 'Unavailable' } : []),
      })
    },
  )
  await page.goto('./')
  const panel = page.getByRole('region', { name: 'Unirse a una campaña' })
  await expect(panel.getByRole('status')).toBeVisible()
  await expect(panel.getByText('No tienes invitaciones pendientes.')).toHaveCount(0)
  release()
  await expect(panel.getByText('No tienes invitaciones pendientes.')).toBeVisible()
  await expect(panel.getByText('dm@example.com', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Copiar correo' })).toBeVisible()
  await capture(page, info.outputPath('invitations-empty.png'))
  fail = true
  await panel.getByRole('button', { name: 'Actualizar', exact: true }).click()
  // RYT-013, RYT-161: the last good answer stays; the screen's one line says it is not updated.
  const line = page.locator('.stale-line')
  await expect(line).toContainText('No se pudo actualizar')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(panel.getByText('No tienes invitaciones pendientes.')).toBeVisible()
  fail = false
  await line.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(panel.getByText('No tienes invitaciones pendientes.')).toBeVisible()
  await expect(line).toHaveCount(0)
})

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const) {
    test(`${language} ${scheme} sign-in, hub and member screens fit and pass axe at 150% text`, async ({
      page,
    }, testInfo) => {
      limitMatrix(testInfo, language === 'es' && scheme === 'dark')
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
        await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
        await expect(
          page.getByText(screen === 'hub' ? 'The Sunken Coast' : 'Arin', { exact: true }).first(),
        ).toBeVisible()
        await capture(page, testInfo.outputPath(`${screen}-${language}-${scheme}-100.png`), {
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
        await capture(page, testInfo.outputPath(`${screen}-${language}-${scheme}-150.png`), {
          scale: 'css',
        })
      }
      await page.goto('./')
      await page
        .getByRole('button', {
          name: language === 'es' ? /Sesión de dm@example.com/ : /Signed in as dm@example.com/,
        })
        .click()
      await page
        .getByRole('menuitem', {
          name: language === 'es' ? 'Cerrar sesión' : 'Sign out',
          exact: true,
        })
        .click()
      const google = page.getByRole('button', {
        name: language === 'es' ? 'Continuar con Google' : 'Continue with Google',
      })
      await expect(google).toBeVisible()
      // RYT-085: at 150% text on a phone the sign-in label is centred, never clipped, and the
      // button stays on screen. Line count depends on the system font (Inter is not bundled),
      // so a wrap onto a second centred line is accepted.
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      const label = await google.evaluate((button) => {
        const text = button.querySelector<HTMLElement>('.mantine-Button-label')!
        const box = button.getBoundingClientRect()
        const inner = text.getBoundingClientRect()
        return {
          align: getComputedStyle(text).textAlign,
          clipped:
            text.scrollWidth > text.clientWidth + 1 ||
            text.scrollHeight > text.clientHeight + 1 ||
            inner.top < box.top - 1 ||
            inner.bottom > box.bottom + 1 ||
            inner.left < box.left - 1 ||
            inner.right > box.right + 1,
          onScreen: box.left >= 0 && box.right <= innerWidth,
          tall: box.height >= 44,
        }
      })
      expect(label).toEqual({ align: 'center', clipped: false, onScreen: true, tall: true })
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(audit.violations).toEqual([])
      await capture(page, testInfo.outputPath(`sign-in-${language}-${scheme}-150.png`), {
        scale: 'css',
      })
    })
  }

// RYT-095: leaving a campaign from My campaigns and from the profile menu.
const leaveTargets =
  'main button:visible, [role="menu"] [role="menuitem"]:visible, [role="dialog"] button:visible'
async function axeClean(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(
    audit.violations.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary}`).join(' | ')}`,
    ),
  ).toEqual([])
}

test('RYT-095 a Player leaves from the campaign card menu', async ({ page }) => {
  const f = await identityFixture(page, { player: true })
  await page.goto('./')
  const more = page.getByRole('button', { name: 'Más acciones · The Sunken Coast', exact: true })
  await more.click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveText(['Abrir campaña', 'Abandonar campaña'])
  // Contrast is measured once the menu has faded in.
  await expect(menu).toHaveCSS('opacity', '1')
  await axeClean(page)
  await expectTouchTargets(page, leaveTargets)
  await menu.getByRole('menuitem', { name: 'Abandonar campaña' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Abandonar The Sunken Coast?' })
  await expect(dialog).toContainText(
    'Tus personajes vuelven al DM. Para volver necesitarás una nueva invitación.',
  )
  await expect(dialog.locator('button', { hasText: /^Cancelar$/ })).toBeFocused()
  // The menu fades out under the dialog; measure once it is gone.
  await expect(menu).toHaveCount(0)
  await axeClean(page)
  await expectTouchTargets(page, leaveTargets)
  // Escape and Cancel close without leaving and return focus to the ⋯ button.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(more).toBeFocused()
  // Keyboard: Enter opens the menu on Open, ArrowDown moves to Leave campaign.
  await page.keyboard.press('Enter')
  await expect(menu.getByRole('menuitem', { name: 'Abrir campaña' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Abandonar campaña' })).toBeFocused()
  await page.keyboard.press('Enter')
  await dialog.locator('button', { hasText: /^Cancelar$/ }).click()
  await expect(dialog).toHaveCount(0)
  await expect(more).toBeFocused()
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await more.click()
  await menu.getByRole('menuitem', { name: 'Abandonar campaña' }).click()
  await dialog.getByRole('button', { name: 'Abandonar campaña', exact: true }).click()
  // The outcome takes focus, the card is gone and the campaign's pages are closed.
  const left = page.getByRole('status').filter({ hasText: 'Has abandonado The Sunken Coast.' })
  await expect(left).toBeFocused()
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Winter at the Keep' })).toBeVisible()
  const leave = f.calls.filter((c) => c.method === 'change_campaign_member')
  expect(leave).toHaveLength(1)
  expect(leave[0]!.body).toEqual({
    target_campaign: campaignId,
    target_user: playerId,
    new_role: null,
  })
  await axeClean(page)
  // Dismissing the outcome moves focus to the page heading and does not come back on reload.
  await left.getByRole('button', { name: 'Cerrar' }).click()
  await expect(left).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Mis campañas' })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Winter at the Keep' })).toBeVisible()
  await expect(page.getByText('Has abandonado')).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByText('Esta campaña no está disponible para tu cuenta.')).toBeVisible()
})

test('RYT-095 a Player leaves from the profile menu inside the campaign', async ({ page }) => {
  const f = await identityFixture(page, { player: true })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toBeVisible()
  const profile = page.getByRole('button', { name: /Sesión de player@example.com/ })
  await profile.click()
  // Leave belongs to the open campaign, above the account items; Sign out stays last.
  await expect(page.getByRole('menuitem')).toHaveText([
    'Mis campañas',
    'Abandonar campaña',
    'Ajustes',
    'Cerrar sesión',
  ])
  await expect(page.getByRole('menu')).toContainText('The Sunken Coast')
  const item = page.getByRole('menuitem', { name: 'Abandonar campaña' })
  await expect(item).toBeEnabled()
  await expect(item).not.toHaveAttribute('aria-disabled')
  await expectTouchTargets(page, leaveTargets)
  await item.click()
  const dialog = page.getByRole('dialog', { name: '¿Abandonar The Sunken Coast?' })
  await expect(dialog.locator('button', { hasText: /^Cancelar$/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(profile).toBeFocused()
  await profile.click()
  await item.click()
  await dialog.getByRole('button', { name: 'Abandonar campaña', exact: true }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(
    page.getByRole('status').filter({ hasText: 'Has abandonado The Sunken Coast.' }),
  ).toBeFocused()
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toHaveCount(0)
  expect(
    f.calls.filter((c) => c.method === 'change_campaign_member' && c.body.new_role === null),
  ).toHaveLength(1)
  // Outside a campaign the profile menu has no leave action.
  await profile.click()
  await expect(page.getByRole('menuitem', { name: 'Abandonar campaña' })).toHaveCount(0)
})

test('RYT-095 the only DM is told to name another DM; with a co-DM they can leave', async ({
  page,
}) => {
  const f = await identityFixture(page)
  await page.goto('./')
  // My campaigns: the DM's own campaign blocks Leave with the reason; their Player campaign does not.
  await page.getByRole('button', { name: 'Más acciones · The Sunken Coast', exact: true }).click()
  const blocked = page.getByRole('menuitem', { name: 'Abandonar campaña' })
  await expect(blocked).toHaveAttribute('aria-disabled', 'true')
  await expect(blocked).toHaveAccessibleDescription('Nombra a otro DM antes de irte.')
  await expect(page.getByRole('menu')).toContainText('Nombra a otro DM antes de irte.')
  await expect(page.getByRole('menu')).toHaveCSS('opacity', '1')
  await axeClean(page)
  // Reachable by the arrow keys, so the reason is read; choosing it does nothing.
  await page.keyboard.press('ArrowDown')
  await expect(blocked).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(blocked).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Más acciones · Winter at the Keep', exact: true }).click()
  await expect(
    page
      .getByRole('menu', { name: 'Más acciones · Winter at the Keep' })
      .getByRole('menuitem', { name: 'Abandonar campaña' }),
  ).not.toHaveAttribute('aria-disabled')
  await page.keyboard.press('Escape')
  // Inside the campaign: the profile menu says the same; the Player view has no leave action.
  await page.goto(`./#/campaign/${campaignId}/party`)
  const profile = page.getByRole('button', { name: /Sesión de dm@example.com/ })
  await profile.click()
  await expect(page.getByRole('menuitem', { name: 'Abandonar campaña' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(
    page.getByRole('menuitem', { name: 'Abandonar campaña' }),
  ).toHaveAccessibleDescription('Nombra a otro DM antes de irte.')
  await page.keyboard.press('Escape')
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await finishArinPreview(page)
  await profile.click()
  await expect(page.getByRole('menuitem', { name: 'Ajustes' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Abandonar campaña' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
})

test('RYT-095 a DM with a co-DM leaves; the server still keeps one DM', async ({ page }) => {
  const f = await identityFixture(page, { twoDms: true })
  // The member list says two DMs, but the other one stepped down meanwhile: the server refuses.
  let refuse = true
  await page.route('**/rest/v1/rpc/change_campaign_member', async (route) => {
    if (!refuse) return route.fallback()
    refuse = false
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: 'Keep at least one DM' }),
    })
  })
  await page.goto(`./#/campaign/${campaignId}/members`)
  const profile = page.getByRole('button', { name: /Sesión de dm@example.com/ })
  await profile.click()
  const item = page.getByRole('menuitem', { name: 'Abandonar campaña' })
  await expect(item).not.toHaveAttribute('aria-disabled')
  await item.click()
  const dialog = page.getByRole('dialog', { name: '¿Abandonar The Sunken Coast?' })
  const confirm = dialog.getByRole('button', { name: 'Abandonar campaña', exact: true })
  await confirm.click()
  await expect(dialog.getByRole('alert')).toHaveText('Nombra a otro DM antes de irte.')
  await expect(dialog.getByRole('alert')).toBeFocused()
  await expect(confirm).toBeDisabled()
  await dialog.locator('button', { hasText: /^Cancelar$/ }).click()
  await expect(profile).toBeFocused()
  // A fresh confirmation goes through.
  await profile.click()
  await item.click()
  await confirm.click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Has abandonado The Sunken Coast.' }),
  ).toBeFocused()
  // The refused call never reached the fixture backend; the second one did.
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(1)
})

test('RYT-095 a failed leave keeps the dialog open with a retry', async ({ page, context }) => {
  const f = await identityFixture(page, { player: true })
  await page.goto('./')
  const more = page.getByRole('button', { name: 'Más acciones · The Sunken Coast', exact: true })
  await more.click()
  await page.getByRole('menuitem', { name: 'Abandonar campaña' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Abandonar The Sunken Coast?' })
  const confirm = dialog.getByRole('button', { name: 'Abandonar campaña', exact: true })
  // Offline: nothing is sent and the dialog says how to recover.
  await context.setOffline(true)
  await confirm.click()
  const error = dialog.getByRole('alert')
  await expect(error).toHaveText(
    'No se pudo abandonar la campaña. Revisa la conexión y vuelve a intentarlo.',
  )
  await expect(error).toBeFocused()
  expect(f.calls.filter((c) => c.method === 'change_campaign_member')).toHaveLength(0)
  await axeClean(page)
  // A server failure keeps the user in place too.
  await context.setOffline(false)
  let fail = true
  await page.route('**/rest/v1/rpc/change_campaign_member', async (route) => {
    if (!fail) return route.fallback()
    fail = false
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Service unavailable' }),
    })
  })
  await confirm.click()
  await expect(error).toBeVisible()
  await expect(confirm).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'The Sunken Coast', exact: true })).toBeAttached()
  // The same button retries.
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Has abandonado The Sunken Coast.' }),
  ).toBeFocused()
})

// RYT-123 (J1): answering invitations, the arrival order of the hub and the shell.
const respondRpc = 'https://rytta-test.supabase.co/rest/v1/rpc/respond_campaign_invitation'
const invitationsRpc = 'https://rytta-test.supabase.co/rest/v1/rpc/list_my_invitations'

test('J1-03 a pending invitation sits above the campaigns and speaks to the Player', async ({
  page,
}) => {
  await identityFixture(page, { player: true })
  await page.goto('./')
  const panel = page.getByRole('region', { name: 'Unirse a una campaña' })
  await expect(panel).toBeVisible()
  const campaign = page.getByRole('heading', { name: 'The Sunken Coast', level: 2 })
  await expect(campaign).toBeVisible()
  expect((await panel.boundingBox())!.y).toBeLessThan((await campaign.boundingBox())!.y)
  // J1-02 and J1-25: Player copy, and the buttons name the campaign they answer.
  await expect(panel.getByText('Jugarás con Amber scout.')).toBeVisible()
  await expect(page.getByText('Cuando acepte, podrás vincularle')).toHaveCount(0)
  await expect(
    panel.getByRole('button', { name: 'Aceptar invitación a The Amber Road' }),
  ).toBeVisible()
  await expect(
    panel.getByRole('button', { name: 'Rechazar invitación a The Amber Road' }),
  ).toBeVisible()
})

test('J1-05 accepting an invitation says so, offers the way in and keeps focus on the result', async ({
  page,
}) => {
  await identityFixture(page, { player: true })
  await page.goto('./')
  await page.getByRole('button', { name: 'Aceptar invitación a The Amber Road' }).click()
  const notice = page.getByRole('status').filter({ hasText: 'Te has unido a The Amber Road.' })
  await expect(notice).toBeVisible()
  await expect(notice).toBeFocused()
  await expect(notice.getByRole('link', { name: 'Abrir campaña' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Amber Road', level: 2 })).toBeVisible()
})

test('J1-06 an offline accept sends nothing, says so and retries after reconnecting', async ({
  page,
  context,
}) => {
  const f = await identityFixture(page, { player: true })
  await page.goto('./')
  const accept = page.getByRole('button', { name: 'Aceptar invitación a The Amber Road' })
  await expect(accept).toBeVisible()
  await context.setOffline(true)
  await accept.click()
  const alert = page.getByRole('region', { name: 'Unirse a una campaña' }).getByRole('alert')
  await expect(alert).toContainText('Sin conexión. Reconecta y vuelve a intentarlo.')
  await context.setOffline(false)
  await page.waitForTimeout(500)
  expect(f.calls.filter((c) => c.method === 'respond_campaign_invitation')).toHaveLength(0)
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Te has unido a The Amber Road.' }),
  ).toBeVisible()
  expect(f.calls.filter((c) => c.method === 'respond_campaign_invitation')).toHaveLength(1)
})

test('J1-06 a revoked invitation says it is gone and its card leaves; other failures offer a retry', async ({
  page,
}) => {
  await identityFixture(page, { player: true })
  await page.goto('./')
  let gone = false
  await page.route(invitationsRpc, (route) =>
    gone
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fallback(),
  )
  let mode: 'server' | 'gone' = 'server'
  await page.route(respondRpc, async (route) => {
    if (mode === 'gone') gone = true
    await route.fulfill({
      status: mode === 'gone' ? 403 : 503,
      contentType: 'application/json',
      body: JSON.stringify({
        message: mode === 'gone' ? 'Invitation unavailable' : 'Service unavailable',
      }),
    })
  })
  const panel = page.getByRole('region', { name: 'Unirse a una campaña' })
  await page.getByRole('button', { name: 'Aceptar invitación a The Amber Road' }).click()
  await expect(panel.getByRole('alert')).toContainText('No se pudo responder a la invitación')
  await expect(panel.getByRole('alert').getByRole('button', { name: 'Reintentar' })).toBeVisible()
  mode = 'gone'
  await panel.getByRole('alert').getByRole('button', { name: 'Reintentar' }).click()
  await expect(panel.getByRole('alert')).toContainText('Esta invitación ya no está disponible')
  await expect(panel.getByRole('alert').getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /Aceptar invitación a/ })).toHaveCount(0)
})

test('J1-07 declining asks a named question, stays open and busy until the answer, then reports it', async ({
  page,
}) => {
  const f = await identityFixture(page, { player: true })
  await page.goto('./')
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(respondRpc, async (route) => {
    await gate
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Rechazar invitación a The Amber Road' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Rechazar la invitación?' })
  await expect(dialog).toContainText('The Amber Road')
  const confirm = dialog.getByRole('button', { name: 'Rechazar invitación', exact: true })
  await confirm.click()
  await expect(confirm).toBeDisabled()
  // Busy: the request is in flight, so Escape waits for its answer.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  release()
  await expect(dialog).toHaveCount(0)
  const notice = page
    .getByRole('status')
    .filter({ hasText: 'Has rechazado la invitación a The Amber Road.' })
  await expect(notice).toBeFocused()
  expect(f.calls.filter((c) => c.method === 'respond_campaign_invitation')).toHaveLength(1)
})

test('J1-11 Back closes the hub dialogs instead of leaving the page', async ({ page }) => {
  await identityFixture(page, { player: true })
  await page.goto('./')
  const start = page.url()
  await page.getByRole('button', { name: 'Crear campaña', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'Crear campaña' })
  await expect(create).toBeVisible()
  await page.goBack()
  await expect(create).toHaveCount(0)
  expect(page.url()).toBe(start)
  await expect(page.getByRole('heading', { name: 'Mis campañas', level: 1 })).toBeVisible()
  // Closing with Escape leaves no entry behind.
  await page.getByRole('button', { name: 'Rechazar invitación a The Amber Road' }).click()
  await expect(page.getByRole('dialog', { name: '¿Rechazar la invitación?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('ryttaOverlays')
  // An overlay reopened right after another closed still owns exactly one entry.
  await page.getByRole('button', { name: 'Rechazar invitación a The Amber Road' }).click()
  const decline = page.getByRole('dialog', { name: '¿Rechazar la invitación?' })
  await expect(decline).toBeVisible()
  await page.goBack()
  await expect(decline).toHaveCount(0)
  expect(page.url()).toBe(start)
})

test('J3-16 a Player sent to the old items address lands on the inventory', async ({ page }) => {
  await identityFixture(page, { player: true, inventory: true })
  await page.goto(`./#/campaign/${campaignId}/items`)
  await expect(page).toHaveURL(new RegExp(`#/campaign/${campaignId}/inventory$`))
})

test('J3-16 the DM keeps landing on the storeroom of the command center', async ({ page }) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/items`)
  await expect(page).toHaveURL(new RegExp(`#/campaign/${campaignId}/members\\?panel=items$`))
})

test('J1-12 the emblem inside a campaign returns to My campaigns; the name stays its home', async ({
  page,
}) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const home = page.getByRole('link', { name: 'Inicio de The Sunken Coast' })
  const list = page.getByRole('link', { name: 'RYTTA · Mis campañas' })
  await expect(home).toBeVisible()
  const box = (await list.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  await list.click()
  await expect(page.getByRole('heading', { name: 'Mis campañas', level: 1 })).toBeVisible()
})

test('J1-08 tapping Google offline says so instead of leaving the page', async ({
  page,
  context,
}) => {
  await identityFixture(page, { signedIn: false })
  await page.goto('./')
  const google = page.getByRole('button', { name: 'Continuar con Google' })
  await expect(google).toBeVisible()
  let authorize = 0
  page.on('request', (request) => {
    if (request.url().includes('/auth/v1/authorize')) authorize += 1
  })
  const start = page.url()
  await context.setOffline(true)
  await google.click()
  await expect(page.getByRole('alert')).toContainText('No pudimos conectar')
  await expect(google).toBeVisible()
  expect(page.url()).toBe(start)
  expect(authorize).toBe(0)
})

test('J1-15 signed out, the gear opens Settings directly and Back closes it', async ({ page }) => {
  await identityFixture(page, { signedIn: false })
  await page.goto('./')
  const start = page.url()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(drawer).toBeVisible()
  await page.goBack()
  await expect(drawer).toHaveCount(0)
  expect(page.url()).toBe(start)
  await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible()
})

const focusLabel = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    return {
      inDialog: Boolean(active?.closest('[role="dialog"]')),
      label: active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 40) ?? '',
    }
  })

for (const dialog of ['handover', 'invite'] as const)
  for (const [key, delay] of [
    ['Tab', 60],
    ['Tab', 150],
    ['Shift+Tab', 100],
  ] as const)
    test(`RYT-135 ${key} ${delay}ms after Escape moves on from the closing ${dialog} dialog instead of being swallowed`, async ({
      page,
    }) => {
      let trigger: Locator
      const triggerLabel = dialog === 'handover' ? 'Acciones de Arin' : 'Invitar jugador'
      if (dialog === 'handover') trigger = await openHandoverDialog(page)
      else {
        await identityFixture(page)
        await page.goto(`./#/campaign/${campaignId}/members`)
        trigger = page
          .getByRole('region', { name: 'Miembros' })
          .getByRole('button', { name: 'Invitar jugador', exact: true })
        await trigger.click()
        await expect(page.getByRole('dialog')).toBeVisible()
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(delay)
      await page.keyboard.press(key)
      // Whenever it is read, in the dialog's last frames or after it has gone, focus is never inside the
      // dialog. Where another control follows the trigger it is on that control, not pulled back.
      const another = dialog === 'invite' || key === 'Shift+Tab'
      for (const wait of [0, 80, 250, 1_500]) {
        await page.waitForTimeout(wait)
        const at = await focusLabel(page)
        expect(at.inDialog, `at +${wait}ms`).toBe(false)
        if (another) expect(at.label, `at +${wait}ms`).not.toBe(triggerLabel)
      }
      if (another) await expect(trigger).not.toBeFocused()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })

test('RYT-135 Escape pressed in the same frame as the dialog opens closes it and returns focus', async ({
  page,
}) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const { trigger: arinMenu, sheet: arinSheet } = await openMemberSheet(page, 'Arin')
  const item = arinSheet.getByRole('button', { name: 'Nombrar DM', exact: true })
  await item.focus()
  // Both keys are sent back to back, before the dialog has rendered.
  await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Escape')])
  // Frames pass first, so "no dialog" is read after it had every chance to open, not before.
  await focusAcrossFrames(page, 30)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(arinMenu).toBeFocused()
  // The same for the invitation dialog.
  const invite = page.getByRole('button', { name: 'Invitar jugador', exact: true })
  await invite.focus()
  await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Escape')])
  await focusAcrossFrames(page, 30)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(invite).toBeFocused()
  // And the dialogs still open and close normally afterwards.
  await invite.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(invite).toBeFocused()
  await arinMenu.click()
  await item.click()
  await expect(confirmation(page)).toBeVisible()
  await confirmation(page).getByRole('button', { name: 'Cancelar', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('RYT-136 the profile menu returns focus on Escape and after a choice that opens a panel, never after the person moved on', async ({
  page,
}) => {
  await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=audit`)
  const trigger = page.getByRole('button', { name: /Sesión de/ })
  await expect(trigger).toBeVisible()
  // The keyboard opens the menu; a slow page may need the key again, so it is retried until it shows.
  const openMenu = () =>
    expect(async () => {
      if (!(await page.getByRole('menu').isVisible())) {
        await trigger.focus()
        await page.keyboard.press('Enter')
      }
      await expect(page.getByRole('menu')).toBeVisible({ timeout: 1_500 })
    }).toPass()

  // Escape, once: back on the trigger, and it stays there.
  await openMenu()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  // It stays there, frame after frame.
  expect(new Set(await focusAcrossFrames(page, 40)).size).toBe(1)
  await expect(trigger).toBeFocused()

  // A choice that opens a panel: the panel hands focus back when it closes.
  await openMenu()
  await page.getByRole('menuitem', { name: 'Ajustes' }).click()
  const settings = page.getByRole('dialog', { name: 'Ajustes' })
  await expect(settings).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // Another control chosen while the menu is open (a click closes the menu): focus belongs to it, now
  // and after the menu has finished leaving.
  await openMenu()
  // The first audit filter sits clear of the menu, which opens under the profile button.
  const other = page.getByRole('radio', { name: 'Todos', exact: true })
  await page
    .locator('.audit-filter label')
    .filter({ hasText: /^Todos$/ })
    .click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  // Frame after frame, until the menu has long finished leaving, focus stays on the chosen control.
  expect(new Set(await focusAcrossFrames(page, 90)).size).toBe(1)
  await expect(other).toBeFocused()
  await expect(trigger).not.toBeFocused()
})

test('RYT-123 the landing keeps its sign-in button above the fold in phone landscape', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'identity-mobile', 'landscape sizes are set here')
  await identityFixture(page, { signedIn: false })
  for (const size of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(size)
    await page.goto('./')
    const button = page.getByRole('button', { name: 'Continuar con Google' })
    await expect(button).toBeVisible()
    const box = (await button.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(size.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, info.outputPath(`landing-landscape-${size.width}.png`), { fullPage: false })
  }
})

test('RYT-123 the campaign hub uses two columns on a tablet and one on a phone', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'The Sunken Coast' })).toBeVisible()
  const columns = await page
    .locator('.hub-card')
    .first()
    .evaluate((card) => getComputedStyle(card.parentElement!).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(info.project.name === 'identity-mobile' ? 1 : 2)
})

test('RYT-179 invitations to accept land on their list; another panel starts at the top with focus', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.route('**/rest/v1/campaign_invitations?**', (route) =>
    route.fulfill({
      json: [
        {
          id: '90000000-0000-4000-8000-000000000002',
          email: 'wait@example.com',
          expires_at: '2099-01-01T00:00:00Z',
        },
      ],
    }),
  )
  await page.goto(`./#/campaign/${campaignId}`)
  await page.getByRole('link', { name: /Invitaciones por aceptar/ }).click()
  // The action is consumed: the address is clean and the sent invitations have focus.
  await expect(page).toHaveURL(/\/members$/)
  // The first invitation row's name has the focus (no "Pending invitations" heading any more).
  await expect(page.getByText('wait@example.com', { exact: true })).toBeFocused()
  if ((info.project.use.viewport?.width ?? 0) < 768) return
  // Panel to panel is the same route: the frame scrolls to the top and focuses the new panel.
  const nav = page.getByRole('navigation', { name: 'Centro de mando DM' })
  await nav.getByRole('link', { name: 'Dados', exact: true }).click()
  await expect(page).toHaveURL(/panel=dice$/)
  await expect(page.locator('.dm-shell-panel')).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

/** The filled accent controls on the page (RYT-151: one per panel at most). */
const filledOnPage = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--app-accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return [...document.querySelectorAll<HTMLElement>('main a, main button')]
      .filter((el) => el.offsetParent && getComputedStyle(el).backgroundColor === accent)
      .map((el) => el.textContent?.trim())
  })

const sentInvitation = {
  id: '90000000-0000-4000-8000-000000000002',
  email: 'wait@example.com',
  expires_at: '2099-01-01T00:00:00Z',
}
const withSentInvitation = (page: Page) =>
  page.route('**/rest/v1/campaign_invitations?**', (route) =>
    route.fulfill({ json: [sentInvitation] }),
  )

test('RYT-180 Members: compact rows, sent invitations in the same list, no badges, columns from 48em', async ({
  page,
}, info) => {
  await identityFixture(page, { linkedPlayer: true, party: true })
  await withSentInvitation(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const rows = page.locator('.member-row')
  // Members first (the DM, Arin, Bea, Cato), then the invitation: one list, no second section.
  await expect(rows).toHaveCount(5)
  await expect(page.locator('main ul.member-list')).toHaveCount(1)
  await expect(rows.nth(4)).toContainText('wait@example.com')
  await expect(rows.nth(4)).toContainText('Invitación enviada · caduca el')
  await expect(page.locator('main .mantine-Badge-root')).toHaveCount(0)
  // One `···` per row, each opening a dialog.
  const more = page.locator('.member-row .member-action')
  await expect(more).toHaveCount(5)
  for (const button of await more.all())
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog')
  // Line 2: a DM is "DM", a Player carries the active character as a link to its sheet.
  await expect(rows.nth(0).locator('.member-second')).toContainText('DM')
  await expect(rows.nth(1).getByRole('link', { name: 'Ficha de Arin' })).toHaveAttribute(
    'href',
    new RegExp(`/campaign/${campaignId}/party/`),
  )
  expect(await filledOnPage(page)).toEqual(['Invitar jugador'])
  const heights = await rows.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  )
  if (phone(page)) {
    // Two lines on about 64px, and the address waits in the sheet.
    for (const height of heights) expect(height).toBeLessThanOrEqual(72)
    await expect(rows.nth(1).locator('.member-email')).toBeHidden()
    await expect(page.locator('.member-list-head')).toBeHidden()
    await expect(rows.nth(1).locator('.member-role')).toBeHidden()
  } else {
    // Columns: Member, Character, Role and the actions; the email is in the row.
    await expect(page.locator('.member-list-head')).toBeVisible()
    await expect(rows.nth(1).locator('.member-email')).toHaveText('player@example.com')
    await expect(rows.nth(1).locator('.member-role')).toHaveText('Jugador')
    const columns = await rows
      .nth(1)
      .evaluate((row) => getComputedStyle(row).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(4)
  }
  await axeClean(page)
  await expectTouchTargets(page, 'main a:visible, main button:visible')
  // The character link is as wide as it is tall to hit, whatever the name.
  await expectTouchTargets(page, 'main .member-sheet-link:visible', { width: 44, height: 44 })
  await capture(page, info.outputPath('members.png'))
})

for (const theme of ['default', 'parchment'] as const)
  test(`RYT-180 the member sheet: dialog semantics, 48px rows, Escape and Back in ${theme}`, async ({
    page,
  }, info) => {
    limitMatrix(info, theme === 'default')
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    await identityFixture(page, { linkedPlayer: true, reserve: ['Eira'], free: ['Nico'] })
    await page.goto(`./#/campaign/${campaignId}/members`)
    const { trigger, sheet } = await openMemberSheet(page, 'Arin')
    // A bottom drawer on phones, the shared modal from 48em; titled with the member, the email under it.
    await expect(sheet).toHaveClass(phone(page) ? /Drawer/ : /Modal/)
    await expect(sheet).toContainText('player@example.com')
    await expect(sheet.getByRole('button', { name: 'Cerrar' })).toBeVisible()
    await expect(sheet.getByRole('link', { name: 'Abrir la ficha de Arin' })).toBeVisible()
    await expect(sheet.getByRole('button', { name: /^Vincular personaje/ })).toContainText(
      '1 libre',
    )
    await expect(sheet.getByRole('button', { name: /^Cambiar activo/ })).toContainText('Eira')
    await expect(sheet.getByRole('button', { name: 'Retirar miembro' })).toBeVisible()
    // Every row is at least 48px.
    const rowHeights = await sheet
      .locator('.sheet-row')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
    for (const height of rowHeights) expect(height).toBeGreaterThanOrEqual(48)
    await page.waitForTimeout(400)
    await axeClean(page)
    await expectTouchTargets(page, '[role="dialog"] button:visible, [role="dialog"] a:visible')
    await capture(page, info.outputPath(`member-sheet-${theme}.png`), { fullPage: false })
    // The list view replaces the actions and has its own back row.
    await sheet.getByRole('button', { name: /^Vincular personaje/ }).click()
    await expect(sheet.getByRole('button', { name: 'Nico', exact: true })).toBeFocused()
    await axeClean(page)
    await expectTouchTargets(page, '[role="dialog"] button:visible, [role="dialog"] a:visible')
    await sheet.getByRole('button', { name: 'Vincular personaje', exact: true }).click()
    await expect(sheet.getByRole('button', { name: /^Vincular personaje/ })).toBeFocused()
    // Escape closes it and focus returns to the `···` that opened it.
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(trigger).toBeFocused()
    // Back closes it too and the page stays where it is.
    await trigger.click()
    await expect(sheet).toBeVisible()
    await page.goBack()
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(/\/members$/)
  })

test('RYT-180 changing a role is three taps, and the only DM cannot step down or leave', async ({
  page,
}) => {
  const f = await identityFixture(page, { linkedPlayer: true })
  await page.goto(`./#/campaign/${campaignId}/members`)
  const { sheet } = await openMemberSheet(page, 'Arin')
  await sheet.getByRole('button', { name: 'Nombrar DM', exact: true }).click()
  await expect(confirmation(page)).toContainText('Arin')
  await confirmation(page).getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    f.calls.filter((c) => c.method === 'change_campaign_member').map((c) => c.body.new_role),
  ).toEqual(['dm'])
  // A second DM exists now: Arin's row says DM.
  await expect(
    page.locator('.member-row').filter({ hasText: 'Arin' }).locator('.member-role'),
  ).toHaveText('DM')
})

test('RYT-180 the only DM cannot step down: the row says why and does nothing', async ({
  page,
}) => {
  await identityFixture(page, { linkedPlayer: true })
  await page.goto(`./#/campaign/${campaignId}/members`)
  const own = await openMemberSheet(page, 'Table DM')
  const role = own.sheet.getByRole('button', { name: /^Cambiar a jugador/ })
  await expect(role).toHaveAttribute('aria-disabled', 'true')
  await expect(role).toContainText('Nombra a otro DM antes de cambiar este rol.')
  await role.dispatchEvent('click')
  // A blocked row does nothing: no confirmation opens.
  await expect(confirmation(page)).toHaveCount(0)
  await expect(own.sheet).toBeVisible()
})

test('RYT-180 a member with no free character to link is offered no Link row', async ({ page }) => {
  await identityFixture(page, { linkedPlayer: true })
  await page.goto(`./#/campaign/${campaignId}/members`)
  const { sheet } = await openMemberSheet(page, 'Arin')
  await expect(sheet.getByRole('button', { name: /^Vincular personaje/ })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /^Cambiar activo/ })).toHaveCount(0)
  await expect(sheet.getByRole('link', { name: 'Abrir la ficha de Arin' })).toBeVisible()
})

test('RYT-180 the sent invitation sheet shares the instructions again and returns focus', async ({
  page,
}) => {
  await identityFixture(page)
  await withSentInvitation(page)
  await page.goto(`./#/campaign/${campaignId}/members`)
  const trigger = page.getByRole('button', {
    name: 'Opciones de la invitación para wait@example.com',
  })
  await trigger.click()
  const sheet = memberSheet(page, 'wait@example.com')
  await sheet.getByRole('button', { name: 'Compartir de nuevo', exact: true }).click()
  const instructions = page.getByRole('dialog', { name: 'Invitar jugador' })
  await expect(instructions.getByRole('textbox')).toHaveValue(/wait@example\.com/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('RYT-180 sent invitations that cannot load say so with a retry above the list', async ({
  page,
}) => {
  await identityFixture(page)
  await page.route('**/rest/v1/campaign_invitations?**', (route) =>
    route.fulfill({ status: 500, json: { message: 'boom' } }),
  )
  await page.goto(`./#/campaign/${campaignId}/members`)
  await expect(page.getByRole('button', { name: 'Reintentar' }).first()).toBeVisible()
  await expect(page.locator('.member-row').first()).toBeVisible()
})

test('RYT-180 Modules: one muted line, no badge, no fill; one tap saves', async ({
  page,
}, info) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=modules`)
  const section = page.getByRole('region', { name: 'Módulos activos', exact: true })
  await expect(section.getByText('Los jugadores ven 1 de 7')).toBeVisible()
  await expect(section.locator('.mantine-Badge-root')).toHaveCount(0)
  await expect(section.getByText('Elige qué módulos ven')).toHaveCount(0)
  // The active row is full ink and has no fill; the others are muted.
  const colours = await section.locator('.module-switch-row').evaluateAll((rows) =>
    rows.map((row) => ({
      active: row.hasAttribute('data-active'),
      background: getComputedStyle(row).backgroundColor,
      ink: getComputedStyle(row.querySelector('.module-switch-name')!).color,
    })),
  )
  expect(new Set(colours.map((row) => row.background)).size).toBe(1)
  const on = colours.find((row) => row.active)!
  const off = colours.find((row) => !row.active)!
  expect(on.ink).not.toBe(off.ink)
  expect(await filledOnPage(page)).toEqual([])
  if (info.project.name === 'identity-mobile') {
    const first = (await section.getByRole('switch').first().boundingBox())!
    expect(first.y).toBeLessThan(260)
  } else {
    // A readable measure from 48em.
    expect((await section.boundingBox())!.width).toBeLessThanOrEqual(44 * 16 + 1)
  }
  await section.getByRole('switch', { name: 'Tiendas: visible para jugadores' }).focus()
  await page.keyboard.press('Space')
  await expect(section.getByText('Los jugadores ven 2 de 7')).toBeVisible()
  expect(f.calls.filter((c) => c.method === 'set_campaign_modules')).toHaveLength(1)
  await axeClean(page)
  await expectTouchTargets(
    page,
    'main button:visible, main [role="switch"]:visible, main a:visible',
  )
})

const auditedAt = (daysAgo: number, hours: number, minutes: number) => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}
const auditEvent = (
  id: number,
  character: string,
  name: string,
  kind: string,
  at: string,
  after: Record<string, unknown>,
) => ({
  id: `60000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  campaign_id: campaignId,
  character_id: character,
  actor_id: dmId,
  kind,
  before_value: null,
  after_value: { name, ...after },
  created_at: at,
})
const beaCharacter = '40000000-0000-4000-8000-0000000000b1'
const arinCharacter = '40000000-0000-4000-8000-000000000001'

test('RYT-180 Audit: filter by character and kind, events by day with times, names as links', async ({
  page,
}, info) => {
  await identityFixture(page)
  await page.route('**/rest/v1/character_events?**', (route) =>
    route.fulfill({
      json: [
        auditEvent(1, arinCharacter, 'Arin', 'character_resources:UPDATE', auditedAt(0, 10, 30), {
          gold: 25,
        }),
        auditEvent(2, beaCharacter, 'Bea', 'characters:INSERT', auditedAt(1, 9, 15), {}),
        auditEvent(3, arinCharacter, 'Arin', 'characters:INSERT', auditedAt(21, 18, 5), {}),
      ],
    }),
  )
  await page.goto(`./#/campaign/${campaignId}/members?panel=audit`)
  const section = page.getByRole('region', { name: 'Auditoría', exact: true })
  // No sentence about the screen; the days are headings, each event has its time.
  await expect(section.getByText('Historial cronológico')).toHaveCount(0)
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(3)
  await expect(section.getByRole('heading', { name: 'Hoy' })).toBeVisible()
  await expect(section.getByRole('heading', { name: 'Ayer' })).toBeVisible()
  await expect(section.locator('time').first()).toHaveText('10:30')
  await expect(section.locator('.mantine-Badge-root')).toHaveCount(0)
  // Character names are links to their sheet.
  await expect(section.getByRole('link', { name: 'Bea' })).toHaveAttribute(
    'href',
    new RegExp(`/campaign/${campaignId}/party/${beaCharacter}$`),
  )
  await axeClean(page)
  await expectTouchTargets(page, 'main a:visible, main button:visible, main select:visible')
  await expectTouchTargets(page, '.audit-filter label:visible')
  await expectTouchTargets(page, 'main .audit-character:visible', { width: 44, height: 44 })
  await capture(page, info.outputPath('audit.png'))
  const select = section.getByRole('combobox', { name: 'Personaje' })
  if (info.project.name === 'identity-mobile') {
    expect((await select.boundingBox())!.y).toBeLessThan(260)
  }

  // Character and kind filter together.
  await expect(select.locator('option')).toHaveText(['Todos los personajes', 'Arin', 'Bea'])
  await select.selectOption({ label: 'Bea' })
  await expect(section.getByRole('link', { name: 'Arin' })).toHaveCount(0)
  await expect(section.getByRole('link', { name: 'Bea' })).toHaveCount(1)
  await section
    .locator('.audit-filter label')
    .filter({ hasText: /^Recursos$/ })
    .click()
  // Nothing matches: one sentence and a way back.
  await expect(section.getByText('Ningún evento coincide con este filtro.')).toBeVisible()
  await section.getByRole('button', { name: 'Mostrar todo' }).click()
  await expect(select).toHaveValue('')
  // The button left with the empty result: the filter holds the focus.
  await expect(select).toBeFocused()
  await expect(section.getByRole('link', { name: 'Arin' })).toHaveCount(2)
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(3)
})

test('RYT-180 the audit offers a retry when the events cannot load', async ({ page }) => {
  await identityFixture(page)
  await page.route('**/rest/v1/character_events?**', (route) =>
    route.fulfill({ status: 500, json: { message: 'boom' } }),
  )
  await page.goto(`./#/campaign/${campaignId}/members?panel=audit`)
  const section = page.getByRole('region', { name: 'Auditoría', exact: true })
  await expect(section.getByRole('button', { name: 'Reintentar' })).toBeVisible()
})

test('RYT-180 the settings panels keep a readable measure from 48em and name themselves once on phones', async ({
  page,
}) => {
  await identityFixture(page, { party: true, sheet: 'complete', partyLevel: 6 })
  for (const panel of ['level', 'modules', 'audit']) {
    await page.goto(`./#/campaign/${campaignId}/members?panel=${panel}`)
    const section = page.locator('.dm-shell-panel section').first()
    await expect(section).toBeVisible()
    const heading = section.getByRole('heading', { level: 2 })
    await expect(heading).toHaveCount(1)
    if (phone(page)) expect((await heading.boundingBox())!.width).toBeLessThanOrEqual(1)
    else {
      await expect(heading).toBeVisible()
      expect((await section.boundingBox())!.width).toBeLessThanOrEqual(44 * 16 + 1)
    }
  }
})
