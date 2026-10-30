import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from './fixtures/identity.ts'

const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
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

test('the assigned Player creates a 5.5e character through the wizard', async ({ page }, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('link', { name: 'Crear tu personaje' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase y nivel')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('alert')).toContainText('Elige una clase.')
  await audit(page, info.outputPath('wizard-class-error.png'))
  await page.getByRole('radio', { name: /Bardo/ }).check()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  await expect(page.getByText('Borrador guardado.', { exact: false })).toBeVisible()
  await page.getByLabel('Especie').selectOption('elf')
  await page.getByLabel('Trasfondo').selectOption('sage')
  await expect(page.getByText('Dote: Iniciado en la magia (mago).', { exact: false })).toBeVisible()
  await page.getByLabel('Aumento de Inteligencia').selectOption('2')
  await page.getByLabel('Aumento de Sabiduría').selectOption('1')
  await audit(page, info.outputPath('wizard-origin.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Características')
  await audit(page, info.outputPath('wizard-abilities.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('0 de 3 elegidas')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Arcanos', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Arcanos', exact: true })).toBeDisabled()
  for (const skill of ['Interpretación', 'Persuasión', 'Engaño'])
    await page.getByRole('checkbox', { name: skill, exact: true }).check()
  await expect(page.getByRole('checkbox', { name: 'Sigilo', exact: true })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Pericia en Interpretación' }).check()
  await audit(page, info.outputPath('wizard-skills.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('Sugerido: 9 (media fija)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Usar sugerido' })).toBeDisabled()
  await page.getByLabel('Puntos de golpe máximos').fill('12')
  await page.getByRole('button', { name: 'Usar sugerido' }).click()
  await expect(page.getByLabel('Puntos de golpe máximos')).toHaveValue('9')
  await audit(page, info.outputPath('wizard-combat.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conjuros')
  await page.getByRole('button', { name: 'Añadir conjuro' }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('alert')).toContainText('Pon nombre a cada conjuro')
  await page.getByLabel('Nombre del conjuro').fill('Burla cruel')
  await audit(page, info.outputPath('wizard-spells.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('Bardo de nivel 1, Elfo, trasfondo Sabio.')).toBeVisible()
  await audit(page, info.outputPath('wizard-details.png'))
  await page.getByRole('button', { name: 'Terminar personaje' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Arin' })).toBeVisible()
  await expect(page.locator('.hp-current')).toHaveText('9')
  await expect(page.getByText('Bardo de nivel 1', { exact: false })).toBeVisible()
})

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const)
    test(`${language} ${scheme} character sheet at 150%`, async ({ page }, info) => {
      await page.addInitScript(
        ({ language, scheme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-color-scheme', scheme)
        },
        { language, scheme },
      )
      const fixture = await identityFixture(page, { player: true, sheet: 'complete' })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(sheetUrl)
      await expect(page.locator('.hp-current')).toHaveText('30')
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      const es = language === 'es'
      await audit(page, info.outputPath(`sheet-summary-${language}-${scheme}-150.png`))
      const damage = page.getByRole('button', { name: es ? 'Daño' : 'Damage', exact: true })
      await damage.click()
      await page.getByRole('dialog').getByRole('textbox').fill('8')
      await audit(page, info.outputPath(`sheet-damage-${language}-${scheme}-150.png`))
      await page
        .getByRole('dialog')
        .getByRole('button', { name: es ? 'Aplicar' : 'Apply' })
        .click()
      await expect(page.locator('.hp-current')).toHaveText('27')
      await expect(damage).toBeFocused()
      for (const tab of es ? ['Rasgos', 'Conjuros', 'Notas'] : ['Features', 'Spells', 'Notes']) {
        await page.getByRole('tab', { name: tab }).click()
        await audit(page, info.outputPath(`sheet-${tab}-${language}-${scheme}-150.png`))
      }
      await page.getByRole('tab', { name: es ? 'Conjuros' : 'Spells' }).click()
      await page
        .getByRole('button', { name: es ? 'Gastar un espacio de nivel 1' : 'Spend a level 1 slot' })
        .first()
        .click()
      await expect(page.getByText('2/4')).toBeVisible()
      fixture.staleVitals()
      await page
        .getByRole('button', { name: es ? 'Gastar un espacio de nivel 1' : 'Spend a level 1 slot' })
        .first()
        .click()
      await expect(page.getByRole('alert')).toContainText(
        es ? 'La ficha cambió en otro dispositivo' : 'This sheet changed on another device',
      )
      await page.getByRole('tab', { name: es ? 'Rasgos' : 'Features' }).click()
      const longRest = page.getByRole('button', { name: es ? 'Descanso largo' : 'Long rest' })
      await longRest.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })

test('DM sees every sheet and Party summaries; unknown characters are not found', async ({
  page,
}, info) => {
  await identityFixture(page, { sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByText('Bardo de nivel 5')).toBeVisible()
  await expect(page.getByText('PG 30/38 +5')).toBeVisible()
  await page.screenshot({ path: info.outputPath('party-summary.png'), fullPage: true })
  await page.getByRole('link', { name: 'Ver ficha' }).click()
  await expect(page.getByRole('link', { name: 'Editar ficha' })).toBeVisible()
  await page.getByRole('link', { name: 'Editar ficha' }).click()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Detalles y revisión' }).click()
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  await audit(page, info.outputPath('wizard-edit.png'))
  await page.goto(`./#/campaign/${campaignId}/party/40000000-0000-4000-8000-000000000099`)
  await expect(page.getByText('Este personaje no existe o no tienes acceso.')).toBeVisible()
})
