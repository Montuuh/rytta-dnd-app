import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from './fixtures/identity.ts'
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
    'main button:visible:not(.glossary-term), main a.mantine-Button-root:visible, [role="dialog"] button:visible:not(.glossary-term)',
  )
  await capture(page, path)
}

test('the assigned Player creates a 5.5e character through the full wizard', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  // RYT-072: "Create" opens the three doors over the party list.
  const create = page.getByRole('button', { name: 'Crear tu personaje' })
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
  await page.getByRole('radio', { name: /Mago/ }).check()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  await page.getByRole('button', { name: 'Guardar y salir' }).click()
  await expect(page.getByText('Arin todavía no tiene la ficha terminada.')).toBeVisible()
  await page.getByRole('link', { name: 'Continuar ficha' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Origen')
  await page.getByRole('button', { name: 'Anterior' }).click()
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

test('RYT-072 quick sheet: class, species and name, then the sheet', async ({ page }, info) => {
  await identityFixture(page, { player: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('button', { name: 'Crear tu personaje' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.getByRole('radiogroup', { name: 'Clase' }).getByText('Monje', { exact: true }).click()
  await expect(page.getByRole('radio', { name: /^Monje/ })).toBeChecked()
  await audit(page, info.outputPath('quick-class.png'))
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Especie')
  await expect(page.getByRole('radio', { name: /^Humano/ })).toBeChecked()
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
  await page.getByRole('button', { name: 'Crear tu personaje' }).click()
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
  await expect(page.getByText('PG 30/38 +5')).toBeVisible()
  await capture(page, info.outputPath('party-summary.png'))
  await page.getByRole('link', { name: 'Ver ficha' }).click()
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
  await expect(page.getByRole('img', { name: '30 de 38 puntos de golpe' })).toBeVisible()
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
  await dice.getByRole('button', { name: 'Gastar un dado de golpe (1/5)' }).click()
  await expect(dice.locator('.pip-count')).toHaveText('4/5')
  await dice.getByRole('button', { name: 'Recuperar un dado de golpe (5/5)' }).click()
  await expect(dice.locator('.pip-count')).toHaveText('5/5')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Condiciones/ }).click()

  const poisoned = page.getByRole('checkbox', { name: 'Envenenado', exact: true })
  await page
    .locator('.condition-chip label')
    .filter({ hasText: /^Envenenado$/ })
    .click()
  await expect(poisoned).toBeChecked()
  await expect(page.getByRole('dialog').locator('.condition-links')).toContainText('Envenenado')
  // A checked chip is filled with the accent and keeps AA text contrast in dark and light themes
  // (on-accent token). Each theme is set with its own scheme (RYT-069).
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
          .include('.condition-chips')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
      `${scheme} ${theme}`,
    ).toEqual([])
  }
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
  const add = await page.locator('.portrait-plate-add').boundingBox()
  const name = await page.locator('#sheet-name').boundingBox()
  expect(ring!.x + ring!.width).toBeLessThanOrEqual(hero!.x + hero!.width)
  expect(add!.y + add!.height).toBeLessThanOrEqual(name!.y)
  await audit(page, info.outputPath('sheet-plate-150.png'))
})
