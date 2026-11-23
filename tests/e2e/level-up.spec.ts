import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture, campaignId, characterId } from './fixtures/identity.ts'
import { expectTouchTargets, capture } from './fixtures/audit.ts'

const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
const membersUrl = `./#/campaign/${campaignId}/members`

async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible, main a.mantine-Button-root:visible, [role="dialog"] button:visible, [role="dialog"] .levelup-choice:visible, [role="dialog"] input[type="text"]:visible',
  )
  await capture(page, path)
}

/** Evidence screenshots (docs/evidence/ui-review/ryt-130) only when RYT_EVIDENCE is set. */
async function evidence(page: Page, name: string, full = false) {
  const project = test.info().project.name
  const size = project === 'identity-mobile' ? '390' : project === 'identity-tablet' ? '820' : null
  if (size && process.env.RYT_EVIDENCE)
    await page.screenshot({
      path: `docs/evidence/ui-review/ryt-130/${name}-${size}.png`,
      fullPage: full,
    })
}

/** A failure or a refusal is where the Player looks: in the viewport, above the footer, focused. */
async function expectSeenAndFocused(alert: Locator) {
  await expect(alert).toBeFocused()
  const box = await alert.boundingBox()
  const viewport = alert.page().viewportSize()!
  const footer = await alert.page().locator('.levelup-footer').boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  expect(box!.y + box!.height).toBeLessThanOrEqual(footer!.y + 1)
}

const levelUpCalls = (calls: { method: string; body: Record<string, unknown> }[]) =>
  calls.filter((call) => call.method === 'apply_level_up')

async function openLevelUp(page: Page, level: number) {
  await page.getByRole('button', { name: `Subir a nivel ${level}` }).click()
  const dialog = page.getByRole('dialog', { name: `Subir a nivel ${level}` })
  await expect(dialog).toBeVisible()
  return dialog
}

/** The glossary index loads in the background; the spell list fills once it is there. */
async function pickSpells(
  dialog: Locator,
  count: number,
  language: 'es' | 'en' = 'es',
  group: 'spells' | 'cantrips' | 'spellbook' = 'spells',
) {
  const titles = {
    es: { spells: /^Conjuros nuevos/, cantrips: /^Truco nuevo/, spellbook: /^Libro de conjuros/ },
    en: { spells: /^New spells/, cantrips: /^New cantrip/, spellbook: /^Spellbook/ },
  }
  const title = titles[language][group]
  const adds = dialog
    .getByRole('group', { name: title })
    .getByRole('button', { name: language === 'es' ? /^Añadir / : /^Add / })
  await expect(adds.first()).toBeVisible()
  for (let n = 0; n < count; n += 1) await adds.first().click()
}

test('RYT-130 the DM sets the party level: confirmation, retry with the same request, count below', async ({
  page,
}, info) => {
  const fixture = await identityFixture(page, { party: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(membersUrl)
  const section = page.getByRole('region', { name: /Nivel del grupo/ })
  await expect(section.getByRole('heading', { name: /Nivel del grupo\s*Sin fijar/ })).toBeVisible()
  await expect(section.getByText('Fíjalo para que cada jugador suba de nivel')).toBeVisible()
  await audit(page, info.outputPath('party-level-unset.png'))
  await evidence(page, 'dm-party-level-unset')

  // Nothing is sent until the DM confirms.
  // It starts at the highest finished sheet (level 5) and the DM raises it by one.
  await expect(section.locator('output')).toHaveText('5')
  await section.getByRole('button', { name: 'Subir el nivel del grupo' }).click()
  await expect(section.locator('output')).toHaveText('6')
  await section.getByRole('button', { name: 'Fijar nivel 6' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Fijar el nivel del grupo en 6?' })
  await expect(dialog).toContainText('Ninguna ficha cambia hasta que la confirmen.')
  // RYT-135: the header key and the footer button do not share a name.
  const names = await dialog
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? ''),
    )
  expect(names).toEqual(['Cerrar', 'Cancelar', 'Confirmar'])
  expect(new Set(names).size).toBe(names.length)
  expect(fixture.calls.filter((call) => call.method === 'set_party_level')).toHaveLength(0)
  await audit(page, info.outputPath('party-level-confirm.png'))
  await evidence(page, 'dm-party-level-confirm')

  // A failure leaves the level as it was and the same button retries the same request.
  fixture.failNextPartyLevel()
  await dialog.getByRole('button', { name: 'Confirmar' }).click()
  await expect(dialog.getByRole('alert')).toContainText('No se guardó el nivel del grupo')
  // Focus stays inside the dialog, on the reason, and the retry is the next stop.
  await expect(dialog.getByRole('alert')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator(':focus')).toHaveCount(1)
  await evidence(page, 'dm-party-level-error')
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog).toHaveCount(0)
  const sent = fixture.calls.filter((call) => call.method === 'set_party_level')
  expect(sent).toHaveLength(2)
  expect(sent[0]!.body.request_id).toBe(sent[1]!.body.request_id)
  expect(sent[1]!.body).toMatchObject({ target_campaign: campaignId, new_level: 6 })

  await expect(section.getByRole('heading', { name: /Nivel del grupo\s*6/ })).toBeVisible()
  await expect(section.locator('.party-level-saved')).toHaveText('Nivel del grupo fijado en 6.')
  await expect(
    section.getByText('3 personajes están por debajo del nivel del grupo.'),
  ).toBeVisible()
  await audit(page, info.outputPath('party-level-set.png'))
  // RYT-151: "Invite player" is the filled action; setting the level is outlined and waits for a
  // number other than the one the campaign holds.
  const setLevel = section.getByRole('button', { name: 'Fijar nivel 6' })
  await expect(setLevel).toBeDisabled()
  await expect(setLevel).toHaveAttribute('data-variant', 'outline')
  await expect(section.getByRole('heading', { name: /Nivel del grupo/ })).toBeFocused()
  await evidence(page, 'dm-party-level-set')

  // The notice goes as soon as the value is edited again.
  await section.getByRole('button', { name: 'Bajar el nivel del grupo' }).click()
  await expect(section.locator('.party-level-saved')).toBeEmpty()
  await section.getByRole('button', { name: 'Subir el nivel del grupo' }).click()
  // Lowering only stops the prompts; Escape closes the question and focus comes back.
  const lower = section.getByRole('button', { name: 'Bajar el nivel del grupo' })
  await lower.click()
  const apply = section.getByRole('button', { name: 'Fijar nivel 5' })
  await apply.click()
  await expect(page.getByRole('dialog')).toContainText('solo detiene los avisos')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(apply).toBeFocused()
  expect(fixture.calls.filter((call) => call.method === 'set_party_level')).toHaveLength(2)
})

test('RYT-130 a Player cannot set the party level and has no control for it', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', partyLevel: 4 })
  await page.goto(membersUrl)
  await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  await expect(page.getByText('Nivel del grupo')).toHaveCount(0)
})

test('RYT-130 the Player below the party level levels up through the guided sheet', async ({
  page,
}, info) => {
  // A level 4 bard, party level 5: new features, slots and two spells to choose.
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  const prompt = page.getByRole('region', { name: 'El grupo es de nivel 5' })
  await expect(prompt).toContainText('Arin sigue en el nivel 4.')
  await audit(page, info.outputPath('prompt.png'))
  await evidence(page, 'player-prompt', true)

  const dialog = await openLevelUp(page, 5)
  // 1. Hit points: the average plus Constitution, a typed roll within the die, the new maximum.
  await expect(dialog.getByRole('heading', { name: 'Puntos de golpe del nivel 5' })).toBeFocused()
  await expect(dialog.getByRole('radio', { name: /Media fija/ })).toBeChecked()
  await expect(dialog.getByText('38 → 45')).toBeVisible()
  await audit(page, info.outputPath('step-hp.png'))
  await evidence(page, 'level-up-1-hp')
  await dialog
    .getByRole('radio', { name: /Mi tirada/ })
    .locator('xpath=..')
    .click()
  const roll = dialog.getByRole('textbox', { name: 'Tirada del d8' })
  await roll.fill('12')
  await expect(roll).toHaveValue('8')
  await expect(dialog.getByText('El d8 llega hasta 8.')).toBeVisible()
  await expect(dialog.getByText('38 → 48')).toBeVisible()
  await evidence(page, 'level-up-1-hp-roll')
  await dialog
    .getByRole('radio', { name: /Media fija/ })
    .locator('xpath=..')
    .click()
  await dialog.getByRole('button', { name: 'Siguiente' }).click()

  // 2. What the level grants, by name with glossary links.
  await expect(dialog.getByRole('heading', { name: 'Lo que te da el nivel 5' })).toBeFocused()
  await expect(dialog.getByRole('button', { name: /Fuente de inspiración/ }).first()).toBeVisible()
  await expect(dialog).toContainText('Bonificador de competencia +2 → +3')
  await expect(dialog).toContainText('Espacios de nivel 3: 0 → 2')
  await audit(page, info.outputPath('step-grants.png'))
  await evidence(page, 'level-up-2-grants')
  await dialog.getByRole('button', { name: 'Siguiente' }).click()

  // 3. Required choices: two spells; the confirm waits for them.
  await expect(dialog.getByRole('heading', { name: 'Elecciones del nivel 5' })).toBeFocused()
  await expect(dialog.getByText('0 de 2 elegidos')).toBeVisible()
  await expect(dialog.getByText('Falta elegir')).toBeVisible()
  await audit(page, info.outputPath('step-choices.png'))
  await evidence(page, 'level-up-3-choices')
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  const confirm = dialog.getByRole('button', { name: 'Confirmar nivel 5' })
  await expect(dialog.getByRole('alert')).toContainText('Falta elegir: conjuros.')
  await expect(confirm).toHaveAttribute('aria-disabled', 'true')
  await confirm.click({ force: true })
  expect(levelUpCalls(fixture.calls)).toHaveLength(0)
  await evidence(page, 'level-up-4-review-missing')
  await dialog.getByRole('button', { name: 'Ir a las elecciones' }).click()
  await pickSpells(dialog, 2)
  await expect(dialog.getByText('2 de 2 elegidos')).toBeVisible()
  // A full pick collapses to its chips; "Cambiar elección" opens the picker again.
  await expect(dialog.getByRole('textbox', { name: 'Buscar' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cambiar elección' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Buscar' })).toBeVisible()
  await pickSpells(dialog, 2)
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  await expect(dialog.getByRole('heading', { name: 'Revisa y confirma' })).toBeFocused()
  await audit(page, info.outputPath('step-review.png'))
  await evidence(page, 'level-up-4-review')

  // 4. One confirm: one request, the new level, maximum and build; then what changed.
  await confirm.click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 5' })).toBeFocused()
  const sent = levelUpCalls(fixture.calls)
  expect(sent).toHaveLength(1)
  expect(sent[0]!.body).toMatchObject({
    target_campaign: campaignId,
    target_character: characterId,
    expected_revision: 3,
    new_level: 5,
    new_max_hp: 45,
  })
  const build = sent[0]!.body.new_build as { spells: unknown[]; features: { ref?: string }[] }
  expect(build.spells).toHaveLength(4)
  expect(build.features.some((feature) => feature.ref?.startsWith('feature.bard-'))).toBe(true)
  await expect(dialog.getByRole('heading', { level: 4, name: 'Qué ha cambiado' })).toBeVisible()
  await expect(dialog).toContainText('Nivel 4 → 5')
  await expect(dialog).toContainText('Puntos de golpe máximos 38 → 45')
  await audit(page, info.outputPath('done.png'))
  await evidence(page, 'level-up-5-done')
  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('#sheet-name')).toBeFocused()
  await expect(prompt).toHaveCount(0)
  await expect(page.getByText('Bardo de nivel 5', { exact: false })).toBeVisible()
  await expect(page.locator('.hp-current')).toHaveText('37')
  // The history tells a level-up from a manual edit.
  await page.getByRole('button', { name: /^Historial/ }).click()
  const history = page.getByRole('dialog', { name: 'Historial' })
  await expect(history.getByText('Subida de nivel', { exact: true })).toBeVisible()
  await expect(history).toContainText('4 → 5')
  await expect(history).toContainText('38 → 45')
  // One entry for the level-up: the sheet's own row folds into it and no raw id shows.
  await expect(history.getByText('Nivel: 4 → 5')).toHaveCount(1)
  await expect(history.getByText('Puntos de golpe máximos: 38 → 45')).toHaveCount(1)
  await expect(history).toContainText('Iniciado en la magia')
  await expect(history).not.toContainText('feat-magic-initiate')
  await evidence(page, 'player-history')
})

test('RYT-130 a failed level-up leaves the character as it was and the retry repeats the request', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 5)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  await pickSpells(dialog, 2)
  await next.click()
  fixture.failNextLevelUp()
  await dialog.getByRole('button', { name: 'Confirmar nivel 5' }).click()
  await expect(dialog.getByRole('alert')).toContainText('La subida de nivel no se guardó')
  await expect(dialog.getByRole('alert')).toContainText('Tu personaje no ha cambiado.')
  await expectSeenAndFocused(dialog.getByRole('alert'))
  // RYT-135: at 820px the summary row ("Arin 4 → 5") is whole under the header with the alert.
  if (page.viewportSize()!.width >= 768) {
    const header = (await dialog.locator('header').boundingBox())!
    const who = (await dialog.locator('.levelup-who').boundingBox())!
    expect(who.y).toBeGreaterThanOrEqual(header.y + header.height - 1)
  }
  await evidence(page, 'level-up-error')
  await expect(dialog.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  // The sheet underneath still reads level 4.
  await expect(page.getByText('Bardo de nivel 4', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 5' })).toBeVisible()
  const sent = levelUpCalls(fixture.calls)
  expect(sent).toHaveLength(2)
  expect(sent[0]!.body.request_id).toBe(sent[1]!.body.request_id)
})

test('RYT-130 a sheet changed elsewhere refuses the level-up and offers only a way out', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 5)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  await pickSpells(dialog, 2)
  await next.click()
  fixture.staleSheet()
  await dialog.getByRole('button', { name: 'Confirmar nivel 5' }).click()
  await expect(dialog.getByRole('alert')).toContainText('La ficha cambió en otro dispositivo')
  await expect(dialog.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expectSeenAndFocused(dialog.getByRole('alert'))
  // Back and forward do not bring the confirm back: the refusal stays.
  await dialog.getByRole('button', { name: 'Atrás' }).click()
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  await expect(dialog.getByRole('button', { name: 'Confirmar nivel 5' })).toHaveCount(0)
  await expect(dialog.getByRole('alert')).toContainText('La ficha cambió en otro dispositivo')
  // The way out is named apart from the header's close button.
  await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Cerrar sin guardar' }).click()
  await expect(dialog).toHaveCount(0)
  // The sheet reloaded: the prompt is there again, from the new revision.
  await openLevelUp(page, 5)
})

test('RYT-130 subclass at level 3 and the ability increase at level 4 block the confirm until chosen', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 2,
    sheetSubclass: '',
    partyLevel: 4,
  })
  await page.goto(sheetUrl)
  let dialog = await openLevelUp(page, 3)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await expect(dialog).toContainText('Los rasgos de tu subclase se muestran cuando la elijas.')
  await next.click()
  await expect(dialog.getByRole('group', { name: /Subclase/ })).toBeVisible()
  await expect(dialog.getByText('Falta elegir').first()).toBeVisible()
  await dialog.getByRole('radio', { name: 'Otra subclase' }).locator('xpath=..').click()
  await dialog.getByRole('textbox', { name: 'Nombre de la subclase' }).fill('Colegio del Valor')
  await pickSpells(dialog, 1)
  await next.click()
  await dialog.getByRole('button', { name: 'Confirmar nivel 3' }).click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 3' })).toBeVisible()
  expect((levelUpCalls(fixture.calls)[0]!.body.new_build as { subclass: string }).subclass).toBe(
    'Colegio del Valor',
  )
  await expect(dialog).toContainText('Subclase: Colegio del Valor')

  // Level 4: an ability increase or a feat, and one more spell.
  await dialog.getByRole('button', { name: 'Subir a nivel 4' }).click()
  dialog = page.getByRole('dialog', { name: 'Subir a nivel 4' })
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  await expect(
    dialog.getByRole('group', { name: /Aumento de característica o dote/ }),
  ).toBeVisible()
  await dialog.getByRole('radio', { name: '+1 a dos características' }).locator('xpath=..').click()
  await dialog.getByRole('button', { name: /^Carisma/ }).click()
  await expect(dialog.getByText('1 de 2 elegidas')).toBeVisible()
  await dialog.getByRole('button', { name: /^Destreza/ }).click()
  await expect(dialog.getByText('2 de 2 elegidas')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Carisma/ })).toContainText('15 → 16')
  await pickSpells(dialog, 1)
  // Levels 4 and 10 also teach one more cantrip.
  await expect(dialog.getByRole('group', { name: /^Truco nuevo/ })).toBeVisible()
  await pickSpells(dialog, 1, 'es', 'cantrips')
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  await dialog.getByRole('button', { name: 'Confirmar nivel 4' }).click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 4' })).toBeVisible()
  const last = levelUpCalls(fixture.calls)[1]!
  expect(
    (last.body.new_build as { baseAbilities: Record<string, number> }).baseAbilities,
  ).toMatchObject({ cha: 16, dex: 15 })
  await expect(dialog).toContainText('Carisma 15 → 16')
})

test('RYT-130 the manual level is locked for the Player and open for the DM', async ({ page }) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Editar la ficha' }).click()
  await expect(page.getByText('El nivel sube con la subida de nivel, no a mano.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Subir nivel/ })).toHaveCount(0)
  expect(fixture.calls.filter((call) => call.method === 'save_character_sheet')).toHaveLength(0)
})

test('RYT-130 the DM keeps the manual level stepper', async ({ page }) => {
  await identityFixture(page, { sheet: 'complete', partyLevel: 6 })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Editar la ficha' }).click()
  await expect(page.getByRole('button', { name: /^Subir nivel/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Subir a nivel 6' })).toHaveCount(0)
})

test('RYT-130 the level-up waits while the character fights', async ({ page }) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
    inEncounter: true,
  })
  await page.goto(sheetUrl)
  const cta = page.getByRole('button', { name: 'Subir a nivel 5' })
  await expect(cta).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('La subida espera a que termine el combate.')).toBeVisible()
  await cta.click({ force: true })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('RYT-130 no prompt for a sheet at the party level or when none is set', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', partyLevel: 5 })
  await page.goto(sheetUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Arin' })).toBeVisible()
  await expect(page.getByRole('region', { name: /El grupo es de nivel/ })).toHaveCount(0)
})

test('RYT-130 Escape and Back close the sheet without saving and focus returns to the prompt', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.goto(sheetUrl)
  const cta = page.getByRole('button', { name: 'Subir a nivel 5' })
  await cta.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cta).toBeFocused()
  await cta.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/party/${characterId}$`))
  expect(levelUpCalls(fixture.calls)).toHaveLength(0)
})

for (const language of ['es', 'en'] as const)
  for (const theme of ['default', 'parchment'] as const)
    test(`RYT-130 evidence ${language} ${theme}`, async ({ page }) => {
      test.skip(!process.env.RYT_EVIDENCE, 'Evidence screenshots only')
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-theme', theme)
        },
        { language, theme },
      )
      const tag = `${theme === 'default' ? 'hearth' : 'parchment'}-${language}`
      const dm = await identityFixture(page, { party: true, sheet: 'complete', partyLevel: 6 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(membersUrl)
      await expect(page.locator('.party-level')).toContainText('6')
      await evidence(page, `matrix-${tag}-dm-control`)
      expect(dm.calls.length).toBeGreaterThan(0)
    })

for (const language of ['es', 'en'] as const)
  for (const theme of ['default', 'parchment'] as const)
    test(`RYT-130 evidence player ${language} ${theme}`, async ({ page }) => {
      test.skip(!process.env.RYT_EVIDENCE, 'Evidence screenshots only')
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem('rytta-language', language)
          localStorage.setItem('rytta-theme', theme)
        },
        { language, theme },
      )
      const tag = `${theme === 'default' ? 'hearth' : 'parchment'}-${language}`
      await identityFixture(page, {
        player: true,
        sheet: 'complete',
        sheetLevel: 3,
        sheetSubclass: '',
        partyLevel: 4,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(sheetUrl)
      const cta = page.getByRole('button', {
        name: language === 'es' ? 'Subir a nivel 4' : 'Level up to 4',
      })
      await expect(cta).toBeVisible()
      await evidence(page, `matrix-${tag}-prompt`, true)
      await cta.click()
      const dialog = page.getByRole('dialog')
      const next = dialog.getByRole('button', { name: language === 'es' ? 'Siguiente' : 'Next' })
      await expect(dialog).toBeVisible()
      await evidence(page, `matrix-${tag}-1-hp`)
      await next.click()
      await evidence(page, `matrix-${tag}-2-grants`)
      await next.click()
      await expect(dialog.getByRole('button', { name: /^(Añadir|Add) / }).first()).toBeVisible()
      await evidence(page, `matrix-${tag}-3-choices`)
      await dialog
        .getByRole('radio', {
          name: language === 'es' ? '+1 a dos características' : '+1 to two scores',
        })
        .locator('xpath=..')
        .click()
      await dialog.getByRole('button', { name: /^(Carisma|Charisma)/ }).click()
      await evidence(page, `matrix-${tag}-3-choices-picked`)
      await dialog.getByRole('button', { name: /^(Destreza|Dexterity)/ }).click()
      await dialog
        .getByRole('radio', { name: /^(College of Lore|Colegio del conocimiento)/ })
        .first()
        .locator('xpath=..')
        .click()
      await pickSpells(dialog, 1, language)
      await pickSpells(dialog, 1, language, 'cantrips')
      await evidence(page, `matrix-${tag}-3-choices-complete`)
      await next.click()
      await evidence(page, `matrix-${tag}-4-review`)
      await dialog
        .getByRole('button', {
          name: language === 'es' ? 'Confirmar nivel 4' : 'Confirm level 4',
        })
        .click()
      await expect(dialog.getByRole('button', { name: /^(Listo|Done)$/ })).toBeVisible()
      await evidence(page, `matrix-${tag}-5-done`)
    })

test('RYT-130 a glossary link inside the sheet opens its reference and Escape closes only that', async ({
  page,
}) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 5)
  await dialog.getByRole('button', { name: 'Siguiente' }).click()
  const term = dialog.getByRole('button', { name: /Fuente de inspiración/ }).first()
  await term.click()
  const reference = page.getByRole('dialog', { name: /Fuente de inspiración/ })
  await expect(reference).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(reference).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(term).toBeFocused()
})

test('RYT-130 the guided sheet holds at 150% text and in English', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('rytta-language', 'en'))
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 3,
    sheetSubclass: '',
    partyLevel: 4,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  await page.getByRole('button', { name: 'Level up to 4' }).click()
  const dialog = page.getByRole('dialog', { name: 'Level up to 4' })
  await expect(dialog.getByRole('heading', { name: 'Hit points for level 4' })).toBeFocused()
  await audit(page, info.outputPath('hp-150.png'))
  await dialog.getByRole('button', { name: 'Next' }).click()
  await audit(page, info.outputPath('grants-150.png'))
  await dialog.getByRole('button', { name: 'Next' }).click()
  await expect(dialog.getByRole('heading', { name: 'Choices for level 4' })).toBeFocused()
  // The radio is visually hidden inside its label: tap the label, as a person does.
  await dialog.getByRole('radio', { name: '+1 to two scores' }).locator('xpath=..').click()
  await expect(dialog.getByRole('radio', { name: '+1 to two scores' })).toBeChecked()
  await audit(page, info.outputPath('choices-150.png'))
})

test('RYT-130 the full editor shows the finished sheet level as locked for the Player', async ({
  page,
}) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.goto(`./#/campaign/${campaignId}/party/${characterId}/create?mode=full`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clase y nivel')
  await expect(page.getByText('El nivel sube con la subida de nivel, no a mano.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Subir nivel/ })).toHaveCount(0)
})

test('RYT-130 the DM lowers the party level while the sheet is open: the refusal offers only a way out', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
  })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 5)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  await pickSpells(dialog, 2)
  await next.click()
  fixture.setPartyLevel(4)
  await dialog.getByRole('button', { name: 'Confirmar nivel 5' }).click()
  await expect(dialog.getByRole('alert')).toContainText('El nivel del grupo es ahora menor')
  await expect(dialog.getByRole('alert')).toContainText('Tu personaje no ha cambiado.')
  await expectSeenAndFocused(dialog.getByRole('alert'))
  await expect(dialog.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await evidence(page, 'level-up-above-party')
  await dialog.getByRole('button', { name: 'Cerrar sin guardar' }).click()
  await expect(dialog).toHaveCount(0)
  // The sheet and the campaign reloaded: nothing changed and no prompt is left.
  await expect(page.getByText('Bardo de nivel 4', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: /El grupo es de nivel/ })).toHaveCount(0)
})

test('RYT-130 an absent character shows no prompt', async ({ page }) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetLevel: 4,
    partyLevel: 5,
    absent: true,
  })
  await page.goto(sheetUrl)
  await expect(page.getByRole('heading', { level: 1, name: 'Arin' })).toBeVisible()
  await expect(page.getByRole('region', { name: /El grupo es de nivel/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Subir a nivel/ })).toHaveCount(0)
})

test('RYT-130 the step count stays put and an empty roll says why Next waits', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', sheetLevel: 4, partyLevel: 5 })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 5)
  await expect(dialog).toContainText('Paso 1 de 4: Puntos de golpe')
  await dialog
    .getByRole('radio', { name: /Mi tirada/ })
    .locator('xpath=..')
    .click()
  await expect(dialog).toContainText('Paso 1 de 4: Puntos de golpe')
  await expect(dialog.getByText('Escribe tu tirada, de 1 a 8, para continuar.')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Siguiente' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await dialog.getByRole('textbox', { name: 'Tirada del d8' }).fill('5')
  await expect(dialog.getByText('Escribe tu tirada, de 1 a 8, para continuar.')).toHaveCount(0)
  await expect(dialog).toContainText('Paso 1 de 4: Puntos de golpe')
})

test('RYT-130 the footer buttons are whole in Spanish at 150% text', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', sheetLevel: 4, partyLevel: 5 })
  await page.goto(sheetUrl)
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const dialog = await openLevelUp(page, 5)
  const whole = async () => {
    const clipped = await page
      .locator('.levelup-footer .mantine-Button-label')
      .evaluateAll((els) =>
        els
          .filter(
            (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
          )
          .map((el) => el.textContent),
      )
    expect(clipped).toEqual([])
    for (const button of await page.locator('.levelup-footer button').all()) {
      const box = await button.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    }
  }
  await whole()
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  await pickSpells(dialog, 2)
  await next.click()
  await expect(dialog.getByRole('button', { name: 'Confirmar nivel 5' })).toBeVisible()
  await whole()
})

test('RYT-130 a wizard copies two spells into the spellbook; a feat takes the place of an increase', async ({
  page,
}) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetClass: 'wizard',
    sheetLevel: 11,
    partyLevel: 12,
  })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 12)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  // Level 12: the ability increase and the spellbook, no prepared spells and no cantrip.
  await expect(dialog.getByRole('group', { name: /^Libro de conjuros/ })).toBeVisible()
  await expect(dialog.getByRole('group', { name: /^Conjuros nuevos/ })).toHaveCount(0)
  await expect(dialog.getByRole('group', { name: /^Truco nuevo/ })).toHaveCount(0)
  await dialog.getByRole('radio', { name: 'Una dote' }).locator('xpath=..').click()
  // RYT-171: the campaign's general feats are offered; another can still be typed.
  const featPick = dialog.getByRole('combobox', { name: 'Dote' })
  await expect(featPick.locator('option', { hasText: 'Alerta' })).toHaveCount(0)
  await featPick.selectOption({ label: 'Otra dote (escribe su nombre)' })
  await dialog.getByRole('textbox', { name: 'Nombre de la dote' }).fill('Alerta casera')
  await featPick.selectOption({ label: 'Apresador' })
  await expect(dialog.getByRole('textbox', { name: 'Nombre de la dote' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Reglas de Apresador' })).toBeVisible()
  if (process.env.RYT_CAPTURE)
    await page.screenshot({
      path: `docs/evidence/ui-review/ryt-171/levelup-feat-${test.info().project.name}.png`,
    })
  await pickSpells(dialog, 2, 'es', 'spellbook')
  await expect(dialog.getByText('2 de 2 elegidos')).toBeVisible()
  await next.click()
  await dialog.getByRole('button', { name: 'Confirmar nivel 12' }).click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 12' })).toBeVisible()
  await expect(dialog).toContainText('Dote: Apresador')
  const build = levelUpCalls(fixture.calls)[0]!.body.new_build as {
    features: { name: string; source: string; ref?: string }[]
    spells: { prepared: boolean; level: number }[]
  }
  expect(build.features).toContainEqual(
    expect.objectContaining({ name: 'Apresador', source: 'feat', ref: 'feature.feat-grappler' }),
  )
  // The sample sheet holds two spells; the two new ones are not prepared (the spellbook).
  expect(build.spells).toHaveLength(4)
  expect(build.spells.filter((spell) => !spell.prepared)).toHaveLength(2)
})

test('RYT-130 +2 to one score and a score already at 20', async ({ page }) => {
  const fixture = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetClass: 'wizard',
    sheetLevel: 11,
    sheetAbilities: { int: 19, wis: 10 },
    partyLevel: 12,
  })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 12)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  const intelligence = dialog.getByRole('button', { name: /^Inteligencia/ })
  await dialog.getByRole('radio', { name: '+2 a una característica' }).locator('xpath=..').click()
  // 19 + 2 would pass 20: it cannot be picked and says so.
  await expect(intelligence).toHaveAttribute('aria-disabled', 'true')
  await expect(intelligence).toContainText('Pasaría de 20')
  await expect(intelligence).not.toContainText('Ya en 20')
  await intelligence.click({ force: true })
  await expect(dialog.getByText('0 de 1 elegidas')).toBeVisible()
  // +1 to two scores can still take it to 20.
  await dialog.getByRole('radio', { name: '+1 a dos características' }).locator('xpath=..').click()
  await expect(intelligence).not.toContainText('Pasaría de 20')
  await dialog.getByRole('radio', { name: '+2 a una característica' }).locator('xpath=..').click()
  await dialog.getByRole('button', { name: /^Sabiduría/ }).click()
  await expect(dialog.getByRole('button', { name: /^Sabiduría/ })).toContainText('10 → 12')
  await pickSpells(dialog, 2, 'es', 'spellbook')
  await next.click()
  await dialog.getByRole('button', { name: 'Confirmar nivel 12' }).click()
  await expect(dialog.getByRole('heading', { name: 'Ahora eres de nivel 12' })).toBeVisible()
  await expect(dialog).toContainText('Sabiduría 10 → 12')
  expect(
    (levelUpCalls(fixture.calls)[0]!.body.new_build as { baseAbilities: Record<string, number> })
      .baseAbilities,
  ).toMatchObject({ wis: 12, int: 19 })
})

test('RYT-135 a score at 20 says it is at the cap and a 19 says +2 would pass it', async ({
  page,
}) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    sheetClass: 'wizard',
    sheetLevel: 11,
    sheetAbilities: { int: 20, wis: 19 },
    partyLevel: 12,
  })
  await page.goto(sheetUrl)
  const dialog = await openLevelUp(page, 12)
  const next = dialog.getByRole('button', { name: 'Siguiente' })
  await next.click()
  await next.click()
  await dialog.getByRole('radio', { name: '+2 a una característica' }).locator('xpath=..').click()
  const atCap = dialog.getByRole('button', { name: /^Inteligencia/ })
  const wouldPass = dialog.getByRole('button', { name: /^Sabiduría/ })
  await expect(atCap).toContainText('Ya en 20')
  await expect(atCap).toHaveAttribute('aria-disabled', 'true')
  await expect(wouldPass).toContainText('Pasaría de 20')
  await expect(wouldPass).toHaveAttribute('aria-disabled', 'true')
})

/** Wide font as on Linux CI, which has wider glyphs and a minimum font size. */
const wideFont = '* { font-family: Verdana, sans-serif !important }'

for (const wide of [false, true])
  test(`RYT-135 at 150% text the typed-roll hint sits with its input and focus stays clear of the footer${wide ? ' (wide font)' : ''}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'identity-mobile', 'The phone sheet is checked at 390px.')
    test.setTimeout(90_000)
    await identityFixture(page, {
      player: true,
      sheet: 'complete',
      sheetLevel: 3,
      sheetSubclass: '',
      partyLevel: 4,
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(sheetUrl)
    await page.addStyleTag({ content: `html { font-size: 150%; } ${wide ? wideFont : ''}` })
    const dialog = await openLevelUp(page, 4)
    await dialog
      .getByRole('radio', { name: /Mi tirada/ })
      .locator('xpath=..')
      .click()
    const input = dialog.getByRole('textbox', { name: 'Tirada del d8' })
    const hint = dialog.getByText('Escribe tu tirada, de 1 a 8, para continuar.')
    await expect(hint).toBeVisible()
    // Read with the input, and on screen with it: no scrolling to find why Next waits.
    const described = await input.getAttribute('aria-describedby')
    expect(described).toContain((await hint.getAttribute('id'))!)
    const viewport = page.viewportSize()!
    const footer = (await dialog.locator('.levelup-footer').boundingBox())!
    for (const box of [(await hint.boundingBox())!, (await input.boundingBox())!]) {
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(Math.min(viewport.height, footer.y + 1))
    }
    await input.fill('5')
    await expect(hint).toHaveCount(0)

    // Moving focus through the options never leaves the focused one under the sticky footer.
    const next = dialog.getByRole('button', { name: 'Siguiente' })
    await next.click()
    await next.click()
    await expect(dialog.getByRole('heading', { name: 'Elecciones del nivel 4' })).toBeFocused()
    const seen: string[] = []
    for (let step = 0; step < 24; step += 1) {
      await page.keyboard.press('Tab')
      // Let the browser's scroll-into-view settle before reading the boxes.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))))
      const read = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement
        if (!active || active.closest('.levelup-footer') || !active.closest('.levelup-modal-body'))
          return null
        const target = active.closest('label') ?? active
        const box = target.getBoundingClientRect()
        const footerBox = document.querySelector('.levelup-footer')!.getBoundingClientRect()
        const headerBox = document.querySelector('[role="dialog"] header')!.getBoundingClientRect()
        return {
          name: (active.getAttribute('aria-label') ?? target.textContent ?? '').slice(0, 30),
          top: box.top,
          bottom: box.bottom,
          footerTop: footerBox.top,
          headerBottom: headerBox.bottom,
        }
      })
      if (!read) break
      seen.push(read.name)
      expect(read.bottom, `${read.name} sits above the footer`).toBeLessThanOrEqual(
        read.footerTop + 1,
      )
      expect(read.top, `${read.name} sits under the header`).toBeGreaterThanOrEqual(
        read.headerBottom - 1,
      )
    }
    expect(seen.length).toBeGreaterThan(2)
  })

// RYT-135: axe on every changed state, in Hearth, Parchment and a class theme, at 100% and 150% text.
for (const theme of ['default', 'parchment', 'wizard'] as const)
  for (const percent of [100, 150])
    test(`RYT-135 axe is clean on the level-up polish states in ${theme} at ${percent}% text`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000)
      await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
      await identityFixture(page, {
        player: true,
        sheet: 'complete',
        sheetClass: 'wizard',
        sheetLevel: 11,
        sheetAbilities: { int: 19, wis: 10 },
        partyLevel: 12,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(sheetUrl)
      await page.addStyleTag({ content: `html { font-size: ${percent}%; }` })
      const dialog = await openLevelUp(page, 12)
      // The typed roll with the reason Next waits.
      await dialog
        .getByRole('radio', { name: /Mi tirada/ })
        .locator('xpath=..')
        .click()
      await expect(dialog.getByText('Escribe tu tirada')).toBeVisible()
      await audit(page, info.outputPath(`hint-${theme}-${percent}.png`))
      await dialog.getByRole('textbox', { name: /Tirada del d/ }).fill('4')
      const next = dialog.getByRole('button', { name: 'Siguiente' })
      await next.click()
      await next.click()
      // The capped tile and the focused option.
      await dialog
        .getByRole('radio', { name: '+2 a una característica' })
        .locator('xpath=..')
        .click()
      await expect(dialog.getByRole('button', { name: /^Inteligencia/ })).toContainText(
        'Pasaría de 20',
      )
      await dialog.getByRole('button', { name: /^Sabiduría/ }).focus()
      await audit(page, info.outputPath(`capped-${theme}-${percent}.png`))
      if (process.env.RYT_EVIDENCE && info.project.name !== 'identity-desktop')
        await page.screenshot({
          path: `docs/evidence/ui-review/ryt-135/level-up-capped-${theme}-${percent}-${info.project.name === 'identity-mobile' ? '390' : '820'}.png`,
        })
    })

for (const theme of ['default', 'parchment', 'wizard'] as const)
  test(`RYT-135 axe is clean on the DM party-level dialog in ${theme}`, async ({ page }, info) => {
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    await identityFixture(page, { party: true, sheet: 'complete' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(membersUrl)
    const section = page.getByRole('region', { name: /Nivel del grupo/ })
    await section.getByRole('button', { name: 'Subir el nivel del grupo' }).click()
    await section.getByRole('button', { name: 'Fijar nivel 6' }).click()
    await expect(
      page.getByRole('dialog', { name: '¿Fijar el nivel del grupo en 6?' }),
    ).toBeVisible()
    await audit(page, info.outputPath(`dm-dialog-${theme}.png`))
  })
