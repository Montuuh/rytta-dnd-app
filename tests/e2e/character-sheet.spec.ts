import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId, sampleSheet } from './fixtures/identity.ts'
import { expectTouchTargets, capture, limitMatrix } from './fixtures/audit.ts'

const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
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

test('the assigned Player creates a 5.5e character through the full wizard', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  // RYT-072: the sheet action opens the three doors over the party list (RYT-097 wording).
  const create = page.getByRole('button', { name: 'Terminar ficha' })
  await create.click()
  const doors = page.getByRole('dialog', { name: 'Nueva ficha para Arin' })
  await expect(doors.getByRole('radio', { name: /^Rápida/ })).toBeChecked()
  await audit(page, info.outputPath('doors.png'))
  await page.keyboard.press('Escape')
  await expect(create).toBeFocused()
  await create.click()
  await doors.getByText('Completa', { exact: true }).click()
  await expect(doors.getByRole('radio', { name: /^Completa/ })).toBeChecked()
  await doors.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase y nivel')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page).toHaveTitle('Editor de ficha · Rytta')
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('alert')).toContainText('Elige una clase.')
  await audit(page, info.outputPath('wizard-class-error.png'))
  // RYT-112: classes are picture cards; the radio sits visually hidden inside its label.
  await page.locator('label.class-pick').filter({ hasText: /Mago/ }).click()
  await expect(page.getByRole('radio', { name: /Mago/ })).toBeChecked()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  await page.getByRole('button', { name: 'Guardar y salir' }).click()
  await expect(page.getByText('Arin todavía no tiene la ficha terminada.')).toBeVisible()
  await page.getByRole('link', { name: 'Continuar ficha' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  await page.getByRole('button', { name: 'Anterior' }).click()
  // RYT-112: classes are picture cards; the radio sits visually hidden inside its label.
  await page.locator('label.class-pick').filter({ hasText: /Bardo/ }).click()
  await expect(page.getByRole('radio', { name: /Bardo/ })).toBeChecked()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  await expect(page.getByText('Borrador guardado.', { exact: false })).toBeVisible()
  await page.getByLabel('Especie').selectOption('elf')
  await page.getByLabel('Trasfondo').selectOption('sage')
  await expect(page.getByText('Dote: Iniciado en la magia (mago).', { exact: false })).toBeVisible()
  await page.getByLabel('Aumento de Inteligencia').selectOption('2')
  await page.getByLabel('Aumento de Sabiduría').selectOption('1')
  // RYT-111: the elven lineage is asked here and the step cannot be left without it.
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByText('Elige una opción de tu especie.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  const lineage = page.getByRole('radiogroup', { name: 'Linaje élfico' })
  await expect(lineage.getByRole('radio')).toHaveCount(3)
  await expect(lineage).toContainText('prestidigitación')
  await lineage.getByRole('radio', { name: 'Alto elfo' }).check()
  await expect(page.getByText('Elige una opción de tu especie.')).toHaveCount(0)
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

test('RYT-072 quick sheet: class, species and name, then the sheet', async ({ page }, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.getByRole('radiogroup', { name: 'Clase' }).getByText('Monje', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /^Monje/ })).toBeChecked()
  await audit(page, info.outputPath('quick-class.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Especie')
  // Nothing is pre-chosen (RYT-124): Next asks for the species first.
  await expect(page.getByRole('radio', { name: /^Humano/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('alert')).toContainText('Elige una especie')
  await page
    .getByRole('radiogroup', { name: 'Especie' })
    .getByText('Humano', { exact: true })
    .click()
  await expect(page.getByRole('radio', { name: /^Humano/ })).toBeChecked()
  await expect(page.getByText('30 pies · ', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nombre y retrato')
  const name = page.getByLabel('Nombre del personaje')
  await name.fill('')
  await expect(page.getByRole('button', { name: 'Crear ficha' })).toBeDisabled()
  await name.fill('Ilsa Brezo')
  const summary = page.getByRole('region', { name: 'Lo que ha preparado Rytta' })
  await expect(summary).toContainText('Humano, Criminal')
  await expect(summary).toContainText('Artes marciales')
  await audit(page, info.outputPath('quick-name.png'))
  await page.getByRole('button', { name: 'Crear ficha' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ilsa Brezo' })).toBeVisible()
  await expect(page.getByText('Monje de nivel 1', { exact: false })).toBeVisible()
  await expect(page.locator('.hp-current')).toHaveText('10')
})

test('RYT-072 blank sheet: name, class and level only', async ({ page }, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByText('En blanco', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ficha en blanco')
  await page.getByRole('combobox', { name: 'Clase' }).click()
  await page.getByRole('option', { name: 'Paladín' }).click()
  for (let step = 0; step < 4; step++)
    await page.getByRole('button', { name: 'Subir nivel' }).click()
  await expect(page.locator('.stepper-value')).toHaveText('5')
  await audit(page, info.outputPath('blank.png'))
  await page.getByRole('button', { name: 'Crear ficha' }).click()
  await expect(page.getByText('Paladín de nivel 5', { exact: false })).toBeVisible()
  // RYT-071: class resources follow the level (Lay on Hands = 5 × level, as a counter).
  const resources = page.getByRole('button', { name: /^Recursos/ })
  await expect(resources).toContainText('Imponer las manos')
  await expect(resources).toContainText('25/25')
})

for (const language of ['es', 'en'] as const)
  for (const scheme of ['dark', 'light'] as const)
    test(`${language} ${scheme} character sheet at 150%`, async ({ page }, info) => {
      limitMatrix(info, language === 'es' && scheme === 'dark')
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
      await audit(page, info.outputPath(`sheet-panel-${language}-${scheme}-150.png`))
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
      // RYT-073: each tile opens its block in a sheet; Escape returns focus to the tile.
      for (const tile of es
        ? ['Recursos', 'Habilidades', 'Rasgos y dotes', 'Conjuros', 'Notas']
        : ['Resources', 'Skills', 'Features and feats', 'Spells', 'Notes']) {
        const opener = page.getByRole('button', { name: new RegExp(`^${tile}`) })
        await opener.click()
        await expect(page.getByRole('dialog', { name: tile })).toBeVisible()
        await audit(page, info.outputPath(`sheet-${tile}-${language}-${scheme}-150.png`))
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(opener).toBeFocused()
      }
      await page
        .getByRole('button', { name: new RegExp(`^${es ? 'Recursos' : 'Resources'}`) })
        .click()
      const spend = page.getByRole('button', {
        name: es ? 'Gastar un espacio de nivel 1' : 'Spend a level 1 slot',
      })
      await spend.first().click()
      await expect(page.getByRole('dialog').getByText('2/4')).toBeVisible()
      fixture.staleVitals()
      await spend.first().click()
      const stale = es
        ? 'La ficha cambió en otro dispositivo'
        : 'This sheet changed on another device'
      // The error shows inside the open sheet, then on the page once the sheet closes.
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText(stale)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('alert')).toContainText(stale)
      // RYT-080: a rest is asked of the group; Arin is the only character at the table, so the
      // requester's own yes settles it at once.
      const longRest = page.getByRole('button', { name: es ? 'Descanso largo' : 'Long rest' })
      await longRest.click()
      await expect(
        page.getByRole('dialog', {
          name: es ? '¿Pedir un descanso largo al grupo?' : 'Ask the group for a long rest?',
        }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(longRest).toBeFocused()
      await longRest.click()
      await page
        .getByRole('dialog')
        .getByRole('button', { name: es ? 'Pedir descanso' : 'Ask for the rest' })
        .click()
      const panel = page.getByRole('dialog', { name: es ? 'Descanso del grupo' : 'Group rest' })
      await expect(
        panel.getByRole('heading', { name: es ? 'El grupo ha descansado' : 'The group rested' }),
      ).toBeVisible()
      await audit(page, info.outputPath(`rest-done-${language}-${scheme}-150.png`))
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(longRest).toBeFocused()
      await expect(page.locator('.hp-current')).toHaveText('38')
      await expect(page).toHaveTitle(es ? 'Ficha de personaje · Rytta' : 'Character sheet · Rytta')
    })

test('DM sees every sheet and Party summaries, edits in place; unknown characters are not found', async ({
  page,
}, info) => {
  await identityFixture(page, { sheet: 'complete' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await expect(page.getByText('Bardo de nivel 5')).toBeVisible()
  // RYT-097: the DM plate reads HP as one meter and its name opens the sheet.
  await expect(
    page.getByRole('img', { name: '30 de 38 puntos de golpe, +5 temporales' }),
  ).toBeVisible()
  await capture(page, info.outputPath('party-summary.png'))
  await page.getByRole('link', { name: 'Arin', exact: true }).click()
  // RYT-073 (P12): the pencil edits the sheet in place and saves once.
  const pencil = page.getByRole('button', { name: 'Editar la ficha' })
  await pencil.click()
  const bar = page.getByRole('region', { name: 'Editando la ficha' })
  await expect(bar).toBeVisible()
  await page.getByRole('button', { name: 'Subir nivel' }).click()
  await page.getByRole('button', { name: 'Subir puntuación de Sabiduría' }).click()
  await audit(page, info.outputPath('sheet-edit.png'))
  await bar.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(bar).toHaveCount(0)
  await expect(page.getByText('Bardo de nivel 6', { exact: false })).toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/party/40000000-0000-4000-8000-000000000099`)
  await expect(page.getByText('Este personaje no existe o no tienes acceso.')).toBeVisible()
})

test('RYT-070 a Player in a live encounter cannot change HP or rest', async ({ page }, info) => {
  await identityFixture(page, { player: true, sheet: 'complete', inEncounter: true })
  await page.goto(sheetUrl)
  await expect(page.getByRole('note')).toContainText('Hay un encuentro en curso')
  await expect(page.getByRole('button', { name: 'Daño', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Descanso largo' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await audit(page, info.outputPath('sheet-locked.png'))
  await page.getByRole('button', { name: /^Recursos/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.locator('section', { hasText: 'Dados de golpe' }).locator('.pip').first(),
  ).toBeDisabled()
  // Resources stay with the Player during the fight.
  await dialog.getByRole('button', { name: 'Gastar un espacio de nivel 1' }).first().click()
  await expect(dialog.getByText('2/4')).toBeVisible()
})

test('RYT-071/073 personalise blocks and resources, add from the library, read the history', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.hp-current')).toHaveText('30')
  const personalise = page.getByRole('button', { name: 'Personalizar la ficha' })
  await personalise.click()
  const drawer = page.getByRole('dialog', { name: 'Personalizar la ficha' })
  await drawer.getByRole('switch', { name: 'Notas' }).dispatchEvent('click')
  await expect(page.getByRole('button', { name: /^Notas/ })).toHaveCount(0)
  await drawer.getByLabel('Nombre del contador').fill('Suerte')
  await drawer
    .locator('label')
    .filter({ hasText: /^Contador$/ })
    .click()
  await audit(page, info.outputPath('personalise.png'))
  await drawer.getByRole('button', { name: 'Añadir recurso' }).click()
  await expect(page.getByRole('button', { name: /^Recursos/ })).toContainText('Suerte')
  await page.keyboard.press('Escape')
  await expect(personalise).toBeFocused()
  await page.getByRole('button', { name: /^Conjuros/ }).click()
  await page.getByRole('button', { name: 'Añadir desde la biblioteca' }).click()
  const library = page.getByRole('dialog', { name: 'Biblioteca' })
  await library.getByLabel('Buscar').fill('curar heridas')
  await audit(page, info.outputPath('library.png'))
  await library.getByRole('button', { name: 'Añadir Curar heridas', exact: true }).click()
  // aria-disabled keeps keyboard focus on the row once it is added.
  await expect(
    library.getByRole('button', { name: 'Curar heridas ya está en la ficha', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Conjuros' })).toContainText('Curar heridas')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Historial/ }).click()
  const history = page.getByRole('dialog', { name: 'Historial' })
  await expect(history).toContainText('Conjuros: añadido Curar heridas')
  await expect(history).toContainText('Tú')
  await audit(page, info.outputPath('history.png'))
})

test('RYT-025 sheet widgets: HP number pad, hit-die pips and condition chips', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.hp-current')).toHaveText('30')
  // The ring is the quickest way to the pad (RYT-124): it opens the damage tab.
  await page.getByRole('button', { name: /30 de 38.*abrir/ }).click()
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Daño' })).toBeChecked()
  await page.keyboard.press('Escape')
  const damage = page.getByRole('button', { name: 'Daño', exact: true })
  await damage.click()
  const dialog = page.getByRole('dialog')
  const pad = dialog.getByRole('group', { name: 'Teclado numérico' })
  await pad.getByRole('button', { name: '1', exact: true }).click()
  await pad.getByRole('button', { name: '2', exact: true }).click()
  await expect(dialog.getByRole('textbox')).toHaveValue('12')
  await expect(dialog.getByText('Quedará en 23/38 PG')).toBeVisible()
  await dialog
    .getByRole('group', { name: 'Cantidades rápidas' })
    .getByRole('button', { name: '−5' })
    .click()
  await expect(dialog.getByRole('textbox')).toHaveValue('17')
  await pad.getByRole('button', { name: 'Borrar último dígito' }).click()
  await expect(dialog.getByRole('textbox')).toHaveValue('1')
  await dialog
    .locator('.hp-mode label')
    .filter({ hasText: /^Curar$/ })
    .click()
  await pad.getByRole('button', { name: 'Borrar', exact: true }).click()
  await pad.getByRole('button', { name: '5', exact: true }).click()
  await expect(dialog.getByText('Quedará en 35/38 PG')).toBeVisible()
  await capture(page, info.outputPath('hp-keypad.png'))
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await expect(page.locator('.hp-current')).toHaveText('35')
  await expect(damage).toBeFocused()

  await page.getByRole('button', { name: /^Recursos/ }).click()
  const dice = page.getByRole('dialog').locator('section', { hasText: 'Dados de golpe' })
  // RYT-124: outside a rest the dice only show; a tap would spend one without healing.
  await expect(dice.locator('.pip-count')).toHaveText('5/5')
  await expect(dice.locator('.pip:not([disabled])')).toHaveCount(0)
  await expect(dice).toContainText(/se gastan en un descanso corto/)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Condiciones/ }).click()

  // RYT-112: the conditions are a grid of toggle buttons (icon and name) in a fixed order.
  const grid = page.getByRole('dialog').locator('.condition-grid')
  const orderBefore = await grid.locator('button').allInnerTexts()
  const poisoned = page.getByRole('button', { name: 'Envenenado', exact: true })
  await expect(poisoned).toHaveAttribute('aria-pressed', 'false')
  await poisoned.click()
  await expect(poisoned).toHaveAttribute('aria-pressed', 'true')
  // The toggled condition keeps its place (a tap never lands on a moved control) and its focus.
  expect(await grid.locator('button').allInnerTexts()).toEqual(orderBefore)
  await expect(poisoned).toBeFocused()
  await expect(page.getByRole('dialog').locator('.condition-links')).toContainText('Envenenado')
  // An active toggle is tinted with the accent and keeps AA text contrast in dark and light themes. Each theme is set with its own scheme (RYT-069).
  for (const [scheme, theme] of [
    ['dark', 'default'],
    ['light', 'parchment'],
    ['light', 'warlock'],
    ['dark', 'druid'],
  ] as const) {
    await page.locator('html').evaluate(
      (el, [s, t]) => {
        el.setAttribute('data-mantine-color-scheme', s)
        el.setAttribute('data-rytta-theme', t)
      },
      [scheme, theme] as const,
    )
    expect(
      (
        await new AxeBuilder({ page })
          .include('.condition-grid')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
      `${scheme} ${theme}`,
    ).toEqual([])
  }
})

test('RYT-099 a large photo is saved as a sharp 1024px portrait under 1 MB', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.goto(sheetUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arin')
  // A 2400x1600 photo with fine detail, drawn in the page (no binary fixture in the repository).
  const photo = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1600
    const context = canvas.getContext('2d')!
    const gradient = context.createLinearGradient(0, 0, 2400, 1600)
    gradient.addColorStop(0, '#6e3410')
    gradient.addColorStop(1, '#f6c478')
    context.fillStyle = gradient
    context.fillRect(0, 0, 2400, 1600)
    context.strokeStyle = '#140f0b'
    for (let x = 0; x < 2400; x += 6) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x + 400, 1600)
      context.stroke()
    }
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png'),
    )
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })
  const uploaded = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/storage/v1/object/character-portraits/'),
  )
  await page.locator('.sheet-plate input[type=file]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64'),
  })
  const editor = page.getByRole('dialog', { name: 'Retrato de Arin' })
  await editor.getByRole('button', { name: 'Guardar retrato' }).click()
  const request = await uploaded
  const body = request.postDataBuffer()!
  // The upload is multipart: take the WebP file out of it by its RIFF header.
  const start = body.indexOf('RIFF')
  expect(start).toBeGreaterThanOrEqual(0)
  const webp = body.subarray(start, start + 8 + body.readUInt32LE(start + 4))
  expect(webp.subarray(8, 12).toString()).toBe('WEBP')
  expect(webp.length).toBeLessThanOrEqual(1_048_576)
  const size = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }))
    return { width: bitmap.width, height: bitmap.height }
  }, webp.toString('base64'))
  expect(size).toEqual({ width: 1024, height: 1024 })
  await expect(editor).toHaveCount(0)
})

test('RYT-099 cancelling while the portrait is being prepared uploads nothing', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.goto(sheetUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arin')
  const uploads: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/storage/v1/object/character-portraits/'))
      uploads.push(request.url())
  })
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
    'base64',
  )
  await page.locator('.sheet-plate input[type=file]').setInputFiles({
    name: 'arin.png',
    mimeType: 'image/png',
    buffer: png,
  })
  const editor = page.getByRole('dialog', { name: 'Retrato de Arin' })
  await expect(editor.getByRole('button', { name: 'Guardar retrato' })).toBeEnabled()
  // Save, then Cancel in the same moment: the picture is still being encoded when the editor closes.
  await editor.evaluate((node) => {
    const button = (text: string) =>
      [...node.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
    button('Guardar retrato').click()
    button('Cancelar').click()
  })
  await expect(editor).toHaveCount(0)
  await page.waitForTimeout(1000)
  expect(uploads).toEqual([])
  await expect(page.getByText('Añadir retrato')).toBeVisible()
})

test('RYT-090 the portrait plate leads the sheet: add, view, remove and inspiration', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arin')
  const inspiration = page.getByRole('button', { name: 'Inspiración heroica' })
  await expect(inspiration).toHaveAttribute('aria-pressed', 'false')
  await inspiration.click()
  await expect(inspiration).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Añadir retrato')).toBeVisible()
  await audit(page, info.outputPath('sheet-plate-empty.png'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
    'base64',
  )
  await page.locator('.sheet-plate input[type=file]').setInputFiles({
    name: 'arin.png',
    mimeType: 'image/png',
    buffer: png,
  })
  const editor = page.getByRole('dialog', { name: 'Retrato de Arin' })
  await editor.getByRole('button', { name: 'Guardar retrato' }).click()
  await expect(editor).toHaveCount(0)
  const plate = page.getByRole('button', { name: 'Ver el retrato de Arin' })
  await expect(plate).toBeFocused()
  await plate.click()
  const viewer = page.getByRole('dialog', { name: 'Arin' })
  await expect(viewer.getByRole('img', { name: 'Retrato de Arin' })).toBeVisible()
  await audit(page, info.outputPath('sheet-plate-viewer.png'))
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(plate).toBeFocused()
  await plate.click()
  await viewer.getByRole('button', { name: 'Quitar retrato' }).click()
  await expect(viewer.getByText('¿Quitar el retrato de Arin?')).toBeVisible()
  await viewer.getByRole('button', { name: 'Sí, quitar' }).click()
  await expect(viewer).toHaveCount(0)
  await expect(page.getByText('Añadir retrato')).toBeVisible()
  await expect(page.locator('.sheet-plate input[type=file]')).toBeFocused()
  // At 150% text the plate grows and the ring stays inside the hero, never clipped.
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const hero = await page.locator('.panel-hero').boundingBox()
  const ring = await page.locator('.sheet-ring').boundingBox()
  // J2-41: "Add portrait" is a camera badge; it keeps its name and a 44px target.
  await expect(page.getByLabel('Añadir retrato')).toHaveCount(1)
  const add = await page.locator('.portrait-plate-camera').boundingBox()
  expect(add!.width).toBeGreaterThanOrEqual(44)
  expect(add!.height).toBeGreaterThanOrEqual(44)
  const name = await page.locator('#sheet-name').boundingBox()
  expect(ring!.x + ring!.width).toBeLessThanOrEqual(hero!.x + hero!.width)
  expect(add!.y + add!.height).toBeLessThanOrEqual(name!.y)
  await audit(page, info.outputPath('sheet-plate-150.png'))
})

test('RYT-098 the portrait opens in the full-screen viewer: double tap and pinch zoom, the same curtain in Parchment', async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem('rytta-theme', 'parchment'))
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Arin')
  await page.locator('.sheet-plate input[type=file]').setInputFiles({
    name: 'arin.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByRole('button', { name: 'Guardar retrato' }).click()
  const plate = page.getByRole('button', { name: 'Ver el retrato de Arin' })
  await expect(plate).toBeFocused()
  await expect(plate).toHaveAttribute('aria-haspopup', 'dialog')

  await plate.click()
  const viewer = page.getByRole('dialog', { name: 'Arin', exact: true })
  const picture = viewer.getByRole('img', { name: 'Retrato de Arin' })
  // The whole picture, never cropped, on a dark curtain even in a light theme; no animation with
  // reduced motion.
  await expect(picture).toHaveCSS('object-fit', 'contain')
  expect(
    await picture.evaluate((img) => parseFloat(getComputedStyle(img).transitionDuration)),
  ).toBeLessThan(0.001)
  await expect(viewer).toHaveCSS('background-color', 'rgb(13, 10, 7)')
  await expect(viewer.getByRole('button', { name: 'Cerrar la imagen' })).toBeFocused()
  await audit(page, info.outputPath('viewer-parchment.png'))
  await expectTouchTargets(page, '.image-viewer-content button:visible')

  const scale = () => picture.evaluate((img) => new DOMMatrix(getComputedStyle(img).transform).a)
  const zoom = viewer.getByRole('button', { name: 'Ampliar' })
  await expect(zoom).toHaveAttribute('aria-pressed', 'false')
  // A double tap zooms 2× where it lands; another one shows the whole picture again.
  const stage = viewer.locator('.image-viewer-stage')
  const box = (await stage.boundingBox())!
  const at = { x: box.x + box.width / 2 + 30, y: box.y + box.height / 2 }
  await page.touchscreen.tap(at.x, at.y)
  await page.touchscreen.tap(at.x, at.y)
  await expect.poll(scale).toBe(2)
  await expect(zoom).toHaveAttribute('aria-pressed', 'true')
  await stage.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect.poll(scale).toBe(1)
  await expect(zoom).toHaveAttribute('aria-pressed', 'false')
  // Two fingers pinch between 1× and 4×.
  const pinch = (from: number, to: number) =>
    stage.evaluate(
      (node, [from, to]) => {
        const r = node.getBoundingClientRect()
        const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2]
        const fire = (type: string, pointerId: number, dx: number) =>
          node.dispatchEvent(
            new PointerEvent(type, {
              pointerId,
              pointerType: 'touch',
              isPrimary: pointerId === 1,
              clientX: cx + (pointerId === 1 ? -dx : dx),
              clientY: cy,
              bubbles: true,
            }),
          )
        fire('pointerdown', 1, from!)
        fire('pointerdown', 2, from!)
        fire('pointermove', 1, to!)
        fire('pointermove', 2, to!)
        fire('pointerup', 1, to!)
        fire('pointerup', 2, to!)
      },
      [from, to],
    )
  await pinch(40, 120)
  await expect.poll(scale).toBe(3)
  await pinch(20, 200)
  await expect.poll(scale).toBe(4)
  // The zoom key works from the keyboard too.
  await zoom.press('Enter')
  await expect.poll(scale).toBe(1)
  await zoom.press('Enter')
  await expect.poll(scale).toBe(2)

  // Escape closes the viewer and gives focus back to the portrait; it opens again whole.
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(plate).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(viewer).toBeVisible()
  await expect.poll(scale).toBe(1)

  // A double tap on Remove never removes: Keep takes Remove's place, so the second tap keeps it,
  // and the confirmation ignores taps for a moment after the question appears.
  const removals: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rpc/set_character_portrait')) removals.push(request.url())
  })
  const remove = viewer.getByRole('button', { name: 'Quitar retrato' })
  const removeBox = (await remove.boundingBox())!
  const middle = { x: removeBox.x + removeBox.width / 2, y: removeBox.y + removeBox.height / 2 }
  await page.touchscreen.tap(middle.x, middle.y)
  await page.touchscreen.tap(middle.x, middle.y)
  await expect(remove).toBeVisible()
  await remove.dblclick()
  await expect(remove).toBeVisible()
  // The confirmation ignores taps for a moment after the question appears. Open the question and
  // tap the confirmation inside the page, well within that moment, so a slow runner cannot race it.
  const guarded = await viewer.evaluate(async (node) => {
    const button = (text: string) =>
      [...node.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
    button('Quitar retrato')!.click()
    for (let tries = 0; tries < 10 && !button('Sí, quitar'); tries++)
      await new Promise((resolve) => setTimeout(resolve, 0))
    const confirm = button('Sí, quitar')
    const state = confirm?.getAttribute('aria-disabled') ?? null
    confirm?.click()
    return state
  })
  expect(guarded).toBe('true')
  // Keep sits exactly where Remove was; the confirmation is the other slot.
  const keep = viewer.getByRole('button', { name: 'Mantener' })
  const confirm = viewer.getByRole('button', { name: 'Sí, quitar' })
  await expect(keep).toBeFocused()
  const keepBox = (await keep.boundingBox())!
  for (const side of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(keepBox[side] - removeBox[side])).toBeLessThan(1)
  await expect(confirm).toHaveCSS('opacity', '1')
  await expect(confirm).not.toHaveAttribute('aria-disabled')
  expect(removals).toEqual([])
  await expect(viewer.getByRole('img', { name: 'Retrato de Arin' })).toBeVisible()
  await keep.click()
  await expect(remove).toBeFocused()
  await viewer.getByRole('button', { name: 'Cerrar la imagen' }).click()
  await expect(viewer).toHaveCount(0)
  await expect(plate).toBeFocused()
})

test('RYT-101 blank sheet keeps species and background optional and lets the player edit identity and auto AC on the sheet', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByText('En blanco', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ficha en blanco')
  await page.getByRole('combobox', { name: 'Clase' }).click()
  await page.getByRole('option', { name: 'Guerrero' }).click()
  // RYT-130: a finished sheet changes level by leveling up, so the level is set while creating it.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Subir nivel' }).click()
  await page.getByRole('button', { name: 'Crear ficha' }).click()

  const completeOrigin = page.getByRole('button', { name: 'Completar especie y trasfondo' })
  await expect(completeOrigin).toBeVisible()
  await audit(page, info.outputPath('blank-unset-origin.png'))

  await completeOrigin.click()
  const bar = page.getByRole('region', { name: 'Editando la ficha' })
  await expect(bar).toBeVisible()
  await page.getByLabel('Nombre del personaje').fill('Kaelen Senda')
  await page.getByRole('combobox', { name: 'Clase', exact: true }).click()
  await page.getByRole('option', { name: 'Monje' }).click()
  await page.getByRole('combobox', { name: 'Especie', exact: true }).click()
  await page.getByRole('option', { name: 'Elfo' }).click()
  await page.getByRole('combobox', { name: 'Trasfondo', exact: true }).click()
  await page.getByRole('option', { name: 'Acólito' }).click()

  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Subir puntuación de Destreza' }).click()
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Subir puntuación de Sabiduría' }).click()
  await page.getByRole('button', { name: 'Subir Bonificador a la CA' }).click()
  await bar.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(bar).toHaveCount(0)

  await expect(page.getByRole('heading', { level: 1, name: 'Kaelen Senda' })).toBeVisible()
  await expect(page.locator('.sheet-plate-sub')).toContainText(/Monje de nivel 5\s+Elfo, Acólito/)
  await expect(completeOrigin).toHaveCount(0)

  const acButton = page.getByRole('button', { name: /Clase de Armadura 16/i })
  await expect(acButton).toContainText('10+3+2+1')
  const speedButton = page.getByRole('button', { name: /Velocidad 40 pies/ })
  await expect(speedButton).toContainText('30+10')

  await acButton.click()
  const acTooltip = page.locator('.stat-breakdown')
  await expect(acTooltip).toContainText('Defensa sin armadura (Monje: 10 + DES + SAB)')
  await expect(acTooltip).toContainText('Bonificador en ficha')
  await audit(page, info.outputPath('monk-ac-breakdown.png'))
  await page.keyboard.press('Escape')
  await expect(page.locator('.stat-breakdown')).toHaveCount(0)

  await speedButton.click()
  await expect(page.locator('.stat-breakdown')).toContainText('Movimiento sin armadura (Monje)')
  await page.keyboard.press('Escape')
  await expect(page.locator('.stat-breakdown')).toHaveCount(0)
})

test('RYT-101 equipped gear, attack bonuses and encumbrance flow into sheet breakdowns', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { player: true, sheet: 'complete', inventory: true })
  const byName = (name: string) => fixture.inventory.definitions.find((d) => d.name === name)!
  const leather = byName('Armadura de cuero')
  const shield = byName('Escudo')
  const sword = byName('Espada larga')
  const ring = byName('Anillo de la marea')
  // RYT-104: weight_lb is the source of truth; the server keeps weight_tenths in step.
  leather.weight_lb = 30
  leather.weight_tenths = 300
  ring.properties = { ...(ring.properties as Record<string, unknown>), acBonus: 1 }
  sword.properties = {
    ...(sword.properties as Record<string, unknown>),
    attackBonus: 1,
    damageBonus: 1,
  }
  for (const [def, slot] of [
    [shield, 'off_hand'],
    [sword, 'main_hand'],
    [ring, 'ring_1'],
  ] as const) {
    fixture.inventory.stacks.find((s) => s.definition_id === def.id)!.equipped_slot = slot
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)

  await page.getByRole('button', { name: 'Editar la ficha' }).click()
  const bar = page.getByRole('region', { name: 'Editando la ficha' })
  await page.getByRole('switch', { name: 'Fijar CA manual' }).click()
  await bar.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(bar).toHaveCount(0)

  const acButton = page.getByRole('button', { name: /Clase de Armadura 16/i })
  await expect(acButton).toContainText('13+2+1')
  const speedButton = page.getByRole('button', { name: /Velocidad 20 pies/ })
  await expect(speedButton).toContainText('30−10')

  await speedButton.click()
  await expect(page.locator('.stat-breakdown')).toContainText('Cargado (peso > 5 × FUE)')
  await page.keyboard.press('Escape')

  // J2-28: the tile and the block read one list, and the block labels attack and damage.
  const attacksTile = page.getByRole('button', { name: /^Ataques/ })
  const tileBonus = /Espada larga ([+-]\d+)/.exec((await attacksTile.textContent()) ?? '')?.[1]
  expect(tileBonus).toBeTruthy()
  await attacksTile.click()
  const attacksDrawer = page.getByRole('dialog', { name: 'Ataques' })
  await expect(attacksDrawer).toContainText('Espada larga')
  const longsword = attacksDrawer.locator('.attack-lines li', { hasText: 'Espada larga' })
  // RYT-133: with physical dice the block says what to roll: the same bonus as the tile.
  const formula = `d20 ${tileBonus!.startsWith('-') ? '−' : '+'} ${tileBonus!.slice(1)}`
  await expect(longsword.locator('.attack-bonus')).toContainText(`Ataque ${formula}`)
  await expect(longsword.locator('.attack-damage')).toContainText('Daño')
  await expect(attacksDrawer).toContainText('Objeto +1')
  await audit(page, info.outputPath('sheet-gear-attacks.png'))
})

/** A level 5 Goliath Monk with Savage Attacker, saved before its class resources existed. */
async function monkSheet(page: Page) {
  const base = sampleSheet()
  const row = {
    ...base,
    level: 5,
    build: {
      ...base.build,
      classKey: 'monk',
      classLabel: 'Monje',
      subclass: 'Mano Abierta',
      subclassKey: 'open-hand',
      speciesKey: 'goliath',
      speciesLabel: 'Goliat',
      backgroundKey: 'soldier',
      backgroundLabel: 'Soldado',
      casterKind: 'none',
      spellAbility: null,
      spells: [],
      hitDie: 8,
      speed: 35,
      choices: { giantAncestry: 'fire' },
      features: [
        { id: 'species-giantAncestry', name: 'Linaje gigante', source: 'species', description: '' },
        {
          id: 'background-savageAttacker',
          name: 'Atacante salvaje',
          source: 'feat',
          description: '',
        },
      ],
      trackers: [],
    } as Record<string, unknown>,
  }
  await page.route('https://rytta-test.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = url.pathname.split('/').pop()
    const select = url.searchParams.get('select') ?? ''
    if (
      method === 'character_sheets' &&
      route.request().method() === 'GET' &&
      select.includes('build')
    )
      return route.fulfill({
        json: [{ character_id: characterId, campaign_id: campaignId, ...row, portrait_path: null }],
      })
    if (method === 'save_character_sheet') {
      const body = route.request().postDataJSON()
      Object.assign(row, {
        level: body.new_level,
        max_hp: body.new_max_hp,
        armor_class: body.new_armor_class,
        build: body.new_build,
        revision: row.revision + 1,
      })
      return route.fulfill({ json: row.revision })
    }
    return route.fallback()
  })
}
/** A level 5 Sorcerer with its Sorcery Points tracker (RYT-110). */
async function sorcererSheet(page: Page) {
  const base = sampleSheet()
  const row = {
    ...base,
    level: 5,
    build: {
      ...base.build,
      classKey: 'sorcerer',
      classLabel: 'Hechicero',
      subclass: '',
      subclassKey: '',
      casterKind: 'full',
      spellAbility: 'cha',
      spells: [],
      hitDie: 6,
      trackers: [
        {
          id: 'tracker-sorcerer-sorcery-points',
          key: 'sorcerer-sorcery-points',
          name: 'Puntos de hechicería',
          max: 5,
          reset: 'long',
          display: 'counter',
        },
      ],
    } as Record<string, unknown>,
  }
  await page.route('https://rytta-test.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const method = url.pathname.split('/').pop()
    const select = url.searchParams.get('select') ?? ''
    if (
      method === 'character_sheets' &&
      route.request().method() === 'GET' &&
      select.includes('build')
    )
      return route.fulfill({
        json: [{ character_id: characterId, campaign_id: campaignId, ...row, portrait_path: null }],
      })
    if (method === 'save_character_sheet') {
      const body = route.request().postDataJSON()
      Object.assign(row, { build: body.new_build, revision: row.revision + 1 })
      return route.fulfill({ json: row.revision })
    }
    return route.fallback()
  })
}

test('RYT-110 Sorcerer: known Metamagic spends points and Font of Magic converts both ways', async ({
  page,
}, info) => {
  await identityFixture(page, { sheet: 'complete' })
  await sorcererSheet(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page
    .getByRole('button', { name: /^Recursos/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog')
  // Metamagic: two known at level 5; a third cannot be ticked.
  const metamagic = sheet.getByRole('region', { name: /Metamagia/ })
  await expect(metamagic).toContainText('0 de 2')
  // Saved at once: each tick waits for the save before the next.
  for (const name of [/Conjuro sutil/, /Conjuro acelerado/]) {
    await metamagic.getByRole('checkbox', { name }).click()
    await expect(metamagic.getByRole('checkbox', { name })).toBeChecked()
  }
  await expect(metamagic).toContainText('2 de 2')
  // All known: only the chosen ones stay listed; Change shows the rest, which cannot be ticked.
  await expect(metamagic.getByRole('checkbox', { name: /Conjuro gemelo/ })).toHaveCount(0)
  await metamagic.getByRole('button', { name: 'Cambiar Metamagia' }).click()
  await expect(metamagic.getByRole('checkbox', { name: /Conjuro gemelo/ })).toBeDisabled()
  await metamagic.getByRole('button', { name: 'Listo' }).click()
  const points = sheet.getByRole('region', { name: 'Puntos de hechicería' })
  const options = points.getByRole('list', { name: 'Opciones que gastan Puntos de hechicería' })
  await expect(options).toContainText('Conjuro sutil')
  await expect(options).toContainText('Conjuro acelerado')
  await expect(options).not.toContainText('Conjuro gemelo')
  await audit(page, info.outputPath('sorcerer-metamagic.png'))

  // Font of Magic: the sample has a spent level 1 slot, so the first slot refills it and the
  // second is an extra one; each costs 2 points.
  const font = page.getByRole('dialog', { name: 'Fuente de Magia' })
  const level = (n: number) => font.locator('label.cast-option', { hasText: `Nivel ${n}` })
  for (const left of ['3/5', '1/5']) {
    await points.getByRole('button', { name: 'Convertir' }).click()
    // Level 4 needs Sorcerer level 7, and an unaffordable level says why.
    await expect(level(4).locator('input')).toBeDisabled()
    await expect(level(4)).toContainText('Desde hechicero de nivel 7')
    await level(1).click()
    await audit(page, info.outputPath('sorcerer-font-of-magic.png'))
    await font.getByRole('button', { name: 'Crear un espacio de nivel 1' }).click()
    await expect(font).toBeHidden()
    await expect(points).toContainText(left)
  }
  // With 1 point left a level 1 slot cannot be paid; Escape closes only the dialog.
  await points.getByRole('button', { name: 'Convertir' }).click()
  await expect(level(1)).toContainText('Cuesta 2; te quedan 1')
  await page.keyboard.press('Escape')
  await expect(font).toBeHidden()
  await expect(sheet).toBeVisible()
  await expect(points.getByRole('button', { name: 'Convertir' })).toBeVisible()
  const created = sheet.getByRole('button', { name: /Usar un espacio creado de nivel 1/ })
  await expect(created).toHaveCount(1)
  await expect(sheet).toContainText('4/4 +1')
  await audit(page, info.outputPath('sorcerer-created-slot.png'))
  // Quickened needs 2 points and is refused with 1 left; Subtle spends the last one.
  await options.getByRole('button', { name: /^Usar Conjuro sutil/ }).click()
  await expect(points).toContainText('0/5')
  // The created slot back into 1 point: it goes first, the table's slots stay.
  await points.getByRole('button', { name: 'Convertir' }).click()
  await font.getByText('A puntos').click()
  // F8: at 150 % text neither mode label is cut.
  await page.evaluate(() => (document.documentElement.style.fontSize = '150%'))
  const cut = await font
    .locator('.mantine-SegmentedControl-label')
    .evaluateAll((labels) => labels.filter((l) => l.scrollWidth > l.clientWidth + 1).length)
  expect(cut).toBe(0)
  await page.evaluate(() => (document.documentElement.style.fontSize = ''))
  // Only the slot levels the sheet has (1st to 3rd at level 5).
  await expect(font.locator('label.cast-option')).toHaveCount(3)
  await level(1).click()
  await font.getByRole('button', { name: 'Convertir un espacio de nivel 1 en puntos' }).click()
  await expect(font).toBeHidden()
  await expect(points).toContainText('1/5')
  await expect(created).toHaveCount(0)
  await expect(sheet).toContainText('4/4')
  await expect(page.getByRole('dialog', { name: 'Fuente de Magia' })).toHaveCount(0)
})

const focusOnBody = (page: Page) => page.evaluate(() => document.activeElement === document.body)

test('RYT-102 resources: add the missing ones, refused options, once-per-turn marks and focus', async ({
  page,
}, info) => {
  await identityFixture(page, { sheet: 'complete' })
  await monkSheet(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page
    .getByRole('button', { name: /^Recursos/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog')
  // "Add them" disappears with its success; focus lands on the first tracker it brought.
  const add = sheet.getByRole('button', { name: 'Añadirlos' })
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(add).toBeHidden()
  await expect(sheet.locator('[data-tracker-name]:focus')).toHaveCount(1)
  expect(await focusOnBody(page)).toBe(false)

  // Spend all Focus Points: every option paid from them reads unavailable and says why.
  const focus = sheet.getByRole('region', { name: 'Puntos de concentración' })
  for (let n = 0; n < 5; n++)
    await focus
      .getByRole('button', { name: /^Gastar un uso de Puntos de concentración/ })
      .first()
      .click()
  await expect(focus.getByText('0/5')).toBeVisible()
  const flurry = focus
    .getByRole('button', { name: /^Necesita 1 de Puntos de concentración; quedan 0/ })
    .first()
  await expect(flurry).toHaveAttribute('aria-disabled', 'true')
  await expect(flurry).toHaveCSS('font-weight', '500')
  await expect(flurry).toHaveCSS('border-top-style', 'dashed')
  // aria-disabled keeps it focusable; a press names the reason and outlines the resource.
  await flurry.focus()
  await page.keyboard.press('Enter')
  await expect(focus.locator('.resource-refused')).toHaveText(
    'Necesita 1 de Puntos de concentración; quedan 0',
  )
  await expect(focus.locator('.resource-meter[data-refused]')).toHaveCount(1)
  await expect(flurry).toBeFocused()
  await audit(page, info.outputPath('focus-empty.png'))

  // The once-per-turn mark: an open box while available, ticked and struck once used.
  const marks = sheet.getByRole('region', { name: 'Una vez por turno' })
  const savage = marks.getByRole('button', { name: 'Atacante salvaje, usado este turno' })
  const name = marks.locator('.turn-mark-name').first()
  await expect(savage).toHaveAttribute('aria-pressed', 'false')
  await expect(savage.locator('svg')).toHaveCount(0)
  await expect(name).not.toHaveCSS('text-decoration-line', 'line-through')
  await savage.focus()
  await page.keyboard.press('Enter')
  await expect(savage).toHaveAttribute('aria-pressed', 'true')
  await expect(savage.locator('svg')).toHaveCount(1)
  await expect(name).toHaveCSS('text-decoration-line', 'line-through')
  await audit(page, info.outputPath('mark-used.png'))
  // "New turn" disappears once nothing is marked; focus returns to the first mark.
  const newTurn = marks.getByRole('button', {
    name: 'Nuevo turno: borra las marcas de una vez por turno',
  })
  await newTurn.focus()
  await page.keyboard.press('Enter')
  await expect(newTurn).toBeHidden()
  await expect(savage).toHaveAttribute('aria-pressed', 'false')
  await expect(savage).toBeFocused()
  expect(await focusOnBody(page)).toBe(false)
})

/** RYT-124: the player journey fixes (double submit, open choices, class change, 0 HP, notes). */
const savesOf = (page: Page) => {
  const saves: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rpc/save_character_sheet')) saves.push(request.url())
  })
  return saves
}
/** Two clicks in the same tick, before React can re-render a disabled state. */
const tapTwice = (button: ReturnType<Page['getByRole']>) =>
  button.evaluate((element: HTMLElement) => {
    element.click()
    element.click()
  })

async function openFullWizard(page: Page) {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  const doors = page.getByRole('dialog', { name: 'Nueva ficha para Arin' })
  await doors.getByText('Completa', { exact: true }).click()
  await doors.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase y nivel')
}
const pickClass = (page: Page, name: RegExp) =>
  page.locator('label.class-pick').filter({ hasText: name }).click()
const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click()

test('RYT-124 a double tap on Create sends one save, and Back does not reopen the wizard', async ({
  page,
}) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const saves = savesOf(page)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Terminar ficha' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await page.getByRole('radiogroup', { name: 'Clase' }).getByText('Monje', { exact: true }).click()
  await next(page)
  await page
    .getByRole('radiogroup', { name: 'Especie' })
    .getByText('Humano', { exact: true })
    .click()
  await next(page)
  await page.getByLabel('Nombre del personaje').fill('Ilsa Brezo')
  await tapTwice(page.getByRole('button', { name: 'Crear ficha' }))
  await expect(page.getByRole('heading', { level: 1, name: 'Ilsa Brezo' })).toBeVisible()
  expect(saves).toHaveLength(1)
  await expect(page.getByText('cambió en otro dispositivo', { exact: false })).toHaveCount(0)
  await page.goBack()
  await expect(page).not.toHaveURL(/\/create/)
  await expect(page.getByRole('heading', { level: 1, name: 'Clase' })).toHaveCount(0)
})

test('RYT-124 a double tap on Save changes saves once without a false conflict', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  const saves = savesOf(page)
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Editar la ficha' }).click()
  await page.getByRole('button', { name: 'Subir velocidad' }).click()
  await tapTwice(page.getByRole('button', { name: 'Guardar cambios' }).first())
  await expect(page.getByRole('region', { name: 'Editando la ficha' })).toHaveCount(0)
  expect(saves).toHaveLength(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

/** The question after "Siguiente" or "Terminar personaje" must be where the player is looking. */
async function expectNoticeInViewAndFocused(notice: Locator) {
  await expect(notice).toBeFocused()
  const box = await notice.boundingBox()
  const viewport = notice.page().viewportSize()!
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
}

test('RYT-124 the full wizard names open choices, keeps scores per method and lets the player finish anyway', async ({
  page,
}, info) => {
  await openFullWizard(page)
  await pickClass(page, /Mago/)
  await next(page)
  await page.getByLabel('Especie').selectOption('elf')
  await page.getByRole('radio', { name: 'Alto elfo' }).check()
  await page.getByLabel('Trasfondo').selectOption('sage')
  // Ability increases left at "—" are named and need a deliberate "continue".
  await next(page)
  const gap = page.getByRole('alert').filter({ hasText: 'elecciones sin hacer' })
  await expect(gap).toContainText('aumentos de característica')
  await expectNoticeInViewAndFocused(gap)
  await audit(page, info.outputPath('wizard-gap.png'))
  await gap.getByRole('button', { name: 'Continuar sin elegir' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Características')
  // The standard array is placed for a Wizard, and picking a taken score swaps.
  const int = page.getByRole('combobox', { name: 'Inteligencia' })
  const str = page.getByRole('combobox', { name: 'Fuerza' })
  await expect(int).toHaveValue('15')
  await str.selectOption('15')
  await expect(str).toHaveValue('15')
  await expect(int).toHaveValue('8')
  // Point buy shows the cost, and each method remembers its own scores.
  await page.getByText('Compra de puntos', { exact: true }).click()
  await expect(page.getByText('cuesta 0', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Subir puntuación de Fuerza' }).click()
  await expect(page.getByText('cuesta 1', { exact: false }).first()).toBeVisible()
  await audit(page, info.outputPath('wizard-pointbuy.png'))
  await page.getByText('Estándar', { exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Fuerza' })).toHaveValue('15')
  await expect(page.getByRole('combobox', { name: 'Inteligencia' })).toHaveValue('8')
  await next(page)
  await expect(page.getByText('0 de 2 elegidas')).toBeVisible()
  await next(page)
  await expect(page.getByRole('alert').filter({ hasText: 'elecciones sin hacer' })).toContainText(
    'Te faltan 2 habilidades',
  )
  await page.getByRole('button', { name: 'Continuar sin elegir' }).click()
  // Maximum HP follows the suggestion until typed; leaving the field empty restores the number.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Combate')
  const hp = page.getByLabel('Puntos de golpe máximos')
  await expect(page.getByText('Sigue a la clase', { exact: false })).toBeVisible()
  const suggested = await hp.inputValue()
  await hp.fill('')
  await hp.blur()
  await expect(hp).toHaveValue(suggested)
  await hp.fill('20')
  await expect(page.getByText('Escrito a mano', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Usar sugerido' }).click()
  await expect(hp).toHaveValue(suggested)
  await next(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conjuros')
  // The step offers the existing library and flags a spell above the available slots.
  await page.getByRole('button', { name: 'Añadir desde la biblioteca' }).click()
  await expect(page.getByRole('dialog', { name: 'Biblioteca' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Añadir conjuro' }).click()
  await page.getByLabel('Nombre del conjuro').fill('Deseo')
  await page.getByLabel('Nivel del conjuro').selectOption('9')
  await expect(page.getByText('Por encima de tus espacios', { exact: false })).toBeVisible()
  await page.getByLabel('Nivel del conjuro').selectOption('1')
  await next(page)
  // Review: the same summary as the quick path, the name, and what is still open.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Detalles y revisión')
  await page.getByLabel('Nombre del personaje').fill('Arin Vael')
  const summary = page.getByRole('region', { name: 'Revisión' })
  await expect(summary).toContainText('Elfo, Sabio')
  const pending = page.getByRole('region', { name: 'Elecciones pendientes' })
  await expect(pending).toContainText('aumentos de característica')
  await expect(pending).toContainText('2 habilidades')
  await audit(page, info.outputPath('wizard-review.png'))
  await page.getByRole('button', { name: 'Terminar personaje' }).click()
  const finishAsk = page.getByRole('alert').filter({ hasText: 'terminar con elecciones' })
  await expect(finishAsk).toBeVisible()
  await expectNoticeInViewAndFocused(finishAsk)
  await page.getByRole('button', { name: 'Terminar así' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Arin Vael' })).toBeVisible()
})

test('RYT-124 changing class clears the subclass and class skills, re-suggests HP and says so once', async ({
  page,
}) => {
  await openFullWizard(page)
  await pickClass(page, /Mago/)
  await page.getByLabel('Subclase').fill('Evocador')
  await next(page)
  await page.getByLabel('Especie').selectOption('elf')
  await page.getByRole('radio', { name: 'Alto elfo' }).check()
  await page.getByLabel('Trasfondo').selectOption('sage')
  await page.getByLabel('Aumento de Inteligencia').selectOption('2')
  await page.getByLabel('Aumento de Sabiduría').selectOption('1')
  await next(page)
  await next(page)
  await page.getByRole('checkbox', { name: 'Medicina', exact: true }).check()
  await page.getByRole('button', { name: 'Anterior' }).click()
  await page.getByRole('button', { name: 'Anterior' }).click()
  await page.getByRole('button', { name: 'Anterior' }).click()
  await pickClass(page, /Guerrero/)
  const loss = page.getByRole('status').filter({ hasText: 'Al cambiar de clase se quita' })
  await expect(loss).toContainText('Evocador')
  await expect(loss).toContainText('1 habilidad de clase')
  // The recalculated HP is not something that was removed: it sits outside the list.
  await expect(loss).toContainText('Los PG máximos se han recalculado')
  await expect(loss.locator('li').filter({ hasText: 'PG máximos' })).toHaveCount(0)
  // Shown below the grid on a phone, so it is scrolled into view; focus stays on the class card.
  const lossBox = (await loss.boundingBox())!
  expect(lossBox.y).toBeGreaterThanOrEqual(0)
  expect(lossBox.y + lossBox.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await expect(page.getByLabel('Subclase')).toHaveValue('')
  await next(page)
  await expect(page.getByRole('status').filter({ hasText: 'Al cambiar de clase' })).toHaveCount(0)
})

test('RYT-124 leaving the wizard with an unsaved change asks first', async ({ page }) => {
  await openFullWizard(page)
  await pickClass(page, /Mago/)
  await page.getByRole('link', { name: 'Ficha de personaje' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Salir sin guardar?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase y nivel')
})

test('RYT-124 notes are written in play with their own save', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  const saves = savesOf(page)
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: /^Notas/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Notas' })
  const notes = drawer.getByRole('textbox', { name: 'Notas', exact: true })
  await notes.fill('El portal se abre con la luna.')
  await expect(drawer).toContainText('Cambios sin guardar')
  await drawer.getByRole('button', { name: 'Guardar notas' }).click()
  await expect(drawer).toContainText('Todo guardado')
  expect(saves).toHaveLength(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Notas/ })).toContainText('El portal se abre')
})

test('RYT-124 Cancel on a dirty draft asks before discarding', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Editar la ficha' }).click()
  // Nothing changed yet: Cancel just closes.
  await page.getByRole('button', { name: 'Cancelar' }).first().click()
  await expect(page.getByRole('region', { name: 'Editando la ficha' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Editar la ficha' }).click()
  await page.getByRole('button', { name: 'Subir velocidad' }).click()
  await page.getByRole('button', { name: 'Cancelar' }).first().click()
  const dialog = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await dialog.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByRole('region', { name: 'Editando la ficha' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar' }).first().click()
  await dialog.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(page.getByRole('region', { name: 'Editando la ficha' })).toHaveCount(0)
})

test('RYT-124 0 HP shows a dying strip, the last HP change can be undone and hit dice only show', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.hp-current')).toHaveText('30')
  const pad = async (amount: string) => {
    await page.getByRole('button', { name: 'Daño', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox').fill(amount)
    await dialog.getByRole('button', { name: 'Aplicar' }).click()
  }
  // Typing past the maximum stops at it and says what it is.
  await page.getByRole('button', { name: 'Daño', exact: true }).click()
  const amount = page.getByRole('dialog').getByRole('textbox')
  await amount.fill('99999')
  await expect(amount).not.toHaveValue('99999')
  await amount.fill('9999')
  await expect(page.getByRole('dialog')).toContainText('El máximo es 9999')
  await page.keyboard.press('Escape')
  // The 5 temporary points absorb first: 8 damage leaves 27.
  await pad('8')
  await expect(page.locator('.hp-current')).toHaveText('27')
  const undo = page.getByRole('status').filter({ hasText: 'PG 30/38' })
  await expect(undo).toBeVisible()
  await undo.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.locator('.hp-current')).toHaveText('30')
  await pad('500')
  await expect(page.locator('.hp-current')).toHaveText('0')
  const strip = page.locator('.sheet-dying')
  await expect(strip).toBeVisible()
  await audit(page, info.outputPath('dying.png'))
  for (let pip = 1; pip <= 3; pip++)
    await strip
      .getByRole('button', { name: `Fallos: +1 (${pip}/3)`, exact: false })
      .first()
      .click()
  await expect(strip).toContainText('Muerto')
  await expect(page.getByRole('button', { name: /^Condiciones/ })).toContainText('Muerto')
  // Hit dice are spent in a short rest: the row only shows them.
  await page.getByRole('button', { name: /^Recursos/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Recursos' })
  await expect(sheet).toContainText(/se gastan en un descanso corto/)
  await expect(
    sheet.locator('section[aria-labelledby="panel-hit-dice"] .pip:not([disabled])'),
  ).toHaveCount(0)
})

test('RYT-124 a save that brings class resources up to date says so inside the open sheet', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: /^Conjuros/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Conjuros' })
  await drawer.getByRole('checkbox', { name: 'Preparado' }).first().click()
  const note = drawer.getByRole('status').filter({ hasText: 'puesto al día' })
  await expect(note).toBeVisible()
  await expect(note).toContainText('Inspiración bárdica')
})
