import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from './fixtures/identity.ts'
import { shopsFixture } from './fixtures/shops.ts'
// RYT-027: /items redirects into the DM Command Center storeroom tab.
const url = `./#/campaign/${campaignId}/items`

/** Row actions are icon buttons on wide screens and fold into one menu on phones. */
async function rowAction(page: Page, name: string, label: string, item: string) {
  const row = page.locator('.store-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  const direct = row.getByRole('button', { name: label, exact: true })
  if (await direct.count()) return direct.click()
  await row.getByRole('button', { name: `Acciones para ${name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
  'base64',
)
async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  for (const control of await page
    .locator(
      'main button:visible:not(.glossary-term), [role="dialog"] button:visible:not(.glossary-term)',
    )
    .all()) {
    expect(
      (await control.boundingBox())!.height,
      (await control.getAttribute('aria-label')) ?? (await control.textContent()) ?? '',
    ).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path, fullPage: true })
}
for (const language of ['es', 'en'] as const)
  for (const theme of ['dark', 'light'] as const)
    test(`catalogue without characters: ${language} ${theme}, image and keyboard at 150%`, async ({
      page,
    }, info) => {
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-color-scheme', theme)
        },
        { language, theme },
      )
      const fixture = await identityFixture(page, { noCharacters: true })
      const es = language === 'es'
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(url)
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      await expect(
        page.getByRole('heading', { name: es ? 'Almacén de objetos' : 'Item storeroom' }),
      ).toBeVisible()
      const create = page.getByRole('button', {
        name: es ? 'Nuevo objeto' : 'New item',
        exact: true,
      })
      await create.click()
      await page
        .getByRole('textbox', { name: es ? 'Nombre' : 'Name', exact: true })
        .fill('Moonstone')
      await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'moon.png', mimeType: 'image/png', buffer: png })
      await expect(
        page.getByRole('img', { name: es ? 'Vista previa de la imagen' : 'Image preview' }),
      ).toBeVisible()
      await audit(page, info.outputPath('item-editor.png'))
      await page
        .getByRole('dialog')
        .getByRole('button', { name: es ? 'Forjar objeto' : 'Forge item', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('.store-row').filter({ hasText: 'Moonstone' })).toBeVisible()
      expect(fixture.inventory.definitions).toHaveLength(1)
      expect(fixture.inventory.stacks).toHaveLength(0)
      expect(fixture.inventory.definitions[0]!.image_path).toMatch(/^pre\//)
      await expect(page.locator('main img')).toBeVisible()
      await audit(page, info.outputPath('catalogue.png'))
      await page.reload()
      await expect(page.locator('.store-row').filter({ hasText: 'Moonstone' })).toBeVisible()
      const edit = page.getByRole('button', {
        name: es ? /^Editar: Moonstone/ : /^Edit: Moonstone/,
      })
      await edit.click()
      await page.keyboard.press('Escape')
      await expect(edit).toBeFocused()
      await audit(page, info.outputPath('catalogue-normal.png'))
    })

test('image attachment failure retries without creating another item', async ({ page }) => {
  const f = await identityFixture(page, { noCharacters: true })
  let attempts = 0
  const keys: string[] = []
  await page.route('**/rest/v1/rpc/set_item_image', async (route) => {
    keys.push(route.request().postDataJSON().request_id)
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Nuevo objeto', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Retry stone')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'stone.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('img', { name: 'Vista previa de la imagen' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('No se pudo')
  expect(f.inventory.definitions).toHaveLength(1)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(f.inventory.definitions).toHaveLength(1)
  expect(new Set(keys).size).toBe(1)
  await page.getByRole('button', { name: /^Editar: Retry stone/ }).click()
  await page.getByRole('button', { name: 'Quitar imagen' }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(f.inventory.definitions[0]!.image_path).toBeNull()
})

test('direct gold accepts zero, Escape cancels and stale edits cannot overwrite a purchase', async ({
  page,
}, info) => {
  const f = await identityFixture(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  const gold = page.getByRole('button', { name: /Editar oro de Arin/ })
  await gold.click()
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('12345')
  await audit(page, info.outputPath('gold-editor.png'))
  await page.keyboard.press('Escape')
  await expect(gold).toBeFocused()
  await expect(gold).toContainText('25')
  await gold.click()
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('0')
  await page.keyboard.press('Enter')
  await expect(gold).toContainText('0')
  await gold.click()
  await page.getByRole('textbox', { name: 'Oro', exact: true }).fill('9000')
  f.staleResources()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Otro DM')
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeDisabled()
})

test('the DM in Player view can equip and unequip the previewed Player character', async ({
  page,
}) => {
  await identityFixture(page, { linkedPlayer: true, inventory: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/inventory?character=${characterId}&view=equipment`)
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await expect(page.getByText('Estás viendo la mesa como Arin')).toBeVisible()
  const torso = page.getByRole('button', { name: 'Torso: Armadura de cuero', exact: true })
  await expect(torso).toBeEnabled()
  await torso.click()
  await page.getByRole('button', { name: 'Quitar Armadura de cuero', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Clase de Armadura 13' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Torso: vacío', exact: true })).toBeFocused()
})

test('Players cannot access the DM catalogue and unequip from the slot drawer', async ({
  page,
}) => {
  await identityFixture(page, { player: true, inventory: true, sheet: 'complete' })
  await page.goto(url)
  await expect(page.getByText('Tu DM gestiona los miembros y las invitaciones.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Almacén de objetos' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nuevo objeto' })).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/party/${characterId}`)
  await expect(page.getByRole('link', { name: 'Ver y cambiar equipo' })).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/inventory?character=${characterId}&view=equipment`)
  // The equipped-items list is gone: unequip lives in the slot drawer only.
  await expect(page.getByRole('button', { name: 'Quitar Armadura de cuero' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Torso: Armadura de cuero', exact: true }).click()
  await page.getByRole('button', { name: 'Quitar Armadura de cuero', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Clase de Armadura 13' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Torso: vacío', exact: true })).toBeFocused()
})

test('shop picker opens the shared editor and keeps the new item selected', async ({ page }) => {
  const f = await identityFixture(page, {
    inventory: true,
    sheet: 'complete',
    modules: ['party', 'inventory', 'shops'],
  })
  await shopsFixture(page, f)
  await page.goto(`./#/campaign/${campaignId}/shops`)
  await page.getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  await page.getByRole('button', { name: 'Crear objeto', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Shop-only stone')
  await page.getByRole('dialog').getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  await expect(page.getByRole('button', { name: /Shop-only stone/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(
    f.inventory.stacks.some(
      (s) =>
        s.definition_id === f.inventory.definitions.find((d) => d.name === 'Shop-only stone')?.id,
    ),
  ).toBe(false)
})

test('one campaign definition is gifted and reused across two shops', async ({ page }) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await shopsFixture(page, f)
  let attempts = 0
  const keys: string[] = []
  await page.route('**/rest/v1/rpc/grant_item', async (route) => {
    keys.push(route.request().postDataJSON().request_id)
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(url)
  await page.getByRole('button', { name: 'Nuevo objeto', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('General charm')
  await page.getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  await rowAction(page, 'General charm', 'Dar General charm a personajes', 'Dar a personajes')
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('button', { name: 'Arin', exact: true }).click()
  await drawer.getByRole('button', { name: 'Aumentar Cantidad', exact: true }).click()
  await drawer.getByRole('button', { name: 'Dar a personajes' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(new Set(keys).size).toBe(1)
  const item = f.inventory.definitions.find((d) => d.name === 'General charm')!
  expect(
    f.inventory.stacks
      .filter((s) => s.definition_id === item.id)
      .reduce((n, s) => n + s.quantity, 0),
  ).toBe(2)
  for (const shop of ['Mercado del puerto', 'El Yunque de Ámbar']) {
    await rowAction(page, 'General charm', 'Añadir General charm a una tienda', 'Añadir a tienda')
    await page.getByRole('combobox', { name: 'Tienda', exact: true }).click()
    await page.getByRole('option', { name: shop, exact: true }).click()
    await page.getByRole('textbox', { name: 'Precio en oro' }).fill('25')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Añadir a tienda', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  expect(f.inventory.definitions.filter((d) => d.name === 'General charm')).toHaveLength(1)
})

test('equipment displays the authoritative manual AC override and retains focus on a failed unequip', async ({
  page,
}) => {
  await identityFixture(page, {
    player: true,
    inventory: true,
    sheet: 'complete',
    armorClassOverride: 23,
  })
  let fail = true
  await page.route('**/rest/v1/rpc/unequip_item', async (route) => {
    if (fail) {
      fail = false
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    }
    return route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/inventory?view=equipment`)
  await expect(page.getByRole('img', { name: 'Clase de Armadura 23' })).toBeVisible()
  const torso = page.getByRole('button', { name: 'Torso: Armadura de cuero', exact: true })
  await torso.focus()
  await page.keyboard.press('Enter')
  const remove = page.getByRole('button', { name: 'Quitar Armadura de cuero', exact: true })
  await remove.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(torso).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Quitar Armadura de cuero', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Torso: vacío', exact: true })).toBeFocused()
  await expect(page.getByRole('img', { name: 'Clase de Armadura 23' })).toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/party/${characterId}`)
  await expect(page.getByText('23', { exact: true })).toBeVisible()
})

test('a partial shop bulk-add keeps only unfinished selections and reuses its request', async ({
  page,
}) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await shopsFixture(page, f)
  let attempts = 0
  const keys: string[] = []
  await page.route('**/rest/v1/rpc/save_listing', async (route) => {
    keys.push(route.request().postDataJSON().request_id)
    if (++attempts === 2) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/shops`)
  await page.getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  const picks = page.locator('.pick-tile')
  await picks.nth(0).click()
  await picks.nth(1).click()
  await page.getByRole('button', { name: 'Añadir 2 objetos', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Añadir 1 objeto', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Añadir 1 objeto', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Añadir 1 objeto', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(keys).toHaveLength(3)
  expect(keys[1]).toBe(keys[2])
  expect(keys[0]).not.toBe(keys[1])
})

test('RYT-027 a new item created for a character from Party lands in that satchel', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Más acciones para Arin', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Nuevo objeto para Arin', exact: true }).click()
  await expect(page).toHaveURL(/panel=items/)
  const forge = page.getByRole('dialog')
  await expect(forge.getByRole('button', { name: 'Arin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await forge.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Moon charm')
  await audit(page, info.outputPath('create-for-character.png'))
  await forge.getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Moon charm' })).toContainText(
    'entregado a Arin',
  )
  await expect(page).not.toHaveURL(/create=/)
  const item = f.inventory.definitions.find((d) => d.name === 'Moon charm')!
  expect(f.inventory.stacks.some((s) => s.definition_id === item.id)).toBe(true)
})

test('RYT-027 storeroom filters, sorts and switches between list and grid', async ({
  page,
}, info) => {
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.goto(url)
  const list = page.locator('.store-list')
  await expect(list.locator('.store-row')).toHaveCount(6)
  await page.getByRole('button', { name: /^Armas/ }).click()
  await expect(list.locator('.store-row')).toHaveCount(1)
  await page.getByRole('button', { name: /^Todo/ }).click()
  await page.getByRole('textbox', { name: 'Buscar objetos' }).fill('zzz')
  await expect(page.getByText('Ningún objeto coincide con estos filtros.')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar filtros', exact: true }).click()
  await page.locator('.store-view label').filter({ hasText: 'Cuadrícula' }).click()
  await expect(page.locator('.store-grid .store-tile')).toHaveCount(6)
  await audit(page, info.outputPath('storeroom-grid.png'))
  // F1: closing an overlay opened from a tile menu returns focus to that ⋯ button.
  const menu = page.getByRole('button', { name: 'Acciones para Escudo', exact: true })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Dar a personajes', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(menu).toBeFocused()
  await page.reload()
  await expect(page.locator('.store-grid .store-tile')).toHaveCount(6)
})

test('RYT-027 R2-1 phone list rows keep the price visible at 100% and 150% text', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.goto(url)
  const potion = page.locator('.store-row').filter({ hasText: 'Poción de curación' })
  for (const scale of ['100%', '150%']) {
    await page.addStyleTag({ content: `html { font-size: ${scale}; }` })
    await expect(potion.locator('.store-row-meta')).not.toContainText('po')
    const price = potion.locator('.store-value')
    await expect(price).toHaveText('50 po')
    // Not clipped by its own box, and fully inside the row before the ⋯ button.
    expect(await price.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const box = (await price.boundingBox())!
    const menu = (await potion
      .getByRole('button', { name: 'Acciones para Poción de curación', exact: true })
      .boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(menu.x)
    // R3-1: the price sits on the meta line, so every name keeps the full row width.
    for (const row of await page.locator('.store-row').all()) {
      const name = (await row.locator('.store-row-name').boundingBox())!
      const body = (await row.locator('.store-row-body').boundingBox())!
      expect(name.width).toBeGreaterThanOrEqual(body.width - 1)
      expect((await row.locator('.store-value').boundingBox())!.y).toBeGreaterThanOrEqual(
        name.y + name.height - 1,
      )
    }
    await expect(
      page.locator('.store-row').filter({ hasText: 'Escudo' }).locator('.store-value'),
    ).toHaveAttribute('data-empty', 'true')
    await audit(page, info.outputPath(`storeroom-phone-${scale.replace('%', '')}.png`))
  }
})

test('RYT-027 R2-2 a ?create= link followed inside the storeroom opens "new item for"', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await expect(page.locator('.store-row').first()).toBeVisible()
  for (let round = 0; round < 2; round++) {
    // R3-2: whatever had focus before the link, closing lands on "Nuevo objeto".
    await page.getByRole('textbox', { name: 'Buscar objetos' }).focus()
    await page.evaluate(
      ({ campaignId, characterId }) => {
        location.hash = `#/campaign/${campaignId}/members?panel=items&create=${characterId}`
      },
      { campaignId, characterId },
    )
    const editor = page.getByRole('dialog', { name: 'Nuevo objeto para Arin' })
    await expect(editor).toBeVisible()
    await expect(editor.getByRole('button', { name: 'Arin', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).not.toHaveURL(/create=/)
    await expect(page.getByRole('button', { name: 'Nuevo objeto', exact: true })).toBeFocused()
  }
})

test('RYT-027 a shop listing opens the shared item editor', async ({ page }) => {
  const f = await identityFixture(page, {
    inventory: true,
    sheet: 'complete',
    modules: ['party', 'inventory', 'shops'],
  })
  await shopsFixture(page, f)
  await page.goto(`./#/campaign/${campaignId}/shops`)
  await page
    .getByRole('button', { name: /Poción de curación/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Editar objeto: Poción de curación', exact: true }).click()
  const editor = page.getByRole('dialog')
  await expect(editor.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
    'Poción de curación',
  )
  await editor.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Poción mayor')
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(f.inventory.definitions.some((d) => d.name === 'Poción mayor')).toBe(true)
})

// RYT-032 evidence screenshots land in docs/evidence when RYT_EVIDENCE is set.
const evidence = async (page: Page, name: string, info: { project: { name: string } }) => {
  if (!process.env.RYT_EVIDENCE) return
  const size = info.project.name.replace('identity-', '')
  await page.screenshot({ path: `docs/evidence/RYT-032/${name}-${size}.png` })
}

test('RYT-032 delete shows its impact, archives listings and keeps open orders safe', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await shopsFixture(page, f)
  await page.goto(url)
  await rowAction(page, 'Espada larga', 'Eliminar Espada larga', 'Eliminar')
  const blocked = page.getByRole('dialog', { name: '¿Eliminar Espada larga?' })
  await expect(blocked.getByRole('alert')).toContainText('2 pedidos abiertos')
  await expect(blocked.getByRole('button', { name: 'Eliminar objeto' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(f.inventory.definitions.find((d) => d.name === 'Espada larga')!.archived).toBe(false)

  await rowAction(page, 'Poción de curación', 'Eliminar Poción de curación', 'Eliminar')
  const dialog = page.getByRole('dialog', { name: '¿Eliminar Poción de curación?' })
  await expect(dialog).toContainText('Se retira de 2 tiendas:')
  await expect(dialog).toContainText('Mercado del puerto')
  await expect(dialog).toContainText('Bóveda del contrabandista')
  await expect(dialog).toContainText('lo conserva en su mochila')
  await expect(dialog.getByRole('button', { name: 'Conservar' })).toBeFocused()
  await audit(page, info.outputPath('delete-impact.png'))
  await evidence(page, 'delete-impact', info)
  await dialog.getByRole('button', { name: 'Eliminar objeto' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'se eliminó' })).toBeVisible()
  await expect(page.locator('.store-row').filter({ hasText: 'Poción de curación' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nuevo objeto', exact: true })).toBeFocused()
  expect(f.inventory.definitions.find((d) => d.name === 'Poción de curación')!.archived).toBe(true)
  // Holdings stay; the item only leaves the storeroom and the shops.
  expect(f.inventory.stacks.some((s) => s.quantity > 0)).toBe(true)
})

test('RYT-032 a changed value offers to update linked shop prices', async ({ page }, info) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await shopsFixture(page, f)
  const bodies: { listing_ids: string[]; new_price: number; request_id: string }[] = []
  let attempts = 0
  await page.route('**/rest/v1/rpc/sync_listing_prices', async (route) => {
    bodies.push(route.request().postDataJSON())
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(url)
  await page.getByRole('button', { name: /^Editar: Poción de curación/ }).click()
  const editor = page.getByRole('dialog')
  await expect(editor.getByRole('region', { name: 'Vista previa del objeto' })).toContainText(
    '50 po',
  )
  await editor.getByRole('textbox', { name: 'Valor (po)', exact: true }).fill('60')
  await expect(editor.getByRole('region', { name: 'Vista previa del objeto' })).toContainText(
    '60 po',
  )
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  const sync = page.getByRole('dialog', { name: '¿Actualizar precios en tiendas?' })
  await expect(sync.getByRole('checkbox')).toHaveCount(2)
  await audit(page, info.outputPath('price-sync.png'))
  await evidence(page, 'price-sync', info)
  await sync.getByRole('checkbox', { name: /Bóveda del contrabandista/ }).click()
  await sync.getByRole('button', { name: 'Actualizar 1 precio', exact: true }).click()
  await expect(sync.getByRole('alert')).toBeVisible()
  await sync.getByRole('button', { name: 'Actualizar 1 precio', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: '1 precio de tienda' })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[0]!.request_id).toBe(bodies[1]!.request_id)
  expect(bodies[1]!.listing_ids).toHaveLength(1)
  expect(bodies[1]!.new_price).toBe(60)
  expect(f.inventory.definitions.find((d) => d.name === 'Poción de curación')!.value_gp).toBe(60)
})

test('RYT-032 the add-to-shop drawer opens right on wide screens and bottom on phones', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await shopsFixture(page, f)
  await page.goto(url)
  await rowAction(page, 'Escudo', 'Añadir Escudo a una tienda', 'Añadir a tienda')
  const content = page.locator('.mantine-Drawer-content')
  await expect(content).toBeVisible()
  await page.waitForTimeout(400)
  const box = (await content.boundingBox())!
  // The stable scrollbar gutter is outside the drawer, so measure against the client box.
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: innerHeight,
  }))
  if (viewport.width < 768) {
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 1)
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(viewport.width - 20)
  } else {
    expect(Math.round(box.x + box.width)).toBeGreaterThanOrEqual(viewport.width - 20)
    expect(box.x).toBeGreaterThan(viewport.width / 3)
  }
  await evidence(page, 'shop-picker', info)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('RYT-032 the forge shows a live preview and keyboard-selectable category and rarity', async ({
  page,
}, info) => {
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.goto(url)
  await page.getByRole('button', { name: 'Nuevo objeto', exact: true }).click()
  const editor = page.getByRole('dialog')
  const preview = editor.getByRole('region', { name: 'Vista previa del objeto' })
  await expect(preview).toContainText('Objeto sin nombre')
  await editor.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Hoja lunar')
  await editor.getByRole('radio', { name: 'Armas', exact: true }).check()
  await expect(editor.getByRole('textbox', { name: 'Dados de daño' })).toBeVisible()
  await editor.getByRole('textbox', { name: 'Dados de daño' }).fill('1d6')
  await editor.getByRole('radio', { name: 'Común', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(editor.getByRole('radio', { name: 'Raro', exact: true })).toBeChecked()
  await editor.getByRole('button', { name: 'Aumentar Peso (lb)', exact: true }).click()
  await editor.getByRole('button', { name: 'Aumentar Valor (po)', exact: true }).click()
  await expect(preview).toContainText('Hoja lunar')
  await expect(preview).toContainText('Raro')
  await expect(preview).toContainText('1d6')
  await expect(preview).toContainText('0,5 lb')
  await expect(preview).toContainText('1 po')
  await audit(page, info.outputPath('forge.png'))
  await evidence(page, 'forge', info)
  await editor.getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.store-row').filter({ hasText: 'Hoja lunar' })).toContainText('1 po')
})

test('RYT-032 the DM adds an existing storeroom item or a new one to a character', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  const keys: string[] = []
  let attempts = 0
  await page.route('**/rest/v1/rpc/grant_item', async (route) => {
    keys.push(route.request().postDataJSON().request_id)
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/inventory?character=${characterId}`)
  const add = page.locator('main').getByRole('button', { name: 'Añadir objeto', exact: true })
  await add.click()
  const chooser = page.getByRole('dialog', { name: 'Añadir un objeto para Arin' })
  await expect(chooser.getByRole('button', { name: /Objeto existente/ })).toBeFocused()
  await audit(page, info.outputPath('add-choose.png'))
  await evidence(page, 'add-choose', info)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(add).toBeFocused()

  await add.click()
  await chooser.getByRole('button', { name: /Objeto existente/ }).click()
  await chooser.getByRole('textbox', { name: 'Buscar en el almacén' }).fill('anillo')
  await chooser.getByRole('button', { name: /Anillo de la marea/ }).click()
  await chooser.getByRole('button', { name: 'Aumentar Cantidad', exact: true }).click()
  await audit(page, info.outputPath('add-existing.png'))
  await evidence(page, 'add-existing', info)
  await chooser.getByRole('button', { name: 'Dar 2 a Arin', exact: true }).click()
  await expect(chooser.getByRole('alert')).toBeVisible()
  await chooser.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  const ring = f.inventory.definitions.find((d) => d.name === 'Anillo de la marea')!
  expect(
    f.inventory.stacks
      .filter((s) => s.definition_id === ring.id && s.character_id === characterId)
      .reduce((n, s) => n + s.quantity, 0),
  ).toBeGreaterThanOrEqual(2)

  await add.click()
  await chooser.getByRole('button', { name: /Crear nuevo/ }).click()
  const forge = page.getByRole('dialog', { name: 'Nuevo objeto para Arin' })
  await expect(forge.getByRole('button', { name: 'Arin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await forge.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Brújula rota')
  await forge.getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const compass = f.inventory.definitions.find((d) => d.name === 'Brújula rota')!
  expect(
    f.inventory.stacks.some(
      (s) => s.definition_id === compass.id && s.character_id === characterId,
    ),
  ).toBe(true)
})

test('RYT-032 Players keep the direct forge from the satchel', async ({ page }) => {
  await identityFixture(page, { player: true, inventory: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/inventory`)
  await page.locator('main').getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /Añadir un objeto para/ })).toHaveCount(0)
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Nombre' })).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Valor (po)' })).toHaveCount(0)
})
