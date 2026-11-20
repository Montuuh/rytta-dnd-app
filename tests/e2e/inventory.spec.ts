import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from './fixtures/identity.ts'
import { expectTouchTargets, capture, limitMatrix } from './fixtures/audit.ts'

const url = `./#/campaign/${campaignId}/inventory`
async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible, main label.portrait-edit:visible, [role="dialog"] button:visible, .undo-fuse button:visible',
  )
  await capture(page, path)
}

for (const [language, scheme] of [
  ['es', 'dark'],
  ['en', 'light'],
] as const)
  test(`${language} ${scheme} satchel, card, use and undo at 150%`, async ({ page }, info) => {
    limitMatrix(info, language === 'es')
    await page.addInitScript(
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(url)
    const es = language === 'es'
    const potion = page.getByRole('button', { name: /Poción de curación, (cantidad|quantity) 3/ })
    await expect(potion).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 150%; }' })
    await expect(page.getByRole('meter')).toHaveAttribute('aria-valuemax', es ? '105' : '210')
    await audit(page, info.outputPath(`satchel-${language}-${scheme}-150.png`))
    await potion.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, info.outputPath(`card-${language}-${scheme}-150.png`))
    const seal = page.getByRole('button', { name: es ? /Usar 1 × Poción/ : /Use 1 × Poción/ })
    await seal.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').locator('.card-result')).toContainText(
      es ? 'Usaste 1. Te quedan 2' : 'Used one, 2 left',
    )
    await expect(page.locator('.undo-fuse')).toHaveCount(0)
    await expect(page.getByText('×2')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.undo-fuse')).toContainText(es ? 'Has usado' : 'You used')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /Poción de curación, (cantidad|quantity) 2/ }),
    ).toBeFocused()
    await audit(page, info.outputPath(`fuse-${language}-${scheme}-150.png`))
    await page
      .locator('.undo-fuse')
      .getByRole('button', { name: es ? /Deshacer/ : /Undo/ })
      .click()
    await expect(
      page.getByRole('button', { name: /Poción de curación, (cantidad|quantity) 3/ }),
    ).toBeVisible()
    await page
      .locator('.view-switch')
      .getByText(es ? 'Equipo' : 'Equipment', { exact: true })
      .click()
    await expect(
      page.getByRole('img', { name: es ? 'Clase de Armadura 14' : 'Armor Class 14' }),
    ).toBeVisible()
    await audit(page, info.outputPath(`doll-${language}-${scheme}-150.png`))
    await page
      .locator('.view-switch')
      .getByText(es ? 'Bitácora' : 'Ledger', { exact: true })
      .click()
    await expect(page.locator('.ledger-entry')).toHaveCount(2)
    await audit(page, info.outputPath(`ledger-${language}-${scheme}-150.png`))
  })

test('RYT-156 no item definition read asks the table for value_gp; values come from the DM read', async ({
  page,
}) => {
  const selects: string[] = []
  let valueReads = 0
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/rest/v1/item_definitions'))
      selects.push(url.searchParams.get('select') ?? '')
    if (url.pathname.endsWith('/rpc/get_item_values')) valueReads++
  })
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.goto(url)
  await expect(
    page.getByRole('button', { name: /Espada larga, (cantidad|quantity) 1/ }),
  ).toBeVisible()
  expect(selects.length).toBeGreaterThan(0)
  expect(selects.filter((select) => select.includes('value_gp'))).toEqual([])
  expect(valueReads).toBeGreaterThan(0)
})

test('equipping through the card and the paper doll updates AC and attacks', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.goto(url)
  await page.getByRole('button', { name: /Espada larga, (cantidad|quantity) 1/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Equipar' }).click()
  await expect(page.locator('.inventory-notice')).toHaveText(
    'Equipado en Mano principal: Espada larga.',
  )
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeFocused()
  await page.locator('.view-switch').getByText('Equipo', { exact: true }).click()
  await expect(page.locator('.attack-lines')).toContainText('Espada larga')
  await expect(page.locator('.attack-lines')).toContainText('+5')
  await page.getByRole('button', { name: 'Mano secundaria: vacío' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Escudo' }).click()
  await expect(page.getByRole('button', { name: 'Mano secundaria: Escudo' })).toBeFocused()
  await expect(page.getByRole('img', { name: 'Clase de Armadura 16' })).toBeVisible()
  await expect(page.locator('.attack-lines')).not.toContainText('a dos manos')
  await page.getByRole('button', { name: 'Anillo izquierdo: vacío' }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Anillo de la marea' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Anillo izquierdo: vacío' })).toBeFocused()
  await capture(page, info.outputPath('doll-equipped.png'))
})

test('hold-to-use needs a sustained press; a tap does nothing', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.goto(url)
  await page.getByRole('button', { name: /Poción de curación, (cantidad|quantity) 3/ }).click()
  const seal = page.getByRole('button', { name: /Usar 1 × Poción/ })
  await seal.click()
  await expect(page.getByText('×3')).toBeVisible()
  await page.getByRole('button', { name: 'Usar ahora' }).click()
  await expect(page.getByText('×2')).toBeVisible()
  const box = (await seal.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(page.getByText('×1')).toBeVisible()
  await page.getByRole('button', { name: /Usar 1 × Poción/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeFocused()
})

test('the DM forges from an existing item, gives it out and sees the hidden-module note', async ({
  page,
}, info) => {
  await identityFixture(page, {
    sheet: 'complete',
    inventory: true,
    catalogue: true,
    modules: ['party'],
  })
  await page.goto(url)
  await expect(
    page.getByText('Los jugadores todavía no ven este módulo.', { exact: false }),
  ).toBeVisible()
  // The inventory page no longer links to the storeroom; the DM opens it from the Command Center.
  await expect(page.getByRole('link', { name: 'Almacén de objetos' })).toHaveCount(0)
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  await page.getByRole('button', { name: 'Nuevo objeto', exact: true }).click()
  // RYT-104: the static SRD list is gone; the helper searches the campaign, templates first.
  const picker = page.getByRole('combobox', { name: 'Partir de un objeto existente' })
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Custom')
  await picker.click()
  expect(
    await picker.evaluate((field) => parseFloat(getComputedStyle(field).fontSize)),
  ).toBeGreaterThanOrEqual(16)
  const options = page.getByRole('dialog').getByRole('listbox')
  await expect(options).toBeVisible()
  await expect(options.getByRole('option').first()).toContainText('Plantilla')
  const viewport = page.viewportSize()!
  await page.setViewportSize({ ...viewport, height: viewport.height - 260 })
  await picker.fill('xyzxyz')
  await picker.press('Enter')
  await expect(options).toBeVisible()
  await picker.fill('espada')
  await expect(options.getByRole('option')).toHaveCount(1)
  await expect(picker).toBeFocused()
  // The option is reachable once the resized drawer has settled: nothing covers its centre.
  await expect
    .poll(() =>
      options.getByRole('option').evaluate((option) => {
        const box = option.getBoundingClientRect()
        return option.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        )
      }),
    )
    .toBe(true)
  await capture(page, info.outputPath('template-search.png'))
  await picker.press('Escape')
  await expect(options).toBeHidden()
  await picker.tap()
  await picker.fill('espada')
  await options.getByRole('option', { name: /Espada larga/ }).tap()
  await expect(options).toBeHidden()
  await page.setViewportSize(viewport)
  await expect(page.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
    'Espada larga',
  )
  await expect(page.getByLabel('Dados de daño')).toHaveValue('1d8')
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Espada del alba')
  await audit(page, info.outputPath('forge.png'))
  await page.getByRole('dialog').getByRole('button', { name: 'Forjar objeto' }).click()
  await expect(page.getByRole('status')).toContainText('Objeto guardado: Espada del alba')
  const row = page.locator('.store-row').filter({ hasText: 'Espada del alba' })
  const give = row.getByRole('button', { name: 'Dar Espada del alba a personajes', exact: true })
  if (await give.count()) await give.click()
  else {
    await row.getByRole('button', { name: 'Acciones para Espada del alba', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Dar a personajes', exact: true }).click()
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Arin', exact: true }).click()
  const delivery = page.getByRole('dialog')
  await delivery.getByRole('button', { name: 'Revisar reparto' }).click()
  await expect(delivery).toContainText('Espada del alba × 1')
  await delivery.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(delivery.getByRole('heading', { name: 'Botín entregado' })).toBeVisible()
  await delivery.getByRole('button', { name: 'Cerrar', exact: true }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goto(url)
  await expect(
    page.getByRole('button', { name: /Espada del alba, (cantidad|quantity) 1/ }),
  ).toBeVisible()
})

test('Players cannot open the module until the DM turns it on', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.goto(url)
  await expect(
    page.getByText('El DM todavía no ha abierto el inventario', { exact: false }),
  ).toBeVisible()
})

test('the Player sets a portrait that shows in the satchel and the sheet', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.goto(url)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
    'base64',
  )
  await page.locator('.inventory-head input[type=file]').setInputFiles({
    name: 'arin.png',
    mimeType: 'image/png',
    buffer: png,
  })
  // RYT-074: the editor always opens; crop is the default, fit adds black bars.
  const editor = page.getByRole('dialog', { name: 'Retrato de Arin' })
  await expect(editor.getByRole('radio', { name: 'Recortar' })).toBeChecked()
  const frame = editor.getByRole('img', { name: /Encuadre del retrato/ })
  await frame.focus()
  await page.keyboard.press('+')
  await page.keyboard.press('ArrowLeft')
  await editor.getByText('Encajar con bandas negras').click()
  await editor.getByRole('button', { name: 'Guardar retrato' }).click()
  await expect(editor).toHaveCount(0)
  // RYT-098: the medallion opens the viewer; the camera beside it stays its own control.
  const portrait = page.getByRole('button', { name: 'Ver el retrato de Arin' })
  await expect(portrait).toBeVisible()
  await expect(page.locator('.inventory-head label.portrait-edit')).toBeVisible()
  await expect(portrait.locator('label, input')).toHaveCount(0)
  await portrait.click()
  const viewer = page.getByRole('dialog', { name: 'Arin', exact: true })
  await expect(viewer.getByRole('img', { name: 'Retrato de Arin' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(portrait).toBeFocused()
})

test('RYT-098 item pictures open the viewer from the item and the slot; the tile keeps opening the item', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  const named = (name: string) => fixture.inventory.definitions.find((d) => d.name === name)!
  named('Espada larga').image_path = `pre/${campaignId}/items/sword.webp`
  named('Armadura de cuero').image_path = `pre/${campaignId}/items/leather.webp`
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  // A tap on the tile still opens the item; the picture in its drawer opens the viewer.
  await page.getByRole('button', { name: /Espada larga, cantidad 1/ }).click()
  // J3-27: the drawer is titled with the item's name.
  const card = page.locator('.item-card-drawer')
  const picture = card.getByRole('button', { name: 'Ver la imagen de Espada larga' })
  await expect(picture).toHaveAttribute('aria-haspopup', 'dialog')
  await picture.click()
  const viewer = page
    .getByRole('dialog', { name: 'Espada larga', exact: true })
    .filter({ has: page.getByRole('img', { name: 'Imagen de Espada larga' }) })
  await expect(viewer.getByRole('img', { name: 'Imagen de Espada larga' })).toBeVisible()
  await audit(page, info.outputPath('item-viewer.png'))
  // Over the drawer, Escape closes only the viewer and focus returns to the picture.
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(card).toBeVisible()
  await expect(picture).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  // An item without a picture keeps its icon, which is not a button.
  await page.getByRole('button', { name: /Poción de curación, cantidad 3/ }).click()
  await expect(card.getByRole('button', { name: /Ver la imagen/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // The equipped armour's picture sits beside the row that unequips it, never inside it.
  await page.locator('.view-switch').getByText('Equipo', { exact: true }).click()
  await page.getByRole('button', { name: 'Torso: Armadura de cuero' }).click()
  const slot = page.getByRole('dialog', { name: 'Torso' })
  const armour = slot.getByRole('button', { name: 'Ver la imagen de Armadura de cuero' })
  await expect(slot.getByRole('button', { name: 'Quitar Armadura de cuero' })).toBeVisible()
  await expect(armour.locator('xpath=ancestor::button')).toHaveCount(0)
  await armour.click()
  await expect(page.getByRole('dialog', { name: 'Armadura de cuero', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(slot).toBeVisible()
  await expect(armour).toBeFocused()
  await audit(page, info.outputPath('slot-picture.png'))
})

test('J3-05 the purse shows in the header, and J3-11 a discard amount stops at the stack', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.route('**/rest/v1/character_resources*', (route) =>
    route.fulfill({ json: { gold: 120 } }),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  await expect(page.getByRole('group', { name: 'Bolsa de Arin' })).toContainText('120 po')
  await page.getByRole('button', { name: /Poción de curación, cantidad 3/ }).click()
  const card = page.locator('.item-card-drawer')
  const amount = card.getByRole('textbox', { name: 'Cuántos descartar' })
  // RYT-149: the discard controls stay folded under the seal until asked for.
  await expect(amount).toBeHidden()
  const fold = card.getByRole('button', { name: 'Descartar…' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  await expect(fold).toHaveAttribute('aria-expanded', 'true')
  await amount.fill('9')
  await expect(amount).toHaveValue('3')
  await expect(card.getByText('Solo tienes 3')).toBeVisible()
  await expect(card.getByText('Descartar 3')).toBeVisible()
  await card.getByRole('button', { name: /Todo \(3\)/ }).click()
  await expect(amount).toHaveValue('3')
  await amount.fill('0')
  await expect(amount).toHaveValue('1')
  await expect(card.getByText('Descartar 1')).toBeVisible()
})

test('RYT-149 tap, hold, keyboard and a double tap each spend exactly one unit', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const uses: number[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/rpc/use_item')) uses.push(Date.now())
  })
  await page.goto(url)
  await page.getByRole('button', { name: /Poción de curación, cantidad 3/ }).click()
  const card = page.locator('.item-card-drawer')
  // The effect leads; discarding is folded away and the menu names its actions.
  await expect(card.locator('.item-card-effect')).toHaveText('Gasta 1 de 3')
  await expect(card.getByRole('textbox', { name: 'Cuántos descartar' })).toBeHidden()
  // Without anyone to trade with the menu would only repeat the Discard row, so it is left out.
  await expect(card.getByRole('button', { name: 'Más acciones' })).toHaveCount(0)
  const seal = card.getByRole('button', { name: /Usar 1 × Poción/ })
  // Two activations in a row, as a screen reader's double tap sends them: one unit.
  await seal.evaluate((element: HTMLElement) => {
    element.click()
    element.click()
  })
  await expect(card.locator('.card-result')).toContainText('Usaste 1. Te quedan 2')
  await expect(card.getByText('×2')).toBeVisible()
  await expect(card.getByRole('alert')).toHaveCount(0)
  expect(uses).toHaveLength(1)
  await expect(card.getByRole('textbox', { name: 'Cuántos descartar' })).toBeHidden()
  await audit(page, info.outputPath('card-result.png'))
  // Hold: one more.
  const box = (await seal.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(card.locator('.card-result')).toContainText('Usaste 1. Te queda 1')
  expect(uses).toHaveLength(2)
  // The result line's undo puts it back.
  await card
    .locator('.card-result')
    .getByRole('button', { name: /Deshacer/ })
    .click()
  await expect(card.getByText('×2')).toBeVisible()
  // A failed use can be tried again; the earlier result line does not claim it worked.
  let failOnce = true
  await page.route('**/rpc/use_item', (route) => {
    if (!failOnce) return route.fallback()
    failOnce = false
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })
  await seal.focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('alert')).toBeVisible()
  await expect(card.locator('.card-result')).toHaveCount(0)
  // The retry is a double activation too: still one request.
  await seal.evaluate((element: HTMLElement) => {
    element.click()
    element.click()
  })
  await expect(card.getByRole('alert')).toHaveCount(0)
  await expect(card.locator('.card-result')).toContainText('Usaste 1. Te queda 1')
  expect(uses).toHaveLength(4)
})
