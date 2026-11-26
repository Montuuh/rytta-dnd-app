import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'

test('RYT-145 the DM can skip combat, grant loot, and carry private and published notes across sessions', async ({
  page,
  browser,
}, info) => {
  const url = `./campaign/${campaignId}/session`
  let saved = {
    lastEncounter: null,
    privateNote: '',
    nextScene: '',
    pendingReward: '',
    sharedRecap: '',
    revision: 0,
  }
  await identityFixture(page, { inventory: true, party: true })
  await page.route('**/rpc/list_encounters', (r) => r.fulfill({ json: [] }))
  await page.route('**/rpc/get_session_continuity', (r) => r.fulfill({ json: saved }))
  await page.route('**/rpc/save_session_continuity', (r) => {
    const payload = r.request().postDataJSON()
    expect(payload.expected_revision).toBe(saved.revision)
    saved = {
      lastEncounter: null,
      privateNote: payload.private_note,
      nextScene: payload.next_scene,
      pendingReward: payload.pending_reward,
      sharedRecap: payload.shared_recap,
      revision: saved.revision + 1,
    }
    return r.fulfill({ json: { revision: saved.revision } })
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Cerrar sesión de juego', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Revisar combate' })).toBeFocused()
  await page.getByRole('button', { name: 'Omitir' }).click()
  await page.getByLabel('Recompensas pendientes').fill('Dos monedas para Bea')
  await page.getByRole('button', { name: 'Repartir objetos ahora' }).click()
  const loot = page.getByRole('dialog')
  await loot.getByRole('button', { name: /Poción de curación/ }).click()
  await loot.getByRole('button', { name: 'Arin', exact: true }).click()
  // One fixed action delivers and closes the view.
  await loot.getByRole('button', { name: 'Entregar 1 objeto' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Objetos entregados')
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByLabel('Cabo suelto privado').fill('El cuervo es un espía')
  await page.getByLabel('Próxima escena').fill('El molino')
  await expect(page.getByRole('textbox', { name: 'Resumen para los jugadores' })).toBeHidden()
  await page.getByLabel('Compartir un resumen con los jugadores').check()
  await page.getByRole('textbox', { name: 'Resumen para los jugadores' }).fill('Llegasteis al río')
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(page, 'main button:visible')
  await capture(page, info.outputPath('session-wizard.png'))
  await page.getByRole('button', { name: 'Guardar y cerrar sesión' }).click()
  await expect(page.getByRole('status')).toHaveText('Sesión cerrada')
  await page.reload()
  for (const value of [
    'El molino',
    'El cuervo es un espía',
    'Dos monedas para Bea',
    'Llegasteis al río',
  ])
    await expect(page.getByText(value, { exact: true })).toBeVisible()
  const other = await browser.newContext({ baseURL: info.project.use.baseURL })
  try {
    const player = await other.newPage()
    await identityFixture(player, { player: true })
    let dmReads = 0
    player.on('request', (req) => {
      if (req.url().includes('/rpc/get_session_continuity')) dmReads++
    })
    await player.route('**/rpc/get_shared_session_recap', (r) =>
      r.fulfill({ json: saved.sharedRecap }),
    )
    await player.goto(url)
    await expect(player.getByText('Llegasteis al río')).toBeVisible()
    await expect(player.getByText('El cuervo es un espía')).toHaveCount(0)
    expect(dmReads).toBe(0)
    await page.getByRole('button', { name: 'Cerrar sesión de juego', exact: true }).click()
    await page.getByRole('button', { name: 'Omitir', exact: true }).click()
    await page.getByRole('button', { name: 'Omitir', exact: true }).click()
    await page.getByLabel('Cabo suelto privado').fill('Borrador que se omite')
    await expect(page.getByRole('button', { name: 'Omitir y cerrar' })).toHaveCount(0)
    await page.getByLabel('Cabo suelto privado').fill('El cuervo es un espía')
    await page.getByRole('button', { name: 'Omitir y cerrar' }).click()
    await expect(page.getByText('El cuervo es un espía', { exact: true })).toBeVisible()
    await expect(page.getByText('Llegasteis al río', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión de juego', exact: true }).click()
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.getByLabel('Compartir un resumen con los jugadores').uncheck()
    await page.getByRole('button', { name: 'Guardar y cerrar sesión' }).click()
    await expect(page.getByRole('status')).toHaveText('Sesión cerrada')
    await player.reload()
    await expect(player.getByText('Todavía no se ha compartido un resumen.')).toBeVisible()
    expect(dmReads).toBe(0)
  } finally {
    await other.close()
  }
})
test('RYT-145 a stale close keeps the DM draft and offers the current saved version', async ({
  page,
}) => {
  const url = `./campaign/${campaignId}/session?close=1`
  const server = {
    lastEncounter: null,
    privateNote: 'Mesa anterior',
    sharedRecap: '',
    pendingReward: '',
    nextScene: '',
    revision: 1,
  }
  await identityFixture(page)
  await page.route('**/rpc/list_encounters', (r) => r.fulfill({ json: [] }))
  await page.route('**/rpc/get_session_continuity', (r) => r.fulfill({ json: server }))
  await page.route('**/rpc/save_session_continuity', (r) => {
    server.privateNote = 'Cambio desde la tableta'
    server.revision = 2
    return r.fulfill({ status: 400, json: { code: 'P0001', message: 'Stale revision' } })
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByLabel('Cabo suelto privado').fill('Cambio desde el móvil')
  await page.getByRole('button', { name: 'Guardar y cerrar sesión' }).click()
  await expect(page.getByRole('alert')).toContainText('Tus cambios siguen aquí')
  await expect(page.getByLabel('Cabo suelto privado')).toHaveValue('Cambio desde el móvil')
  await page
    .getByRole('button', { name: 'Descartar mi borrador y cargar la sesión guardada' })
    .click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByLabel('Cabo suelto privado')).toHaveValue('Cambio desde la tableta')
})
test('RYT-145 the DM can read the published recap in player preview', async ({ page }) => {
  await identityFixture(page, { party: true, modules: ['party', 'combat'] })
  await page.route('**/rpc/get_shared_session_recap', (r) =>
    r.fulfill({ json: 'Resumen publicado' }),
  )
  await page.goto(`./campaign/${campaignId}/members`)
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Ver como jugador' })
  const banner = page.getByText('Viendo como jugador · Arin')
  await expect(banner.or(picker)).toBeVisible()
  if (await picker.isVisible())
    await picker.getByRole('button', { name: 'Arin', exact: true }).click()
  await expect(banner).toBeVisible()
  await page.getByRole('link', { name: 'Inicio de The Sunken Coast' }).click()
  let dmReads = 0
  page.on('request', (r) => {
    if (r.url().includes('/rpc/get_session_continuity')) dmReads++
  })
  await page.getByRole('link', { name: 'Resumen para los jugadores' }).click()
  await expect(page.getByText('Resumen publicado')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Diario de sesión' })).toBeHidden()
  expect(dmReads).toBe(0)
})
test('RYT-145 a failed save can be retried with the same request and private note', async ({
  page,
}) => {
  await identityFixture(page)
  await page.route('**/rpc/list_encounters', (r) => r.fulfill({ json: [] }))
  let attempt: string | undefined
  await page.route('**/rpc/save_session_continuity', (r) => {
    const payload = r.request().postDataJSON()
    expect(payload.private_note).toBe('Llave oculta')
    if (!attempt) {
      attempt = payload.request_id
      return r.fulfill({ status: 500, json: { code: 'XX000', message: 'Unavailable' } })
    }
    expect(payload.request_id).toBe(attempt)
    return r.fulfill({ json: { revision: 1 } })
  })
  await page.goto(`./campaign/${campaignId}/session?close=1`)
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByLabel('Cabo suelto privado').fill('Llave oculta')
  await page.getByRole('button', { name: 'Guardar y cerrar sesión' }).click()
  await expect(page.getByLabel('Cabo suelto privado')).toHaveValue('Llave oculta')
  await page.getByRole('button', { name: 'Reintentar guardado' }).click()
  await expect(page.getByRole('status')).toHaveText('Sesión cerrada')
})
