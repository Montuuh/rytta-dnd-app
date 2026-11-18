import { test, expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, characterId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'

// RYT-134: casting from the sheet. "Lanzar" on each prepared spell, the slot to spend, the
// concentration marker in the hero, rituals, the manual way out, and what a failed, repeated
// or stale save says.
const sheetUrl = `./#/campaign/${campaignId}/party/${characterId}`

const spell = (id: string, name: string, level: number, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  level,
  concentration: false,
  ritual: false,
  prepared: true,
  notes: '',
  ...extra,
})
/** A level 5 bard: nine slots, four of level 1, three of level 2 and two of level 3. */
const spells = [
  spell('s-light', 'Luz', 0),
  spell('s-guidance', 'Orientación', 0, { concentration: true }),
  spell('s-heal', 'Palabra sanadora', 1),
  spell('s-bless', 'Bendición', 1, { concentration: true }),
  spell('s-hold', 'Inmovilizar persona', 2, { concentration: true }),
  spell('s-detect', 'Detectar magia', 1, { concentration: true, ritual: true }),
  spell('s-identify', 'Identificar', 1, { ritual: true }),
  spell('s-fireball', 'Bola de fuego', 3),
  spell('s-shield', 'Escudo', 1, { prepared: false }),
]
const fresh = [0, 0, 0, 0, 0, 0, 0, 0, 0]

async function open(
  page: Page,
  options: Parameters<typeof identityFixture>[1] = {},
  extra: { theme?: string; language?: 'es' | 'en' } = {},
) {
  await page.addInitScript(
    ({ theme, language }) => {
      if (theme) localStorage.setItem('rytta-theme', theme)
      if (language) localStorage.setItem('rytta-language', language)
    },
    { theme: extra.theme, language: extra.language },
  )
  const f = await identityFixture(page, {
    sheet: 'complete',
    sheetSpells: spells,
    slotsUsed: fresh,
    ...options,
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  return f
}

async function openSpells(page: Page, name = /Conjuros/) {
  await page.locator('.panel-tile').filter({ hasText: name }).click()
  const sheet = page.getByRole('dialog', { name })
  await expect(sheet).toBeVisible()
  return sheet
}
const rowOf = (sheet: Locator, name: string) =>
  sheet.locator('.spell-row').filter({ hasText: name })
const castDialog = (page: Page, name: string | RegExp = /^Lanzar /) =>
  page.getByRole('dialog', { name })

async function audit(page: Page, label: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label).toBe(
    true,
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations, label).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible, [role="dialog"] button:visible, [role="dialog"] .cast-option:visible, [role="dialog"] input[type="text"]:visible',
  )
  // Every box of the casting UI stays inside the viewport.
  const outside = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '.cast-option, .cast-trigger, .cast-why, .cast-alert, .cast-note, .sheet-concentration, .cast-manual, [role="dialog"] .mantine-Modal-content',
      ),
    )
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ cls: element.className, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.left < -0.5 || box.right > innerWidth + 0.5)
      .map(({ cls, box }) => `${cls}: ${Math.round(box.left)}..${Math.round(box.right)}`),
  )
  expect(outside, label).toEqual([])
}

const evidence = async (page: Page, name: string) => {
  const project = test.info().project.name
  const size = project === 'identity-mobile' ? '390' : project === 'identity-tablet' ? '820' : null
  if (size && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/ui-review/ryt-134/${name}-${size}.png` })
}

test('RYT-134 a cantrip casts without a dialog, a slot or a request', async ({ page }) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  const light = rowOf(sheet, 'Luz')
  await expect(light.getByRole('button', { name: 'Lanzar Luz' })).toBeVisible()
  await light.getByRole('button', { name: 'Lanzar Luz' }).click()
  await expect(sheet.locator('[data-cast-note]')).toHaveText(
    'Luz lanzado. Los trucos no gastan espacio.',
  )
  await expect(castDialog(page)).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(0)
  expect(f.vitalsOf(characterId)!.slots_used).toEqual(fresh)
  // The announcement is a live region that was mounted empty.
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Luz lanzado' })).toHaveCount(
    1,
  )
  await evidence(page, 'cantrip')
})

test('RYT-134 only prepared spells and cantrips offer Lanzar; a read-only sheet offers none', async ({
  page,
}) => {
  await open(page)
  const sheet = await openSpells(page)
  await expect(rowOf(sheet, 'Escudo').getByRole('button', { name: /Lanzar/ })).toHaveCount(0)
  await expect(
    rowOf(sheet, 'Palabra sanadora').getByRole('button', { name: /Lanzar/ }),
  ).toHaveCount(1)
})

test('RYT-134 an absent character is read-only: no Lanzar, no marker controls', async ({
  page,
}) => {
  await open(page, { absent: true, player: true })
  const sheet = await openSpells(page)
  await expect(sheet.getByRole('button', { name: /Lanzar/ })).toHaveCount(0)
  await expect(sheet.getByText('Conjuro en el que te concentras')).toHaveCount(0)
})

test('RYT-134 a levelled spell asks for the slot, spends exactly one and returns focus', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  const trigger = rowOf(sheet, 'Palabra sanadora').getByRole('button', {
    name: 'Lanzar Palabra sanadora',
  })
  await trigger.click()
  const dialog = castDialog(page, 'Lanzar Palabra sanadora')
  await expect(dialog).toBeVisible()
  const levels = dialog.getByRole('group', { name: 'Espacio que gastas' })
  await expect(levels.getByRole('radio')).toHaveCount(3)
  await expect(levels.getByRole('radio', { name: /Nivel 1/ })).toBeChecked()
  await expect(dialog).toContainText('quedan 4 de 4')
  await audit(page, 'slot choice')
  await evidence(page, 'slot-choice')
  // The radios are visually hidden: the label is what a finger taps.
  await levels.locator('label', { hasText: 'Nivel 2' }).click()
  await expect(levels.getByRole('radio', { name: /Nivel 2/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(1)
  expect(f.vitalsCalls[0]).toMatchObject({
    new_slots_used: [0, 1, 0, 0, 0, 0, 0, 0, 0],
    expected_revision: 0,
  })
  // A spell without concentration leaves the marker alone: the keys are not sent.
  expect(f.vitalsCalls[0]).not.toHaveProperty('change_concentration')
  expect(f.vitalsCalls[0]).not.toHaveProperty('new_concentration')
  expect(f.vitalsOf(characterId)!.slots_used).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0])
  await expect(sheet.locator('[data-cast-note]')).toHaveText(
    'Palabra sanadora lanzado con un espacio de nivel 2.',
  )
  await expect(trigger).toBeFocused()
})

test('RYT-134 only levels at or above the spell with a slot left are offered, and with none the row says why', async ({
  page,
}) => {
  // Level 3 slots are spent (2 of 2); level 1 has one left.
  await open(page, { slotsUsed: [3, 0, 2, 0, 0, 0, 0, 0, 0] })
  const sheet = await openSpells(page)
  const fireball = rowOf(sheet, 'Bola de fuego')
  await expect(fireball).toContainText('Sin espacios de nivel 3 o superior')
  // Not a button that looks tappable and does nothing: there is no button at all.
  await expect(fireball.getByRole('button', { name: /Lanzar/ })).toHaveCount(0)
  await rowOf(sheet, 'Inmovilizar persona')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const hold = castDialog(page, 'Lanzar Inmovilizar persona')
  await expect(hold.getByRole('radio')).toHaveCount(1)
  await expect(hold.getByRole('radio', { name: /Nivel 2/ })).toBeChecked()
  await hold.getByRole('button', { name: 'Cancelar' }).click()
  await expect(hold).toHaveCount(0)
  // Level 1 spells can use the level 1 and 2 slots, never a spent one.
  await rowOf(sheet, 'Palabra sanadora')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const heal = castDialog(page, 'Lanzar Palabra sanadora')
  await expect(heal.getByRole('radio')).toHaveCount(2)
  await expect(heal).toContainText('quedan 1 de 4')
  await audit(page, 'two levels')
  await castDialog(page).getByRole('button', { name: 'Cancelar' }).click()
  await evidence(page, 'spell-list')
})

test('RYT-134 with every slot spent the spell row says so and a ritual casts without one', async ({
  page,
}) => {
  const f = await open(page, { slotsUsed: [4, 3, 2, 0, 0, 0, 0, 0, 0] })
  const sheet = await openSpells(page)
  await expect(rowOf(sheet, 'Palabra sanadora')).toContainText('Sin espacios de conjuro')
  await expect(
    rowOf(sheet, 'Palabra sanadora').getByRole('button', { name: /Lanzar/ }),
  ).toHaveCount(0)
  const identify = rowOf(sheet, 'Identificar')
  await expect(identify).toContainText('Sin espacios: solo como ritual')
  await identify.getByRole('button', { name: 'Lanzar Identificar' }).click()
  const dialog = castDialog(page, 'Lanzar Identificar')
  // Only the ritual is offered, and it is already chosen.
  await expect(dialog.getByRole('radio')).toHaveCount(1)
  await expect(dialog.getByRole('radio', { name: /Como ritual/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(sheet.locator('[data-cast-note]')).toHaveText(
    'Identificar lanzado como ritual. No se gastó ningún espacio.',
  )
  // Nothing to spend or mark, so nothing is written.
  expect(f.vitalsCalls).toHaveLength(0)
  expect(f.vitalsOf(characterId)!.slots_used).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0])
})

test('RYT-134 a ritual spell can also be cast with a slot, and a concentration ritual marks without one', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Detectar magia')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Detectar magia')
  await expect(dialog.getByRole('radio')).toHaveCount(4)
  await dialog.locator('label', { hasText: 'Como ritual' }).click()
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(1)
  // No slot spent, but the concentration is marked in the same request.
  expect(f.vitalsCalls[0]).toMatchObject({
    new_slots_used: fresh,
    change_concentration: true,
    new_concentration: 'Detectar magia',
  })
  expect(f.vitalsOf(characterId)!.concentration).toBe('Detectar magia')
})

test('RYT-134 concentration: the slot and the marker are one request; another spell asks before replacing; the marker ends by hand', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Bendición')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const bless = castDialog(page, 'Lanzar Bendición')
  await expect(bless).toContainText('Este conjuro requiere concentración.')
  await bless.getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(bless).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(1)
  expect(f.vitalsCalls[0]).toMatchObject({
    new_slots_used: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    change_concentration: true,
    new_concentration: 'Bendición',
  })
  await expect(sheet.locator('[data-cast-note]')).toHaveText(
    'Bendición lanzado con un espacio de nivel 1. Te concentras en Bendición.',
  )

  // A second concentration spell asks first; cancelling changes nothing.
  await rowOf(sheet, 'Inmovilizar persona')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const hold = castDialog(page, 'Lanzar Inmovilizar persona')
  await expect(hold).toContainText('Te concentras en «Bendición». Lanzar esto la termina.')
  await expect(hold.getByRole('button', { name: 'Lanzar y reemplazar' })).toBeVisible()
  await audit(page, 'replace')
  await evidence(page, 'replace')
  await hold.getByRole('button', { name: 'Cancelar' }).click()
  expect(f.vitalsCalls).toHaveLength(1)
  expect(f.vitalsOf(characterId)!.concentration).toBe('Bendición')

  await rowOf(sheet, 'Inmovilizar persona')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  await hold.getByRole('button', { name: 'Lanzar y reemplazar' }).click()
  await expect(hold).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(2)
  expect(f.vitalsCalls[1]).toMatchObject({
    new_slots_used: [1, 1, 0, 0, 0, 0, 0, 0, 0],
    change_concentration: true,
    new_concentration: 'Inmovilizar persona',
  })

  // A spell without concentration keeps the marker.
  await rowOf(sheet, 'Palabra sanadora')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  await castDialog(page, 'Lanzar Palabra sanadora')
    .getByRole('button', { name: 'Lanzar', exact: true })
    .click()
  await expect(castDialog(page)).toHaveCount(0)
  expect(f.vitalsCalls[2]).not.toHaveProperty('change_concentration')
  expect(f.vitalsOf(characterId)!.concentration).toBe('Inmovilizar persona')

  // The marker is in the hero, outside the sheet drawer; it ends there by hand.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  const marker = page.locator('.sheet-concentration')
  await expect(marker).toContainText('Concentración')
  await expect(marker).toContainText('Inmovilizar persona')
  await marker.scrollIntoViewIfNeeded()
  await evidence(page, 'hero-marker')
  await marker
    .getByRole('button', { name: 'Terminar la concentración en Inmovilizar persona' })
    .click()
  await expect(marker).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(4)
  expect(f.vitalsCalls[3]).toMatchObject({ change_concentration: true, new_concentration: null })
  expect(f.vitalsOf(characterId)!.concentration).toBeNull()
})

test('RYT-134 manual rulings: slots by hand, the marker by hand, and a pasted invisible character is refused in the field', async ({
  page,
}) => {
  const f = await open(page)
  // Slots by hand.
  const resources = await openSpells(page, /Recursos/)
  await resources.getByRole('button', { name: 'Gastar un espacio de nivel 1' }).first().click()
  await expect.poll(() => f.vitalsOf(characterId)!.slots_used).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(f.vitalsCalls[0]).not.toHaveProperty('change_concentration')
  await page.keyboard.press('Escape')

  const sheet = await openSpells(page)
  await expect(sheet.getByText('No te concentras en nada.')).toBeVisible()
  const field = sheet.getByLabel('Conjuro en el que te concentras')
  await field.fill('Sanar\u200b')
  await expect(
    sheet.getByText('Quita del nombre los caracteres de control o invisibles.'),
  ).toBeVisible()
  const mark = sheet.getByRole('button', { name: 'Marcar concentración' })
  await expect(mark).toHaveAttribute('aria-disabled', 'true')
  // Enter in the field submits the form too: still nothing is sent.
  await field.press('Enter')
  expect(f.vitalsCalls).toHaveLength(1)
  await audit(page, 'manual field error')
  await field.fill('  Aura de protección  ')
  await sheet.getByRole('button', { name: 'Marcar concentración' }).click()
  await expect.poll(() => f.vitalsOf(characterId)!.concentration).toBe('Aura de protección')
  expect(f.vitalsCalls.at(-1)).toMatchObject({
    change_concentration: true,
    new_concentration: 'Aura de protección',
    // The slot spent by hand before stays as it was.
    new_slots_used: [1, 0, 0, 0, 0, 0, 0, 0, 0],
  })
  await sheet
    .getByRole('button', { name: 'Terminar la concentración en Aura de protección' })
    .click()
  await expect.poll(() => f.vitalsOf(characterId)!.concentration).toBeNull()
})

test('RYT-134 a double tap on Lanzar spends one slot', async ({ page }) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Palabra sanadora')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Palabra sanadora')
  const confirm = dialog.getByRole('button', { name: 'Lanzar', exact: true })
  // Two taps in the same frame, before the first answer.
  await confirm.evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    ;(button as HTMLButtonElement).click()
  })
  await expect(dialog).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(1)
  expect(f.vitalsOf(characterId)!.slots_used).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
})

test('RYT-134 a failed save leaves the slots as they were, says so where it is seen and retries the same request', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Bendición')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Bendición')
  f.failVitals('down')
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('No se lanzó el conjuro')
  await expect(alert).toContainText('No se pudo guardar')
  await expect(alert).toContainText('Tu ficha sigue como estaba.')
  await expect(alert).toBeFocused()
  expect(f.vitalsOf(characterId)!.slots_used).toEqual(fresh)
  expect(f.vitalsOf(characterId)!.concentration).toBeNull()
  await audit(page, 'failed save')
  await evidence(page, 'failed-save')
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(2)
  expect(f.vitalsCalls[1]!.request_id).toBe(f.vitalsCalls[0]!.request_id)
  expect(f.vitalsOf(characterId)!.slots_used).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(f.vitalsOf(characterId)!.concentration).toBe('Bendición')
})

test('RYT-134 when the answer is lost the retry repeats the request and the slot is spent once', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Palabra sanadora')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Palabra sanadora')
  f.failVitals('lost')
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeFocused()
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(2)
  expect(f.vitalsCalls[1]!.request_id).toBe(f.vitalsCalls[0]!.request_id)
  expect(f.vitalsOf(characterId)!.slots_used).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
})

test('RYT-134 a stale sheet says so, reloads and the next cast is a new request on the new revision', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Palabra sanadora')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Palabra sanadora')
  f.staleVitals()
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('Tu ficha cambió en otro dispositivo')
  await expect(alert).toBeFocused()
  expect(f.vitalsOf(characterId)!.slots_used).toEqual(fresh)
  // It is a plain cast again, not a retry of the refused request.
  await expect(dialog.getByRole('button', { name: 'Lanzar', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await audit(page, 'stale')
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(f.vitalsCalls).toHaveLength(2)
  expect(f.vitalsCalls[1]!.request_id).not.toBe(f.vitalsCalls[0]!.request_id)
  expect(f.vitalsCalls[1]!.expected_revision).toBe(Number(f.vitalsCalls[0]!.expected_revision) + 1)
  expect(f.vitalsOf(characterId)!.slots_used).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
})

test('RYT-134 a refused cast on an absent character explains itself and offers only a way out', async ({
  page,
}) => {
  // The sheet was open before the DM benched the character: the write is refused by the server.
  const f = await open(page, { player: true })
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Palabra sanadora')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Palabra sanadora')
  f.benchCharacter()
  await dialog.getByRole('button', { name: 'Lanzar', exact: true }).click()
  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('Este personaje está ausente')
  await expect(alert).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Reintentar' })).toHaveCount(0)
  await expect(dialog.locator('.cast-footer').getByRole('button', { name: 'Cerrar' })).toBeVisible()
  expect(f.vitalsOf(characterId)!.slots_used).toEqual(fresh)
})

test('RYT-134 a long rest ends the marker', async ({ page }) => {
  const f = await open(page, { concentration: 'Bendición', player: true })
  await expect(page.locator('.sheet-concentration')).toContainText('Bendición')
  await page.getByRole('button', { name: 'Descanso largo' }).click()
  await page
    .getByRole('dialog', { name: /Pedir un descanso largo/ })
    .getByRole('button', { name: 'Pedir descanso' })
    .click()
  await page.getByRole('dialog', { name: 'Descanso del grupo' }).waitFor()
  await expect.poll(() => f.vitalsOf(characterId)!.concentration, { timeout: 15_000 }).toBeNull()
})

test('RYT-134 history names the marker', async ({ page }) => {
  await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Bendición')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  await castDialog(page, 'Lanzar Bendición')
    .getByRole('button', { name: 'Lanzar', exact: true })
    .click()
  await expect(castDialog(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  const history = await openSpells(page, /Historial/)
  await expect(history).toContainText('Concentración')
  await expect(history).toContainText('Bendición')
})

test('RYT-134 the marker is never a name the server would refuse', async ({ page }) => {
  const f = await open(page, {
    sheetSpells: [
      spell('s-long', 'N'.repeat(100), 1, { concentration: true }),
      spell('s-zero', 'Ho\u200bld\u202e Person', 1, { concentration: true }),
    ],
  })
  const sheet = await openSpells(page)
  await sheet.getByRole('button', { name: /^Lanzar N+$/ }).click()
  await castDialog(page).getByRole('button', { name: 'Lanzar', exact: true }).click()
  await expect(castDialog(page)).toHaveCount(0)
  expect(String(f.vitalsCalls[0]!.new_concentration)).toBe('N'.repeat(100))
  await sheet.getByRole('button', { name: /^Lanzar Ho/ }).click()
  await castDialog(page).getByRole('button', { name: 'Lanzar y reemplazar' }).click()
  await expect(castDialog(page)).toHaveCount(0)
  expect(f.vitalsCalls[1]!.new_concentration).toBe('Hold Person')
  expect(f.vitalsCalls.every((call) => call.change_concentration === true)).toBe(true)
})

test('RYT-134 keyboard: Enter opens the dialog, Tab stays inside, Escape closes it and returns focus', async ({
  page,
}) => {
  const f = await open(page)
  const sheet = await openSpells(page)
  const trigger = rowOf(sheet, 'Bendición').getByRole('button', { name: /Lanzar/ })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = castDialog(page, 'Lanzar Bendición')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: /Nivel 1/ })).toBeFocused()
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  // Escape closed only the dialog: the spells sheet is still there, focus back on the trigger.
  await expect(sheet).toBeVisible()
  await expect(trigger).toBeFocused()
  expect(f.vitalsCalls).toHaveLength(0)
  // The arrow keys move through the slots, and Space confirms the radio, not the cast.
  await page.keyboard.press('Enter')
  await dialog.getByRole('radio', { name: /Nivel 1/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('radio', { name: /Nivel 2/ })).toBeChecked()
  expect(f.vitalsCalls).toHaveLength(0)
})

test('RYT-134 the phone Back button closes the dialog and keeps the sheet', async ({ page }) => {
  await open(page)
  const sheet = await openSpells(page)
  await rowOf(sheet, 'Bendición')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Bendición')
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`party/${characterId}`))
})

test('RYT-134 English: the words, the replace question and the way out', async ({ page }) => {
  await open(page, { concentration: 'Bless' }, { language: 'en' })
  const sheet = await openSpells(page, /Spells/)
  await rowOf(sheet, 'Bendición').getByRole('button', { name: 'Cast Bendición' }).click()
  const dialog = castDialog(page, 'Cast Bendición')
  await expect(dialog.getByRole('group', { name: 'Slot to spend' })).toBeVisible()
  await expect(dialog).toContainText('You are concentrating on “Bless”. Casting this ends it.')
  await expect(dialog.getByRole('button', { name: 'Cast and replace' })).toBeVisible()
  await audit(page, 'english replace')
  await evidence(page, 'replace-en')
})

test('RYT-134 stays usable at 150% text', async ({ page }) => {
  await open(page, {
    concentration: 'Una concentración con un nombre bastante largo para envolver',
  })
  await page.addStyleTag({ content: 'html { font-size: 150% !important; }' })
  const sheet = await openSpells(page)
  await audit(page, '150% list')
  await rowOf(sheet, 'Inmovilizar persona')
    .getByRole('button', { name: /Lanzar/ })
    .click()
  const dialog = castDialog(page, 'Lanzar Inmovilizar persona')
  await expect(dialog.getByRole('button', { name: 'Lanzar y reemplazar' })).toBeVisible()
  await audit(page, '150% dialog')
  await evidence(page, 'dialog-150')
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await page.keyboard.press('Escape')
  await audit(page, '150% hero')
})

for (const theme of ['default', 'parchment', 'bard'])
  test(`RYT-134 axe is clean on every casting state in ${theme}`, async ({ page }) => {
    const f = await open(page, { slotsUsed: [3, 0, 2, 0, 0, 0, 0, 0, 0] }, { theme })
    const sheet = await openSpells(page)
    await audit(page, `${theme}: list`)
    await sheet.getByLabel('Conjuro en el que te concentras').fill('Bendición')
    await sheet.getByRole('button', { name: 'Marcar concentración' }).click()
    await expect(sheet.getByText('Bendición').first()).toBeVisible()
    await audit(page, `${theme}: manual marker`)
    await rowOf(sheet, 'Palabra sanadora')
      .getByRole('button', { name: /Lanzar/ })
      .click()
    await audit(page, `${theme}: choice`)
    await castDialog(page, 'Lanzar Palabra sanadora')
      .getByRole('button', { name: 'Cancelar' })
      .click()
    await rowOf(sheet, 'Inmovilizar persona')
      .getByRole('button', { name: /Lanzar/ })
      .click()
    await audit(page, `${theme}: replace`)
    f.failVitals('down')
    await castDialog(page).getByRole('button', { name: 'Lanzar y reemplazar' }).click()
    await expect(castDialog(page).getByRole('alert')).toBeFocused()
    await audit(page, `${theme}: failed`)
    await evidence(page, `failed-${theme}`)
    await castDialog(page).getByRole('button', { name: 'Reintentar' }).click()
    await expect(castDialog(page)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.sheet-concentration')).toContainText('Inmovilizar persona')
    await audit(page, `${theme}: hero marker`)
    await page.locator('.sheet-concentration').scrollIntoViewIfNeeded()
    await evidence(page, `hero-${theme}`)
  })
