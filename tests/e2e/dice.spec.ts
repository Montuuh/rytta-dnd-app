import {
  test,
  expect,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  beaId,
  campaignId,
  characterId,
  dmId,
  identityFixture,
  peerId,
  playerId,
} from './fixtures/identity.ts'
import { createDiceStore, type RollVisibility, type StoredRoll } from './fixtures/dice-store.ts'
import { combatServer } from './fixtures/combat.ts'
import { expectTouchTargets, focusAcrossFrames } from './fixtures/audit.ts'

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

/**
 * The page keeps the one-roll state it first read until the server refuses a roll: another device
 * rolled meanwhile, and the refusal (not a poll) is what makes the page read the state again.
 * Register it before the page loads.
 */
async function staleUntilRefusal(page: Page) {
  let first: string | null = null
  let refused = false
  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/rpc/log_roll') && response.status() === 400) refused = true
    if (url.includes('/rpc/get_roll_context') && first === null && !refused)
      first = await response.text()
  })
  await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
    first === null || refused
      ? route.fallback()
      : route.fulfill({ status: 200, contentType: 'application/json', body: first }),
  )
}

const logged = (calls: { method: string; body: Record<string, unknown> }[]) =>
  calls.filter((call) => call.method === 'log_roll')
const settingsCalls = (calls: { method: string; body: Record<string, unknown> }[]) =>
  calls.filter((call) => call.method === 'set_dice_settings')

/** The bard of the fixture: DEX 14 (+2), proficiency +3, Perception +3, Performance +8. */
const medal = (page: Page, key: 'FUE' | 'DES' | 'CON' | 'INT' | 'SAB' | 'CAR') =>
  page.locator('.ability-medal', { has: page.locator('abbr', { hasText: key }) })

/** The result card and the strip never list the newest roll twice: dismiss the card to read the strip. */
async function dismissCard(page: Page) {
  const close = page.getByRole('button', {
    name: /^(Cerrar la tirada|Dismiss the roll|Close the roll)/,
  })
  if (await close.count()) await close.first().click()
}

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

  // The strip on the sheet lists it, marked as recorded, once the card is out of the way.
  await dismissCard(page)
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
  // The card holds the newest roll, so the strip does not list it twice (RYT-135); with the card
  // dismissed the strip agrees with it and labels the source.
  // The only roll is on the card: no bare heading is left behind.
  await expect(strip).toHaveCount(0)
  await expect(check).toBeFocused()
  await dismissCard(page)
  await expect(strip.locator('.roll-entry-total').first()).toContainText('16')
  await expect(strip.locator('.roll-entry-maths').first()).toContainText(
    '14 + 2 · Tirada por Rytta',
  )
  await audit(page)

  // A save of Dexterity, rolled from the strip of abilities too.
  await page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }).click()
  await expect(result.locator('.roll-result-total')).toHaveText('8')
  await expect(strip.locator('.roll-entry')).toHaveCount(1)
  await expect(strip.locator('.roll-entry-total').first()).toContainText('16')
  await dismissCard(page)
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
    server.useDice(f.dice)
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
      // The server holds the roll, not the screen: after a reload the entry
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
  // The DM reads their own roll in the strip, once the card is dismissed.
  await dismissCard(page)
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
  await dismissCard(page)
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

for (const [theme, wide] of [
  ['default', false],
  ['default', true],
  ['parchment', false],
  ['bard', false],
] as const)
  test(`RYT-135 at 150% text the sticky roll card leaves the sheet usable, rolled and failed in ${theme}${wide ? ' (wide font)' : ''}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'identity-mobile', 'The phone sheet is checked at 390px.')
    test.setTimeout(90_000)
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    const f = await identityFixture(page, {
      player: true,
      sheet: 'complete',
      party: true,
      diceMode: 'app',
    })
    serverFaces(f, [7, 12])
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(sheetUrl)
    await page.addStyleTag({
      content: `html { font-size: 150% !important; } ${wide ? '* { font-family: Verdana, sans-serif !important }' : ''}`,
    })
    const skills = await openTile(page, /Habilidades/)
    const viewport = page.viewportSize()!
    const card = skills.sheet.getByRole('region', { name: 'Última tirada' })
    await skills.sheet.getByRole('button', { name: /Tirar Percepción, d20 \+ 3/ }).click()
    await expect(card.locator('.roll-result-total')).toHaveText('10')
    const rolled = (await card.boundingBox())!
    expect(rolled.height).toBeLessThanOrEqual(viewport.height / 3)
    // A failed roll adds the reason and a retry: still no more than a third of the screen.
    f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
    await skills.sheet.getByRole('button', { name: /Tirar Percepción, d20 \+ 3/ }).click()
    await expect(card.getByRole('alert')).toBeVisible()
    const failed = (await card.boundingBox())!
    expect(failed.height).toBeLessThanOrEqual(viewport.height / 3)
    // The roll's name, the reason's title and the retry are in view without scrolling the card.
    const inside = async (locator: Locator) => {
      const box = (await locator.boundingBox())!
      const cardBox = (await card.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(cardBox.y - 1)
      expect(box.y + box.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1)
    }
    await inside(card.locator('.roll-result-name'))
    await inside(card.locator('.mantine-Alert-title'))
    await inside(card.getByRole('button', { name: 'Reintentar' }))
    // Past a third of the screen the card scrolls inside itself: the retry is still reachable.
    await card.getByRole('button', { name: 'Reintentar' }).click({ trial: true })
    await expectTouchTargets(page, '.roll-result button:visible')
    await axeClean(page, `failed roll card in ${theme}`)
    if (process.env.RYT_EVIDENCE && !wide && theme === 'default')
      await page.screenshot({ path: 'docs/evidence/ui-review/ryt-135/roll-card-150-390.png' })
  })

for (const language of ['es', 'en'])
  for (const wide of [false, true])
    test(`RYT-135 the proficiency dot keeps clear of the ability names in ${language}${wide ? ' with a wide font' : ''}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'identity-mobile', 'The 390px phone is the tight case.')
      await page.addInitScript((lang) => localStorage.setItem('rytta-language', lang), language)
      await identityFixture(page, { player: true, sheet: 'complete', party: true })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(sheetUrl)
      if (wide)
        await page.addStyleTag({ content: '* { font-family: Verdana, sans-serif !important }' })
      for (const percent of [100, 150]) {
        await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` })
        await expect(page.locator('.ability-medal .ability-save-dot').first()).toBeAttached()
        const gaps = await page.locator('.ability-medal').evaluateAll((items) =>
          items.flatMap((item) => {
            const dot = item.querySelector('.ability-save-dot')
            if (!dot) return []
            const d = dot.getBoundingClientRect()
            const name = item.querySelector('.ability-name')!.textContent ?? ''
            return [
              '.ability-name abbr',
              '.ability-mod',
              '.ability-score',
              '.ability-save .roll-point-text',
              '.ability-save .roll-point-formula',
            ].flatMap((selector) =>
              [...item.querySelectorAll(selector)].map((part) => {
                const r = part.getBoundingClientRect()
                // Distance between the two boxes (0 when they touch or overlap).
                const dx = Math.max(r.left - d.right, d.left - r.right, 0)
                const dy = Math.max(r.top - d.bottom, d.top - r.bottom, 0)
                return { name: `${name} ${selector}`, gap: Math.hypot(dx, dy) }
              }),
            )
          }),
        )
        // The two proficient saves of the sample sheet carry a dot.
        expect(gaps.length).toBeGreaterThan(0)
        for (const { name, gap } of gaps)
          expect(gap, `${percent}% ${name}`).toBeGreaterThanOrEqual(3)
      }
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
        expect(part.left, `${percent}%`).toBeGreaterThanOrEqual(medal.left + 2)
        expect(part.right, `${percent}%`).toBeLessThanOrEqual(medal.right - 2)
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
  // The card shows it; the strip lists it only once the card is gone.
  await expect(strip).toHaveCount(0)
  await expect(card.locator('.roll-result-total')).toHaveText('16')
  await dismissCard(page)
  await expect(strip.locator('.roll-entry')).toHaveCount(1)
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

const arinId = (server: ReturnType<typeof combatServer>) =>
  server.encounters[0]!.combatants.find((c) => c.name === 'Arin')!.id

async function initiativePage(
  browser: Browser,
  info: TestInfo,
  options: {
    theme?: string
    failLog?: { on: boolean; hits?: number }
    stale?: boolean
    /** The roll store is not told which fight is live (its state names no fight). */
    noDice?: boolean
    /** Collects the urls of the one-roll state requests. */
    reads?: string[]
  } = {},
) {
  const server = combatServer()
  server.seedInitiative()
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    hasTouch: info.project.use.hasTouch,
  })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (options.theme)
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), options.theme)
  const f = await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
    diceMode: 'app',
  })
  if (!options.noDice) server.useDice(f.dice)
  await server.install(page)
  const reads = options.reads
  if (reads)
    page.on('request', (request) => {
      if (request.url().includes('/rpc/get_roll_context')) reads.push(request.url())
    })
  if (options.stale) await staleUntilRefusal(page)
  const failLog = options.failLog
  if (failLog)
    await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) => {
      if (!failLog.on) return route.fallback()
      failLog.hits = (failLog.hits ?? 0) + 1
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"message":"x"}',
      })
    })
  await page.goto(`./#/campaign/${campaignId}/combat`)
  const entry = page.locator('.combat-entry')
  await expect(entry).toBeVisible({ timeout: 15_000 })
  return { server, page, f, entry, context }
}

test('RYT-133 initiative: a total the DM changed wins over the Player roll, and nothing offers to save the old one', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13. Guarda esa tirada para fijarla.')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  // Saved as rolled: reopening says so, offers no roll and nothing to save, and no instruction.
  await page.reload()
  await page.getByRole('button', { name: 'Editar la iniciativa de Arin' }).click()
  await expect(entry).toBeVisible()
  await expect(entry).toContainText('Ya tiraste: 13. Solo el DM puede cambiarla.')
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  // RYT-135: nothing is left to save, so the way out is "Cerrar", not a disabled "Guardar".
  await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toHaveCount(0)
  await expect(entry.getByRole('button', { name: 'Cancelar' })).toHaveCount(0)
  await expect(entry.getByRole('button', { name: 'Cerrar' })).toBeVisible()
  await expect(entry.locator('.combat-entry-formula')).not.toContainText('Rytta tira')
  // The DM sets 9: the row, the d20 and the note all say 9, and the 13 is not offered again.
  server.act('set_initiative', {
    target_combatant: arinId(server),
    initiative_total: 9,
    tiebreak_bonus: null,
    request_id: 'dm-sets-9',
  })
  await page.reload()
  await page.getByRole('button', { name: 'Editar la iniciativa de Arin' }).click()
  await expect(entry.locator('.combat-d20-input input')).toHaveValue('9')
  await expect(entry).toContainText(
    'Tu iniciativa ya está fijada en 9. Solo el DM puede cambiarla.',
  )
  await expect(entry).not.toContainText('Ya tiraste: 13')
  await expect(entry).not.toContainText('Guarda esa tirada')
  await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toHaveCount(0)
  await entry.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar la iniciativa de Arin' })).toBeFocused()
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  expect(f.dice.rolls).toHaveLength(1)
  await context.close()
})

test('RYT-133 initiative: if the roll log cannot load, it says so, retries, and the flow can still be completed', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const failLog: { on: boolean; hits?: number } = { on: true }
  const { page, f, entry, context } = await initiativePage(browser, info, { failLog })
  serverFaces(f, [11, 4])
  // Loading is brief; then the failure is said with a retry, and rolling stays possible.
  const alert = entry.getByRole('alert')
  await expect(alert).toContainText('No se pudieron comprobar tus tiradas anteriores', {
    timeout: 20_000,
  })
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toBeEnabled()
  // A retry that fails again changes nothing. The retry is a new request (the query tries twice), so
  // wait for it to have been answered before the log is allowed to answer.
  const before = failLog.hits ?? 0
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect.poll(() => failLog.hits ?? 0, { timeout: 20_000 }).toBeGreaterThan(before + 1)
  await expect(alert).toContainText('No se pudieron comprobar', { timeout: 20_000 })
  // The retry works once the log answers: the message goes away.
  failLog.on = false
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(entry.getByRole('alert')).toHaveCount(0, { timeout: 20_000 })
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry.locator('.combat-d20-input input')).toHaveValue('13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  await context.close()
})

test('RYT-133 initiative: rolling anyway while the roll log is down still completes the flow', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const { f, entry, context } = await initiativePage(browser, info, { failLog: { on: true } })
  serverFaces(f, [11])
  await expect(entry.getByRole('alert')).toContainText('No se pudieron comprobar', {
    timeout: 20_000,
  })
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13. Guarda esa tirada para fijarla.')
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toBeEnabled()
  await context.close()
})

test('RYT-133 hit dice: if the roll log cannot load, it says so, retries, and the roll can still be made', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const failLog = { on: true }
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
    failLog.on
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' })
      : route.fallback(),
  )
  serverFaces(f, [6, 3])
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
  const alert = dice.getByRole('alert').filter({ hasText: 'No se pudieron comprobar' })
  await expect(alert).toBeVisible({ timeout: 20_000 })
  await expect(dice.getByRole('button', { name: 'Tirar por mí' })).toBeEnabled()
  failLog.on = false
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(alert).toHaveCount(0, { timeout: 20_000 })
  await dice.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('6')
  await expect(dice).toContainText('Ya tiraste los dados de golpe: 6.')
})

test('RYT-135 hit dice: with the roll log down, the roll made on the rest is still there when it is reopened', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  // The log never answers: only this screen knows the roll.
  await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
  )
  serverFaces(f, [6, 3])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Descanso corto' }).click()
  await page
    .getByRole('dialog', { name: '¿Pedir un descanso corto al grupo?' })
    .getByRole('button', { name: 'Pedir descanso' })
    .click()
  const dice = () =>
    page
      .getByRole('dialog', { name: 'Descanso del grupo' })
      .getByRole('group', { name: /Dados de golpe que gastas/ })
  await dice().getByRole('button', { name: 'Gastar un dado más' }).click()
  await expect(
    dice().getByRole('alert').filter({ hasText: 'No se pudieron comprobar' }),
  ).toBeVisible({ timeout: 20_000 })
  await dice().getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('6')
  expect(f.dice.rolls).toHaveLength(1)

  // Closed and opened again in the same session, the log still failing: the same roll, nothing new.
  await page.keyboard.press('Escape')
  await page
    .getByRole('region', { name: 'Descanso del grupo' })
    .getByRole('button', { name: /^(Votar|Ver)$/ })
    .click()
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('6')
  await expect(dice()).toContainText('Ya tiraste los dados de golpe: 6.')
  await expect(dice().locator('.rest-dice-faces')).toContainText('Tirada por Rytta')
  await expect(dice().locator('.rest-stepper-value')).toHaveText('1')
  await expect(dice().getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await expect(dice().getByRole('button', { name: 'Gastar un dado más' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  expect(f.dice.rolls).toHaveLength(1)
})

async function axeClean(page: Page, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    label,
  ).toEqual([])
}

for (const theme of ['default', 'parchment', 'bard'])
  test(`RYT-133 axe is clean on every dice state in ${theme}: rolled, failed, stale mode, record error`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    const f = await identityFixture(page, {
      player: true,
      sheet: 'complete',
      party: true,
      diceMode: 'app',
    })
    serverFaces(f, [14, 9])
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(sheetUrl)
    const result = page.getByRole('region', { name: 'Última tirada' })
    await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
    await expect(result.locator('.roll-result-total')).toHaveText('16')
    await axeClean(page, `${theme}: rolled`)
    f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
    await page.getByRole('button', { name: 'Tirar Salvación de Destreza, d20 + 5' }).click()
    await expect(result.getByRole('alert')).toBeVisible()
    await axeClean(page, `${theme}: failed roll`)
    // The DM moves the table to physical dice; the retry is refused with the stale-mode text.
    f.dice.dice_mode = 'physical'
    await result.getByRole('button', { name: 'Reintentar' }).click()
    await expect(result.getByRole('alert')).toContainText('El DM ha cambiado', { timeout: 10_000 })
    await axeClean(page, `${theme}: stale mode`)
    await page
      .getByRole('button', { name: 'Anotar la tirada de Prueba de Destreza, d20 + 2' })
      .click()
    const record = page.getByRole('dialog', { name: 'Anotar: Prueba de Destreza' })
    await record.getByRole('textbox', { name: 'Resultado del d20' }).fill('25')
    await record.getByRole('button', { name: 'Anotar', exact: true }).click()
    await expect(record.getByText('Escribe un número de 1 a 20.')).toBeVisible()
    await axeClean(page, `${theme}: record error`)
  })

for (const theme of ['default', 'parchment', 'bard'])
  test(`RYT-133 axe is clean on initiative states in ${theme}: log failed, rolled, saved, set by the DM`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const failLog = { on: true }
    const first = await initiativePage(browser, info, { theme, failLog })
    await expect(first.entry.getByRole('alert')).toContainText('No se pudieron comprobar', {
      timeout: 20_000,
    })
    await axeClean(first.page, `${theme}: log failed`)
    serverFaces(first.f, [11])
    await first.entry.getByRole('button', { name: 'Tirar por mí' }).click()
    await expect(first.entry).toContainText('Ya tiraste: 13')
    await axeClean(first.page, `${theme}: rolled`)
    failLog.on = false
    await first.entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
    await expect(first.page.locator('.combat-entry')).toHaveCount(0)
    await first.page.reload()
    await first.page.getByRole('button', { name: 'Editar la iniciativa de Arin' }).click()
    await expect(first.entry).toContainText('Solo el DM puede cambiarla')
    await axeClean(first.page, `${theme}: saved`)
    first.server.act('set_initiative', {
      target_combatant: arinId(first.server),
      initiative_total: 9,
      tiebreak_bonus: null,
      request_id: 'dm-sets-9',
    })
    await first.page.reload()
    await first.page.getByRole('button', { name: 'Editar la iniciativa de Arin' }).click()
    await expect(first.entry).toContainText('ya está fijada en 9')
    await axeClean(first.page, `${theme}: set by the DM`)
    await first.context.close()
  })

for (const theme of ['default', 'parchment', 'bard'])
  test(`RYT-133 axe is clean on the hit dice states in ${theme}: log failed, rolled`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const failLog = { on: true }
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    const f = await identityFixture(page, {
      player: true,
      sheet: 'complete',
      party: true,
      diceMode: 'app',
    })
    await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
      failLog.on
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' })
        : route.fallback(),
    )
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
    await expect(
      dice.getByRole('alert').filter({ hasText: 'No se pudieron comprobar' }),
    ).toBeVisible({
      timeout: 20_000,
    })
    await axeClean(page, `${theme}: hit dice log failed`)
    await dice.getByRole('button', { name: 'Tirar por mí' }).click()
    await expect(dice.locator('.rest-roll-result-value')).toHaveText('6')
    await axeClean(page, `${theme}: hit dice rolled`)
  })

// ---------------------------------------------------------------------------------------------
// RYT-137: one roll per fight and per rest, enforced by the server. The fixture backend holds the
// server's rules (linking, `Already rolled`, `get_roll_context`, the DM resets); these tests check
// what the Player and the DM see.
// ---------------------------------------------------------------------------------------------

const playerMember = { role: 'player' as const, active: true }
const arinOnly = (id: string) =>
  id === characterId ? { id, user_id: playerId, archived: false, absent: false } : undefined

/** A roll made by the same account on another device: it reaches the server, not this page. */
function otherDevice(
  f: { dice: ReturnType<typeof createDiceStore> },
  kind: 'initiative' | 'hit_die',
  expression: string,
  requestId = crypto.randomUUID(),
) {
  const reply = f.dice.logRoll(playerId, playerMember, arinOnly, {
    target_campaign: campaignId,
    target_character: characterId,
    roll_label: kind,
    roll_expression: expression,
    roll_kind: kind,
    roll_source: 'app',
    recorded_dice: null,
    recorded_total: null,
    request_id: requestId,
  })
  expect(reply.status).toBe(200)
  return reply.body as StoredRoll
}

/** The DM resets Arin's hit-dice roll straight on the server (another device). */
const dmReset = (f: { dice: ReturnType<typeof createDiceStore> }) =>
  f.dice.resetHitDice(
    dmId,
    { role: 'dm', active: true },
    arinOnly,
    {
      target_campaign: campaignId,
      target_character: characterId,
      request_id: crypto.randomUUID(),
    },
    () => false,
  )

const arinRow = (page: Page) =>
  page.locator('.combat-rail:visible .combat-row', { hasText: 'Arin' }).first()

/** A DM page on the same table: its own page, the same server state (rolls and fight). */
async function dmOnTable(
  browser: Browser,
  info: TestInfo,
  f: { dice: ReturnType<typeof createDiceStore> },
  server: ReturnType<typeof combatServer>,
  encounterId: string,
  theme?: string,
) {
  const context = await browser.newContext({
    viewport: info.project.use.viewport,
    hasTouch: info.project.use.hasTouch,
  })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (theme) await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
  await identityFixture(page, {
    party: true,
    linkedPlayer: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
    dice: f.dice,
  })
  await server.install(page)
  await page.goto(`./#/campaign/${campaignId}/combat/${encounterId}?view=console`)
  await expect(arinRow(page)).toBeVisible({ timeout: 15_000 })
  return { page, context }
}

const arinCombatant = (server: ReturnType<typeof combatServer>) =>
  server.encounters[0]!.combatants.find((c) => c.name === 'Arin')!

test('RYT-137 initiative: a second roll is refused with its reason and no number, then the first roll shows', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const { page, f, entry, context } = await initiativePage(browser, info, { stale: true })
  serverFaces(f, [11, 4])
  // The same account rolled on another device: the server holds the roll, this page has not read it.
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toBeVisible()
  const first = otherDevice(f, 'initiative', 'd20+2')
  expect(first.total).toBe(13)
  const refused = page.waitForResponse(
    (response) => response.url().includes('/rpc/log_roll') && response.status() === 400,
  )
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  expect(((await (await refused).json()) as { message: string }).message).toBe('Already rolled')
  await expect(entry.locator('.combat-entry-formula')).toContainText(
    'Rytta ya tiene tu tirada de iniciativa de este combate',
  )
  // Nothing was rolled: the only number is the first roll.
  await expect(entry).not.toContainText('Salió 4')
  await expect(entry).toContainText('Ya tiraste: 13')
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  expect(f.dice.rolls).toHaveLength(1)
  await audit(page)
  await context.close()
})

test('RYT-137 initiative: a retry reuses the request id and returns the first roll, not a new one', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  // The state cannot be read, so the page keeps offering the roll; the server decides.
  const { page, f, entry, context } = await initiativePage(browser, info, {
    failLog: { on: true },
  })
  serverFaces(f, [11, 4])
  f.dice.loseReplyNext = true
  const lost = page.waitForResponse(
    (response) => response.url().includes('/rpc/log_roll') && response.status() === 503,
  )
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await lost
  await expect(entry.locator('.combat-entry-formula')).toContainText(
    'No se pudo tirar la iniciativa',
  )
  expect(f.dice.rolls).toHaveLength(1)
  const replay = page.waitForResponse(
    (response) => response.url().includes('/rpc/log_roll') && response.status() === 200,
  )
  await entry.getByRole('button', { name: 'Reintentar' }).last().click()
  await replay
  // The first roll (13), not a second one (4 + 2 = 6).
  await expect(entry.locator('.combat-d20-input input')).toHaveValue('13')
  await expect(entry.locator('.combat-entry-formula')).toContainText('Salió 11 + 2 = 13')
  const calls = logged(f.calls)
  expect(calls).toHaveLength(2)
  expect(calls[0]!.body.request_id).toBe(calls[1]!.body.request_id)
  expect(f.dice.rolls).toHaveLength(1)
  expect(f.dice.serverDice).toEqual([4])
  await context.close()
})

test('RYT-137 initiative: saving a total the server does not hold is refused as "roll required"', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 4])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13. Guarda esa tirada para fijarla.')
  // The DM clears the roll while the Player is about to save it.
  await page.route(/\/rest\/v1\/rpc\/set_initiative/, async (route) => {
    server.act('reset_initiative_roll', {
      target_campaign: campaignId,
      target_character: characterId,
      reroll_expression: null,
      request_id: 'dm-clears-before-save',
    })
    await route.fallback()
  })
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Tu iniciativa tiene que salir de tu tirada en Rytta' }),
  ).toBeVisible()
  expect(arinCombatant(server).initiative).toBeUndefined()
  // The state is read again: the cleared Player can roll once more, and the new roll saves.
  // The refused save is what makes the page read the state again (not the next poll): the roll is
  // offered again at once, with an empty d20 and no old total to save.
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toBeVisible({
    timeout: 5_000,
  })
  await expect(entry.locator('.combat-d20-input input')).toHaveValue('')
  await expect(entry).not.toContainText('Ya tiraste')
  await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toBeDisabled()
  await page.unroute(/\/rest\/v1\/rpc\/set_initiative/)
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 6. Guarda esa tirada para fijarla.')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  expect(arinCombatant(server).initiative).toBe(6)
  expect(f.dice.rolls).toHaveLength(2)
  await context.close()
})

test('RYT-137 initiative: the DM clears a Player roll from the row menu and the Player rolls again', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 4])
  let reads = 0
  page.on('request', (request) => {
    if (request.url().includes('/rpc/get_roll_context')) reads += 1
  })
  const contextReads = () => reads
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)

  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  let readsBeforeClear = 0
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  // Bea has not rolled: nothing to clear for her.
  const beaMenu = dm.getByRole('button', { name: 'Opciones de Bea' })
  await beaMenu.click()
  await expect(dm.getByRole('menuitem', { name: 'Cambiar iniciativa' })).toBeVisible()
  await expect(dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })).toHaveCount(0)
  await dm.keyboard.press('Escape')
  await expect(beaMenu).toBeFocused()
  // Arin has: opened and chosen with the keyboard, focus comes back to the row's menu button.
  await menuButton.focus()
  await dm.keyboard.press('Enter')
  const clear = dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })
  await expect(clear).toBeVisible()
  await expect(dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' })).toBeVisible()
  // Measured once the menu has settled (it grows into place as it opens).
  await expect.poll(async () => (await clear.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectTouchTargets(dm, '.combat-menu [role="menuitem"]:visible', { height: 44 })
  await clear.focus()
  readsBeforeClear = contextReads()
  await dm.keyboard.press('Enter')
  await expect(clear).toBeHidden()
  await expect(menuButton).toBeFocused()
  await expect(dm.getByText('Arin puede volver a tirar su iniciativa.')).toBeAttached()
  // It stays there while the order and the one-roll state refresh (the row moves).
  await expectFocusStays(dm, 'Opciones de Arin')
  expect(arinCombatant(server).initiative).toBeUndefined()
  expect(f.dice.rolls[0]!.superseded_at).toBeTruthy()
  // After the clear no roll is in force: the menu no longer offers to clear it.
  await menuButton.click()
  await expect(dm.getByRole('menuitem', { name: 'Cambiar iniciativa' })).toBeVisible()
  await expect(dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })).toHaveCount(0)
  await dm.keyboard.press('Escape')
  await dmContext.close()

  // The Player's screen follows live, without a reload: the combat state shows the clear, which
  // makes the page read the one-roll state again, so the roll is offered with nothing to save.
  await expect(entry).toBeVisible({ timeout: 8_000 })
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toBeVisible({
    timeout: 8_000,
  })
  await expect(entry.locator('.combat-d20-input input')).toHaveValue('')
  await expect(entry).not.toContainText('Ya tiraste')
  expect(contextReads()).toBeGreaterThan(readsBeforeClear)
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 6. Guarda esa tirada para fijarla.')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  expect(arinCombatant(server).initiative).toBe(6)
  expect(f.dice.rolls.filter((roll) => !roll.superseded_at)).toHaveLength(1)
  await context.close()
})

test('RYT-137 initiative: the DM re-rolls a Player initiative on the server and the Player cannot roll it again', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 8])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)

  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  await menuButton.click()
  await dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' }).click()
  await expect(menuButton).toBeFocused()
  await expect(dm.getByText('La iniciativa de Arin se ha tirado de nuevo.')).toBeAttached()
  // The server rolled d20 with the bonus of the Player roll: 8 + 2.
  expect(arinCombatant(server).initiative).toBe(10)
  const again = f.dice.rolls.find((roll) => !roll.superseded_at)!
  const old = f.dice.rolls.find((roll) => roll.superseded_at)!
  expect(again).toMatchObject({ expression: 'd20+2', dice: [8], total: 10, roller_id: dmId })
  expect(old.total).toBe(13)
  await expect(arinRow(dm)).toContainText('10')
  await dmContext.close()

  // The Player's entry says the DM set 10 and offers neither a roll nor the old 13.
  await page.reload()
  await page.getByRole('button', { name: 'Editar la iniciativa de Arin' }).click()
  await expect(entry).toContainText(
    'Tu iniciativa ya está fijada en 10. Solo el DM puede cambiarla.',
  )
  await expect(entry).not.toContainText('13')
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await context.close()
})

test('RYT-137 initiative: with physical dice nothing changes and any total saves', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
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
    diceMode: 'physical',
  })
  server.useDice(f.dice)
  await server.install(page)
  const contextReads: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rpc/get_roll_context')) contextReads.push(request.url())
  })
  await page.goto(`./#/campaign/${campaignId}/combat`)
  const entry = page.locator('.combat-entry')
  await expect(entry).toBeVisible({ timeout: 15_000 })
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await page.getByRole('button', { name: '1', exact: true }).click()
  await page.getByRole('button', { name: '7', exact: true }).click()
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  expect(arinCombatant(server).initiative).toBe(17)
  expect(logged(f.calls)).toHaveLength(0)
  // Physical dice hold no roll: the one-roll state is never requested.
  expect(contextReads).toEqual([])
  await context.close()
})

/** A Player page with dice in the app, ready to ask for a short rest. */
async function hitDicePage(page: Page, options: { failContext?: boolean; stale?: boolean } = {}) {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  if (options.failContext)
    await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
    )
  if (options.stale) await staleUntilRefusal(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return f
}
const askShortRest = async (page: Page) => {
  await page.getByRole('button', { name: 'Descanso corto' }).click()
  await page
    .getByRole('dialog', { name: '¿Pedir un descanso corto al grupo?' })
    .getByRole('button', { name: 'Pedir descanso' })
    .click()
}
const diceGroup = (page: Page) =>
  page
    .getByRole('dialog', { name: 'Descanso del grupo' })
    .getByRole('group', { name: /Dados de golpe que gastas/ })

test('RYT-137 hit dice: a second roll is refused with its reason and no number', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const f = await hitDicePage(page, { stale: true })
  serverFaces(f, [6, 3])
  await page.goto(sheetUrl)
  await askShortRest(page)
  const dice = diceGroup(page)
  await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
  await expect(dice.getByRole('button', { name: 'Tirar por mí' })).toBeVisible()
  // The same account rolled the hit dice on another device while this panel was open.
  otherDevice(f, 'hit_die', '1d8+2')
  const refused = page.waitForResponse(
    (response) => response.url().includes('/rpc/log_roll') && response.status() === 400,
  )
  await dice.getByRole('button', { name: 'Tirar por mí' }).click()
  expect(((await (await refused).json()) as { message: string }).message).toBe('Already rolled')
  await expect(
    dice.getByRole('status').filter({ hasText: 'Rytta ya tiene tu tirada' }),
  ).toBeVisible()
  // The refused request stored nothing, and the roll shown afterwards is the one the server holds.
  expect(f.dice.rolls).toHaveLength(1)
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('6')
  await expect(dice.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await audit(page)
})

test('RYT-137 hit dice: a retry reuses the request id and returns the first roll', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const f = await hitDicePage(page, { failContext: true })
  serverFaces(f, [6, 3])
  await page.goto(sheetUrl)
  await askShortRest(page)
  const dice = diceGroup(page)
  await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
  f.dice.loseReplyNext = true
  const lost = page.waitForResponse(
    (response) => response.url().includes('/rpc/log_roll') && response.status() === 503,
  )
  await dice.getByRole('button', { name: 'Tirar por mí' }).click()
  await lost
  await expect(dice.getByRole('alert').filter({ hasText: 'No se pudieron tirar' })).toBeVisible()
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('Sin tirar')
  const replay = page.waitForResponse(
    (response) => response.url().includes('/rpc/log_roll') && response.status() === 200,
  )
  await dice.locator('.rest-autoroll').click()
  await replay
  await expect(dice.locator('.rest-roll-result-value')).toHaveText('6')
  const calls = logged(f.calls)
  expect(calls).toHaveLength(2)
  expect(calls[0]!.body.request_id).toBe(calls[1]!.body.request_id)
  expect(f.dice.rolls).toHaveLength(1)
  expect(f.dice.serverDice).toEqual([3])
})

test('RYT-137 hit dice: the roll is kept when a rest is cancelled, and is offered again after a rest completes', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const f = await hitDicePage(page)
  serverFaces(f, [6, 3])
  await page.goto(sheetUrl)
  await askShortRest(page)
  const dice = () => diceGroup(page)
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await dice().getByRole('button', { name: 'Gastar un dado más' }).click()
  await dice().getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('6')
  // The requester cancels the rest: it did not complete, so the roll stays the character's.
  await panel.getByRole('button', { name: 'Cancelar petición' }).click()
  await expect(panel.getByRole('button', { name: 'Cerrar' }).last()).toBeVisible()
  await panel.getByRole('button', { name: 'Cerrar' }).last().click()
  await askShortRest(page)
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('6')
  await expect(dice().getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await expect(dice()).toContainText('Ya tiraste los dados de golpe: 6.')
  await expect(dice().locator('.rest-stepper-value')).toHaveText('1')
  expect(f.dice.rolls).toHaveLength(1)
  // A rest completes elsewhere (it uses the kept roll up): the next rest offers a new roll.
  f.dice.restsCompleted += 1
  await page.reload()
  await page
    .getByRole('region', { name: 'Descanso del grupo' })
    .getByRole('button', { name: /^(Votar|Ver)$/ })
    .click()
  await dice().getByRole('button', { name: 'Gastar un dado más' }).click()
  await expect(dice().getByRole('button', { name: 'Tirar por mí' })).toBeVisible()
  await dice().getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('3')
  expect(f.dice.rolls).toHaveLength(2)
})

test('RYT-137 hit dice: voting with dice the server does not hold is refused, and the cleared Player can roll again', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const f = await hitDicePage(page)
  serverFaces(f, [6, 3])
  await page.goto(sheetUrl)
  await askShortRest(page)
  const dice = () => diceGroup(page)
  await dice().getByRole('button', { name: 'Gastar un dado más' }).click()
  await dice().getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('6')
  // The DM resets the roll while the Player is about to vote with it.
  await page.route(/\/rest\/v1\/rpc\/vote_rest/, async (route) => {
    expect(dmReset(f).status).toBe(200)
    await route.fallback()
  })
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await panel.getByRole('button', { name: 'Descansar', exact: true }).click()
  await expect(
    panel
      .getByRole('alert')
      .filter({ hasText: 'Los dados de golpe tienen que salir de tu tirada en Rytta' }),
  ).toBeVisible()
  await page.unroute(/\/rest\/v1\/rpc\/vote_rest/)
  // Read again: no roll in force, so Rytta offers one, and the new roll is the one that counts.
  // The refused vote is what makes the panel read the state again: the old roll is gone from the
  // result and from the heal line, not just from the button.
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('Sin tirar', {
    timeout: 5_000,
  })
  await expect(dice().locator('.rest-dice-faces')).toHaveCount(0)
  await expect(dice().locator('.rest-dice-sum')).not.toContainText('Tirada 6')
  await dice().getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice().locator('.rest-roll-result-value')).toHaveText('3')
  expect(f.dice.rolls.filter((roll) => !roll.superseded_at)).toHaveLength(1)
  await panel.getByRole('button', { name: 'Descansar', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
})

test('RYT-137 hit dice: the DM resets a Player roll from the rest panel, and the vote made with it', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const f = await identityFixture(page, { party: true, sheet: 'complete', diceMode: 'app' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  f.openRest('short', { user: playerId, character: characterId })
  // Arin rolled one die (a 6) and voted with it, from another device.
  const made = otherDevice(f, 'hit_die', '1d8+2')
  expect(made.dice).toHaveLength(1)
  f.restVote(characterId, 'yes', 1, made.dice[0]!)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('region', { name: 'Descanso del grupo' }).getByRole('button').first().click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  const person = panel.locator('.rest-person', { hasText: 'Arin' })
  const control = person.locator('.mantine-Accordion-control')
  if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click()
  const reset = person.getByRole('button', {
    name: 'Descartar la tirada de dados de golpe de Arin',
  })
  await expect(person).toContainText('Arin ya tiró los dados de golpe')
  await expectTouchTargets(page, '.rest-dm-reset .mantine-Button-root:visible', { height: 44 })
  await audit(page)
  // A failed request changes nothing, and the retry sends the same request id.
  f.dice.failNext = { rpc: 'reset_hit_dice_roll', message: 'Unavailable' }
  const failed = page.waitForResponse(
    (response) => response.url().includes('/rpc/reset_hit_dice_roll') && response.status() === 503,
  )
  await reset.click()
  await failed
  await expect(panel.getByRole('alert')).toBeVisible()
  expect(f.dice.rolls[0]!.superseded_at ?? null).toBeNull()
  await reset.click()
  await expect(reset).toHaveCount(0)
  const calls = f.calls.filter((call) => call.method === 'reset_hit_dice_roll')
  expect(calls).toHaveLength(2)
  expect(calls[0]!.body.request_id).toBe(calls[1]!.body.request_id)
  expect(f.dice.rolls[0]!.superseded_at).toBeTruthy()
  // The button leaves with the roll; the person's row takes focus and the status says what changed.
  await expect(person.locator('.mantine-Accordion-control')).toBeFocused()
  await expect(
    panel.locator('[role="status"]', { hasText: 'se quitó el voto de Arin' }),
  ).toBeAttached()
})

/** RYT-137 evidence: a screenshot of a changed state at the project's width (RYT_EVIDENCE=1). */
async function evidence(page: Page, info: TestInfo, name: string) {
  const width = info.project.use.viewport?.width
  if (!process.env.RYT_EVIDENCE || (width !== 390 && width !== 820)) return
  await page.screenshot({ path: `docs/evidence/RYT-137/${name}-${width}.png` })
}

for (const theme of ['default', 'parchment'])
  test(`RYT-137 axe is clean on the refused roll, the DM menu and the DM reset in ${theme}`, async ({
    browser,
  }, info) => {
    test.setTimeout(150_000)
    const { server, page, f, entry, context } = await initiativePage(browser, info, {
      theme,
      stale: true,
    })
    serverFaces(f, [11, 4])
    // 1. The refusal says why and shows no number of its own.
    // The state is read (the roll is offered) before the other device rolls.
    await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toBeVisible()
    otherDevice(f, 'initiative', 'd20+2')
    await entry.getByRole('button', { name: 'Tirar por mí' }).click()
    await expect(entry.locator('.combat-entry-formula')).toContainText(
      'Rytta ya tiene tu tirada de iniciativa de este combate',
    )
    await expect(entry).toContainText('Ya tiraste: 13')
    await axeClean(page, `${theme}: initiative refused`)
    await evidence(page, info, `initiative-refused-${theme}`)
    await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
    await expect(page.locator('.combat-entry')).toHaveCount(0)

    // 2. The DM's row menu offers to clear or re-roll it.
    const { page: dm, context: dmContext } = await dmOnTable(
      browser,
      info,
      f,
      server,
      server.encounters[0]!.id,
      theme,
    )
    await dm.getByRole('button', { name: 'Opciones de Arin' }).click()
    await expect(dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })).toBeVisible()
    // Mantine's menu carries a focus sentinel (an empty presentation div) that axe reads as a menu
    // child: that rule only is left out, as in the scene menu audit.
    const menuAudit = await new AxeBuilder({ page: dm })
      .include('[role="menu"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .disableRules(['aria-required-children'])
      .analyze()
    expect(menuAudit.violations, `${theme}: DM menu`).toEqual([])
    await evidence(dm, info, `dm-menu-${theme}`)
    await dm.keyboard.press('Escape')
    await dmContext.close()
    await context.close()
  })

for (const theme of ['default', 'parchment'])
  test(`RYT-137 axe is clean on the hit dice refusal and the DM reset in ${theme}`, async ({
    browser,
  }, info) => {
    test.setTimeout(150_000)
    // The Player: a refused second roll.
    const playerContext = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const page = await playerContext.newPage()
    await page.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    const f = await hitDicePage(page, { stale: true })
    serverFaces(f, [6, 3])
    await page.goto(sheetUrl)
    await askShortRest(page)
    const dice = diceGroup(page)
    await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
    await expect(dice.getByRole('button', { name: 'Tirar por mí' })).toBeVisible()
    otherDevice(f, 'hit_die', '1d8+2')
    await dice.getByRole('button', { name: 'Tirar por mí' }).click()
    await expect(
      dice.getByRole('status').filter({ hasText: 'Rytta ya tiene tu tirada' }),
    ).toBeVisible()
    await axeClean(page, `${theme}: hit dice refused`)
    await evidence(page, info, `hit-dice-refused-${theme}`)
    await playerContext.close()

    // The DM: the reset button and its note, in the open rest.
    const dmContext = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const dm = await dmContext.newPage()
    await dm.addInitScript((id) => localStorage.setItem('rytta-theme', id), theme)
    const g = await identityFixture(dm, { party: true, sheet: 'complete', diceMode: 'app' })
    await dm.emulateMedia({ reducedMotion: 'reduce' })
    g.openRest('short', { user: playerId, character: characterId })
    otherDevice(g, 'hit_die', '1d8+2')
    await dm.goto(`./#/campaign/${campaignId}/party`)
    await dm.getByRole('region', { name: 'Descanso del grupo' }).getByRole('button').first().click()
    const panel = dm.getByRole('dialog', { name: 'Descanso del grupo' })
    const person = panel.locator('.rest-person', { hasText: 'Arin' })
    const control = person.locator('.mantine-Accordion-control')
    if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click()
    const reset = person.getByRole('button', {
      name: 'Descartar la tirada de dados de golpe de Arin',
    })
    await expect(reset).toBeVisible()
    await reset.scrollIntoViewIfNeeded()
    await axeClean(dm, `${theme}: DM hit dice reset`)
    await evidence(dm, info, `dm-hit-dice-reset-${theme}`)
    await dmContext.close()
  })

test('RYT-137 hit dice: a roll the DM made for the character counts and is said, without a number the Player cannot read', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const f = await hitDicePage(page)
  serverFaces(f, [6])
  await page.goto(sheetUrl)
  await askShortRest(page)
  await expect(page.getByRole('dialog', { name: 'Descanso del grupo' })).toBeVisible()
  // The DM rolls the hit dice for Arin: the server counts it, and a Player cannot read the DM's roll.
  const reply = f.dice.logRoll(dmId, { role: 'dm', active: true }, arinOnly, {
    target_campaign: campaignId,
    target_character: characterId,
    roll_label: 'hit_die',
    roll_expression: '1d8+2',
    roll_kind: 'hit_die',
    roll_source: 'app',
    recorded_dice: null,
    recorded_total: null,
    request_id: crypto.randomUUID(),
  })
  expect(reply.status).toBe(200)
  await page.reload()
  await page
    .getByRole('region', { name: 'Descanso del grupo' })
    .getByRole('button', { name: /^(Votar|Ver)$/ })
    .click()
  const dice = diceGroup(page)
  await expect(dice).toContainText('Hay una tirada de dados de golpe tuya que no puedes ver')
  // Coherent: no "not rolled" next to a roll that exists, no roll to make, the count is fixed.
  await expect(dice.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await expect(dice.locator('.rest-roll-result-value')).toHaveCount(0)
  await expect(dice.getByRole('button', { name: 'Gastar un dado más' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(dice.locator('.rest-stepper-value')).toHaveText('0')
  // The vote that can succeed is the one without dice: it goes through, and nothing is dead.
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await panel.getByRole('button', { name: 'Descansar', exact: true }).click()
  await expect
    .poll(() => f.calls.filter((call) => call.method === 'vote_rest').length)
    .toBeGreaterThan(0)
  const vote = f.calls.filter((call) => call.method === 'vote_rest').at(-1)!
  expect(vote.body).toMatchObject({ vote_value: 'yes', spent: 0 })
  await expect(panel.getByRole('alert')).toHaveCount(0)
  expect(f.dice.rolls).toHaveLength(1)
})

const resetCalls = (calls: { method: string; body: Record<string, unknown> }[], method: string) =>
  calls.filter((call) => call.method === method)

test('RYT-137 initiative: a clear whose reply is lost is retried with the same id; a later roll and clear use a new one', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 4])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)

  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  const resets: string[] = []
  dm.on('request', (request) => {
    if (!request.url().includes('/rpc/reset_initiative_roll')) return
    resets.push((request.postDataJSON() as { request_id: string }).request_id)
  })
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  // The state is loaded once the menu offers the clear.
  await menuButton.click()
  await expect(dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })).toBeVisible()
  await dm.keyboard.press('Escape')
  await expect(menuButton).toBeFocused()
  // The one-roll state cannot be read now: the menu keeps offering the clear, the server decides.
  await dm.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
  )
  f.dice.loseResetReplyNext = true
  await menuButton.click()
  await dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' }).click()
  await expect(dm.getByRole('alert')).toBeVisible()
  expect(arinCombatant(server).initiative).toBeUndefined()
  expect(f.dice.rolls[0]!.superseded_at).toBeTruthy()
  const firstSuperseded = f.dice.rolls[0]!.superseded_at
  await menuButton.click()
  await dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' }).click()
  await expect(dm.getByText('Arin puede volver a tirar su iniciativa.')).toBeAttached()
  expect(resets).toHaveLength(2)
  expect(resets[1]).toBe(resets[0])
  // The replay returned the first result: nothing was cleared twice.
  expect(f.dice.rolls[0]!.superseded_at).toBe(firstSuperseded)

  // The Player rolls again; the DM reads the state and clears the new roll: a new request id that
  // really clears.
  await page.reload()
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 6')
  await dm.unroute(/\/rest\/v1\/rpc\/get_roll_context/)
  await dm.reload()
  await expect(arinRow(dm)).toBeVisible({ timeout: 15_000 })
  await dm.getByRole('button', { name: 'Opciones de Arin' }).click()
  await dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' }).click()
  await expect.poll(() => resets.length).toBe(3)
  expect(resets[2]).not.toBe(resets[0])
  await expect.poll(() => f.dice.rolls.filter((roll) => !roll.superseded_at).length).toBe(0)
  await dmContext.close()
  await context.close()
})

test('RYT-137 hit dice: a discard whose reply is lost is retried with the same id; a later roll and discard use a new one', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const f = await identityFixture(page, { party: true, sheet: 'complete', diceMode: 'app' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  f.openRest('short', { user: playerId, character: characterId })
  const made = otherDevice(f, 'hit_die', '1d8+2')
  f.restVote(characterId, 'yes', 1, made.dice[0]!)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('region', { name: 'Descanso del grupo' }).getByRole('button').first().click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  const person = panel.locator('.rest-person', { hasText: 'Arin' })
  const control = person.locator('.mantine-Accordion-control')
  if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click()
  const reset = person.getByRole('button', {
    name: 'Descartar la tirada de dados de golpe de Arin',
  })
  await expect(reset).toBeVisible()
  // The state cannot be read from here on: the button stays and the server decides.
  await page.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
  )
  f.dice.loseResetReplyNext = true
  await reset.click()
  await expect(panel.getByRole('alert')).toBeVisible()
  const superseded = f.dice.rolls[0]!.superseded_at
  expect(superseded).toBeTruthy()
  await reset.click()
  await expect(panel.locator('.rest-reset-note')).toContainText('Tirada descartada')
  const calls = resetCalls(f.calls, 'reset_hit_dice_roll')
  expect(calls).toHaveLength(2)
  expect(calls[1]!.body.request_id).toBe(calls[0]!.body.request_id)
  expect(f.dice.rolls[0]!.superseded_at).toBe(superseded)

  // A new roll, then a new discard: a new request id, and it really discards the new roll.
  await page.unroute(/\/rest\/v1\/rpc\/get_roll_context/)
  const second = otherDevice(f, 'hit_die', '1d8+2')
  await page.reload()
  await page.getByRole('region', { name: 'Descanso del grupo' }).getByRole('button').first().click()
  const again = page.getByRole('dialog', { name: 'Descanso del grupo' }).locator('.rest-person', {
    hasText: 'Arin',
  })
  const againControl = again.locator('.mantine-Accordion-control')
  if ((await againControl.getAttribute('aria-expanded')) !== 'true') await againControl.click()
  await again.getByRole('button', { name: 'Descartar la tirada de dados de golpe de Arin' }).click()
  await expect.poll(() => resetCalls(f.calls, 'reset_hit_dice_roll').length).toBe(3)
  const third = resetCalls(f.calls, 'reset_hit_dice_roll')[2]!
  expect(third.body.request_id).not.toBe(calls[0]!.body.request_id)
  expect(f.dice.rolls.find((roll) => roll.id === second.id)!.superseded_at).toBeTruthy()
})

test('RYT-137 initiative: a roll the DM made that the Player cannot read is said, and nothing offers to save', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const { page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [9])
  // The DM rolls Arin's initiative without fixing the total: the Player cannot read the DM's roll.
  const reply = f.dice.logRoll(dmId, { role: 'dm', active: true }, arinOnly, {
    target_campaign: campaignId,
    target_character: characterId,
    roll_label: 'initiative',
    roll_expression: 'd20+2',
    roll_kind: 'initiative',
    roll_source: 'app',
    recorded_dice: null,
    recorded_total: null,
    request_id: crypto.randomUUID(),
  })
  expect(reply.status).toBe(200)
  await page.reload()
  await expect(entry).toBeVisible({ timeout: 15_000 })
  await expect(entry).toContainText('Ya hay una tirada tuya en este combate')
  await expect(entry.getByRole('button', { name: 'Tirar por mí' })).toHaveCount(0)
  await expect(entry.getByRole('button', { name: 'Guardar iniciativa' })).toHaveCount(0)
  await audit(page)
  await context.close()
})

test('RYT-137 initiative: the DM re-roll uses the sheet bonus when the roll is unreadable and none is saved', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, f, entry, context } = await initiativePage(browser, info)
  // Only the roller reads their roll: the DM cannot read the expression.
  f.dice.roll_visibility = 'roller'
  serverFaces(f, [11, 8])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  // Rolled but not saved: no bonus is saved on the combatant either.
  expect(arinCombatant(server).initiative_bonus).toBe(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  await dm.getByRole('button', { name: 'Opciones de Arin' }).click()
  await dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' }).click()
  await expect.poll(() => arinCombatant(server).initiative).toBe(10)
  expect(f.dice.rolls.find((roll) => !roll.superseded_at)).toMatchObject({
    expression: 'd20+2',
    total: 10,
  })
  await dmContext.close()
  await context.close()
})

for (const theme of ['default', 'parchment'])
  test(`RYT-137 English: the refused roll, the DM menu, the hit-dice refusal and the DM discard in ${theme}`, async ({
    browser,
  }, info) => {
    test.setTimeout(180_000)
    const english = (page: Page) =>
      page.addInitScript(
        ([language, id]) => {
          localStorage.setItem('rytta-language', language!)
          localStorage.setItem('rytta-theme', id!)
        },
        ['en', theme],
      )
    // Initiative: refused, then the DM menu.
    const server = combatServer()
    server.seedInitiative()
    const context = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await english(page)
    const f = await identityFixture(page, {
      player: true,
      party: true,
      sheet: 'complete',
      modules: ['party', 'combat'],
      diceMode: 'app',
    })
    server.useDice(f.dice)
    await server.install(page)
    await staleUntilRefusal(page)
    serverFaces(f, [11, 4])
    await page.goto(`./#/campaign/${campaignId}/combat`)
    const entry = page.locator('.combat-entry')
    await expect(entry).toBeVisible({ timeout: 15_000 })
    await expect(entry.getByRole('button', { name: 'Roll for me' })).toBeVisible()
    otherDevice(f, 'initiative', 'd20+2')
    await entry.getByRole('button', { name: 'Roll for me' }).click()
    await expect(entry.locator('.combat-entry-formula')).toContainText(
      'Rytta already has your initiative roll for this fight.',
    )
    await expect(entry).toContainText('You already rolled: 13')
    await axeClean(page, `${theme}: initiative refused (en)`)
    await evidence(page, info, `en-initiative-refused-${theme}`)
    await entry.getByRole('button', { name: 'Save initiative' }).click()
    await expect(page.locator('.combat-entry')).toHaveCount(0)
    const dmContext = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const dm = await dmContext.newPage()
    await dm.emulateMedia({ reducedMotion: 'reduce' })
    await english(dm)
    await identityFixture(dm, {
      party: true,
      linkedPlayer: true,
      sheet: 'complete',
      modules: ['party', 'combat'],
      dice: f.dice,
    })
    await server.install(dm)
    await dm.goto(`./#/campaign/${campaignId}/combat/${server.encounters[0]!.id}?view=console`)
    await dm.getByRole('button', { name: 'Options for Arin' }).click()
    await expect(dm.getByRole('menuitem', { name: 'Clear their initiative roll' })).toBeVisible()
    await evidence(dm, info, `en-dm-menu-${theme}`)
    await dm.keyboard.press('Escape')
    await dmContext.close()
    await context.close()

    // Hit dice: refused for the Player, then the DM's discard in the rest panel.
    const playerContext = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const player = await playerContext.newPage()
    await english(player)
    const g = await hitDicePage(player, { stale: true })
    serverFaces(g, [6, 3])
    await player.goto(sheetUrl)
    await player.getByRole('button', { name: 'Short rest' }).click()
    await player
      .getByRole('dialog', { name: 'Ask the group for a short rest?' })
      .getByRole('button', { name: 'Ask for the rest' })
      .click()
    const dice = player
      .getByRole('dialog', { name: 'Group rest' })
      .getByRole('group', { name: /Hit dice you spend/ })
    await dice.getByRole('button', { name: 'Spend one die more' }).click()
    await expect(dice.getByRole('button', { name: 'Roll for me' })).toBeVisible()
    otherDevice(g, 'hit_die', '1d8+2')
    await dice.getByRole('button', { name: 'Roll for me' }).click()
    await expect(
      dice.getByRole('status').filter({ hasText: 'Rytta already has your' }),
    ).toBeVisible()
    await axeClean(player, `${theme}: hit dice refused (en)`)
    await evidence(player, info, `en-hit-dice-refused-${theme}`)
    await playerContext.close()

    const dmRest = await browser.newContext({
      viewport: info.project.use.viewport,
      hasTouch: info.project.use.hasTouch,
    })
    const dmPage = await dmRest.newPage()
    await english(dmPage)
    const h = await identityFixture(dmPage, { party: true, sheet: 'complete', diceMode: 'app' })
    await dmPage.emulateMedia({ reducedMotion: 'reduce' })
    h.openRest('short', { user: playerId, character: characterId })
    otherDevice(h, 'hit_die', '1d8+2')
    await dmPage.goto(`./#/campaign/${campaignId}/party`)
    await dmPage.getByRole('region', { name: 'Group rest' }).getByRole('button').first().click()
    const row = dmPage
      .getByRole('dialog', { name: 'Group rest' })
      .locator('.rest-person', { hasText: 'Arin' })
    const control = row.locator('.mantine-Accordion-control')
    if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click()
    const discard = row.getByRole('button', { name: 'Discard the hit-dice roll of Arin' })
    await expect(discard).toBeVisible()
    await discard.scrollIntoViewIfNeeded()
    await axeClean(dmPage, `${theme}: DM discard (en)`)
    await evidence(dmPage, info, `en-dm-hit-dice-discard-${theme}`)
    await discard.click()
    await expect(dmPage.locator('.rest-reset-note')).toContainText('Roll discarded')
    await evidence(dmPage, info, `en-dm-hit-dice-discarded-${theme}`)
    await dmRest.close()
  })

/**
 * The menu's own keys: ArrowDown until the item has focus. The menu may still be settling its
 * first focus when the keys arrive, so a fixed number of presses lands on different items.
 */
async function arrowTo(page: Page, item: Locator) {
  await expect(item).toBeVisible()
  await expect
    .poll(
      async () => {
        if (await item.evaluate((el) => el === document.activeElement)) return true
        await page.keyboard.press('ArrowDown')
        return item.evaluate((el) => el === document.activeElement)
      },
      { timeout: 10_000, intervals: [100] },
    )
    .toBe(true)
}

/** Focus holds the control it was given for many frames: one label, never the page. */
async function expectFocusStays(page: Page, label: string) {
  const seen = await focusAcrossFrames(page, 60)
  expect([...new Set(seen)]).toEqual([label])
}

test('RYT-137 initiative: after a keyboard clear or re-roll from the row menu, focus stays on the menu button', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 8])
  // Bea acts after Arin (5): when Arin's total goes away her row moves below Bea's, so the row
  // that holds the menu button changes place in the order while focus is on it.
  server.act('set_initiative', {
    target_combatant: server.encounters[0]!.combatants.find((c) => c.name === 'Bea')!.id,
    initiative_total: 5,
    tiebreak_bonus: 0,
    request_id: 'bea-5',
  })
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  await expect(arinRow(dm)).toContainText('13')
  // Re-roll first (the roll stays in force), by keyboard.
  await menuButton.focus()
  await dm.keyboard.press('Enter')
  const reroll = dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' })
  await expect(reroll).toBeVisible()
  // The menu's own keys: arrows to the item, Enter to choose it.
  await arrowTo(dm, reroll)
  await dm.keyboard.press('Enter')
  await expect(arinRow(dm)).toContainText('10')
  await expect(menuButton).toBeFocused()
  await expectFocusStays(dm, 'Opciones de Arin')
  // Then clear it, by keyboard: the row moves in the order when its initiative goes away.
  await menuButton.focus()
  await dm.keyboard.press('Enter')
  const clear = dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })
  await expect(clear).toBeVisible()
  await arrowTo(dm, clear)
  await dm.keyboard.press('Enter')
  await expect(arinRow(dm)).not.toContainText('10')
  await expect(menuButton).toBeFocused()
  await expectFocusStays(dm, 'Opciones de Arin')
  await dmContext.close()
  await context.close()
})

test('RYT-137 initiative: after a keyboard re-roll from the combatant detail menu, focus stays on its button', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 8])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  // The detail of Arin: a panel on wide screens, a sheet from the row on phones and tablets.
  await arinRow(dm).locator('.combat-row-main').click()
  const more = dm.getByRole('button', { name: 'Más controles del DM para Arin' })
  await expect(more).toBeVisible()
  await more.focus()
  await dm.keyboard.press('Enter')
  const reroll = dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' })
  await reroll.focus()
  await dm.keyboard.press('Enter')
  await expect.poll(() => arinCombatant(server).initiative).toBe(10)
  await expect(more).toBeFocused()
  await expectFocusStays(dm, 'Más controles del DM para Arin')
  await dmContext.close()
  await context.close()
})

/** A DM page on a fight where Arin rolled 13 and saved it; the next faces are 8 and 5. */
async function lostRerollTable(browser: Browser, info: TestInfo) {
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11, 8, 5])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  const ids: string[] = []
  dm.on('request', (request) => {
    if (request.url().includes('/rpc/reset_initiative_roll'))
      ids.push((request.postDataJSON() as { request_id: string }).request_id)
  })
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  const reroll = dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' })
  // The state is loaded once the menu offers the re-roll.
  await menuButton.click()
  await expect(reroll).toBeVisible()
  await dm.keyboard.press('Escape')
  await expect(menuButton).toBeFocused()
  return { server, f, dm, ids, menuButton, reroll, close: [dmContext, context] }
}

test('RYT-137 initiative: a re-roll whose reply is lost is retried at once with the same id and rolls once', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, f, dm, ids, menuButton, reroll, close } = await lostRerollTable(browser, info)
  // The state cannot be read again, so the DM cannot see that the first try applied.
  await dm.route(/\/rest\/v1\/rpc\/get_roll_context/, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
  )
  f.dice.loseResetReplyNext = true
  await menuButton.click()
  await reroll.click()
  await expect(dm.getByRole('alert')).toBeVisible()
  // The first try applied: one new roll (8 + 2) is in force and the order shows it.
  expect(arinCombatant(server).initiative).toBe(10)
  expect(f.dice.rolls.filter((roll) => !roll.superseded_at)).toHaveLength(1)
  await menuButton.click()
  await reroll.click()
  await expect.poll(() => ids.length).toBe(2)
  expect(ids[1]).toBe(ids[0])
  await expect(dm.getByText('La iniciativa de Arin se ha tirado de nuevo.')).toBeAttached()
  // One roll on the server (the faces for a second one were never used) and the same total.
  expect(f.dice.rolls.filter((roll) => !roll.superseded_at)).toHaveLength(1)
  expect(f.dice.rolls).toHaveLength(2)
  expect(f.dice.serverDice).toEqual([5])
  expect(arinCombatant(server).initiative).toBe(10)
  await expect(arinRow(dm)).toContainText('10')
  for (const context of close) await context.close()
})

test('RYT-137 initiative: a lost re-roll the DM never retried is announced when the state shows it, and a later re-roll rolls', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, f, dm, ids, menuButton, reroll, close } = await lostRerollTable(browser, info)
  f.dice.loseResetReplyNext = true
  const refreshed = dm.waitForResponse((response) =>
    response.url().includes('/rpc/get_roll_context'),
  )
  await menuButton.click()
  await reroll.click()
  await expect(dm.getByRole('alert')).toBeVisible()
  await refreshed
  // The state shows this DM's own new roll: the attempt is over and it is said, with nothing sent.
  await expect(dm.getByText('La iniciativa de Arin se ha tirado de nuevo.')).toBeAttached()
  expect(ids).toHaveLength(1)
  expect(arinCombatant(server).initiative).toBe(10)
  // Much later the DM re-rolls on purpose: a new request, a new id, and it rolls (5 + 2).
  await menuButton.click()
  await reroll.click()
  await expect.poll(() => ids.length).toBe(2)
  expect(ids[1]).not.toBe(ids[0])
  await expect.poll(() => arinCombatant(server).initiative).toBe(7)
  expect(f.dice.rolls.filter((roll) => !roll.superseded_at)).toHaveLength(1)
  expect(f.dice.rolls).toHaveLength(3)
  for (const context of close) await context.close()
})

test('RYT-137 initiative: after Escape, reopening the menu and choosing with Enter, focus is still on the menu button a second later', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  // Open and read the menu, Escape, open it again, choose with the keyboard (the sequence that
  // leaves focus on the menu's own hidden focus target while it closes).
  await menuButton.focus()
  await dm.keyboard.press('Enter')
  await expect(dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })).toBeVisible()
  await dm.keyboard.press('Escape')
  await expect(menuButton).toBeFocused()
  await menuButton.focus()
  await dm.keyboard.press('Enter')
  const clear = dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })
  await expect(clear).toBeVisible()
  await clear.focus()
  await expect(clear).toBeFocused()
  await dm.keyboard.press('Enter')
  await expect(arinRow(dm)).not.toContainText('13')
  // A second of frames: the menu has closed and unmounted by then.
  await expectFocusStays(dm, 'Opciones de Arin')
  await dmContext.close()
  await context.close()
})

test('RYT-137 initiative: focus the DM moved to another control after a reset is left there', async ({
  browser,
}, info) => {
  test.setTimeout(150_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  serverFaces(f, [11])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  await dm.getByRole('button', { name: 'Opciones de Arin' }).focus()
  await dm.keyboard.press('Enter')
  await dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' }).click()
  // The DM goes to Bea's menu button at once: nothing pulls focus back to Arin's.
  const bea = dm.getByRole('button', { name: 'Opciones de Bea' })
  await bea.focus()
  await expect(arinRow(dm)).not.toContainText('13')
  await expectFocusStays(dm, 'Opciones de Bea')
  await dmContext.close()
  await context.close()
})

test('RYT-137 initiative: a changed intent gets a new id and an attempt ends when the server no longer holds the roll, without a reload', async ({
  browser,
}, info) => {
  test.setTimeout(180_000)
  const { server, page, f, entry, context } = await initiativePage(browser, info)
  // Only the roller reads their roll: the DM sees none, so the signature cannot tell two rolls apart.
  f.dice.roll_visibility = 'roller'
  serverFaces(f, [11, 6])
  await entry.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(entry).toContainText('Ya tiraste: 13')
  await entry.getByRole('button', { name: 'Guardar iniciativa' }).click()
  await expect(page.locator('.combat-entry')).toHaveCount(0)
  const { page: dm, context: dmContext } = await dmOnTable(
    browser,
    info,
    f,
    server,
    server.encounters[0]!.id,
  )
  const ids: string[] = []
  dm.on('request', (request) => {
    if (request.url().includes('/rpc/reset_initiative_roll'))
      ids.push((request.postDataJSON() as { request_id: string }).request_id)
  })
  const menuButton = dm.getByRole('button', { name: 'Opciones de Arin' })
  const clear = dm.getByRole('menuitem', { name: 'Borrar su tirada de iniciativa' })
  const reroll = dm.getByRole('menuitem', { name: 'Tirar su iniciativa de nuevo' })

  const saveBea = async (total: string) => {
    await dm.getByRole('button', { name: 'Opciones de Bea' }).click()
    await dm.getByRole('menuitem', { name: 'Cambiar iniciativa' }).click()
    const dialog = dm.getByRole('dialog', { name: 'Iniciativa de Bea' })
    await dialog.getByRole('textbox').fill(total)
    await dialog.getByRole('button', { name: 'Guardar iniciativa' }).click()
    await expect(dialog).toBeHidden()
  }

  // 1. A clear that fails, then another intent (a re-roll) for the same character: a new id.
  f.dice.failNext = { rpc: 'reset_initiative_roll', message: 'Unavailable' }
  await menuButton.click()
  await clear.click()
  await expect.poll(() => ids.length).toBe(1)
  await expect(dm.getByRole('alert')).toBeVisible()
  f.dice.failNext = { rpc: 'reset_initiative_roll', message: 'Unavailable' }
  await menuButton.click()
  await reroll.click()
  await expect.poll(() => ids.length).toBe(2)
  expect(ids[1]).not.toBe(ids[0])

  // 2. Someone else clears the roll: the state shows none any more, so the pending re-roll
  //    attempt is over (the next menu no longer offers either action).
  f.dice.supersede(campaignId, characterId, 'initiative')
  await saveBea('5')
  await menuButton.click()
  await expect(dm.getByRole('menuitem', { name: 'Cambiar iniciativa' })).toBeVisible()
  await expect(clear).toHaveCount(0)
  await dm.keyboard.press('Escape')

  // 3. The Player rolls again (the DM cannot read it, so it looks exactly like the one before):
  //    the intent is the same text, but the attempt had ended: a new id, and it really re-rolls.
  otherDevice(f, 'initiative', 'd20+2')
  await saveBea('6')
  await menuButton.click()
  await reroll.click()
  await expect.poll(() => ids.length).toBe(3)
  expect(ids[2]).not.toBe(ids[1])
  await expect
    .poll(
      () => f.dice.rolls.filter((roll) => !roll.superseded_at && roll.roller_id === dmId).length,
    )
    .toBe(1)
  expect(f.dice.rolls.filter((roll) => !roll.superseded_at)).toHaveLength(1)
  await dmContext.close()
  await context.close()
})

test('RYT-137 initiative: a state that keeps naming another fight is asked for a couple of times, then says so and still lets the server decide', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const reads: string[] = []
  // The roll store is not wired to this fight: its state names no (or another) encounter.
  const { page, f, entry, context } = await initiativePage(browser, info, {
    noDice: true,
    reads,
  })
  serverFaces(f, [11])
  await expect(entry.getByRole('alert')).toContainText('No se pudieron comprobar tus tiradas', {
    timeout: 15_000,
  })
  // An observation window: a loop would ask many times in these seconds.
  await page.evaluate(() => new Promise((done) => setTimeout(done, 5000)))
  expect(reads.length).toBeLessThanOrEqual(3)
  // Not stuck on "Comprobando…": the roll is offered and the server decides.
  const roll = entry.getByRole('button', { name: 'Tirar por mí' })
  await expect(roll).toBeVisible()
  await roll.click()
  await expect(entry).toContainText('Ya tiraste: 13')
  expect(reads.length).toBeLessThanOrEqual(5)
  await context.close()
})
