import { expect, type Locator, type Page } from '@playwright/test'

/** The storeroom's ⋯ menu: New item and Manage catalogue (RYT-181). */
export const storeMenu = (page: Page, es = true) =>
  page.getByRole('button', { name: es ? 'Acciones del almacén' : 'Storeroom actions' })

export async function storeAction(page: Page, action: 'new' | 'manage', es = true) {
  await storeMenu(page, es).click()
  const label =
    action === 'new'
      ? es
        ? 'Nuevo objeto'
        : 'New item'
      : es
        ? 'Gestionar catálogo'
        : 'Manage catalogue'
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

/** The row of an item in the list: one button that opens the item sheet. */
export const itemRow = (page: Page, name: string): Locator =>
  page.locator('.store-row').filter({ hasText: name }).first()

/** Opens the item sheet of a row and returns it. */
export async function openItem(page: Page, name: string) {
  await expect(itemRow(page, name)).toBeVisible()
  await itemRow(page, name).getByRole('button').click()
  await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible()
  // The sheet's title changes on the give step, so later steps hold the dialog itself.
  return page.getByRole('dialog')
}

/** Opens an item's sheet and chooses an entry of its ⋯ menu ("Eliminar", "Fusionar con…"). */
export async function itemMenu(page: Page, name: string, label: string) {
  const sheet = await openItem(page, name)
  await sheet.getByRole('button', { name: `Más acciones para ${name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

/** The item sheet's Edit button: opens the forge as before. */
export async function editItem(page: Page, name: string) {
  const sheet = await openItem(page, name)
  await sheet.getByRole('button', { name: 'Editar', exact: true }).click()
}

/** Row, Give, character, Give to {character}: the four taps of giving one item. */
export async function giveItem(page: Page, name: string, character: string) {
  const sheet = await openItem(page, name)
  await sheet.getByRole('button', { name: 'Dar', exact: true }).click()
  await sheet.getByRole('radio', { name: character, exact: true }).check()
  await sheet.getByRole('button', { name: `Dar a ${character}`, exact: true }).click()
}
