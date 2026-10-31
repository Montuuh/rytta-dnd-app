import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId } from './fixtures/identity.ts'

const url = `./#/campaign/${campaignId}/inventory`
async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  for (const control of await page
    .locator(
      'main button:visible, main label.portrait-edit:visible, [role="dialog"] button:visible, .undo-fuse button:visible',
    )
    .all()) {
    const box = await control.boundingBox()
    expect(
      box!.height,
      await control.evaluate((el) => el.outerHTML.slice(0, 200)),
    ).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path, fullPage: true })
}

for (const [language, scheme] of [
  ['es', 'dark'],
  ['en', 'light'],
] as const)
  test(`${language} ${scheme} satchel, card, use and undo at 150%`, async ({ page }, info) => {
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
    const potion = page.getByRole('button', { name: /Poción de curación, 3/ })
    await expect(potion).toBeVisible()
    await page.addStyleTag({ content: 'html { font-size: 150%; }' })
    await expect(page.getByRole('meter')).toHaveAttribute('aria-valuemax', '210')
    await audit(page, info.outputPath(`satchel-${language}-${scheme}-150.png`))
    await potion.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, info.outputPath(`card-${language}-${scheme}-150.png`))
    const seal = page.getByRole('button', { name: es ? /Usar un Poción/ : /Use one Poción/ })
    await seal.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.undo-fuse')).toContainText(es ? 'Has usado' : 'You used')
    await expect(page.getByText('×2')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Poción de curación, 2/ })).toBeFocused()
    await audit(page, info.outputPath(`fuse-${language}-${scheme}-150.png`))
    await page
      .locator('.undo-fuse')
      .getByRole('button', { name: es ? /Deshacer/ : /Undo/ })
      .click()
    await expect(page.getByRole('button', { name: /Poción de curación, 3/ })).toBeVisible()
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

test('equipping through the card and the paper doll updates AC and attacks', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.goto(url)
  await page.getByRole('button', { name: /Espada larga, 1/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Equipar' }).click()
  await expect(page.getByText('Espada larga equipado en Mano principal.')).toBeVisible()
  await page.locator('.view-switch').getByText('Equipo', { exact: true }).click()
  await expect(page.locator('.attack-lines')).toContainText('Espada larga')
  await expect(page.locator('.attack-lines')).toContainText('+5')
  await page.getByRole('button', { name: 'Mano secundaria: vacío' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Escudo' }).click()
  await expect(page.getByRole('img', { name: 'Clase de Armadura 16' })).toBeVisible()
  await expect(page.locator('.attack-lines')).not.toContainText('a dos manos')
  await page.getByRole('button', { name: 'Anillo izquierdo: vacío' }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Anillo de la marea' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Anillo izquierdo: vacío' })).toBeFocused()
  await page.screenshot({ path: info.outputPath('doll-equipped.png'), fullPage: true })
})

test('hold-to-use needs a sustained press; a tap does nothing', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  await page.goto(url)
  await page.getByRole('button', { name: /Poción de curación, 3/ }).click()
  const seal = page.getByRole('button', { name: /Usar un Poción/ })
  await seal.click()
  await expect(page.getByText('×3')).toBeVisible()
  const box = (await seal.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect(page.getByText('×2')).toBeVisible()
})

test('the DM forges from an SRD template, gives it out and sees the hidden-module note', async ({
  page,
}, info) => {
  await identityFixture(page, { sheet: 'complete' })
  await page.goto(url)
  await expect(
    page.getByText('Los jugadores todavía no ven este módulo.', { exact: false }),
  ).toBeVisible()
  await page.locator('.view-switch').getByText('Almacén', { exact: true }).click()
  await page.getByRole('button', { name: 'Forjar objeto' }).first().click()
  await page.getByRole('combobox', { name: 'Partir de una plantilla del SRD' }).click()
  await page.getByRole('option', { name: 'Daga' }).click()
  await expect(page.getByLabel('Nombre')).toHaveValue('Daga')
  await expect(page.getByLabel('Dados de daño')).toHaveValue('1d4')
  await page.getByRole('button', { name: 'Arin', exact: true }).click()
  await audit(page, info.outputPath('forge.png'))
  await page.getByRole('dialog').getByRole('button', { name: 'Forjar objeto' }).click()
  await expect(page.getByText('Daga forjado.')).toBeVisible()
  await page.locator('.view-switch').getByText('Mochila', { exact: true }).click()
  await expect(page.getByRole('button', { name: /Daga, 1/ })).toBeVisible()
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
  await expect(page.getByRole('img', { name: 'Retrato de Arin' }).first()).toBeVisible()
})
