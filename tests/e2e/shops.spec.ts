import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from './fixtures/identity.ts'
import { shopsFixture, shopIds } from './fixtures/shops.ts'

const shops = `./#/campaign/${campaignId}/shops`
const modules = ['party', 'inventory', 'shops']
async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  for (const control of await page
    .locator(
      'main button:visible, main a.mantine-Button-root:visible, [role="dialog"] button:visible',
    )
    .all()) {
    const box = await control.boundingBox()
    expect(
      box!.height,
      await control.evaluate((el) => el.outerHTML.slice(0, 300)),
    ).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path, fullPage: true })
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
  // The mode help is a tooltip on the badge (focusable), not a paragraph under the header.
  await expect(page.locator('.shop-header p', { hasText: 'Las compras se completan' })).toHaveCount(
    0,
  )
  await expect(page.locator('.mode-hint')).toHaveAccessibleDescription(
    /Las compras se completan al momento/,
  )
  await page.locator('.mode-hint').focus()
  await expect(page.getByRole('tooltip')).toContainText('Las compras se completan al momento')
  await page.keyboard.press('Escape')
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
  await page.getByRole('button', { name: 'Añadir Poción de curación al carrito' }).click()
  await page.locator('.listing-card', { hasText: 'Flecha' }).locator('.listing-main').click()
  const detail = page.getByRole('dialog', { name: 'Flecha' })
  await detail.getByLabel('Cantidad').fill('5')
  await detail.getByRole('button', { name: 'Añadir 5 al carrito' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Revisar carrito: 7 por 85 po' }).click()
  const cart = page.getByRole('dialog', { name: 'Carrito en Mercado del puerto' })
  await expect(cart.locator('.balance-change').first()).toContainText('120 po')
  await expect(cart.locator('.balance-change').first()).toContainText('35 po')
  await audit(page, info.outputPath('cart.png'))
  await cart.getByRole('button', { name: 'Comprar por 85 po' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Compra completada por 85 po.' }),
  ).toBeVisible()
  await expect(page.locator('.purse-bar')).toContainText('35 po')

  await page.getByRole('link', { name: 'Ver inventario' }).click()
  await expect(page.getByRole('button', { name: /Flecha, cantidad 5/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Poción de curación, cantidad 3/ })).toHaveCount(2)
  await page.locator('.view-switch').getByText('Bitácora', { exact: true }).click()
  await expect(page.locator('.ledger-entry').first()).toContainText('compra')
  expect(errors).toEqual([])
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
  await page.getByRole('button', { name: /Revisar carrito/ }).click()
  const cart = page.getByRole('dialog', { name: 'Carrito en El Yunque de Ámbar' })
  await cart.getByLabel('Tu oferta por unidad').fill('12')
  await cart.getByLabel('Mensaje para el DM').fill('Soy cliente fiel.')
  await expect(cart.getByText('El oro y los objetos solo se mueven')).toBeVisible()
  await cart.getByRole('button', { name: 'Enviar petición al DM' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Petición enviada' })).toBeVisible()

  await page.getByRole('tab', { name: 'Vender' }).click()
  await expect(page.getByText(/No compra: .*Flecha/)).toBeVisible()
  await page.getByLabel('Cuántos Espada larga vender').fill('1')
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

test('a Player without the shops module sees why', async ({ page }) => {
  await identityFixture(page, { player: true, inventory: true })
  await page.goto(shops)
  await expect(page.getByText('El DM todavía no ha abierto las tiendas.')).toBeVisible()
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
  await expect(page.getByText('Los jugadores aún no ven Tiendas')).toBeVisible()
  const list = page.getByRole('navigation', { name: 'Tiendas' })
  await expect(list.getByRole('button', { name: /Bóveda del contrabandista/ })).toContainText(
    'Oculta',
  )
  await expect(page.getByRole('button', { name: /Anillo de la marea/ })).toContainText('Solo Arin')
  await audit(page, info.outputPath('admin-shops.png'))

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
  await expect(potionRow).toContainText('56 po')

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
  await pending.getByRole('button', { name: 'Mitad: 18' }).click()
  await audit(page, info.outputPath('counter.png'))
  await pending.getByRole('button', { name: 'Contraofertar 36 po' }).click()
  await expect(pending).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: 'Contraoferta enviada' })).toBeVisible()
  // The countered order stays in view as a counter-offer: asked total struck, new total shown.
  await expect(pending).toHaveClass(/order-counter/)
  await expect(pending.locator('.order-kind')).toHaveText('Contraoferta de compra')
  await expect(pending.locator('.order-flow')).toContainText('36 po')
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
