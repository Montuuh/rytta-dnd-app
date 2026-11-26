import { itemPackState, resetItemPacks, srdItemsPackId } from './fixtures/item-packs.ts'
import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from './fixtures/identity.ts'
import { clippedLabels, expectTouchTargets, capture, limitMatrix } from './fixtures/audit.ts'
import { shopsFixture } from './fixtures/shops.ts'
import {
  editItem,
  itemMenu,
  itemRow,
  openItem,
  storeAction,
  storeMenu,
} from './fixtures/storeroom.ts'
// RYT-027: /items redirects into the DM Command Center storeroom tab.
const url = `./#/campaign/${campaignId}/items`

test('RYT-181 the loot view picks alphabetically, toggles recipients, delivers in one action and reopens a saved batch', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { inventory: true, party: true })
  const calls: unknown[] = []
  await page.route('**/rpc/distribute_loot', async (route) => {
    calls.push(route.request().postDataJSON())
    await route.fallback()
  })
  await page.goto(url)
  const open = page.getByRole('button', { name: 'Repartir botín', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog', { name: 'Repartir botín' })
  // With no line yet the view opens on the picker, its search focused.
  await expect(dialog.getByRole('searchbox', { name: 'Buscar objeto para añadir' })).toBeFocused()
  // Back leaves a view with nothing to deliver: the fixed action says so and waits.
  await dialog.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(dialog.getByRole('button', { name: /^Entregar/ })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  // The picker lists every item in alphabetical order, in rows of at least 48px.
  const picker = dialog.getByRole('list', { name: 'Objetos del almacén' })
  await expect(picker).toBeVisible()
  const names = await picker.locator('.loot-pick-name').allTextContents()
  expect(names.length).toBeGreaterThan(3)
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')))
  await expectTouchTargets(dialog, '.loot-pick-row:visible', { height: 48 })
  // The same ranking as the item search: a start before a word start before any other match.
  await dialog.getByRole('searchbox', { name: 'Buscar objeto para añadir' }).fill('POCION')
  await expect(picker.getByRole('button')).toHaveCount(1)
  await picker.getByRole('button', { name: /Poción de curación/ }).click()
  await expect(dialog.getByRole('button', { name: 'Añadir objeto', exact: true })).toBeFocused()
  const potion = dialog.getByRole('group', { name: 'Poción de curación', exact: true })
  const who = (line: typeof potion, name: string) => line.getByRole('button', { name, exact: true })
  // The action waits and one muted line above it names the item that still needs a recipient.
  await expect(dialog.getByRole('button', { name: /^Entregar/ })).toBeDisabled()
  await expect(dialog.locator('.loot-reason')).toHaveText('Elige quién recibe Poción de curación.')
  // "All" turns every recipient on; turning one off turns "All" off again.
  await who(potion, 'Todos').click()
  await expect(dialog.locator('.loot-reason')).toHaveCount(0)
  for (const name of ['Todos', 'Arin', 'Bea', 'Cato'])
    await expect(who(potion, name)).toHaveAttribute('aria-pressed', 'true')
  await who(potion, 'Cato').click()
  await expect(who(potion, 'Todos')).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  await dialog.getByRole('searchbox', { name: 'Buscar objeto para añadir' }).fill('espada')
  await page.keyboard.press('Enter')
  const sword = dialog.getByRole('group', { name: 'Espada larga', exact: true })
  await expect(dialog.locator('.loot-reason')).toHaveText('Elige quién recibe Espada larga.')
  await who(sword, 'Cato').click()
  await expect(
    potion.getByRole('button', { name: 'Cantidad por destinatario: uno más', exact: true }),
  ).toBeVisible()
  // What each character receives, in one muted line above the fixed action.
  await expect(dialog.locator('.loot-summary')).toHaveText(
    'Arin: 1 Poción de curación · Bea: 1 Poción de curación · Cato: 1 Espada larga',
  )
  await dialog.getByLabel('Guardar este reparto como lote reutilizable').check()
  await dialog.getByLabel('Nombre del lote').fill('Tesoro del puente')
  const deliver = dialog.getByRole('button', { name: 'Entregar 3 objetos', exact: true })
  await expect(deliver).toBeEnabled()
  // The action is fixed: inside the view whatever the list length.
  const box = (await deliver.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  // ... and with a single line it rests at the bottom of the view, not under the list.
  await dialog.getByRole('button', { name: 'Quitar Espada larga del reparto' }).click()
  const view = (await dialog.boundingBox())!
  const resting = (await dialog.getByRole('button', { name: /^Entregar/ }).boundingBox())!
  expect(view.y + view.height - (resting.y + resting.height)).toBeLessThan(40)
  await dialog.getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  await dialog.getByRole('searchbox', { name: 'Buscar objeto para añadir' }).fill('espada')
  await page.keyboard.press('Enter')
  await who(sword, 'Cato').click()
  expect(calls).toHaveLength(0)
  await audit(page, info.outputPath('loot-view.png'), false)
  await deliver.click()
  // One action delivers, closes the view and says so on the page.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Botín entregado' })).toContainText(
    'Cato: 1 Espada larga',
  )
  await expect(open).toBeFocused()
  expect(calls).toHaveLength(1)
  expect(fixture.inventory.events.filter((event) => event.kind === 'grant')).toHaveLength(3)
  await open.click()
  await dialog.getByRole('button', { name: 'Usar un lote guardado' }).click()
  await dialog.getByRole('button', { name: 'Tesoro del puente', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Entregar 3 objetos' })).toBeEnabled()
  await expect(dialog.getByLabel('Guardar este reparto como lote reutilizable')).not.toBeChecked()
  await page.keyboard.press('Escape')
  await open.click()
  await dialog.getByRole('button', { name: 'Usar un lote guardado' }).click()
  await dialog.getByRole('button', { name: /Eliminar el lote/ }).click()
  await expect(
    dialog.getByText('Los personajes conservarán todos los objetos entregados.'),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(dialog.getByText('No hay lotes guardados.')).toBeVisible()
  expect(calls).toHaveLength(1)
})

test('RYT-181 a failed delivery keeps the loot view open and Retry repeats the same request', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { inventory: true, party: true })
  const keys: string[] = []
  let attempts = 0
  await page.route('**/rest/v1/rpc/distribute_loot', async (route) => {
    keys.push(route.request().postDataJSON().request_id)
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items&do=loot`)
  const dialog = page.getByRole('dialog', { name: 'Repartir botín' })
  await dialog.getByRole('button', { name: /Poción de curación/ }).click()
  await dialog
    .getByRole('group', { name: 'Poción de curación', exact: true })
    .getByRole('button', { name: 'Todos', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Entregar 3 objetos' }).click()
  await expect(dialog.getByRole('alert')).toContainText('No se pudo confirmar la entrega')
  await expect(dialog).toBeVisible()
  // The pressed button went busy and dropped focus: the alert takes it, and Retry is the next stop.
  await expect(dialog.getByRole('alert')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Reintentar', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Botín entregado' })).toBeVisible()
  expect(new Set(keys).size).toBe(1)
  expect(keys).toHaveLength(2)
  expect(fixture.inventory.events.filter((event) => event.kind === 'grant')).toHaveLength(3)
})
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
  'base64',
)
async function audit(page: Page, path: string, fullPage = true) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(page, 'main button:visible, [role="dialog"] button:visible')
  await capture(page, path, { fullPage })
}
for (const language of ['es', 'en'] as const)
  for (const theme of ['dark', 'light'] as const)
    test(`catalogue without characters: ${language} ${theme}, image and keyboard at 150%`, async ({
      page,
    }, info) => {
      limitMatrix(info, language === 'es' && theme === 'dark')
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
      await storeAction(page, 'new', es)
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
      // The row opens the item sheet, not the editor; Escape returns to the row.
      const row = itemRow(page, 'Moonstone').getByRole('button')
      await row.click()
      await expect(page.getByRole('dialog', { name: 'Moonstone', exact: true })).toBeVisible()
      await audit(page, info.outputPath('item-sheet.png'))
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(row).toBeFocused()
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
  await storeAction(page, 'new')
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
  await editItem(page, 'Retry stone')
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
  await expect(page.getByText('Viendo como jugador · Arin')).toBeVisible()
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
  // J3-16: the old items address sends a Player to the inventory, never to the DM catalogue.
  await expect(page).toHaveURL(/\/inventory/)
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Almacén de objetos' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Acciones del almacén' })).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/party/${characterId}`)
  // The sheet must have replaced the inventory (a mounted page keeps its view), then no gear link.
  await expect(page.getByRole('heading', { level: 1, name: 'Arin' })).toBeVisible()
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
  await page.route('**/rest/v1/rpc/distribute_loot', async (route) => {
    keys.push(route.request().postDataJSON().request_id)
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(url)
  await storeAction(page, 'new')
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('General charm')
  await page.getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  const sheet = await openItem(page, 'General charm')
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  // One character: nothing to choose, so it is already chosen.
  await expect(sheet.getByRole('radio', { name: 'Arin', exact: true })).toBeChecked()
  await sheet.getByRole('button', { name: 'Cantidad: uno más', exact: true }).click()
  await sheet.getByRole('button', { name: 'Dar a Arin', exact: true }).click()
  // The reason stays in the sheet and Retry repeats the same request.
  await expect(sheet.getByRole('alert')).toBeVisible()
  await sheet.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Arin recibe 2 × General charm.' }),
  ).toBeVisible()
  expect(new Set(keys).size).toBe(1)
  const item = f.inventory.definitions.find((d) => d.name === 'General charm')!
  expect(
    f.inventory.stacks
      .filter((s) => s.definition_id === item.id)
      .reduce((n, s) => n + s.quantity, 0),
  ).toBe(2)
  for (const shop of ['Mercado del puerto', 'El Yunque de Ámbar']) {
    await itemMenu(page, 'General charm', 'Añadir a tienda')
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

test('RYT-181 the Filters sheet holds category, sort and view; the active filter is one line with Clear', async ({
  page,
}, info) => {
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const rows = page.locator('.store-list .store-row')
  await expect(rows).toHaveCount(6)
  // Nothing but the search, Filters and ⋯ stands between the head and the list; no badges.
  await expect(page.locator('.category-chip, .chip-count')).toHaveCount(0)
  await expect(page.locator('.store-filter-line')).toHaveCount(0)
  const filters = page.getByRole('button', { name: /^Filtros/ })
  await filters.click()
  const sheet = page.getByRole('dialog', { name: 'Filtros', exact: true })
  const weapons = sheet.getByRole('button', { name: /^Armas/ })
  await weapons.click()
  await expect(weapons).toHaveAttribute('aria-pressed', 'true')
  // The category's count is a numeral, and the filled action says what it leaves.
  await expect(weapons).toContainText('1')
  await expect(sheet.getByRole('button', { name: 'Ver 1 objeto', exact: true })).toBeVisible()
  await sheet.getByText('Precio', { exact: true }).click()
  await audit(page, info.outputPath('filters.png'), false)
  await sheet.getByRole('button', { name: 'Ver 1 objeto', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(filters).toBeFocused()
  await expect(rows).toHaveCount(1)
  await expect(page.locator('.store-filter-line')).toContainText('Armas · por precio')
  // The line sits in the sticky block with the search, and the Filters button reads as set.
  await expect(page.locator('.store-sticky .store-filter-line')).toHaveCount(1)
  await expect(filters).toHaveAttribute('data-active', 'true')
  await expect(filters.locator('.store-filters-count')).toHaveText('2')
  // With a filter count the head still fits one row at the default text size, at equal heights.
  const head = await page.locator('.store-find > *').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect()
      return { top: box.top, height: box.height }
    }),
  )
  expect(
    Math.max(...head.map((box) => box.top)) - Math.min(...head.map((box) => box.top)),
  ).toBeLessThan(4)
  expect(
    Math.max(...head.map((box) => box.height)) - Math.min(...head.map((box) => box.height)),
  ).toBeLessThan(2)
  await expect(page.locator('.store-count')).toHaveText('1 de 6 objetos')
  await page.getByRole('button', { name: 'Quitar filtros', exact: true }).click()
  await expect(rows).toHaveCount(6)
  await expect(page.locator('.store-filter-line')).toHaveCount(0)
  await expect(filters).not.toHaveAttribute('data-active', 'true')
  // A search alone says "the search", not "these filters".
  await page.getByRole('searchbox', { name: 'Buscar objetos' }).fill('zzz')
  await expect(page.getByText('Ningún objeto coincide con la búsqueda.')).toBeVisible()
  await expect(page.getByText('estos filtros')).toHaveCount(0)
  await page.getByRole('button', { name: 'Quitar filtros', exact: true }).click()
  await expect(rows).toHaveCount(6)
  await filters.click()
  await page.getByRole('dialog', { name: 'Filtros', exact: true }).getByText('Cuadrícula').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.store-grid .store-tile')).toHaveCount(6)
  await audit(page, info.outputPath('storeroom-grid.png'))
  // A tile is one button too: it opens the item sheet and Escape gives focus back to it.
  const tile = page.locator('.store-tile').filter({ hasText: 'Escudo' }).getByRole('button')
  await tile.click()
  await expect(page.getByRole('dialog', { name: 'Escudo', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile).toBeFocused()
  await page.reload()
  await expect(page.locator('.store-grid .store-tile')).toHaveCount(6)
})

test('RYT-181 search ranks starts before word starts, ignores accents, Enter opens the first and / focuses it', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, catalogue: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await expect(page.locator('.store-row').first()).toBeVisible()
  const search = page.getByRole('searchbox', { name: 'Buscar objetos' })
  // "/" outside a field goes to the item search, not to the quick switcher.
  await page.locator('main').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('/')
  await expect(search).toBeFocused()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await search.fill('ESCU')
  await expect(page.locator('.store-row')).toHaveCount(1)
  await search.fill('cue')
  const names = await page.locator('.store-row-name').allTextContents()
  // "Cuerda de cáñamo" starts with it; "Armadura de cuero" only has a word that does.
  expect(names.map((name) => name.trim())).toEqual(['Cuerda de cáñamo', 'Armadura de cuero'])
  await search.fill('pocion')
  await expect(page.locator('.store-row')).toHaveCount(1)
  await search.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Poción de curación', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(search).toBeFocused()
})

test('RYT-181 a row is one button of about 60px with its price at the end, at 100% and 150% text', async ({
  page,
}, info) => {
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const potion = itemRow(page, 'Poción de curación')
  await expect(potion.getByRole('button')).toHaveCount(1)
  // One tab stop per row, no ⋯ menu inside it.
  await expect(page.locator('.store-row button')).toHaveCount(6)
  const height = (await potion.boundingBox())!.height
  expect(height).toBeGreaterThanOrEqual(56)
  expect(height).toBeLessThanOrEqual(84)
  await expect(potion).toContainText('Consumibles')
  await expect(potion).toContainText('Poco común')
  for (const scale of ['100%', '150%']) {
    await page.addStyleTag({ content: `html { font-size: ${scale}; }` })
    const price = potion.locator('.store-value')
    await expect(price).toHaveText('50 po')
    // Not clipped by its own box, and fully inside the row at the end of it.
    expect(await price.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const box = (await price.boundingBox())!
    const row = (await potion.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(row.x + row.width)
    await expect(
      page.locator('.store-row').filter({ hasText: 'Escudo' }).locator('.store-value'),
    ).toHaveAttribute('data-empty', 'true')
    await audit(page, info.outputPath(`storeroom-${scale.replace('%', '')}.png`))
  }
})

test('RYT-181 a long catalogue mounts only the rows near the screen and keeps the search in view', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { inventory: true, sheet: 'complete' })
  const source = fixture.inventory.definitions[0]!
  for (let at = 0; at < 120; at++)
    fixture.inventory.definitions.push({
      ...source,
      id: `80000000-0000-4000-8000-${String(900 + at).padStart(12, '0')}`,
      name: `Copia ${String(at).padStart(3, '0')}`,
    })
  await page.goto(url)
  await expect(page.locator('.store-count')).toHaveText('126 objetos')
  await expect(page.locator('.store-row').first()).toBeVisible()
  const mounted = await page.locator('.store-row').count()
  expect(mounted).toBeGreaterThan(5)
  expect(mounted).toBeLessThan(126)
  // The search stays in view while the list scrolls.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
  await expect(page.getByRole('searchbox', { name: 'Buscar objetos' })).toBeInViewport()
})

test('RYT-027 R2-2 a ?create= link followed inside the storeroom opens "new item for"', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await expect(page.locator('.store-row').first()).toBeVisible()
  for (let round = 0; round < 2; round++) {
    // R3-2: whatever had focus before the link, closing lands on the ⋯ menu.
    await page.getByRole('searchbox', { name: 'Buscar objetos' }).focus()
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
    await expect(storeMenu(page)).toBeFocused()
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
  await itemMenu(page, 'Espada larga', 'Eliminar')
  const blocked = page.getByRole('dialog', { name: '¿Eliminar Espada larga?' })
  await expect(blocked.getByRole('alert')).toContainText('2 pedidos abiertos')
  await expect(blocked.getByRole('button', { name: 'Eliminar objeto' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(f.inventory.definitions.find((d) => d.name === 'Espada larga')!.archived).toBe(false)

  await itemMenu(page, 'Poción de curación', 'Eliminar')
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
  await expect(storeMenu(page)).toBeFocused()
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
  await editItem(page, 'Poción de curación')
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
  await itemMenu(page, 'Escudo', 'Añadir a tienda')
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
  await storeAction(page, 'new')
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
  await editor.getByRole('button', { name: 'Peso (kg): uno más', exact: true }).click()
  await editor.getByRole('button', { name: 'Valor (po): uno más', exact: true }).click()
  await expect(preview).toContainText('Hoja lunar')
  await expect(preview).toContainText('Raro')
  await expect(preview).toContainText('1d6')
  // RYT-104: 0.5 lb shows in the Spanish default unit, with the Spanish decimal comma.
  await expect(preview).toContainText('0,25 kg')
  await expect(editor.getByRole('textbox', { name: 'Peso (kg)', exact: true })).toHaveValue('0,25')
  // RYT-125: one weight field, in the reader's unit; the other unit is not a second field.
  await expect(editor.getByRole('textbox', { name: 'Peso (lb)', exact: true })).toHaveCount(0)
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
  await chooser.getByRole('button', { name: 'Cantidad: uno más', exact: true }).click()
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

test('RYT-105 Players search basic items first and propose what is missing', async ({ page }) => {
  await identityFixture(page, {
    player: true,
    inventory: true,
    catalogue: true,
    sheet: 'complete',
  })
  await page.goto(`./#/campaign/${campaignId}/inventory`)
  await page.locator('main').getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByRole('textbox', { name: 'Buscar objetos básicos' }).fill('racion')
  await drawer.getByRole('button', { name: /Raciones/ }).click()
  await expect(drawer).toContainText('Comida seca para un día de viaje.')
  await drawer.getByRole('button', { name: 'Cantidad: uno más', exact: true }).click()
  await drawer.getByRole('button', { name: /Añadir 2 a la mochila/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Units a Player added never feed supplies, so their card does not promise rations.
  await page.getByRole('button', { name: /Raciones, cantidad 2/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Comida seca para un día de viaje.')
  await expect(page.getByRole('dialog')).not.toContainText('Cada uso da')
  await page.keyboard.press('Escape')
  await page.locator('main').getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Buscar objetos básicos' })
    .fill('Laúd')
  // With nothing to pick, proposing is the one action: no dead "choose an item" button.
  await expect(page.getByRole('dialog')).toContainText('Ningún objeto básico coincide')
  await expect(page.getByRole('button', { name: 'Elige primero un objeto' })).toHaveCount(0)
  await page.getByRole('button', { name: /Propón un objeto nuevo/ }).click()
  const forge = page.getByRole('dialog', { name: 'Proponer un objeto para Arin' })
  await expect(forge.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('Laúd')
  await expect(forge.getByRole('textbox', { name: 'Valor (po)' })).toHaveCount(0)
  // J3-19: a proposal starts short; the price lives under "Más detalles".
  await expect(forge.getByRole('textbox', { name: 'Precio sugerido (po)' })).toBeHidden()
  await forge.getByRole('button', { name: /Más detalles/ }).click()
  await forge.getByRole('textbox', { name: 'Precio sugerido (po)' }).fill('35.5')
  await forge.getByRole('button', { name: 'Enviar al DM', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const shelf = page.getByRole('region', { name: 'Tus propuestas' })
  await expect(shelf).toContainText('Laúd')
  await expect(shelf).toContainText('Esperando al DM')
  await shelf.getByRole('button', { name: 'Retirar la propuesta de Laúd' }).click()
  await expect(shelf).not.toContainText('Laúd')
})

test('RYT-098 the chosen picture opens the viewer from the forge and the item sheet', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { inventory: true })
  fixture.inventory.definitions.find((d) => d.name === 'Espada larga')!.image_path =
    `pre/${campaignId}/items/sword.webp`
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  // The row opens the item sheet; its picture opens the viewer.
  const give = await openItem(page, 'Espada larga')
  const sword = give.getByRole('button', { name: 'Ver la imagen de Espada larga' })
  await sword.click()
  await expect(page.locator('.image-viewer-content')).toBeVisible()
  await audit(page, info.outputPath('give-viewer.png'))
  await page.keyboard.press('Escape')
  await expect(page.locator('.image-viewer-content')).toHaveCount(0)
  await expect(give).toBeVisible()
  await expect(sword).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(give).toHaveCount(0)

  // A picture chosen in the forge can be checked full size before saving.
  await storeAction(page, 'new')
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Moonstone')
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'moon.png', mimeType: 'image/png', buffer: png })
  const preview = page.getByRole('button', { name: 'Ver la imagen de Moonstone' })
  await preview.click()
  const viewer = page.getByRole('dialog', { name: 'Moonstone', exact: true })
  await expect(viewer.getByRole('img', { name: 'Imagen de Moonstone' })).toHaveAttribute(
    'src',
    /^blob:/,
  )
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(preview).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('Moonstone')
})

test('RYT-104 and RYT-166 the DM updates imported items from their packs and imports the rest', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { inventory: true, catalogue: true })
  const bodies: { keys: string[]; update: boolean; request: string }[] = []
  await page.route('**/rpc/import_basic_items', (route) => {
    const body = route.request().postDataJSON()
    bodies.push({
      keys: body.items.map((item: { key: string }) => item.key),
      update: Boolean(body.update_existing),
      request: body.request_id,
    })
    return route.fallback()
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  const open = page.getByRole('button', { name: 'Importar objetos' })
  await storeAction(page, 'manage')
  await open.click()
  const drawer = page.getByRole('dialog', { name: 'Importar objetos' })
  // Only the items that differ from their pack are listed, each ticked, with what changes.
  const changes = drawer.getByRole('checkbox', { name: /Cuerda|Raciones|Mochila/ })
  await expect(changes).toHaveCount(3)
  await expect(drawer.getByRole('button', { name: 'Actualizar 3 objetos' })).toBeVisible()
  await expect(drawer.getByLabel('Fuente')).toBeVisible()
  await audit(page, info.outputPath('import-update.png'))
  // Unticking one keeps it as it is.
  await drawer.getByRole('checkbox', { name: /Raciones/ }).uncheck()
  await drawer.getByRole('button', { name: 'Actualizar 2 objetos' }).click()
  // The rope's name and weight follow the pack; its price stays the DM's.
  await expect(page.getByRole('status').filter({ hasText: /objetos? actualizados?/ })).toBeVisible()
  expect(bodies.at(-1)).toMatchObject({ update: true })
  expect(bodies.at(-1)!.keys.sort()).toEqual(['reinforcedBackpack', 'rope'])
  const rope = f.inventory.definitions.find((d) => d.basic_key === 'rope')!
  expect(rope).toMatchObject({ name: 'Cuerda', weight_lb: 5, value_gp: 1 })
  // Only the unticked item still differs.
  await storeAction(page, 'manage')
  await open.click()
  await expect(drawer.getByRole('button', { name: 'Actualizar 1 objeto' })).toBeVisible()
  // The import itself only sends what is missing and creates it.
  // Nothing is ticked on opening: the action says what to do and waits.
  await expect(drawer.getByRole('button', { name: 'Elige una categoría' })).toBeDisabled()
  await drawer.getByRole('checkbox', { name: 'Todo lo que falta por importar' }).check()
  const submit = drawer.getByRole('button', { name: /^Importar \d+ objetos$/ })
  const count = Number((await submit.textContent())!.match(/(\d+)/)![1])
  await submit.click()
  await expect(
    page.getByRole('status').filter({ hasText: `${count} objetos añadidos al almacén.` }),
  ).toBeVisible()
  const sent = bodies.filter((body) => !body.update).flatMap((body) => body.keys)
  expect(sent).toHaveLength(count)
  expect(sent).not.toContain('rope')
})

test('RYT-166 the import filters by pack, leaves hidden items out and sends the DM to Content without packs', async ({
  page,
}, info) => {
  itemPackState.books = true
  itemPackState.hidden = { [srdItemsPackId]: ['longsword'] }
  try {
    await identityFixture(page, { inventory: true, catalogue: true })
    const keys: string[] = []
    await page.route('**/rpc/import_basic_items', (route) => {
      keys.push(
        ...route
          .request()
          .postDataJSON()
          .items.map((item: { key: string }) => item.key),
      )
      return route.fallback()
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
    await storeAction(page, 'manage')
    await page.getByRole('button', { name: 'Importar objetos' }).click()
    const drawer = page.getByRole('dialog', { name: 'Importar objetos' })
    const source = drawer.getByLabel('Fuente')
    await source.selectOption({ label: 'Libros del dueño' })
    await expect(drawer.getByRole('button', { name: 'Elige una categoría' })).toBeDisabled()
    await audit(page, info.outputPath('import-source.png'))
    await drawer.getByRole('checkbox', { name: 'Todo lo que falta por importar' }).check()
    await expect(drawer.getByRole('button', { name: 'Importar 1 objeto' })).toBeVisible()
    await drawer.getByRole('button', { name: 'Importar 1 objeto' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: '1 objeto añadido al almacén.' }),
    ).toBeVisible()
    expect(keys).toEqual(['b00c5000--moon-blade'])
    // The hidden SRD longsword is never offered.
    await storeAction(page, 'manage')
    await page.getByRole('button', { name: 'Importar objetos' }).click()
    await drawer.getByRole('checkbox', { name: 'Todo lo que falta por importar' }).check()
    await drawer.getByRole('button', { name: /^Importar \d+ objetos$/ }).click()
    await expect(page.getByRole('status').filter({ hasText: /añadidos al almacén/ })).toBeVisible()
    expect(keys).not.toContain('longsword')

    itemPackState.books = false
    itemPackState.hidden = {}
    itemPackState.none = true
    await page.reload()
    await storeAction(page, 'manage')
    await page.getByRole('button', { name: 'Importar objetos' }).click()
    await expect(drawer.getByText('La campaña no tiene paquetes de objetos activos.')).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Elegir en Contenido' })).toHaveAttribute(
      'href',
      new RegExp(`/campaign/${campaignId}/members\\?panel=content$`),
    )
    await audit(page, info.outputPath('import-no-packs.png'))
  } finally {
    resetItemPacks()
  }
})

test('RYT-105 the DM review keeps focus through its steps; Escape steps back and keeps the reason', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, catalogue: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await page.locator('.store-proposals').click()
  const drawer = page.getByRole('dialog', { name: 'Propuestas de jugadores' })
  const onBody = () => page.evaluate(() => document.activeElement === document.body)
  // One proposal waits: the view opens on its card, with focus on its name.
  await expect(drawer.getByRole('heading', { level: 3, name: /Amuleto/ })).toBeFocused()
  expect(await onBody()).toBe(false)
  // Reject: focus on the reason; Escape returns to the proposal and the reason survives.
  const reject = drawer.getByRole('button', { name: 'Rechazar', exact: true })
  await reject.click()
  const reason = drawer.getByRole('textbox', { name: 'Motivo (opcional)' })
  await expect(reason).toBeFocused()
  await reason.fill('Demasiado poderoso para nivel 3')
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
  await expect(reject).toBeFocused()
  await reject.click()
  await expect(reason).toHaveValue('Demasiado poderoso para nivel 3')
  await drawer.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(reject).toBeFocused()
  // Give an existing item: focus on its search; Escape returns to its link.
  const give = drawer.getByRole('button', { name: 'Dar un objeto existente en su lugar' })
  await give.click()
  await expect(drawer.getByRole('textbox', { name: 'Objeto que se entrega' })).toBeFocused()
  expect(await onBody()).toBe(false)
  await page.keyboard.press('Escape')
  await expect(give).toBeFocused()
  // On the proposal itself Escape closes the drawer as before.
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('RYT-104 the merge confirmation says it cannot be undone', async ({ page }) => {
  await identityFixture(page, { inventory: true, catalogue: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await itemMenu(page, 'Cuerda de cáñamo', 'Fusionar con…')
  const drawer = page.getByRole('dialog', { name: 'Fusionar Cuerda de cáñamo' })
  await drawer
    .getByRole('button', { name: /Flecha/ })
    .first()
    .click()
  await drawer.getByRole('button', { name: /^Conservar/ }).click()
  await expect(
    drawer.getByText('No se puede deshacer: Cuerda de cáñamo sale del almacén para siempre.'),
  ).toBeVisible()
})

/** Names of the visible controls in `main` painted with the filled accent (RYT-151). */
const filledControls = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--app-accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return (
      [...document.querySelectorAll<HTMLElement>('main *')]
        // Text-bearing elements only: slider tracks and marks are value displays, not actions.
        .filter(
          (el) =>
            el.offsetParent &&
            el.textContent?.trim() &&
            getComputedStyle(el).backgroundColor === accent,
        )
        .map((el) => el.textContent?.trim())
    )
  })

test('RYT-151 the storeroom and shops fill only the table action and mark selection in ink', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { inventory: true, party: true })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await expect(page.getByRole('button', { name: 'Repartir botín', exact: true })).toBeVisible()
  expect(await filledControls(page)).toEqual(['Repartir botín'])
  await expect(storeMenu(page)).toBeVisible()
  // The open panel and the pressed filter carry accent ink and a rail or outline, never the fill.
  // RYT-179: the panel is a link in the side navigation; on phones the switcher names it.
  if (page.viewportSize()!.width >= 768) {
    const current = page
      .getByRole('navigation', { name: 'Centro de mando DM' })
      .getByRole('link', { name: 'Almacén de objetos', exact: true })
    await expect(current).toHaveAttribute('aria-current', 'page')
    expect(await current.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/)
  } else {
    await expect(
      page.getByRole('button', { name: 'Almacén de objetos, cambiar de panel' }),
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  const all = page.getByRole('dialog').getByRole('button', { name: /^Todo/ })
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  expect(await all.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/)
  await page.keyboard.press('Escape')

  await page.goto(`./#/campaign/${campaignId}/shops`)
  await expect(page.getByRole('button', { name: 'Añadir objeto' })).toBeVisible()
  expect(await filledControls(page)).toEqual(['Añadir objeto'])
  const views = page.getByRole('navigation', { name: 'Existencias y pedidos' })
  await expect(views.getByRole('button', { name: 'Existencias' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await views.getByRole('button', { name: 'Pedidos pendientes' }).click()
  await expect(page.getByRole('tab', { name: /Bitácora/ })).toHaveAttribute('aria-selected', 'true')
})

/** A pending Player proposal as `list_item_proposals` returns it, for the answers a spec stages. */
const proposalRow = (id: string, name: string) => ({
  id,
  character_id: characterId,
  character_name: 'Arin',
  proposed_by_you: false,
  proposer_name: 'Arin',
  draft: {
    name,
    description: 'Un colgante de hueso que siempre está tibio.',
    category: 'treasure',
    icon: 'medal',
    rarity: 'uncommon',
    slot_kind: 'neck',
    properties: {},
    weight_lb: 0.25,
    suggested_value_gp: 25,
  },
  quantity: 1,
  status: 'pending',
  dm_note: '',
  resolved_definition_id: null,
  revision: 0,
  created_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
  resolved_at: null,
})

/** Whether a control is painted with the filled accent (the one primary action of a screen). */
const filledName = (control: Locator) =>
  control.evaluate((el) => {
    const probe = document.createElement('i')
    probe.style.color = 'var(--app-accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return getComputedStyle(el).backgroundColor === accent
  })

/** A colour token as the browser paints it, to compare with a computed colour. */
const painted = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement('i')
    probe.style.backgroundColor = `var(${name})`
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, token)

test('RYT-181 the item sheet reads the item and offers Give, Edit and a menu with the rest', async ({
  page,
}, info) => {
  await identityFixture(page, { inventory: true, catalogue: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  const sheet = await openItem(page, 'Espada larga')
  // Read-only: name, one muted line, the properties that exist; no form fields.
  await expect(sheet.locator('.item-sheet-line')).toContainText('Armas · Común')
  await expect(sheet.locator('.item-sheet-line')).toContainText('15 po')
  await expect(sheet.getByRole('list', { name: 'Propiedades' })).toContainText('1d8 cortante')
  await expect(sheet.getByRole('textbox')).toHaveCount(0)
  // One filled action, one outlined, and the ⋯ menu.
  expect(await filledName(sheet.getByRole('button', { name: 'Dar', exact: true }))).toBe(true)
  expect(await filledName(sheet.getByRole('button', { name: 'Editar', exact: true }))).toBe(false)
  await audit(page, info.outputPath('item-sheet.png'), false)
  const more = sheet.getByRole('button', { name: 'Más acciones para Espada larga', exact: true })
  await more.click()
  for (const entry of [
    'Añadir a tienda',
    'Dejar de usar como plantilla',
    'Fusionar con…',
    'Eliminar',
  ])
    await expect(page.getByRole('menuitem', { name: entry, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  // Edit opens the forge as before; closing it returns focus to the row.
  await sheet.getByRole('button', { name: 'Editar', exact: true }).click()
  const forge = page.getByRole('dialog', { name: 'Editar objeto' })
  await expect(forge.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
    'Espada larga',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(itemRow(page, 'Espada larga').getByRole('button')).toBeFocused()
})

test('RYT-181 giving one item is four taps and a status line; "Share among several" opens the loot view with it', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { inventory: true, party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const bodies: { allocations: { character_id: string; quantity: number }[]; batch_name: null }[] =
    []
  await page.route('**/rpc/distribute_loot', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fallback()
  })
  await page.goto(url)
  const sheet = await openItem(page, 'Espada larga')
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Dar Espada larga', exact: true })).toBeVisible()
  // With three characters none is chosen yet: the action says so and waits.
  const confirm = sheet.getByRole('button', { name: 'Elige un personaje', exact: true })
  await expect(confirm).toBeDisabled()
  await expectTouchTargets(sheet, '.give-char:visible', { height: 48 })
  await audit(page, info.outputPath('give-step.png'), false)
  // The whole row is the label: a tap at its far edge, away from the radio and the name, chooses.
  const bea = sheet.locator('.give-char').filter({ hasText: 'Bea' })
  const row = (await bea.boundingBox())!
  expect(row.width).toBeGreaterThan(200)
  await page.mouse.click(row.x + row.width - 6, row.y + row.height / 2)
  await expect(sheet.getByRole('radio', { name: 'Bea', exact: true })).toBeChecked()
  // A way back to the item, as in the loot picker.
  await sheet.getByRole('button', { name: 'Volver', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Dar', exact: true })).toBeFocused()
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  await sheet.getByRole('radio', { name: 'Bea', exact: true }).check()
  await sheet.getByRole('button', { name: 'Dar a Bea', exact: true }).click()
  // No review and no closing screen: the sheet is gone and the page says it.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Espada larga' })).toHaveText(
    'Bea recibe Espada larga.',
  )
  await expect(itemRow(page, 'Espada larga').getByRole('button')).toBeFocused()
  expect(bodies).toHaveLength(1)
  expect(bodies[0]!.allocations).toHaveLength(1)
  expect(bodies[0]!.allocations[0]!.quantity).toBe(1)
  expect(bodies[0]!.batch_name).toBeNull()
  expect(fixture.inventory.events.filter((event) => event.kind === 'grant')).toHaveLength(1)
  // "Share among several" hands the item to the loot view.
  const potion = await openItem(page, 'Poción de curación')
  await potion.getByRole('button', { name: 'Dar', exact: true }).click()
  await potion.getByRole('button', { name: 'Repartir entre varios', exact: true }).click()
  const loot = page.getByRole('dialog', { name: 'Repartir botín' })
  await expect(loot.getByRole('group', { name: 'Poción de curación', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(itemRow(page, 'Poción de curación').getByRole('button')).toBeFocused()
})

test('RYT-181 a proposal is accepted in one tap from its card; only the last answer closes the view', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, {
    inventory: true,
    catalogue: true,
    sheet: 'complete',
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const bodies: { resolution: string; quantity: number; draft: { name: string } }[] = []
  await page.route('**/rpc/resolve_item_proposal', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  const row = page.locator('.store-proposals')
  await expect(row).toContainText('1 propuesta de un jugador por revisar')
  // One proposal waits: its row opens the card itself, so accepting is two taps (row, accept).
  let taps = 0
  await row.click()
  taps++
  const drawer = page.getByRole('dialog', { name: 'Propuestas de jugadores' })
  // The card shows the Player's draft and three ways to answer; one filled button.
  await expect(drawer).toContainText('Un colgante de hueso que siempre está tibio.')
  const accept = drawer.getByRole('button', { name: 'Aceptar y dar a Arin', exact: true })
  expect(await filledName(accept)).toBe(true)
  expect(await filledName(drawer.getByRole('button', { name: 'Revisar antes', exact: true }))).toBe(
    false,
  )
  await audit(page, info.outputPath('proposal-card.png'), false)
  await accept.click()
  taps++
  expect(taps).toBe(2)
  // The last proposal: the view closes and the list says what happened.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Amuleto de la abuela' })).toHaveText(
    'Arin recibe Amuleto de la abuela.',
  )
  await expect(page.locator('.store-proposals')).toHaveCount(0)
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({
    resolution: 'accept',
    quantity: 1,
    draft: { name: 'Amuleto de la abuela' },
  })
  expect(fixture.inventory.events.filter((event) => event.kind === 'grant')).toHaveLength(1)
})

test('RYT-181 "Review first" opens the forge with the draft, and a proposal can be rejected with a reason', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, catalogue: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const bodies: { resolution: string; note?: string }[] = []
  await page.route('**/rpc/resolve_item_proposal', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await page.locator('.store-proposals').click()
  const drawer = page.getByRole('dialog', { name: 'Propuestas de jugadores' })
  await drawer.getByRole('button', { name: 'Revisar antes', exact: true }).click()
  const forge = page.getByRole('dialog', { name: 'Aceptar Amuleto de la abuela' })
  await expect(forge.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
    'Amuleto de la abuela',
  )
  await page.keyboard.press('Escape')
  await expect(forge).toHaveCount(0)
  await expect(drawer).toBeVisible()
  expect(bodies).toHaveLength(0)
  // The card says who it is for under the label "Para", not "Propuesta".
  await expect(drawer.locator('dt', { hasText: /^Para$/ })).toBeVisible()
  await expect(drawer.locator('dt', { hasText: /^Propuesta$/ })).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Rechazar', exact: true }).click()
  await drawer.getByRole('textbox', { name: 'Motivo (opcional)' }).fill('Demasiado poderoso')
  await drawer.getByRole('button', { name: 'Rechazar propuesta', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'rechazada' })).toHaveText(
    'Propuesta de Amuleto de la abuela rechazada.',
  )
  expect(bodies).toEqual([
    expect.objectContaining({ resolution: 'reject', note: 'Demasiado poderoso' }),
  ])
})

test('RYT-181 an answer with proposals still waiting is said on the proposals view', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, catalogue: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let answered = false
  const first = proposalRow('b0000000-0000-4000-8000-0000000000fe', 'Amuleto de la abuela')
  const second = proposalRow('b0000000-0000-4000-8000-0000000000ff', 'Brújula rota')
  await page.route('**/rpc/list_item_proposals', (route) =>
    route.fulfill({ json: answered ? [second] : [first, second] }),
  )
  await page.route('**/rpc/resolve_item_proposal', async (route) => {
    answered = true
    const body = route.request().postDataJSON()
    await route.fulfill({
      json: {
        id: body.target_proposal,
        status: 'accepted',
        revision: 1,
        definition_id: null,
        item_id: null,
        event_id: null,
        quantity: 1,
      },
    })
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await expect(page.locator('.store-proposals')).toContainText('2 propuestas de jugadores')
  await page.locator('.store-proposals').click()
  const drawer = page.getByRole('dialog', { name: 'Propuestas de jugadores' })
  await drawer.getByRole('button', { name: /Amuleto/ }).click()
  await drawer.getByRole('button', { name: 'Aceptar y dar a Arin', exact: true }).click()
  // Another proposal waits: the view stays and its list says what was done, in view.
  await expect(drawer.getByRole('status').filter({ hasText: 'Amuleto' })).toHaveText(
    'Arin recibe Amuleto de la abuela.',
  )
  await expect(drawer.getByRole('button', { name: /Brújula rota/ })).toBeVisible()
})

test('RYT-181 a proposal that would not pass the forge is not accepted directly', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, catalogue: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const sent: unknown[] = []
  const nameless = proposalRow('b0000000-0000-4000-8000-0000000000fd', '  ')
  await page.route('**/rpc/list_item_proposals', (route) => route.fulfill({ json: [nameless] }))
  await page.route('**/rpc/resolve_item_proposal', async (route) => {
    sent.push(route.request().postDataJSON())
    await route.fallback()
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await page.locator('.store-proposals').click()
  const drawer = page.getByRole('dialog', { name: 'Propuestas de jugadores' })
  // A blank name still has a heading; only "Review first" is offered, filled, and one line says what is missing.
  await expect(drawer.getByRole('button', { name: /^Aceptar y dar/ })).toHaveCount(0)
  await expect(drawer.getByRole('heading', { level: 3, name: 'Objeto sin nombre' })).toBeVisible()
  await expect(drawer).toContainText('A la propuesta le falta el nombre.')
  expect(await filledName(drawer.getByRole('button', { name: 'Revisar antes', exact: true }))).toBe(
    true,
  )
  expect(sent).toHaveLength(0)
})

for (const scheme of ['dark', 'light'] as const)
  test(`RYT-181 a new item with typed content asks before it is discarded (${scheme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, scheme === 'dark')
    await page.addInitScript((scheme) => localStorage.setItem('rytta-color-scheme', scheme), scheme)
    await newItemDiscard(page)
  })

async function newItemDiscard(page: Page) {
  const f = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  // Nothing typed: Escape closes at once.
  await storeAction(page, 'new')
  await expect(page.getByRole('dialog', { name: 'Forjar objeto' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(storeMenu(page)).toBeFocused()
  // Typed: Escape asks, and "Keep editing" returns to the form with the text.
  await storeAction(page, 'new')
  const name = page.getByRole('textbox', { name: 'Nombre', exact: true })
  await name.fill('Anillo a medias')
  await page.keyboard.press('Escape')
  const ask = page.getByRole('dialog', { name: '¿Descartar este objeto?' })
  await expect(ask).toBeVisible()
  await expect(ask.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  // The destructive answer reads at 4.5:1 in both schemes (axe color-contrast).
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(name).toHaveValue('Anillo a medias')
  // The close button asks too; Discard leaves without saving and focus returns to the menu.
  await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
  await ask.getByRole('button', { name: 'Descartar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(storeMenu(page)).toBeFocused()
  expect(f.inventory.definitions.some((d) => d.name === 'Anillo a medias')).toBe(false)
}

test('RYT-181 Parchment paints the segmented control track and the off switch with its own tokens', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('rytta-color-scheme', 'light'))
  await identityFixture(page, { inventory: true, party: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const raised = await painted(page, '--app-raised')
  const toggle = page.getByRole('switch', { name: 'Vista jugador', exact: true })
  await expect(toggle).not.toBeChecked()
  expect(
    await toggle.evaluate((input) => getComputedStyle(input.nextElementSibling!).backgroundColor),
  ).toBe(raised)
  await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  const track = page
    .getByRole('dialog', { name: 'Filtros', exact: true })
    .locator('.ink-seg')
    .first()
  expect(await track.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(raised)
  // Inactive labels take the theme's muted ink, not Mantine's cool grey.
  const muted = await painted(page, '--app-muted')
  expect(
    await track
      .locator('.mantine-SegmentedControl-label:not([data-active])')
      .first()
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe(muted)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The unchosen rings of the give step (3:1 non-text contrast) use it too.
  const sheet = await openItem(page, 'Espada larga')
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  const rings = sheet.locator('.give-char input[type="radio"]:not(:checked)')
  await expect(rings).toHaveCount(3)
  for (const ring of await rings.all())
    expect(await ring.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(muted)
})

test('RYT-181 with one character each new loot line starts with them, and the same status said twice is new again', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { inventory: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const open = page.getByRole('button', { name: 'Repartir botín', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog', { name: 'Repartir botín' })
  await dialog.getByRole('button', { name: /Poción de curación/ }).click()
  const potion = dialog.getByRole('group', { name: 'Poción de curación', exact: true })
  // Nobody to choose: the only character is already on, so the action is ready and says no reason.
  await expect(potion.getByRole('button', { name: 'Arin', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.locator('.loot-reason')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Entregar 1 objeto', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Añadir objeto', exact: true }).click()
  await dialog.getByRole('searchbox', { name: 'Buscar objeto para añadir' }).fill('espada')
  await page.keyboard.press('Enter')
  await expect(
    dialog
      .getByRole('group', { name: 'Espada larga', exact: true })
      .getByRole('button', { name: 'Arin', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Entregar 2 objetos', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // One status element stays mounted; a repeated sentence replaces its text node, so it reads as new.
  const status = page.locator('.store-status [role="status"]')
  await expect(status).toContainText('Botín entregado')
  await status.evaluate((node) => {
    ;(window as unknown as { kept: Element }).kept = node
    ;(window as unknown as { text: Element | null }).text = node.querySelector('span')
  })
  await open.click()
  await dialog.getByRole('button', { name: /Poción de curación/ }).click()
  await dialog.getByRole('button', { name: 'Entregar 1 objeto', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const kept = await status.evaluate((node) => ({
    same: node === (window as unknown as { kept: Element }).kept,
    renewed: node.querySelector('span') !== (window as unknown as { text: Element | null }).text,
  }))
  expect(kept).toEqual({ same: true, renewed: true })
  expect(fixture.inventory.events.filter((event) => event.kind === 'grant')).toHaveLength(3)
})

for (const scheme of ['dark', 'light'] as const)
  test(`RYT-181 with no characters the give step and the loot view say so and link to Party (${scheme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, scheme === 'dark')
    await noCharactersSteps(page, scheme)
  })

async function noCharactersSteps(page: Page, scheme: 'dark' | 'light') {
  await page.addInitScript((scheme) => localStorage.setItem('rytta-color-scheme', scheme), scheme)
  await identityFixture(page, { noCharacters: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Almacén de objetos' })).toBeVisible()
  await storeAction(page, 'new')
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Moonstone')
  await page.getByRole('button', { name: 'Forjar objeto', exact: true }).click()
  const sheet = await openItem(page, 'Moonstone')
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  // One sentence with the way to Party: no stepper, no character list, no disabled button.
  await expect(sheet.getByText('Crea un personaje en Grupo para dar objetos.')).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Grupo', exact: true })).toHaveAttribute(
    'href',
    new RegExp(`/campaign/${campaignId}/party$`),
  )
  await expect(sheet.getByRole('radio')).toHaveCount(0)
  await expect(sheet.getByRole('textbox')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: /^Dar a|^Elige/ })).toHaveCount(0)
  // Focus stays inside the sheet, on the way back, instead of falling to the page.
  await expect(sheet.getByRole('button', { name: 'Volver', exact: true })).toBeFocused()
  // The link is not told apart by colour alone.
  expect(
    await sheet
      .getByRole('link', { name: 'Grupo', exact: true })
      .evaluate((link) => getComputedStyle(link).textDecorationLine),
  ).toContain('underline')
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Repartir botín', exact: true }).click()
  const loot = page.getByRole('dialog', { name: 'Repartir botín' })
  await expect(loot.getByText('Crea un personaje en Grupo para dar objetos.')).toBeVisible()
  await expect(loot.getByRole('button', { name: /^Entregar/ })).toHaveCount(0)
  expect(
    await loot
      .getByRole('link', { name: 'Grupo', exact: true })
      .evaluate((link) => getComputedStyle(link).textDecorationLine),
  ).toContain('underline')
}

test('RYT-181 an empty storeroom offers New item beside Import', async ({ page }) => {
  await identityFixture(page, { noCharacters: true })
  await page.goto(url)
  const empty = page.locator('.store-empty')
  await expect(empty.getByRole('button', { name: 'Importar objetos' })).toBeVisible()
  await expect(empty.getByRole('button', { name: 'Nuevo objeto', exact: true })).toBeVisible()
})

test('RYT-181 at 150% text the item sheet wraps its actions and no label is cut', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, party: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const sheet = await openItem(page, 'Espada larga')
  const give = sheet.getByRole('button', { name: 'Dar', exact: true })
  const edit = sheet.getByRole('button', { name: 'Editar', exact: true })
  await expect(give).toBeVisible()
  // Every action shows its whole label: nothing wider or taller than the box that holds it.
  expect(await clippedLabels(sheet, '.item-sheet-actions button')).toEqual([])
  const width = page.viewportSize()!.width
  const [giveBox, editBox] = [(await give.boundingBox())!, (await edit.boundingBox())!]
  if (width < 500) {
    // The row wraps: Give on a line of its own, Edit and the menu under it.
    expect(editBox.y).toBeGreaterThan(giveBox.y + giveBox.height - 1)
    const more = (await sheet.getByRole('button', { name: /^Más acciones para/ }).boundingBox())!
    expect(Math.abs(more.y - editBox.y)).toBeLessThan(editBox.height)
  }
  expect(giveBox.height).toBeGreaterThanOrEqual(44)
  expect(editBox.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('RYT-181 a failed give moves focus to the alert and Retry is the next stop', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { inventory: true, party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let attempts = 0
  await page.route('**/rest/v1/rpc/distribute_loot', async (route) => {
    if (++attempts === 1) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(url)
  const sheet = await openItem(page, 'Espada larga')
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  await sheet.locator('.give-char').filter({ hasText: 'Bea' }).click()
  await sheet.getByRole('button', { name: 'Dar a Bea', exact: true }).click()
  const alert = sheet.getByRole('alert')
  await expect(alert).toBeVisible()
  // The pressed button went busy and dropped focus: the alert takes it.
  await expect(alert).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(sheet.getByRole('button', { name: 'Reintentar', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(attempts).toBe(2)
  expect(fixture.inventory.events.filter((event) => event.kind === 'grant')).toHaveLength(1)
})

test('RYT-181 at 150% text the storeroom search keeps room and its controls share a height', async ({
  page,
}) => {
  await identityFixture(page, { inventory: true, party: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const field = page.getByRole('searchbox', { name: 'Buscar objetos' })
  await expect(field).toBeVisible()
  expect((await field.boundingBox())!.width).toBeGreaterThanOrEqual(100)
  const heights = await page
    .locator('.store-find > *')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('RYT-184 the storeroom search finds the items of the packs and adds them one at a time', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { inventory: true, catalogue: true })
  const sent: string[][] = []
  let packReads = 0
  await page.route('**/rpc/get_campaign_item_packs', (route) => {
    packReads++
    return route.fallback()
  })
  await page.route('**/rpc/import_basic_items', (route) => {
    sent.push(
      route
        .request()
        .postDataJSON()
        .items.map((item: { key: string }) => item.key),
    )
    return route.fallback()
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const search = page.getByRole('searchbox', { name: 'Buscar objetos' })
  const group = page.getByRole('region', { name: 'En tus paquetes' })
  await expect(page.locator('.store-row').first()).toBeVisible()
  // One character reads nothing from the packs.
  await search.fill('d')
  await expect(group).toHaveCount(0)
  expect(packReads).toBe(0)
  await search.fill('daga')
  await expect(group.getByRole('listitem')).toHaveCount(1)
  expect(packReads).toBe(1)
  await expect(group.getByRole('button', { name: 'Añadir Daga' })).toBeVisible()
  await expect(page.locator('.store-row').filter({ hasText: 'Daga' })).toHaveCount(0)
  await audit(page, info.outputPath('storeroom-pack-finds.png'))
  await group.getByRole('button', { name: 'Añadir Daga' }).click()
  // One item, one request; it moves to the storeroom and the status says so.
  await expect(page.locator('.store-row').filter({ hasText: 'Daga' })).toHaveCount(1)
  await expect(group.getByRole('listitem')).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Daga añadido al almacén.' }),
  ).toBeVisible()
  expect(sent).toEqual([['dagger']])
  expect(fixture.inventory.definitions.filter((d) => d.basic_key === 'dagger')).toHaveLength(1)
  // The last find is gone: focus returns to the search instead of falling to the page.
  await expect(search).toBeFocused()
  // Items the storeroom holds are never offered again.
  await search.fill('cuerda')
  await expect(group.getByRole('listitem').filter({ hasText: 'Cuerda' })).toHaveCount(0)
})

test('RYT-184 the pack group names its pack with several packs, fails with a retry and leaves one empty state', async ({
  page,
}) => {
  itemPackState.books = true
  try {
    await identityFixture(page, { inventory: true, catalogue: true })
    let fail = true
    await page.route('**/rpc/import_basic_items', (route) =>
      fail ? route.fulfill({ status: 503, json: { message: 'Unavailable' } }) : route.fallback(),
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(url)
    const search = page.getByRole('searchbox', { name: 'Buscar objetos' })
    const group = page.getByRole('region', { name: 'En tus paquetes' })
    await search.fill('hoja lunar')
    const row = group.getByRole('listitem').filter({ hasText: 'Hoja lunar' })
    await expect(row).toContainText('Libros del dueño')
    await row.getByRole('button', { name: 'Añadir Hoja lunar' }).click()
    await expect(row.getByRole('alert')).toHaveText('No se pudo añadir.')
    fail = false
    await row.getByRole('button', { name: 'Añadir Hoja lunar' }).press('Enter')
    await expect(page.locator('.store-row').filter({ hasText: 'Hoja lunar' })).toHaveCount(1)
    // The storeroom matches but the packs do not: the group says so.
    await search.fill('cuerda')
    await expect(group.getByText('Nada en tus paquetes.')).toBeVisible()
    // Neither matches: the storeroom's one empty state, no group.
    await search.fill('zzzz')
    await expect(page.getByText('Ningún objeto coincide con la búsqueda.')).toBeVisible()
    await expect(group).toHaveCount(0)
  } finally {
    resetItemPacks()
  }
})

test('RYT-184 an unreachable library shows the group error with a retry', async ({ page }) => {
  itemPackState.unreachable = true
  try {
    await identityFixture(page, { inventory: true, catalogue: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(url)
    await page.getByRole('searchbox', { name: 'Buscar objetos' }).fill('daga')
    const group = page.getByRole('region', { name: 'En tus paquetes' })
    await expect(group.getByRole('alert')).toContainText('No se pudieron leer tus paquetes.')
    itemPackState.unreachable = false
    await group.getByRole('button', { name: 'Reintentar' }).click()
    await expect(group.getByRole('button', { name: 'Añadir Daga' })).toBeVisible()
  } finally {
    resetItemPacks()
  }
})
