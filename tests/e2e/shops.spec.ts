import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from './fixtures/identity.ts'
import { expectTouchTargets, capture, expectArtPrompt } from './fixtures/audit.ts'
import { shopsFixture, shopIds } from './fixtures/shops.ts'

const shops = `./#/campaign/${campaignId}/shops`
const modules = ['party', 'inventory', 'shops']
/** One cart button: the dock on a phone's buy tab, the purse bar's button on a tablet (J3-33). */
const cartButton = (page: Page, count: string, total = '[0-9]+') =>
  page.getByRole('button', {
    name: new RegExp(
      `Revisar carrito: ${count} por ${total} po|Abrir carrito, ${count} objetos?, ${total} po`,
    ),
  })
async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible, main a.mantine-Button-root:visible, [role="dialog"] button:visible',
  )
  await capture(page, path)
}

test('a Player buys a cart in an auto shop and finds it in the RYT-004 inventory', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    modules,
  })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  await expect(page.locator('.purse-bar')).toContainText('120 po')
  // The shop name is the picker: a select-only combobox with every visible merchant.
  const picker = page.getByRole('combobox', { name: /Cambiar de tienda, 2 disponibles/ })
  await expect(picker).toContainText('Mercado del puerto')
  await picker.click()
  await expect(page.getByRole('option', { name: /El Yunque de Ámbar/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /Mercado del puerto/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(picker).toBeFocused()
  await expect(page.getByText('Bóveda del contrabandista')).toHaveCount(0)
  // J3-07: the mode help is a visible line (a tooltip cannot be opened by touch).
  await expect(page.locator('.shop-mode-help')).toContainText('Las compras se completan al momento')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await expect(page.getByText('20 % de descuento para ti')).toBeVisible()
  const potion = page.locator('.listing-card', { hasText: 'Poción de curación' })
  await expect(potion).toContainText('40 po')
  await expect(potion.getByRole('link', { name: 'Tienes 4 en el inventario' })).toHaveAttribute(
    'href',
    `#/campaign/${campaignId}/inventory`,
  )
  await expect(page.locator('.listing-card', { hasText: 'Anillo de la marea' })).toContainText(
    'Solo para ti',
  )
  await audit(page, info.outputPath('storefront.png'))

  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  // J3-12: once in the cart the add button is a stepper on the card.
  await page
    .getByRole('button', { name: 'Cantidad de Poción de curación en el carrito: uno más' })
    .click()
  await page.locator('.listing-card', { hasText: 'Flecha' }).locator('.listing-main').click()
  const detail = page.getByRole('dialog', { name: 'Flecha' })
  await detail.getByRole('textbox', { name: 'Cantidad' }).fill('5')
  await detail.getByRole('button', { name: 'Añadir 5 al carrito' }).click()
  await page.keyboard.press('Escape')
  await cartButton(page, '7', '85').click()
  const cart = page.getByRole('dialog', { name: 'Carrito' })
  await expect(cart.locator('.balance-change').first()).toContainText('120 po')
  await expect(cart.locator('.balance-change').first()).toContainText('35 po')
  await audit(page, info.outputPath('cart.png'))
  await cart.getByRole('button', { name: 'Comprar por 85 po' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Compra completada por 85 po.' }),
  ).toBeVisible()
  await expect(page.locator('.purse-bar')).toContainText('35 po')

  await page.getByRole('link', { name: 'Ver inventario' }).click()
  // J3-23: units of one item read as one tile, whatever stack they sit in.
  await expect(page.getByRole('button', { name: /Flecha, cantidad 25/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Poción de curación, cantidad 6/ })).toHaveCount(1)
  await page.locator('.view-switch').getByText('Bitácora', { exact: true }).click()
  await expect(page.locator('.ledger-entry').first()).toContainText('compra')
  expect(errors).toEqual([])
})

test('one cart spans merchants and retries only the outstanding order', async ({ page }, info) => {
  const fixture = await identityFixture(page, { player: true, inventory: true, modules })
  const market = await shopsFixture(page, fixture)
  const attempts: { target_shop: string; request_id: string }[] = []
  await page.route('**/rpc/checkout', async (route) => {
    const body = route.request().postDataJSON()
    attempts.push(body)
    if (attempts.length === 2)
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
    return route.fallback()
  })
  await page.goto(shops)
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  await page.getByRole('combobox', { name: /Cambiar de tienda/ }).click()
  await page.getByRole('option', { name: /El Yunque de Ámbar/ }).click()
  await expect(cartButton(page, '1', '40')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir Espada larga al carrito' }).click()
  await cartButton(page, '2').click()
  const cart = page.getByRole('dialog', { name: 'Carrito' })
  await expect(cart.getByRole('heading', { name: 'Mercado del puerto' })).toBeVisible()
  await expect(cart.getByRole('heading', { name: 'El Yunque de Ámbar' })).toBeVisible()
  await cart.getByRole('textbox', { name: 'Tu oferta por unidad' }).fill('12')
  await expect(cart.locator('.cart-summary')).toContainText('52 po')
  await audit(page, info.outputPath('shared-cart.png'))
  await cart.getByRole('button', { name: 'Comprar y enviar petición al DM' }).click()
  await expect(cart.getByRole('alert')).toContainText('El Yunque de Ámbar')
  await expect(
    cart.getByRole('status').filter({ hasText: 'Compra completada por 40 po.' }),
  ).toBeVisible()
  await expect(cart.getByText('Poción de curación', { exact: true })).toHaveCount(0)
  await expect(cart.getByRole('textbox', { name: 'Tu oferta por unidad' })).toHaveValue('12')
  await cart.getByRole('button', { name: 'Enviar petición al DM' }).click()
  await expect(cart).toBeHidden()
  expect(market.gold()).toBe(80)
  expect(attempts.map((a) => a.target_shop)).toEqual([shopIds.market, shopIds.smith, shopIds.smith])
  expect(attempts[1]!.request_id).toBe(attempts[2]!.request_id)
})

test('a Player negotiates with an approval shop and sells to it', async ({ page }, info) => {
  const fixture = await identityFixture(page, { player: true, inventory: true, modules })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${shops}?shop=${shopIds.smith}&tab=orders`)
  const countered = page.locator('.order-card', { hasText: '18 es mi última palabra' })
  await expect(countered).toContainText('Contraoferta')
  await audit(page, info.outputPath('orders.png'))
  await countered.getByRole('button', { name: 'Aceptar por 18 po' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Pedido completado por 18 po.' }),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Comprar' }).click()
  await page.getByRole('button', { name: 'Añadir Espada larga al carrito' }).click()
  await cartButton(page, '[0-9]+').click()
  const cart = page.getByRole('dialog', { name: 'Carrito' })
  await cart.getByRole('textbox', { name: 'Tu oferta por unidad' }).fill('12')
  await cart.getByLabel('Mensaje para el DM').fill('Soy cliente fiel.')
  await expect(cart.getByText('El oro y los objetos solo se mueven')).toBeVisible()
  await cart.getByRole('button', { name: 'Enviar petición al DM' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Petición enviada' })).toBeVisible()

  await page.getByRole('tab', { name: 'Vender' }).click()
  await expect(page.getByText(/No compra: .*Flecha/)).toBeVisible()
  await page.getByRole('textbox', { name: 'Cuántos Espada larga vender' }).fill('1')
  await audit(page, info.outputPath('sell.png'))
  await page.getByRole('button', { name: 'Proponer venta al DM' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Propuesta de venta' })).toBeVisible()

  // My orders now hold a sale, a purchase request and the accepted counter-offer, each in
  // its own visual language; the gold direction is phrased for the Player.
  await page.getByRole('tab', { name: /Mis pedidos/ }).click()
  const sale = page.locator('.order-card.order-sale').first()
  await expect(sale.locator('.order-kind')).toHaveText('Venta')
  await expect(sale.locator('.order-flow')).toContainText('Recibirás')
  await expect(page.locator('.order-card.order-purchase').first()).toBeVisible()
  await audit(page, info.outputPath('orders-mixed.png'))
})

test('RYT-098 a listing picture opens the viewer; the rest of the card keeps opening the item', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    modules,
  })
  fixture.inventory.definitions.find((d) => d.name === 'Flecha')!.image_path =
    `pre/${campaignId}/items/arrow.webp`
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  const arrow = page.locator('.listing-card', { hasText: 'Flecha' })
  const picture = arrow.getByRole('button', { name: 'Ver la imagen de Flecha' })
  // Two sibling buttons: the picture and the one that opens the item.
  await expect(picture.locator('xpath=ancestor::button')).toHaveCount(0)
  await expect(arrow.locator('.listing-main').getByRole('button')).toHaveCount(0)
  await picture.click()
  const viewer = page.getByRole('dialog', { name: 'Flecha', exact: true })
  await expect(viewer.getByRole('img', { name: 'Imagen de Flecha' })).toBeVisible()
  await audit(page, info.outputPath('listing-viewer.png'))
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(picture).toBeFocused()
  // A tap beside the picture opens the item as before; its picture there opens the viewer too, and
  // Escape over the drawer closes only the viewer.
  await arrow.locator('.listing-main').click()
  const detail = page.getByRole('dialog', { name: 'Flecha' }).filter({ hasText: 'Precio' })
  const inside = detail.getByRole('button', { name: 'Ver la imagen de Flecha' })
  await inside.click()
  await expect(page.locator('.image-viewer-content')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.image-viewer-content')).toHaveCount(0)
  await expect(detail).toBeVisible()
  await expect(inside).toBeFocused()
  // Items without a picture keep their glyph inside the card's button.
  const potion = page.locator('.listing-card', { hasText: 'Poción de curación' })
  await expect(potion.locator('.listing-main .shop-glyph')).toHaveCount(1)
  await expect(potion.getByRole('button', { name: /Ver la imagen/ })).toHaveCount(0)
})

test('RYT-098 the DM stock row keeps its picture beside the button that opens the editor', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { inventory: true })
  fixture.inventory.definitions.find((d) => d.name === 'Flecha')!.image_path =
    `pre/${campaignId}/items/arrow.webp`
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  const row = page.locator('.stock-row', { hasText: 'Flecha' })
  const picture = row.getByRole('button', { name: 'Ver la imagen de Flecha' })
  const main = row.locator('.stock-row-main')
  await expect(main).toHaveAttribute('aria-expanded', 'false')
  await expect(main.getByRole('button')).toHaveCount(0)
  await picture.click()
  await expect(page.getByRole('dialog', { name: 'Flecha', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picture).toBeFocused()
  await expect(main).toHaveAttribute('aria-expanded', 'false')
  await main.click()
  await expect(main).toHaveAttribute('aria-expanded', 'true')
})

test('a Player without the shops module sees why', async ({ page }) => {
  await identityFixture(page, { player: true, inventory: true })
  await page.goto(shops)
  await expect(page.getByText('El DM todavía no ha abierto las tiendas.')).toBeVisible()
})

test('RYT-144 the DM can reach stock, pending orders and the campaign visibility setting from a shop', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.goto(shops)
  await expect(page.getByText('Oculta al grupo porque Tiendas está desactivado.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Gestionar módulos de jugadores' })).toHaveAttribute(
    'href',
    /panel=modules/,
  )
  await expect(page.getByRole('switch', { name: /Abierta/ })).toBeHidden()
  await page.getByRole('button', { name: 'Existencias', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Existencias' })).toBeFocused()
  await page.getByRole('button', { name: 'Pedidos pendientes' }).click()
  await expect(page.getByText('Por responder (0)')).toBeVisible()
  await page.getByRole('tab', { name: 'Tiendas' }).click()
  await audit(page, info.outputPath('selected-shop.png'))
})

test('the DM runs shops inline: create, visibility, stock, prices, ledger and revert', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeVisible()
  await expect(page.getByText('Oculta al grupo porque Tiendas está desactivado.')).toBeVisible()
  const list = page.getByRole('navigation', { name: 'Tiendas' })
  await expect(list.getByRole('button', { name: /Bóveda del contrabandista/ })).toContainText(
    'Oculta',
  )
  await expect(page.getByRole('button', { name: /Anillo de la marea/ })).toContainText('Solo Arin')
  await audit(page, info.outputPath('admin-shops.png'))

  await page.getByText('Ajustes de tienda', { exact: true }).click()
  // Shop settings save as soon as they change; no form.
  const saved = page
    .getByRole('status')
    .filter({ hasText: 'Cambios en Mercado del puerto guardados' })
  await page.getByRole('switch', { name: /Abierta/ }).click()
  await expect(saved).toBeVisible()
  await expect(page.getByRole('switch', { name: /Cerrada/ })).toBeFocused()
  // Rapid changes are merged and all of them reach the server.
  await page.locator('.shop-controls').getByText('Oculta', { exact: true }).click()
  await page.locator('.shop-controls').getByText('Con aprobación del DM', { exact: true }).click()
  await expect(saved).toBeVisible()
  await expect(page.locator('.admin-shop-item.is-active')).toContainText('Oculta')
  await page.getByRole('tab', { name: /Bitácora/ }).click()
  await page.getByRole('tab', { name: 'Tiendas' }).click()
  await page.getByText('Ajustes de tienda', { exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Con aprobación del DM' })).toBeChecked()
  await page.locator('.shop-controls').getByText('Algunos personajes', { exact: true }).click()
  await page.getByRole('group', { name: 'Personajes que la ven' }).getByText('Arin').click()
  await expect(saved).toBeVisible()
  // Keyboard on the resale slider: three steps, one save, the server value shown.
  const resale = page.getByRole('slider', { name: 'Compra objetos al' })
  await resale.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(saved).toBeVisible()
  await expect(resale).toHaveAttribute('aria-valuenow', '65')
  await expect(resale).toHaveAttribute('aria-valuetext', 'Paga el 65\u00a0%')

  // Inline stock editing: price stepper and limited stock.
  // The expanded row also offers 'Editar objeto: …' (RYT-027); anchor on the row button.
  const potionRow = page.getByRole('button', { name: /^Poción de curación/ })
  await potionRow.click()
  await expect(potionRow).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Subir Precio' }).click()
  await page.getByRole('button', { name: '+10%' }).click()
  await audit(page, info.outputPath('stock-editor.png'))
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Poción de curación guardado' }),
  ).toBeVisible()
  await expect(potionRow).toBeFocused()
  await expect(potionRow).toContainText('56,10 po')

  // Several catalog items at once from the icon grid.
  await page.getByRole('button', { name: 'Añadir objeto' }).click()
  const picker = page.getByRole('dialog', { name: 'Añadir a Mercado del puerto' })
  await picker.locator('.pick-tile', { hasText: 'Escudo' }).click()
  await picker.locator('.pick-tile', { hasText: 'Espada larga' }).click()
  await expect(picker.locator('.pick-tile', { hasText: 'Escudo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await audit(page, info.outputPath('item-picker.png'))
  await picker.getByRole('button', { name: 'Añadir 2 objetos' }).click()
  await expect(page.getByRole('status').filter({ hasText: '2 objetos añadidos' })).toBeVisible()
  await expect(page.locator('.stock-row', { hasText: 'Escudo' })).toBeVisible()

  // Starting a shop takes only a name.
  await list.getByRole('button', { name: 'Nueva tienda' }).click()
  const create = page.getByRole('dialog', { name: 'Nueva tienda' })
  await create.getByLabel('Nombre').fill('Herbolario de Mara')
  await create.getByRole('button', { name: 'Crear tienda' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Herbolario de Mara creada' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Herbolario de Mara' })).toBeVisible()

  await list.getByRole('button', { name: /Bóveda del contrabandista/ }).click()
  await page.getByText('Ajustes de tienda', { exact: true }).click()
  const remove = page.getByRole('button', { name: 'Eliminar tienda Bóveda del contrabandista' })
  await remove.click()
  const archive = page.getByRole('dialog', { name: '¿Eliminar Bóveda del contrabandista?' })
  await expect(archive.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(remove).toBeFocused()
  await remove.click()
  await archive.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'eliminada' })).toBeVisible()
  await expect(list.getByRole('button', { name: /Bóveda del contrabandista/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Tiendas' })).toBeFocused()

  // Ledger: inline counter-offer with price chips, then hold-to-revert from history.
  await page.getByRole('tab', { name: /Bitácora/ }).click()
  await expect(page.getByText('Por responder (1)')).toBeVisible()
  // Manual refresh next to the freshness stamp; polling every 5 s covers the rest.
  await page.getByRole('button', { name: 'Actualizar bitácora' }).click()
  await expect(page.locator('.refresh-stamp')).toContainText('Actualizado')
  const pending = page.locator('.order-card', { hasText: 'Para el viaje al faro.' })
  // Each order type reads differently: kind label, stripe tone and gold direction.
  await expect(pending.locator('.order-kind')).toHaveText('Compra')
  await expect(pending).toHaveClass(/order-purchase/)
  await expect(pending.locator('.order-flow')).toContainText('Arin pagará')
  await pending.getByRole('button', { name: 'Rechazar' }).click()
  await expect(pending.getByRole('button', { name: 'No', exact: true })).toBeFocused()
  await audit(page, info.outputPath('reject-confirm.png'))
  await page.keyboard.press('Escape')
  await expect(pending.getByRole('button', { name: 'Rechazar' })).toBeFocused()
  await pending.getByRole('button', { name: 'Rechazar' }).click()
  await pending.getByRole('button', { name: 'No', exact: true }).click()
  await expect(pending.getByRole('button', { name: 'Rechazar' })).toBeFocused()
  await pending.getByRole('button', { name: 'Contraofertar', exact: true }).click()
  await expect(pending.getByRole('group', { name: 'Contraoferta' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(pending.getByRole('button', { name: 'Contraofertar', exact: true })).toBeFocused()
  await pending.getByRole('button', { name: 'Contraofertar', exact: true }).click()
  await pending.getByRole('button', { name: 'Mitad: 17,50' }).click()
  await audit(page, info.outputPath('counter.png'))
  await pending.getByRole('button', { name: 'Contraofertar 35 po' }).click()
  await expect(pending).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Contraoferta enviada' })).toBeVisible()
  // The countered order stays in view as a counter-offer: asked total struck, new total shown.
  await expect(pending).toHaveClass(/order-counter/)
  await expect(pending.locator('.order-kind')).toHaveText('Contraoferta de compra')
  await expect(pending.locator('.order-flow')).toContainText('35 po')
  await audit(page, info.outputPath('ledger-counter.png'))
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')

  await page.getByText(/^Historial/).click()
  const done = page.locator('.order-card', { hasText: 'Arin compró en Mercado del puerto' }).first()
  await done.getByRole('button', { name: 'Revertir' }).click()
  await expect(done).toContainText('Lo usado o vendido no se reembolsa')
  await audit(page, info.outputPath('revert.png'))
  const seal = done.getByRole('button', { name: /Mantén pulsado para revertir/ })
  await seal.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Pedido revertido' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
  await audit(page, info.outputPath('ledger.png'))
  expect(errors).toEqual([])
})

test('the DM panel fits at 150% text with the stock editor open', async ({ page }, info) => {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  await page.getByRole('button', { name: /Poción de curación/ }).click()
  await page.getByText('Algunos personajes', { exact: true }).last().click()
  await audit(page, info.outputPath('admin-150.png'))
  await page.getByRole('tab', { name: /Bitácora/ }).click()
  await page
    .locator('.order-card', { hasText: 'Para el viaje al faro.' })
    .getByRole('button', { name: 'Contraofertar', exact: true })
    .click()
  await audit(page, info.outputPath('ledger-150.png'))
})

test('RYT-107 the DM creates a shop from a type and a retry finishes its stock without duplicates', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  const saves: string[] = []
  let failures = 1
  await page.route('**/rpc/save_shop', (route) => {
    saves.push(route.request().postDataJSON().request_id)
    return route.fallback()
  })
  await page.route('**/rpc/add_listings', (route) =>
    failures-- > 0
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      : route.fallback(),
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  const list = page.getByRole('navigation', { name: 'Tiendas' })
  // The admin list shows each shop's type as a glyph and word.
  await expect(list.getByRole('button', { name: /Mercado del puerto/ })).toContainText(
    'Tienda de abastos',
  )
  await list.getByRole('button', { name: 'Nueva tienda' }).click()
  const create = page.getByRole('dialog', { name: 'Nueva tienda' })
  const empty = create.getByRole('radio', { name: /Vacía/ })
  await expect(empty).toBeChecked()
  // Native radios: one Tab stop and arrow keys move the choice.
  await empty.focus()
  await page.keyboard.press('ArrowRight')
  await expect(create.getByRole('radio', { name: /Herrería/ })).toBeChecked()
  await create.getByRole('radio', { name: /Taberna y posada/ }).check()
  await expect(create.getByLabel('Nombre')).toHaveValue('Taberna y posada')
  await create.getByLabel('Nombre').fill('La Jarra Alegre')
  const review = create.getByRole('button', { name: /Revisar los objetos/ })
  await review.click()
  await expect(review).toHaveAttribute('aria-expanded', 'true')
  await create.locator('.stock-review-list input[type="checkbox"]').first().uncheck()
  const submit = create.getByRole('button', { name: /Crear con \d+ objetos/ })
  const count = Number((await submit.textContent())!.match(/(\d+)/)![1])
  await audit(page, info.outputPath('create-typed.png'))
  await submit.click()
  // The shop exists; the stock failed. The drawer stays with a retry that only stocks it.
  await expect(create.getByRole('alert')).toContainText('La tienda La Jarra Alegre ya existe')
  await expect(create.getByLabel('Nombre')).toBeDisabled()
  await create.getByRole('button', { name: /Terminar de llenar/ }).click()
  await expect(
    page.getByRole('status').filter({ hasText: `La Jarra Alegre creada con ${count} objetos` }),
  ).toBeVisible()
  expect(saves).toHaveLength(1)
  await expect(page.getByRole('heading', { level: 2, name: 'La Jarra Alegre' })).toBeVisible()
  await expect(page.locator('.stock-row')).toHaveCount(count)
  expect(errors).toEqual([])
})

test('RYT-107 an empty shop is stocked from its type; the add-items header keeps New item in view', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture, { emptyShop: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${shops}?shop=71000000-0000-4000-8000-000000000004`)
  await expect(page.getByText('Estantes vacíos')).toBeVisible()
  await page.getByRole('button', { name: 'Llenar según un tipo' }).click()
  const drawer = page.getByRole('dialog', { name: 'Llenar La Jarra Alegre según su tipo' })
  await expect(drawer.getByRole('radio', { name: /Taberna y posada/ })).toBeChecked()
  // The drawer opens on the chosen type, not on Close.
  await expect(drawer.getByRole('radio', { name: /Taberna y posada/ })).toBeFocused()
  await audit(page, info.outputPath('stock-from-type.png'))
  await drawer.getByRole('button', { name: /Llenar con \d+ objetos/ }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'objetos nuevos en los estantes' }),
  ).toBeVisible()
  await expect(page.locator('.stock-row', { hasText: 'Cerveza' })).toBeVisible()

  await page.getByRole('button', { name: 'Añadir objeto' }).click()
  const picker = page.getByRole('dialog', { name: 'Añadir a La Jarra Alegre' })
  const forge = picker.getByRole('button', { name: 'Crear objeto' })
  const inView = async () => {
    const box = (await forge.boundingBox())!
    return box.y >= 0 && box.y + box.height <= page.viewportSize()!.height
  }
  expect(await inView()).toBe(true)
  await picker.evaluate((node) => {
    const content = node.closest('.mantine-Drawer-content') ?? node
    content.scrollTo(0, 10_000)
  })
  expect(await inView()).toBe(true)
  // A pick the search hides still counts, and the dock says so.
  await picker.locator('.pick-tile').first().click()
  await expect(picker.getByRole('button', { name: 'Añadir 1 objeto' })).toBeVisible()
  await picker.getByLabel('Buscar objetos').fill('Martillo lunar')
  await expect(picker.getByText(/No tienes .Martillo lunar. en el almacén/)).toBeVisible()
  await expect(picker.getByText('1 objeto elegido no se ve con esta búsqueda.')).toBeVisible()
  // One create action: the pinned one now names the search; the old "Create it" is gone.
  await expect(picker.getByRole('button', { name: /^Crear/ })).toHaveCount(1)
  const named = picker.getByRole('button', { name: 'Crear «Martillo lunar»' })
  await expect(named).toBeVisible()
  await audit(page, info.outputPath('picker-no-match.png'))
  await picker.getByRole('button', { name: 'Ver todos' }).focus()
  await page.keyboard.press('Enter')
  await expect(picker.getByLabel('Buscar objetos')).toHaveValue('')
  // RYT-108: focus lands on the first tile of the expanded list, never on the document body.
  await expect(picker.locator('.pick-tile').first()).toBeFocused()
  await expect(picker.getByText(/no se ve con esta búsqueda/)).toHaveCount(0)
  await picker.getByLabel('Buscar objetos').fill('Martillo lunar')
  // It opens the forge with the searched name.
  await named.click()
  await expect(
    page.getByRole('dialog').getByRole('textbox', { name: 'Nombre', exact: true }),
  ).toHaveValue('Martillo lunar')
})

test('RYT-104 a Spanish price field keeps the comma while cents are typed', async ({ page }) => {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  const potionRow = page.getByRole('button', { name: /^Poción de curación/ })
  await potionRow.click()
  const price = page.getByRole('textbox', { name: 'Precio', exact: true })
  await price.selectText()
  // Character by character, as on a phone keypad: "12," must not lose its comma.
  await price.pressSequentially('12,')
  await expect(price).toHaveValue('12, po')
  await price.pressSequentially('5')
  await expect(price).toHaveValue('12,5 po')
  // Settled, a price with cents shows both of them (RYT-104).
  await price.blur()
  await expect(price).toHaveValue('12,50 po')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Poción de curación guardado' }),
  ).toBeVisible()
  await expect(potionRow).toContainText('12,50 po')
})

test('RYT-107 the DM uploads, keeps and removes the shop image', async ({ page }, info) => {
  const fixture = await identityFixture(page, { inventory: true })
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await page.getByText('Ajustes de tienda', { exact: true }).click()
  const field = page.getByRole('group', { name: 'Imagen de la tienda' })
  // RYT-154: a prompt for the banner, in the house style, before uploading.
  await expectArtPrompt(field, page, /^Shop interior banner .*"Mercado del puerto"[^]*16:9/)
  await field.locator('input[type="file"]').setInputFiles({
    name: 'stall.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })
  await expect(field.getByRole('status')).toHaveText('Imagen guardada.')
  await expect(
    field.getByRole('button', { name: 'Ver la imagen de Mercado del puerto' }),
  ).toBeVisible()
  await field.getByRole('button', { name: 'Quitar imagen' }).click()
  await field.getByRole('button', { name: 'Conservar' }).click()
  await expect(field.getByRole('button', { name: 'Quitar imagen' })).toBeFocused()
  await audit(page, info.outputPath('admin-image.png'))
  await field.getByRole('button', { name: 'Quitar imagen' }).click()
  await field.getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(field.getByRole('status')).toHaveText('Imagen quitada.')
  await expect(field.getByText('Añadir una imagen')).toBeVisible()
})

test('RYT-107 a Player sees the shop banner with its type; tapping it opens the viewer', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    modules,
  })
  await shopsFixture(page, fixture, { shopImage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  const banner = page.locator('.shop-banner')
  await expect(banner).toContainText('Tienda de abastos')
  await expect(banner.getByRole('combobox', { name: /Mercado del puerto/ })).toBeVisible()
  await audit(page, info.outputPath('storefront-banner.png'))
  const open = banner.getByRole('button', { name: 'Ver la imagen de Mercado del puerto' })
  await expect(open.locator('xpath=ancestor::button')).toHaveCount(0)
  // The name and badges sit on the picture's foot; a tap above them opens it.
  await open.click({ position: { x: 24, y: 12 } })
  await expect(page.getByRole('dialog', { name: 'Mercado del puerto', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(open).toBeFocused()
  // RYT-112: a shop without an image shows its type's painted interior as the banner, with the
  // type in its title; the art is decorative, so there is no viewer button to open.
  await page.goto(`${shops}?shop=${shopIds.smith}`)
  const painted = page.locator('.shop-banner .is-painted')
  await expect(painted).toHaveCount(1)
  await expect(painted.locator('img')).toHaveAttribute('src', /shops\/.+/)
  await expect(page.locator('.shop-banner')).toContainText('Herrería')
  await expect(
    page.locator('.shop-banner').getByRole('button', { name: /^Ver la imagen/ }),
  ).toHaveCount(0)
})

test('J3-01 a quantity field shows what will be charged: 9 against a stock of 3 becomes 3', async ({
  page,
}) => {
  const fixture = await identityFixture(page, { player: true, inventory: true, modules })
  await shopsFixture(page, fixture)
  const sent: { order_lines: { listing_id: string; quantity: number }[] }[] = []
  await page.route('**/rpc/checkout', async (route) => {
    sent.push(route.request().postDataJSON())
    return route.fallback()
  })
  await page.goto(shops)
  await page
    .locator('.listing-card', { hasText: 'Poción de curación' })
    .locator('.listing-main')
    .click()
  const detail = page.getByRole('dialog', { name: 'Poción de curación' })
  const amount = detail.getByRole('textbox', { name: 'Cantidad' })
  await amount.fill('9')
  // The field itself takes the clamped value and says why.
  await expect(amount).toHaveValue('3')
  await expect(detail.getByText('Solo quedan 3')).toBeVisible()
  await detail.getByRole('button', { name: 'Añadir 3 al carrito' }).click()
  await page.keyboard.press('Escape')

  await cartButton(page, '3', '120').click()
  const cart = page.getByRole('dialog', { name: 'Carrito' })
  const quantity = cart.getByRole('textbox', { name: 'Cantidad', exact: true })
  await expect(quantity).toHaveValue('3')
  // Typing past the stock, a negative number or zero never leaves a value the charge ignores.
  await quantity.fill('5000')
  await expect(quantity).toHaveValue('3')
  await quantity.fill('0')
  await expect(quantity).toHaveValue('1')
  await expect(cart.getByText('Mínimo 1')).toBeVisible()
  // A whole-number field does not take "2,5" silently: it keeps 2 and says why.
  await quantity.fill('2,5')
  await expect(quantity).toHaveValue('2')
  await expect(cart.getByText('Escribe solo cifras.')).toBeVisible()
  await quantity.fill('9')
  await expect(quantity).toHaveValue('3')
  await expect(cart.locator('.cart-summary')).toContainText('120 po')
  await cart.getByRole('button', { name: 'Comprar por 120 po' }).click()
  await expect(cart).toBeHidden()
  // Field, line total and the request all agree.
  expect(sent).toHaveLength(1)
  expect(sent[0]!.order_lines.map((l) => l.quantity)).toEqual([3])
})

test('J3-06 the cart survives a reload and is checked against the shelf', async ({ page }) => {
  const fixture = await identityFixture(page, { player: true, inventory: true, modules })
  await shopsFixture(page, fixture)
  await page.goto(shops)
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  await expect(cartButton(page, '1', '40')).toBeVisible()
  await page.reload()
  await expect(cartButton(page, '1', '40')).toBeVisible()
})

test('RYT-106 the cart shows each item picture, which opens the viewer over the cart', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    modules,
  })
  fixture.inventory.definitions.find((d) => d.name === 'Flecha')!.image_path =
    `pre/${campaignId}/items/arrow.webp`
  await shopsFixture(page, fixture)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(shops)
  await page.getByRole('button', { name: 'Añadir Flecha al carrito' }).click()
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  await cartButton(page, '2').click()
  const line = page.locator('.cart-line', { hasText: 'Flecha' })
  const picture = line.getByRole('button', { name: 'Ver la imagen de Flecha' })
  await expect(picture).toBeVisible()
  // The picture sits inside the rarity frame; without one, the category painting stands in.
  const potion = page.locator('.cart-line', { hasText: 'Poción de curación' })
  await expect(potion.locator('.shop-glyph')).toHaveCount(1)
  await expect(potion.getByRole('button', { name: /Ver la imagen/ })).toHaveCount(0)
  await audit(page, info.outputPath('cart-pictures.png'))
  await picture.click()
  await expect(page.locator('.image-viewer-content')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.image-viewer-content')).toHaveCount(0)
  await expect(line).toBeVisible()
  await expect(picture).toBeFocused()
})
