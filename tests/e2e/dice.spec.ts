import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  beaId,
  campaignId,
  characterId,
  identityFixture,
  peerId,
  playerId,
} from './fixtures/identity.ts'
import { createDiceStore, type RollVisibility, type StoredRoll } from './fixtures/dice-store.ts'
import { combatServer } from './fixtures/combat.ts'
import { expectTouchTargets } from './fixtures/audit.ts'

// RYT-133: the table's dice. The DM's setting, the sheet in physical mode (what to roll, and
// recording the result), the sheet in app mode (3D dice, the maths, the recent rolls), who sees
// which roll, and initiative and hit dice following the same mode.
const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`
const diceUrl = `./#/campaign/${campaignId}/members?panel=dice`

async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible, main a.mantine-Button-root:visible, [role="dialog"] button:visible, [role="dialog"] input[type="text"]:visible, .dice-set-option:visible',
  )
}

/**
 * Dice in the app are rolled by the server, so the fixture server is what is made deterministic:
 * the faces it is given are the ones it rolls, in order (anything else it rolls at random). The
 * 3D engine only decorates, and with reduced motion it never loads.
 */
const serverFaces = (f: { dice: { serverDice: number[] } }, faces: number[]) => {
  f.dice.serverDice.push(...faces)
}

const logged = (calls: { method: string; body: Record<string, unknown> }[]) =>
  calls.filter((call) => call.method === 'log_roll')
const settingsCalls = (calls: { method: string; body: Record<string, unknown> }[]) =>
  calls.filter((call) => call.method === 'set_dice_settings')

/** The bard of the fixture: DEX 14 (+2), proficiency +3, Perception +3, Performance +8. */
const medal = (page: Page, key: 'FUE' | 'DES' | 'CON' | 'INT' | 'SAB' | 'CAR') =>
  page.locator('.ability-medal', { has: page.locator('abbr', { hasText: key }) })

async function openTile(page: Page, name: RegExp) {
  const tile = page.locator('.panel-tile').filter({ hasText: name })
  await tile.click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  return { tile, sheet }
}

async function equipSword(page: Page) {
  await page.goto(`./#/campaign/${campaignId}/inventory`)
  await page.getByRole('button', { name: /Espada larga, cantidad 1/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Equipar' }).click()
  await expect(page.locator('.inventory-notice')).toContainText('Equipado en Mano principal')
  await page.goto(sheetUrl)
}

test('RYT-133 the DM sets the dice: confirmation, a failure, the same request retried, who sees rolls', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { party: true, sheet: 'complete' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(diceUrl)
  const section = page.getByRole('region', { name: 'Dados de la mesa' })
  await expect(page.getByRole('tab', { name: 'Dados', selected: true })).toBeVisible()
  // Physical dice and the roller plus the DM are the defaults.
  const mode = section.getByRole('group', { name: 'Cómo se tira' })
  const visibility = section.getByRole('group', { name: 'Quién ve las tiradas' })
  await expect(mode.getByRole('radio', { name: /Dados físicos/ })).toBeChecked()
  await expect(visibility.getByRole('radio', { name: /Quien tira y el DM/ })).toBeChecked()
  await expect(section.getByRole('button', { name: 'Aplicar cambios' })).toHaveCount(0)
  await audit(page)
  if (process.env.RYT_CAPTURE) await page.screenshot({ path: info.outputPath('dice-setting.png') })

  // The radios are visually hidden: the labels are what a finger taps.
  await section.locator('label', { hasText: 'Dados en la app' }).click()
  await expect(mode.getByRole('radio', { name: /Dados en la app/ })).toBeChecked()
  await section.locator('label', { hasText: 'Toda la mesa' }).click()
  const apply = section.getByRole('button', { name: 'Aplicar cambios' })
  await apply.click()
  const dialog = page.getByRole('dialog', { name: '¿Cambiar los dados de la mesa?' })
  await expect(dialog).toContainText('Dados en la app')
  await expect(dialog).toContainText('Toda la mesa')
  await expect(dialog).toContainText('Las tiradas anteriores no se muestran a más gente')
  // Nothing is sent until the DM confirms.
  expect(settingsCalls(f.calls)).toHaveLength(0)
  await audit(page)

  // A failure leaves the settings as they were; the reason takes the focus and the same button
  // retries the same request.
  f.dice.failNext = { rpc: 'set_dice_settings', message: 'Unavailable' }
  await dialog.getByRole('button', { name: 'Confirmar' }).click()
  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('No se guardaron los ajustes de dados')
  await expect(alert).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator(':focus')).toHaveCount(1)
  expect(f.dice.settings()).toEqual({ dice_mode: 'physical', roll_visibility: 'roller_dm' })
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog).toHaveCount(0)
  const sent = settingsCalls(f.calls)
  expect(sent).toHaveLength(2)
  expect(sent[0]!.body.request_id).toBe(sent[1]!.body.request_id)
  expect(sent[1]!.body).toMatchObject({
    target_campaign: campaignId,
    new_dice_mode: 'app',
    new_roll_visibility: 'table',
  })
  expect(f.dice.settings()).toEqual({ dice_mode: 'app', roll_visibility: 'table' })
  await expect(section.locator('.dice-set-saved')).toHaveText('Ajustes de dados guardados.')
  await expect(mode.getByRole('radio', { name: /Dados en la app/ })).toBeChecked()
  await expect(mode.locator('.dice-set-current')).toHaveText('En uso')
  await expect(apply).toHaveCount(0)

  // Narrowing says what is lost; Escape closes the question, focus returns and nothing is sent.
  await section.locator('label', { hasText: 'Solo quien tira' }).click()
  await apply.click()
  await expect(page.getByRole('dialog')).toContainText(
    'tú dejas de ver las de los jugadores, las anteriores incluidas',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(apply).toBeFocused()
  expect(settingsCalls(f.calls)).toHaveLength(2)
  // Each Player chooses: no consequence is promised beyond the device.
  await section.locator('label', { hasText: 'Cada jugador elige' }).click()
  await apply.click()
  await expect(page.getByRole('dialog')).toContainText('hasta que elija, usa dados físicos')
  await page.keyboard.press('Escape')
})

test('RYT-133 a refused change says so, and a Player has no dice tab', async ({ page }) => {
  const f = await identityFixture(page, { party: true, sheet: 'complete' })
  await page.goto(diceUrl)
  const section = page.getByRole('region', { name: 'Dados de la mesa' })
  await section.locator('label', { hasText: 'Dados en la app' }).click()
  await section.getByRole('button', { name: 'Aplicar cambios' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Cambiar los dados de la mesa?' })
  f.dice.failNext = { rpc: 'set_dice_settings', message: 'Forbidden' }
  await dialog.getByRole('button', { name: 'Confirmar' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Solo un DM de esta campaña puede cambiar los dados.',
  )
  await expect(dialog.getByRole('alert')).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Confirmar' })).toBeVisible()
})

test('RYT-133 a Player never sees the dice settings', async ({ page }) => {
  await identityFixture(page, { player: true, party: true, sheet: 'complete' })
  await page.goto(diceUrl)
  await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Dados' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Cómo se tira' })).toHaveCount(0)
})

test('RYT-133 physical dice: each line says what to roll, and the result can be recorded', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    inventory: true,
    party: true,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await equipSword(page)

  // Checks and saves, on the sheet itself: the modifier and what to roll with it.
  const dex = medal(page, 'DES')
  await expect(
    dex.getByRole('button', { name: 'Anotar la tirada de Prueba de Destreza, d20 + 2' }),
  ).toContainText('d20+2')
  await expect(
    dex.getByRole('button', { name: 'Anotar la tirada de Salvación de Destreza, d20 + 5' }),
  ).toContainText('d20+5')
  await expect(medal(page, 'FUE')).toContainText('d20−1')
  await expect(medal(page, 'SAB')).toContainText('d20')
  await expect(page.locator('.roll-hint').first()).toContainText('anotar el resultado')
  await audit(page)

  // Skills: the formula replaces the bare bonus.
  const skills = await openTile(page, /Habilidades/)
  await expect(
    skills.sheet
      .getByRole('button', { name: /Anotar la tirada de Percepción, d20 \+ 3/ })
      .locator('.roll-point-text'),
  ).toHaveText('d20 + 3')
  await expect(
    skills.sheet
      .getByRole('button', { name: /Anotar la tirada de Interpretación, d20 \+ 8/ })
      .locator('.roll-point-text'),
  ).toHaveText('d20 + 8')
  await audit(page)
  await page.keyboard.press('Escape')
  await expect(skills.sheet).toHaveCount(0)

  // Attacks: to hit and damage for the weapon; an unarmed strike without a die has no damage roll.
  const attacks = await openTile(page, /Ataques/)
  const hit = attacks.sheet.getByRole('button', {
    name: /Anotar la tirada de Ataque con Espada larga, d20/,
  })
  const damage = attacks.sheet.getByRole('button', {
    name: /Anotar la tirada de Daño de Espada larga, 1d8/,
  })
  await expect(hit.locator('.roll-point-text')).toHaveText(/^d20 [+−] \d+$/)
  // The to-hit number keeps its meaning in the accessible name.
  await expect(hit).toHaveAccessibleName(
    /\d al ataque, Anotar la tirada de Ataque con Espada larga/,
  )
  // Two-handed damage (1d10) is a line of its own that can be recorded.
  await expect(
    attacks.sheet.getByRole('button', { name: /Anotar la tirada de Daño de Espada larga, 1d10/ }),
  ).toContainText('a dos manos')
  await expect(damage.locator('.roll-point-text')).toHaveText(/^1d8( [+−] \d+)?$/)
  await expect(attacks.sheet.getByRole('button', { name: /Daño: Ataque desarmado/ })).toHaveCount(0)
  await audit(page)

  // Recording: the dice are typed and checked against what the sheet said to roll.
  await damage.click()
  const record = page.getByRole('dialog', { name: 'Anotar: Daño de Espada larga' })
  await expect(record.getByText(/^Tira 1d8/)).toBeVisible()
  const die = record.getByRole('textbox', { name: 'Resultado del d8' })
  await expect(die).toBeFocused()
  await audit(page)
  await die.fill('9')
  await record.getByRole('button', { name: 'Anotar', exact: true }).click()
  await expect(record.getByText('Escribe un número de 1 a 8.')).toBeVisible()
  expect(logged(f.calls)).toHaveLength(0)
  await die.fill('6')
  await expect(record.getByRole('status')).toContainText(/^6( [+−] \d+)? = \d+$/)
  const sum = (await record.getByRole('status').textContent())!
  const total = Number(sum.split('=')[1])

  // A failed save keeps the dialog open; the reason takes the focus; the retry repeats the request.
  f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
  await record.getByRole('button', { name: 'Anotar', exact: true }).click()
  await expect(record.getByRole('alert')).toContainText('La tirada no llegó a la mesa')
  await expect(record.getByRole('alert')).toBeFocused()
  expect(f.dice.rolls).toHaveLength(0)
  await record.getByRole('button', { name: 'Reintentar' }).click()
  await expect(record).toHaveCount(0)
  const sent = logged(f.calls)
  expect(sent).toHaveLength(2)
  expect(sent[0]!.body.request_id).toBe(sent[1]!.body.request_id)
  expect(sent[1]!.body).toMatchObject({
    target_campaign: campaignId,
    target_character: characterId,
    roll_label: 'Espada larga',
    roll_kind: 'damage',
    roll_source: 'recorded',
    recorded_dice: [6],
    recorded_total: total,
  })
  expect(f.dice.rolls).toHaveLength(1)
  // Focus is back on the line that was tapped, and the result is at the foot of the open block.
  await expect(damage).toBeFocused()
  const result = attacks.sheet.getByRole('region', { name: 'Última tirada' })
  await expect(result).toContainText(String(total))
  await expect(result).toContainText('Anotada. La ven quien tira y el DM.')
  await audit(page)
  await page.keyboard.press('Escape')

  // The strip on the sheet lists it, marked as recorded.
  const strip = page.getByRole('region', { name: 'Últimas tiradas' })
  await expect(strip.locator('.roll-entry')).toHaveCount(1)
  await expect(strip.locator('.roll-entry-name')).toHaveText('Daño de Espada larga · Arin (tú)')
  await audit(page)

  // Escape cancels without recording and gives the focus back to the line that was tapped.
  await page
    .getByRole('button', { name: 'Anotar la tirada de Prueba de Destreza, d20 + 2' })
    .click()
  const second = page.getByRole('dialog', { name: 'Anotar: Prueba de Destreza' })
  await second.getByRole('textbox', { name: 'Resultado del d20' }).fill('14')
  await expect(second.getByRole('status')).toHaveText('14 + 2 = 16')
  await page.keyboard.press('Escape')
  await expect(second).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Anotar la tirada de Prueba de Destreza, d20 + 2' }),
  ).toBeFocused()
  expect(logged(f.calls)).toHaveLength(2)
})

const spoken = (page: Page) => page.locator('p.visually-hidden[role="status"]')

test('RYT-133 dice in the app: Rytta rolls on the server, the card and the strip show its dice', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  serverFaces(f, [14, 3, 20, 5])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  // With no rolls yet the strip says what to do.
  const strip = page.getByRole('region', { name: 'Últimas tiradas' })
  await expect(strip).toContainText('Aún no hay tiradas.')
  await expect(page.locator('.roll-hint').first()).toContainText('Toca un número subrayado')
  await expect(spoken(page)).toHaveText('')
  await audit(page)

  // The accessible name holds the visible text and what a tap does.
  const check = page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' })
  await expect(check).toContainText('+2')
  await expect(check).toHaveAccessibleName(/Modificador \+2, Tirar Prueba de Destreza, d20 \+ 2/)
  // A proficient save keeps "proficient" in its name, and the visible +5 is in it too.
  await expect(
    page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }),
  ).toHaveAccessibleName(/Salvación de Destreza \+5, Competente, Tirar Salvación de Destreza/)
  await check.click()
  const result = page.getByRole('region', { name: 'Última tirada' })
  await expect(result.locator('.roll-result-total')).toHaveText('16')
  await expect(result).toContainText('Prueba de Destreza')
  await expect(result.locator('.roll-result-maths')).toContainText('14')
  await expect(result.locator('.roll-result-maths')).toContainText('+ 2')
  await expect(result.locator('.roll-result-maths')).toContainText('d20 + 2')
  // Who made it and who sees it: the source and the visibility the roll was stored with.
  await expect(result.locator('.roll-result-state')).toHaveText(
    'Tirada por Rytta. La ven quien tira y el DM.',
  )
  // The region is always mounted and was empty: the roll, its source and who sees it are spoken.
  await expect(spoken(page)).toHaveText(
    'Prueba de Destreza: 14 + 2 = 16. Tirada por Rytta. La ven quien tira y el DM.',
  )
  // Reduced motion: no stage for the 3D dice was ever created.
  await expect(page.locator('#rytta-dice-stage')).toHaveCount(0)
  // The request carried no dice: the server rolled, and its roll is the only one.
  expect(logged(f.calls)).toHaveLength(1)
  expect(logged(f.calls)[0]!.body).toMatchObject({
    target_character: characterId,
    roll_label: 'dex',
    roll_kind: 'ability',
    roll_expression: 'd20+2',
    roll_source: 'app',
    recorded_dice: null,
    recorded_total: null,
  })
  expect(f.dice.rolls[0]).toMatchObject({ source: 'app', dice: [14], total: 16 })
  // The strip agrees with the card and labels the source.
  await expect(strip.locator('.roll-entry-total').first()).toContainText('16')
  await expect(strip.locator('.roll-entry-maths').first()).toContainText(
    '14 + 2 · Tirada por Rytta',
  )
  await expect(check).toBeFocused()
  await audit(page)

  // A save of Dexterity, rolled from the strip of abilities too.
  await page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }).click()
  await expect(result.locator('.roll-result-total')).toHaveText('8')
  await expect(strip.locator('.roll-entry')).toHaveCount(2)
  await expect(strip.locator('.roll-entry-total').first()).toContainText('8')

  // A skill inside the open block: the result stays at its foot, in view.
  const skills = await openTile(page, /Habilidades/)
  await skills.sheet.getByRole('button', { name: /Tirar Percepción, d20 \+ 3/ }).click()
  const inSheet = skills.sheet.getByRole('region', { name: 'Última tirada' })
  await expect(inSheet.locator('.roll-result-total')).toHaveText('23')
  const viewport = page.viewportSize()!
  const box = (await inSheet.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  // One result at a time: the page behind does not repeat it.
  await expect(page.getByRole('region', { name: 'Última tirada' })).toHaveCount(1)
  await audit(page)
  await inSheet.getByRole('button', { name: 'Cerrar la tirada' }).click()
  await expect(inSheet).toHaveCount(0)
  await page.keyboard.press('Escape')

  // The fourth roll: three show, the rest open from "Ver las 4".
  serverFaces(f, [5])
  await page.getByRole('button', { name: 'Tirar Prueba de Fuerza, d20 − 1' }).click()
  await expect(strip.locator('.roll-entry')).toHaveCount(3)
  const all = strip.getByRole('button', { name: 'Ver las 4' })
  await all.click()
  const drawer = page.getByRole('dialog', { name: 'Últimas tiradas' })
  await expect(drawer.locator('.roll-entry')).toHaveCount(4)
  await audit(page)
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
  await expect(all).toBeFocused()
})

test('RYT-133 a failed roll shows nothing rolled; the retry repeats the request and a lost reply returns the same roll', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  serverFaces(f, [11, 12, 6])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  // The request never reaches the table: no dice, no total, no local roll to fall back on.
  f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
  await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
  const result = page.getByRole('region', { name: 'Última tirada' })
  await expect(result.locator('.roll-result-total')).toHaveText('–')
  await expect(result).toContainText('Sin tirar')
  await expect(result.locator('.roll-die')).toHaveCount(0)
  const alert = result.getByRole('alert')
  await expect(alert).toContainText('La tirada no llegó a la mesa')
  await expect(alert).toBeFocused()
  expect(f.dice.rolls).toHaveLength(0)
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(result.locator('.roll-result-total')).toHaveText('13')
  await expect(result.getByRole('alert')).toHaveCount(0)
  const first = logged(f.calls)
  expect(first).toHaveLength(2)
  expect(first[0]!.body.request_id).toBe(first[1]!.body.request_id)
  expect(f.dice.rolls).toHaveLength(1)

  // The roll is stored but the answer is lost: the retry with the same id returns that roll
  // (the face 12, so 17), never a new one (the next face, 6, stays unused).
  f.dice.loseReplyNext = true
  await page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }).click()
  await expect(result.getByRole('alert')).toBeFocused()
  expect(f.dice.rolls).toHaveLength(2)
  await result.getByRole('button', { name: 'Reintentar' }).click()
  await expect(result.locator('.roll-result-total')).toHaveText('17')
  const replay = logged(f.calls).slice(2)
  expect(replay).toHaveLength(2)
  expect(replay[0]!.body.request_id).toBe(replay[1]!.body.request_id)
  expect(f.dice.rolls).toHaveLength(2)
  expect(f.dice.serverDice).toEqual([6])
  // A new roll is a new request.
  await page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }).click()
  await expect(result.locator('.roll-result-total')).toHaveText('11')
  expect(new Set(logged(f.calls).map((call) => call.body.request_id)).size).toBe(3)

  // Thirty rolls a minute: the next one is refused with its own message.
  const now = Date.now()
  for (let n = 0; n < 27; n += 1)
    f.dice.rolls.push({
      id: `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      campaign_id: campaignId,
      character_id: characterId,
      roller_id: playerId,
      label: 'dex',
      expression: 'd20',
      dice: [4],
      total: 4,
      kind: 'ability',
      source: 'recorded',
      visibility: 'roller_dm',
      created_at: new Date(now - 1000).toISOString(),
    })
  await page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }).click()
  await expect(result.getByRole('alert')).toContainText('Demasiadas tiradas seguidas')
})

test('RYT-133 when the DM has changed the mode, the refusal says so and the sheet follows', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  const roll = page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' })
  await expect(roll).toBeVisible()
  // The DM moves the table to physical dice; this device has not read it yet.
  f.dice.dice_mode = 'physical'
  await roll.click()
  const result = page.getByRole('region', { name: 'Última tirada' })
  await expect(result.getByRole('alert')).toContainText('El DM ha cambiado los dados de la mesa')
  // Nothing was rolled and there is no retry to offer: the campaign is read again instead.
  await expect(result.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  expect(f.dice.rolls).toHaveLength(0)
  await expect(medal(page, 'DES')).toContainText('d20+2')
  await expect(
    page.getByRole('button', { name: 'Anotar la tirada de Prueba de Destreza, d20 + 2' }),
  ).toBeVisible()
})

test('RYT-133 a character that cannot roll has plain numbers, not roll buttons', async ({
  page,
}) => {
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
    absent: true,
  })
  await page.goto(sheetUrl)
  await expect(medal(page, 'DES')).toContainText('+2')
  await expect(page.locator('.roll-point')).toHaveCount(0)
  await expect(page.locator('.roll-hint')).toHaveCount(0)
})

test('RYT-133 each Player chooses: physical until the choice, kept on this device', async ({
  page,
}, info) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'player',
  })
  serverFaces(f, [9])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  const choice = page.getByRole('radiogroup', { name: 'Tus dados' })
  await expect(choice.getByRole('radio', { name: 'Físicos' })).toBeChecked()
  await expect(
    page.getByText('Cada jugador elige en su dispositivo; tu elección se guarda aquí.'),
  ).toBeVisible()
  await expect(medal(page, 'DES')).toContainText('d20+2')
  await audit(page)
  await choice.locator('label', { hasText: 'En la app' }).click()
  await expect(choice.getByRole('radio', { name: 'En la app' })).toBeChecked()
  await expect(medal(page, 'DES')).not.toContainText('d20+2')
  await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
  await expect(page.locator('.roll-result-total')).toHaveText('11')
  expect(logged(f.calls)).toHaveLength(1)
  // The choice is the device's: it survives a reload, and is never sent to the server.
  await page.reload()
  await expect(
    page.getByRole('radiogroup', { name: 'Tus dados' }).getByRole('radio', { name: 'En la app' }),
  ).toBeChecked()
  expect(
    f.calls.some(
      (call) => JSON.stringify(call.body).includes('"app"') && call.method !== 'log_roll',
    ),
  ).toBe(false)
  if (info.project.name.endsWith('mobile') && process.env.RYT_CAPTURE)
    await page.screenshot({ path: info.outputPath('dice-choice.png') })
})

test('RYT-133 physical tables see no choice and no strip until a roll exists', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.goto(sheetUrl)
  await expect(medal(page, 'DES')).toContainText('d20+2')
  await expect(page.getByRole('radiogroup', { name: 'Tus dados' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Últimas tiradas' })).toHaveCount(0)
})

type Viewer = 'dm' | 'arin' | 'bea'
const scenarios: {
  name: string
  current: RollVisibility
  stored: RollVisibility
  sees: Record<Viewer, string[]>
}[] = [
  {
    name: 'the whole table',
    current: 'table',
    stored: 'table',
    sees: { dm: ['Arin', 'Bea'], arin: ['Arin', 'Bea'], bea: ['Arin', 'Bea'] },
  },
  {
    name: 'the roller and the DM',
    current: 'roller_dm',
    stored: 'roller_dm',
    sees: { dm: ['Arin', 'Bea'], arin: ['Arin'], bea: ['Bea'] },
  },
  {
    name: 'only the roller',
    current: 'roller',
    stored: 'roller',
    sees: { dm: [], arin: ['Arin'], bea: ['Bea'] },
  },
  {
    // Widening never reveals the rolls made under the narrower setting.
    name: 'widened to the table after the rolls were made for the roller and the DM',
    current: 'table',
    stored: 'roller_dm',
    sees: { dm: ['Arin', 'Bea'], arin: ['Arin'], bea: ['Bea'] },
  },
  {
    // Narrowing hides the earlier rolls from everyone who no longer may read them.
    name: 'narrowed to the roller after the rolls were made for the table',
    current: 'roller',
    stored: 'table',
    sees: { dm: [], arin: ['Arin'], bea: ['Bea'] },
  },
]

function seededRolls(stored: RollVisibility): StoredRoll[] {
  const at = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()
  return [
    {
      id: '51000000-0000-4000-8000-000000000001',
      campaign_id: campaignId,
      character_id: characterId,
      roller_id: playerId,
      label: 'perception',
      expression: 'd20+3',
      dice: [18],
      total: 21,
      kind: 'skill',
      source: 'app',
      visibility: stored,
      created_at: at(120),
    },
    {
      id: '51000000-0000-4000-8000-000000000002',
      campaign_id: campaignId,
      character_id: beaId,
      roller_id: peerId,
      label: 'stealth',
      expression: 'd20+2',
      dice: [15],
      total: 17,
      kind: 'skill',
      source: 'recorded',
      visibility: stored,
      created_at: at(60),
    },
  ]
}

async function viewerPage(
  browser: Browser,
  info: TestInfo,
  viewer: Viewer,
  store: ReturnType<typeof createDiceStore>,
) {
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    hasTouch: info.project.use.hasTouch,
  })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await identityFixture(page, {
    party: true,
    sheet: 'complete',
    dice: store,
    ...(viewer === 'dm' ? {} : { player: true }),
    ...(viewer === 'bea' ? { as: peerId } : {}),
  })
  await page.goto(viewer === 'bea' ? `./#/campaign/${campaignId}/party/${beaId}` : sheetUrl)
  await expect.poll(() => fixture.calls.some((call) => call.method === 'campaign_rolls')).toBe(true)
  return { page, fixture }
}

for (const scenario of scenarios)
  test(`RYT-133 rolls shown by ${scenario.name}: the DM, the roller and another Player`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const store = createDiceStore({
      mode: 'app',
      visibility: scenario.current,
      rolls: seededRolls(scenario.stored),
    })
    for (const viewer of ['dm', 'arin', 'bea'] as const) {
      const { page } = await viewerPage(browser, info, viewer, store)
      const entries = page.locator('.roll-entry-name')
      if (scenario.sees[viewer].length === 0) {
        await expect(page.getByRole('region', { name: 'Últimas tiradas' })).toContainText(
          'Aún no hay tiradas',
        )
        await expect(entries).toHaveCount(0)
      } else {
        await expect(entries).toHaveCount(scenario.sees[viewer].length)
        const names = (await entries.allTextContents()).map((text) =>
          text.replace(/^.* · /, '').replace(' (tú)', ''),
        )
        expect(names.sort()).toEqual([...scenario.sees[viewer]].sort())
        // The table can tell a roll Rytta made from one that was typed: Arin's was rolled by
        // Rytta, Bea's was recorded.
        for (const name of scenario.sees[viewer]) {
          const entry = page.locator('.roll-entry', { hasText: `· ${name}` })
          await expect(entry.locator('.roll-entry-maths')).toContainText(
            name === 'Arin' ? 'Tirada por Rytta' : 'Anotada',
          )
        }
      }
      // Whoever rolled it reads it as their own.
      if (viewer === 'arin' && scenario.sees.arin.includes('Arin'))
        await expect(page.locator('.roll-entry[data-own]')).toHaveCount(1)
      await page.context().close()
    }
  })

test('RYT-133 a roll another account makes reaches an open sheet, and the DM setting reaches it too', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const store = createDiceStore({ mode: 'app', visibility: 'table' })
  const { page } = await viewerPage(browser, info, 'bea', store)
  await expect(page.locator('.roll-entry')).toHaveCount(0)
  // Arin rolls from another device; Bea's sheet picks it up without a reload.
  const reply = store.logRoll(
    playerId,
    { role: 'player', active: true },
    (id) => ({ id, user_id: playerId, archived: false, absent: false }),
    {
      target_campaign: campaignId,
      target_character: characterId,
      roll_label: 'dex',
      roll_expression: 'd20+2',
      roll_kind: 'ability',
      roll_source: 'recorded',
      recorded_dice: [17],
      recorded_total: 19,
      request_id: '52000000-0000-4000-8000-000000000001',
    },
  )
  expect(reply.status).toBe(200)
  await expect(page.locator('.roll-entry-name')).toHaveText('Prueba de Destreza · Arin', {
    timeout: 30_000,
  })
  // The DM narrows the setting: the roll leaves Bea's strip at the next refresh.
  store.roll_visibility = 'roller'
  store.revision += 1
  await expect(page.locator('.roll-entry')).toHaveCount(0, { timeout: 30_000 })
})

test('RYT-133 initiative follows the campaign dice: typed with physical dice, rolled in the app', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  for (const mode of ['physical', 'app'] as const) {
    const server = combatServer()
    server.seedInitiative()
    const context = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const f = await identityFixture(page, {
      player: true,
      party: true,
      sheet: 'complete',
      modules: ['party', 'combat'],
      diceMode: mode,
    })
    serverFaces(f, [13])
    await server.install(page)
    await page.goto(`./#/campaign/${campaignId}/combat`)
    const entry = page.locator('.combat-entry')
    await expect(entry).toBeVisible({ timeout: 15_000 })
    const keypad = page.getByRole('group', { name: 'Teclado numérico' })
    const rollButton = entry.getByRole('button', { name: 'Tirar por mí' })
    const field = entry.locator('.combat-d20-input input')
    if (mode === 'physical') {
      await expect(rollButton).toHaveCount(0)
      await expect(keypad).toBeVisible()
      await expect(entry.locator('.combat-entry-formula')).toContainText('Tira d20 + 2')
      await page.getByRole('button', { name: '1', exact: true }).click()
      await page.getByRole('button', { name: '7', exact: true }).click()
      await expect(field).toHaveValue('17')
      expect(logged(f.calls)).toHaveLength(0)
    } else {
      await expect(keypad).toHaveCount(0)
      await expect(field).toHaveAttribute('readonly', '')
      // A request that fails rolls nothing: the total stays empty and the same button retries.
      f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
      await rollButton.click()
      await expect(entry.locator('.combat-entry-formula')).toContainText(
        'No se pudo tirar la iniciativa',
      )
      await expect(field).toHaveValue('')
      await entry.getByRole('button', { name: 'Reintentar' }).click()
      // The server's dice and total are the only ones: 13 + 2.
      await expect(field).toHaveValue('15')
      await expect(entry.locator('.combat-entry-formula')).toContainText('Salió 13 + 2 = 15')
      expect(logged(f.calls)).toHaveLength(2)
      expect(logged(f.calls)[0]!.body.request_id).toBe(logged(f.calls)[1]!.body.request_id)
      expect(logged(f.calls)[1]!.body).toMatchObject({
        roll_kind: 'initiative',
        roll_expression: 'd20+2',
        roll_source: 'app',
        recorded_dice: null,
        recorded_total: null,
      })
      expect(f.dice.rolls[0]).toMatchObject({ source: 'app', dice: [13], total: 15 })
      // Rolled once: no second roll, whatever the total.
      await expect(rollButton).toHaveCount(0)
      await expect(entry).toContainText('Ya tiraste: 15. Guarda esa tirada para fijarla.')
      await expect(entry.locator('.combat-entry-formula')).toContainText('Tirada por Rytta')
      // The roll lives in the Player's own roll log, not in the screen: after a reload the entry
      // reopens with that same server roll and no roll button, and the same total is what is saved.
      await page.reload()
      await expect(entry).toBeVisible({ timeout: 15_000 })
      await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
      await expect(field).toHaveValue('15')
      await expect(entry).toContainText('Ya tiraste: 15. Guarda esa tirada para fijarla.')
      await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toBeEnabled()
      expect(f.dice.rolls).toHaveLength(1)
    }
    await expectTouchTargets(page, '.combat-entry button:visible', { height: 44 })
    await context.close()
  }
})

test('RYT-133 hit dice follow the campaign dice: typed with physical dice, rolled in the app', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  serverFaces(f, [6])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Descanso corto' }).click()
  await page
    .getByRole('dialog', { name: '¿Pedir un descanso corto al grupo?' })
    .getByRole('button', { name: 'Pedir descanso' })
    .click()
  const dice = page
    .getByRole('dialog', { name: 'Descanso del grupo' })
    .getByRole('group', { name: /Dados de golpe que gastas/ })
  await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
  // The roll is a result Rytta makes, not a field to fill in.
  await expect(dice.getByRole('textbox', { name: 'Tu tirada' })).toHaveCount(0)
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('Sin tirar')
  // A failed request rolls nothing: the field stays empty and the same button retries.
  f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
  await dice.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice.getByRole('alert')).toContainText('No se pudieron tirar los dados de golpe')
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('Sin tirar')
  await dice.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('6')
  await expect(dice.locator('.rest-dice-faces')).toContainText('Tirada por Rytta')
  await expect(dice).toContainText('Ya tiraste los dados de golpe: 6.')
  // Rolled by the server with the CON modifier counted once per die, on one request id.
  expect(logged(f.calls)).toHaveLength(2)
  expect(logged(f.calls)[0]!.body.request_id).toBe(logged(f.calls)[1]!.body.request_id)
  expect(logged(f.calls)[0]!.body).toMatchObject({
    roll_kind: 'hit_die',
    roll_expression: '1d8+2',
    roll_source: 'app',
    recorded_dice: null,
    recorded_total: null,
  })
  expect(f.dice.rolls[0]).toMatchObject({ source: 'app', dice: [6], total: 8 })

  // Closing the panel and opening it again, or reloading, keeps the roll: it is read from the roll
  // log, so there is no second roll to make and the count cannot change.
  for (const how of ['reopen', 'reload'] as const) {
    if (how === 'reload') await page.reload()
    else await page.keyboard.press('Escape')
    await page
      .getByRole('region', { name: 'Descanso del grupo' })
      .getByRole('button', { name: /^(Votar|Ver)$/ })
      .click()
    const again = page
      .getByRole('dialog', { name: 'Descanso del grupo' })
      .getByRole('group', { name: /Dados de golpe que gastas/ })
    await expect(again.locator('.rest-roll-result-value')).toHaveText('6')
    await expect(again.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
    await expect(again).toContainText('Ya tiraste los dados de golpe: 6.')
    await expect(again.locator('.rest-stepper-value')).toHaveText('1')
    expect(f.dice.rolls).toHaveLength(1)
  }
})

test('RYT-133 the DM can roll for a character on its sheet, rolled for that character', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    party: true,
    sheet: 'complete',
    linkedPlayer: true,
    diceMode: 'app',
  })
  serverFaces(f, [10])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
  await expect(page.locator('.roll-result-total')).toHaveText('12')
  expect(logged(f.calls)[0]!.body).toMatchObject({ target_character: characterId })
  // The DM reads their own roll in the strip.
  await expect(page.locator('.roll-entry-name')).toContainText('Prueba de Destreza · Arin (tú)')
})

test('RYT-133 English and the light theme: labels in the viewer language, nothing overflows', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-theme', 'parchment')
  })
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
    rollVisibility: 'table',
  })
  serverFaces(f, [12])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.roll-hint').first()).toContainText('Tap an underlined number')
  await page.getByRole('button', { name: 'Roll Dexterity check, d20 + 2' }).click()
  const result = page.getByRole('region', { name: 'Latest roll' })
  await expect(result).toContainText('Dexterity check')
  await expect(result).toContainText('Rolled by Rytta. The whole table sees it.')
  await expect(page.locator('.roll-entry-name')).toContainText('Dexterity check · Arin (you)')
  await audit(page)
  if (process.env.RYT_CAPTURE) await page.screenshot({ path: info.outputPath('dice-en-light.png') })
})

test('RYT-133 the dice stay usable at 150% text', async ({ page }) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  serverFaces(f, [7])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.addStyleTag({ content: 'html { font-size: 150% !important; }' })
  await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
  const result = page.getByRole('region', { name: 'Última tirada' })
  await expect(result).toBeVisible()
  const box = (await result.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
})

test('RYT-133 physical formulas stay inside their own medal, at 100% and at 150% text', async ({
  page,
}) => {
  await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  for (const percent of [100, 150]) {
    await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` })
    await expect(page.locator('.ability-medal .roll-point-formula').first()).toBeVisible()
    const medals = await page.locator('.ability-medal').evaluateAll((items) =>
      items.map((item) => {
        const box = (element: Element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect()
          return { left, right, top, bottom }
        }
        return {
          medal: box(item),
          parts: [
            ...item.querySelectorAll('.roll-point-formula, .ability-save .roll-point-text'),
          ].map(box),
        }
      }),
    )
    const all = medals.flatMap((entry) => entry.parts)
    expect(all.length).toBe(12)
    for (const { medal, parts } of medals)
      for (const part of parts) {
        expect(part.left, `${percent}%`).toBeGreaterThanOrEqual(medal.left - 0.5)
        expect(part.right, `${percent}%`).toBeLessThanOrEqual(medal.right + 0.5)
        expect(part.top, `${percent}%`).toBeGreaterThanOrEqual(medal.top - 0.5)
        expect(part.bottom, `${percent}%`).toBeLessThanOrEqual(medal.bottom + 0.5)
      }
    // No two formulas touch, so no underline runs from one medal into the next.
    for (const [index, a] of all.entries())
      for (const b of all.slice(index + 1))
        expect(
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          `${percent}%: two formulas overlap`,
        ).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
})

test('RYT-133 one reveal moment: the strip does not show the roll while the card is still rolling', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  serverFaces(f, [14])
  // Motion allowed: the 3D dice tumble beside the request.
  await page.goto(sheetUrl)
  test.skip(
    !(await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')))),
    'The tumble needs WebGL',
  )
  const strip = page.getByRole('region', { name: 'Últimas tiradas' })
  await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
  const card = page.locator('section.roll-result')
  await expect(card).toHaveAttribute('data-phase', 'rolling')
  // The server has answered, yet neither the strip nor the spoken text has the roll.
  await expect.poll(() => f.dice.rolls.length).toBe(1)
  await expect(card).toHaveAttribute('data-phase', 'rolling')
  await expect(strip.locator('.roll-entry')).toHaveCount(0)
  await expect(spoken(page)).not.toContainText('= 16')
  await expect(card).toHaveAttribute('data-phase', 'saved', { timeout: 20_000 })
  await expect(strip.locator('.roll-entry')).toHaveCount(1)
  await expect(card.locator('.roll-result-total')).toHaveText('16')
})

for (const theme of ['parchment', 'default', 'bard'])
  test(`RYT-133 ${theme}: the record dialog error is legible (axe, contrast included)`, async ({
    page,
  }) => {
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    await identityFixture(page, { player: true, sheet: 'complete', party: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(sheetUrl)
    await page
      .getByRole('button', { name: 'Anotar la tirada de Prueba de Destreza, d20 + 2' })
      .click()
    const record = page.getByRole('dialog', { name: 'Anotar: Prueba de Destreza' })
    await record.getByRole('textbox', { name: 'Resultado del d20' }).fill('25')
    await record.getByRole('button', { name: 'Anotar', exact: true }).click()
    await expect(record.getByText('Escribe un número de 1 a 20.')).toBeVisible()
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .include('[role="dialog"]')
      .analyze()
    expect(result.violations).toEqual([])
  })
