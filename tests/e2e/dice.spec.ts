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
 * The 3D engine is deterministic here the way the rest specs make it: reduced motion rolls without
 * the engine, and the platform generator it falls back to hands out the faces given (a die with
 * face v takes the raw value v - 1). Anything else asks the real generator.
 */
async function fixedDice(page: Page, faces: number[]) {
  await page.addInitScript((initial) => {
    const queue = [...initial]
    ;(window as unknown as { diceQueue: number[] }).diceQueue = queue
    const original = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (array instanceof Uint32Array && array.length === 1 && queue.length) {
        array[0] = queue.shift()! - 1
        return array
      }
      return original(array as ArrayBufferView<ArrayBuffer>)
    }) as typeof crypto.getRandomValues
  }, faces)
}

const queueDice = (page: Page, faces: number[]) =>
  page.evaluate((next) => {
    ;(window as unknown as { diceQueue: number[] }).diceQueue.push(...next)
  }, faces)

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
    'Quien deje de poder verlas pierde también las tiradas anteriores',
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
    skills.sheet.getByRole('button', { name: /Anotar la tirada de Percepción, d20 \+ 3/ }),
  ).toHaveText('d20 + 3')
  await expect(
    skills.sheet.getByRole('button', { name: /Anotar la tirada de Interpretación, d20 \+ 8/ }),
  ).toHaveText('d20 + 8')
  await audit(page)
  await page.keyboard.press('Escape')
  await expect(skills.sheet).toHaveCount(0)

  // Attacks: to hit and damage for the weapon; an unarmed strike without a die has no damage roll.
  const attacks = await openTile(page, /Ataques/)
  const hit = attacks.sheet.getByRole('button', {
    name: /Anotar la tirada de Ataque: Espada larga, d20/,
  })
  const damage = attacks.sheet.getByRole('button', {
    name: /Anotar la tirada de Daño: Espada larga, 1d8/,
  })
  await expect(hit).toHaveText(/^d20 [+−] \d+$/)
  await expect(damage).toHaveText(/^1d8( [+−] \d+)?$/)
  await expect(attacks.sheet.getByRole('button', { name: /Daño: Ataque desarmado/ })).toHaveCount(0)
  await audit(page)

  // Recording: the dice are typed and checked against what the sheet said to roll.
  await damage.click()
  const record = page.getByRole('dialog', { name: 'Anotar: Daño: Espada larga' })
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
  await expect(record.getByRole('alert')).toContainText('No se anotó la tirada')
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
  await expect(result).toContainText('Anotada. La ven tú y el DM.')
  await audit(page)
  await page.keyboard.press('Escape')

  // The strip on the sheet lists it.
  const strip = page.getByRole('region', { name: 'Últimas tiradas' })
  await expect(strip.locator('.roll-entry')).toHaveCount(1)
  await expect(strip.locator('.roll-entry-name')).toHaveText('Daño: Espada larga · Arin (tú)')
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

test('RYT-133 dice in the app: a tap rolls, shows the maths and records; reduced motion has no animation', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  await fixedDice(page, [14, 3, 20, 5])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  // With no rolls yet the strip says what to do.
  const strip = page.getByRole('region', { name: 'Últimas tiradas' })
  await expect(strip).toContainText('Aún no hay tiradas. Toca un modificador para tirar.')
  await expect(page.locator('.roll-hint').first()).toContainText('Toca un modificador subrayado')
  await audit(page)

  const check = page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' })
  await expect(check).toContainText('+2')
  await check.click()
  const result = page.getByRole('region', { name: 'Última tirada' })
  await expect(result.locator('.roll-result-total')).toHaveText('16')
  await expect(result).toContainText('Prueba de Destreza')
  await expect(result.locator('.roll-result-maths')).toContainText('14')
  await expect(result.locator('.roll-result-maths')).toContainText('+ 2')
  await expect(result.locator('.roll-result-maths')).toContainText('d20 + 2')
  await expect(result).toContainText('Anotada. La ven tú y el DM.')
  // Spoken: the maths and the total, in a status region.
  await expect(result.getByRole('status')).toHaveText('Prueba de Destreza: 14 + 2 = 16')
  // No stage for the 3D dice was ever created.
  await expect(page.locator('#rytta-dice-stage')).toHaveCount(0)
  expect(logged(f.calls)).toHaveLength(1)
  expect(logged(f.calls)[0]!.body).toMatchObject({
    target_character: characterId,
    roll_label: 'dex',
    roll_kind: 'ability',
    roll_expression: 'd20+2',
    roll_source: 'recorded',
    recorded_dice: [14],
    recorded_total: 16,
  })
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
  await queueDice(page, [5])
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

test('RYT-133 a failed save keeps the roll and retries the same request; a rate limit says so', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
  })
  await fixedDice(page, [11, 12])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  f.dice.failNext = { rpc: 'log_roll', message: 'Unavailable' }
  await page.getByRole('button', { name: 'Tirar Prueba de Destreza, d20 + 2' }).click()
  const result = page.getByRole('region', { name: 'Última tirada' })
  // The roll happened and stays; only the record failed.
  await expect(result.locator('.roll-result-total')).toHaveText('13')
  await expect(result).toContainText('Sin anotar')
  const alert = result.getByRole('alert')
  await expect(alert).toContainText('No se anotó la tirada')
  await expect(alert).toBeFocused()
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(result).toContainText('Anotada.')
  await expect(result.getByRole('alert')).toHaveCount(0)
  const sent = logged(f.calls)
  expect(sent).toHaveLength(2)
  expect(sent[0]!.body.request_id).toBe(sent[1]!.body.request_id)
  expect(sent[1]!.body.recorded_dice).toEqual([11])
  expect(f.dice.rolls).toHaveLength(1)

  // Thirty rolls a minute: the next one is refused with its own message.
  const now = Date.now()
  for (let n = 0; n < 29; n += 1)
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
  await fixedDice(page, [9])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  const choice = page.getByRole('radiogroup', { name: 'Tus dados' })
  await expect(choice.getByRole('radio', { name: 'Físicos' })).toBeChecked()
  await expect(
    page.getByText('El DM lo deja a tu elección. Se guarda en este dispositivo.'),
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
      source: 'recorded',
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
    await fixedDice(page, [13])
    const f = await identityFixture(page, {
      player: true,
      party: true,
      sheet: 'complete',
      modules: ['party', 'combat'],
      diceMode: mode,
    })
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
      await rollButton.click()
      await expect(field).toHaveValue('15')
      await expect(entry.locator('.combat-entry-formula')).toContainText('Salió 13 + 2 = 15')
      expect(logged(f.calls)).toHaveLength(1)
      expect(logged(f.calls)[0]!.body).toMatchObject({
        roll_kind: 'initiative',
        roll_expression: 'd20+2',
        recorded_dice: [13],
        recorded_total: 15,
      })
      await expect(rollButton).toBeVisible()
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
  await fixedDice(page, [6])
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
  await expect(dice.getByRole('textbox', { name: 'Tu tirada' })).toHaveAttribute('readonly', '')
  await dice.getByRole('button', { name: 'Tirar por mí' }).click()
  await expect(dice.getByRole('textbox', { name: 'Tu tirada' })).toHaveValue('6')
  // Recorded for the strip, with the CON modifier counted once per die.
  await expect.poll(() => logged(f.calls).length).toBe(1)
  expect(logged(f.calls)[0]!.body).toMatchObject({
    roll_kind: 'hit_die',
    roll_expression: '1d8+2',
    recorded_dice: [6],
    recorded_total: 8,
  })
})

test('RYT-133 the DM can roll for a character on its sheet, recorded for that character', async ({
  page,
}) => {
  const f = await identityFixture(page, {
    party: true,
    sheet: 'complete',
    linkedPlayer: true,
    diceMode: 'app',
  })
  await fixedDice(page, [10])
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
  await identityFixture(page, {
    player: true,
    sheet: 'complete',
    party: true,
    diceMode: 'app',
    rollVisibility: 'table',
  })
  await fixedDice(page, [12])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.roll-hint').first()).toContainText('Tap an underlined modifier')
  await page.getByRole('button', { name: 'Roll Dexterity check, d20 + 2' }).click()
  const result = page.getByRole('region', { name: 'Latest roll' })
  await expect(result).toContainText('Dexterity check')
  await expect(result).toContainText('Recorded. The whole table sees it.')
  await expect(page.locator('.roll-entry-name')).toContainText('Dexterity check · Arin (you)')
  await audit(page)
  if (process.env.RYT_CAPTURE) await page.screenshot({ path: info.outputPath('dice-en-light.png') })
})

test('RYT-133 the dice stay usable at 150% text', async ({ page }) => {
  await identityFixture(page, { player: true, sheet: 'complete', party: true, diceMode: 'app' })
  await fixedDice(page, [7])
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
