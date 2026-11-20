import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  beaId,
  campaignId,
  catoId,
  characterId,
  identityFixture,
  peerId,
} from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
import { tradeServer } from './fixtures/trades.ts'

const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
async function evidence(page: Page, project: string, name: string) {
  const s = size(project)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-034/${name}-${s}.png` })
}
async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(page, '[role="dialog"] button:visible')
}

test('RYT-034 two Players trade items and gold with a double confirmation', async ({
  browser,
}, info) => {
  test.setTimeout(120_000)
  const server = tradeServer()
  const options = { viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch }
  const arinContext = await browser.newContext(options)
  const beaContext = await browser.newContext(options)
  const arin = await arinContext.newPage()
  const bea = await beaContext.newPage()
  const errors: string[] = []
  for (const page of [arin, bea]) {
    page.on('pageerror', (e) => errors.push(e.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
  await identityFixture(arin, { player: true, party: true, sheet: 'complete' })
  await identityFixture(bea, { player: true, party: true, sheet: 'complete', as: peerId })
  await server.install(arin, characterId)
  await server.install(bea, beaId)
  await arin.goto(`./#/campaign/${campaignId}/party`)
  await bea.goto(`./#/campaign/${campaignId}/party`)

  // 1. Arin invites Bea from the trade icon on her portrait.
  const beaCard = arin.getByRole('article', { name: 'Bea' })
  await beaCard.getByRole('button', { name: 'Comerciar con Bea' }).click()
  await expect(arin.getByText('Invitación enviada a Bea.')).toBeVisible()
  await expect(arin.getByRole('complementary', { name: 'Trueque en curso' })).toContainText(
    'Esperando a Bea',
  )

  // 2. Bea gets a centered, focus-trapped invitation; Escape postpones it to the dock.
  const invite = bea.getByRole('dialog', { name: 'Arin quiere comerciar contigo' })
  await expect(invite).toBeVisible({ timeout: 15_000 })
  await expect(invite.getByRole('button', { name: 'Abrir el trueque' })).toBeFocused()
  await expect(invite.getByRole('timer')).toHaveAccessibleName(/Tiempo para responder: \d:\d\d/)
  await audit(bea)
  await evidence(bea, info.project.name, 'invite')
  await bea.keyboard.press('Escape')
  await expect(invite).toBeHidden()
  const dock = bea.getByRole('button', { name: 'Responder a la invitación de trueque de Arin' })
  await expect(dock).toBeFocused()
  await dock.click()
  await invite.getByRole('button', { name: 'Abrir el trueque' }).click()

  // 3. Both windows open; Arin puts two potions and 10 gold on the table.
  const arinWindow = arin.getByRole('dialog', { name: 'Trueque con Bea' })
  const beaWindow = bea.getByRole('dialog', { name: 'Trueque con Arin' })
  await expect(beaWindow).toBeVisible()
  await expect(arinWindow).toBeVisible({ timeout: 10_000 })
  await arinWindow.getByRole('button', { name: 'Añadir un objeto' }).click()
  const picker = arin.getByRole('dialog', { name: 'Elige qué das' })
  await picker.getByRole('option', { name: /Poción de curación/ }).click()
  await picker.getByRole('button', { name: 'Una unidad más de Poción de curación' }).click()
  await picker.getByRole('button', { name: 'Dar', exact: true }).click()
  await expect(arinWindow.getByRole('button', { name: /Poción de curación, ×2/ })).toBeVisible()
  // J3-22: more gold than the purse is clamped in the field, with the reason, never kept silently.
  const goldField = arinWindow.getByRole('textbox', { name: 'Oro que das' })
  await goldField.fill('99999')
  await expect(goldField).toHaveValue('120')
  await expect(arinWindow.getByText('Solo tienes 120 po')).toBeVisible()
  await goldField.fill('10')
  await expect(arinWindow.getByText('Guardando tu oferta…')).toBeHidden({ timeout: 5_000 })
  await expect
    .poll(() => server.calls.filter((c) => c.method === 'set_trade_offer').length)
    .toBeGreaterThanOrEqual(2)

  // 4. Bea sees the offer, adds her dagger and accepts.
  await expect(beaWindow.getByRole('button', { name: 'Poción de curación, ×2' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(beaWindow).toContainText('Oro que da Arin: 10 po')
  await beaWindow.getByRole('button', { name: 'Añadir un objeto' }).click()
  await bea
    .getByRole('dialog', { name: 'Elige qué das' })
    .getByRole('button', { name: 'Dar', exact: true })
    .click()
  await expect(beaWindow.getByRole('button', { name: /Daga élfica, ×1/ })).toBeVisible()
  await expect(beaWindow.getByText('Guardando tu oferta…')).toBeHidden({ timeout: 5_000 })
  await beaWindow.getByRole('button', { name: 'Aceptar el trato' }).click()
  await expect(beaWindow.getByRole('button', { name: 'Aceptado, esperando a Arin' })).toBeDisabled()
  await expect(arinWindow.getByText('Bea ha aceptado esta oferta')).toBeVisible({ timeout: 10_000 })
  await audit(arin)
  await evidence(arin, info.project.name, 'window-partner-accepted')
  // RYT-109: Arin opens Bea's dagger: its picture (which opens the viewer) and its description.
  const dagger = arinWindow.getByRole('button', { name: 'Daga élfica, ×1' })
  await dagger.click()
  const sheet = arin.getByRole('dialog', { name: 'Daga élfica' })
  await expect(sheet).toContainText('Hoja fina de acero lunar.')
  await expect(sheet.getByRole('button', { name: 'Ver la imagen de Daga élfica' })).toBeVisible()
  await audit(arin)
  await evidence(arin, info.project.name, 'partner-item-sheet')
  await arin.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(dagger).toBeFocused()

  // 5. Any change unlocks both: Arin adds one gold, Bea must accept again.
  await arinWindow.getByRole('button', { name: 'Una pieza de oro más' }).click()
  await expect(
    beaWindow.getByText('La oferta cambió: los dos tenéis que aceptar de nuevo.'),
  ).toBeVisible({
    timeout: 10_000,
  })
  await expect(beaWindow.getByRole('button', { name: 'Aceptar el trato' })).toBeEnabled()
  await evidence(bea, info.project.name, 'window-unlocked')

  // 6. Both accept: the swap completes and both see the summary.
  await beaWindow.getByRole('button', { name: 'Aceptar el trato' }).click()
  await expect(arinWindow.getByText('Bea ha aceptado esta oferta')).toBeVisible({ timeout: 10_000 })
  await arinWindow.getByRole('button', { name: 'Aceptar el trato' }).click()
  const arinDone = arin.getByRole('dialog', { name: 'Trato cerrado' })
  const beaDone = bea.getByRole('dialog', { name: 'Trato cerrado' })
  await expect(arinDone).toBeVisible()
  await expect(beaDone).toBeVisible({ timeout: 10_000 })
  await expect(arinDone.getByRole('region', { name: 'Recibes' })).toContainText('1 × Daga élfica')
  await expect(arinDone.getByRole('region', { name: 'Entregas' })).toContainText(
    '2 × Poción de curación',
  )
  await expect(arinDone.getByRole('region', { name: 'Entregas' })).toContainText('11 po')
  await expect(beaDone.getByRole('region', { name: 'Recibes' })).toContainText('11 po')
  await audit(bea)
  await evidence(bea, info.project.name, 'done')
  expect(server.gold[characterId]).toBe(109)
  expect(server.gold[beaId]).toBe(56)
  expect(server.inventories[beaId]!.map((i) => i.name)).toContain('Poción de curación')
  expect(server.calls.filter((c) => c.method === 'confirm_trade')).toHaveLength(3)

  // 7. The history lists the trade for both sides.
  await arinDone.getByRole('button', { name: 'Hecho' }).first().click()
  const history = arin.getByRole('region', { name: 'Trueques recientes' })
  await expect(history).toContainText('Con Bea')
  await evidence(arin, info.project.name, 'history')
  expect(errors).toEqual([])
  await arinContext.close()
  await beaContext.close()
})

test('RYT-034 declined invitations and phone bottom-sheet picker', async ({ browser }, info) => {
  test.setTimeout(90_000)
  const server = tradeServer()
  const options = { viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch }
  const arinContext = await browser.newContext(options)
  const beaContext = await browser.newContext(options)
  const arin = await arinContext.newPage()
  const bea = await beaContext.newPage()
  await identityFixture(arin, { player: true, party: true, sheet: 'complete' })
  await identityFixture(bea, { player: true, party: true, sheet: 'complete', as: peerId })
  await server.install(arin, characterId)
  await server.install(bea, beaId)
  // Bea plays in English with the light theme.
  await bea.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-color-scheme', 'light')
  })
  await arin.goto(`./#/campaign/${campaignId}/party`)
  await bea.goto(`./#/campaign/${campaignId}/party`)
  // RYT-097: no general launcher; every teammate carries its own trade icon.
  await expect(arin.getByRole('button', { name: 'Proponer un trueque' })).toHaveCount(0)
  await arin
    .getByRole('article', { name: 'Bea' })
    .getByRole('button', { name: 'Comerciar con Bea' })
    .click()
  const invite = bea.getByRole('dialog', { name: 'Arin wants to trade with you' })
  await expect(invite).toBeVisible({ timeout: 15_000 })
  await audit(bea)
  await evidence(bea, info.project.name, 'invite-en-light')
  await invite.getByRole('button', { name: 'Decline' }).click()
  await expect(arin.getByText('Bea ha rechazado el trueque.')).toBeVisible({ timeout: 10_000 })
  await expect(arin.getByRole('complementary', { name: 'Trueque en curso' })).toHaveCount(0)
  // Second attempt: open, then show the picker as a bottom sheet on phones.
  await arin
    .getByRole('article', { name: 'Bea' })
    .getByRole('button', { name: 'Comerciar con Bea' })
    .click()
  await invite.getByRole('button', { name: 'Open the trade' }).click({ timeout: 15_000 })
  const arinWindow = arin.getByRole('dialog', { name: 'Trueque con Bea' })
  await expect(arinWindow).toBeVisible({ timeout: 10_000 })
  const beaWindow = bea.getByRole('dialog', { name: 'Trade with Arin' })
  await expect(beaWindow).toBeVisible()
  await audit(bea)
  await evidence(bea, info.project.name, 'window-en-light')
  await arinWindow.getByRole('button', { name: 'Añadir un objeto' }).click()
  const picker = arin.getByRole('dialog', { name: 'Elige qué das' })
  await expect(picker.getByRole('option', { name: /Gema de luna/ })).toBeVisible()
  await audit(arin)
  await evidence(arin, info.project.name, 'picker')
  // The listbox is one Tab stop; arrows move focus and selection together.
  const first = picker.getByRole('option', { name: /Poción de curación/ })
  await first.focus()
  await arin.keyboard.press('ArrowDown')
  const second = picker.getByRole('option', { name: /Cuerda de seda/ })
  await expect(second).toBeFocused()
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(first).toHaveAttribute('tabindex', '-1')
  await arin.keyboard.press('End')
  await expect(picker.getByRole('option', { name: /Gema de luna/ })).toBeFocused()
  await arin.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  // Focus returns to the slot that opened the picker.
  await expect(arinWindow.getByRole('button', { name: 'Añadir un objeto' })).toBeFocused()
  // Nothing on the table yet: accepting is blocked with a reason next to the button.
  await expect(arinWindow.getByRole('button', { name: 'Aceptar el trato' })).toBeDisabled()
  await expect(arinWindow.getByText('Añade un objeto u oro para poder aceptar.')).toBeVisible()
  await evidence(arin, info.project.name, 'window-empty')
  // Escape minimizes the window to the dock; the dock brings it back.
  await arin.keyboard.press('Escape')
  await expect(arinWindow).toBeHidden()
  await arin
    .getByRole('complementary', { name: 'Trueque en curso' })
    .getByRole('button', { name: 'Volver al trueque con Bea' })
    .click()
  await expect(arinWindow).toBeVisible()
  // J3-08: cancelling ends the trade for both, so it asks again in place and rests on the safe choice.
  await arinWindow.getByRole('button', { name: 'Cancelar el trueque' }).click()
  await expect(arinWindow.getByRole('button', { name: 'Seguir comerciando' })).toBeFocused()
  await arin.keyboard.press('Escape')
  await expect(arinWindow).toBeVisible()
  await arinWindow.getByRole('button', { name: 'Cancelar el trueque' }).click()
  await arinWindow.getByRole('button', { name: 'Sí, cancelar' }).click()
  await expect(arinWindow).toBeHidden()
  await expect(bea.getByText('Arin cancelled the trade.')).toBeVisible({ timeout: 10_000 })
  await arinContext.close()
  await beaContext.close()
})

test('RYT-097 trading starts from the portrait icon, also with an unshared teammate', async ({
  page,
}) => {
  const server = tradeServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { player: true, party: true, sheet: 'complete' })
  await server.install(page, characterId)
  await page.goto(`./#/campaign/${campaignId}/party`)
  const cato = page.getByRole('article', { name: 'Cato' })
  await expect(cato).toContainText('Estado no compartido')
  await cato.getByRole('button', { name: 'Comerciar con Cato' }).click()
  await expect(page.getByText('Invitación enviada a Cato.')).toBeVisible()
  // RYT-108: the notification close button has a translated name.
  await expect(
    page
      .locator('.mantine-Notification-root', { hasText: 'Invitación enviada a Cato.' })
      .getByRole('button'),
  ).toHaveAccessibleName('Cerrar')
  expect(server.calls.find((c) => c.method === 'invite_trade')?.body).toMatchObject({
    to_character: catoId,
  })
  // While that invitation is open the other icon stays focusable and says why it waits.
  const bea = page
    .getByRole('article', { name: 'Bea' })
    .getByRole('button', { name: 'Comerciar con Bea' })
  await expect(bea).toHaveAttribute('aria-disabled', 'true')
  await expect(bea).toHaveAccessibleDescription('Ya tienes un trueque en curso')
  // Pressing it does nothing (the click is forced: Playwright waits for aria-disabled controls).
  await bea.click({ force: true })
  expect(server.calls.filter((c) => c.method === 'invite_trade')).toHaveLength(1)
  // The icon on Cato's portrait brings the open invitation back.
  await expect(cato.getByRole('button', { name: 'Volver al trueque con Cato' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // The whole page, notifications included (they were left out before RYT-108).
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(page, 'main button:visible')
})

test('RYT-149 Give from the item card puts the item on the table and Bea only accepts', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const server = tradeServer()
  const options = { viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch }
  const arinContext = await browser.newContext(options)
  const beaContext = await browser.newContext(options)
  const arin = await arinContext.newPage()
  const bea = await beaContext.newPage()
  for (const page of [arin, bea]) await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(arin, { player: true, party: true, sheet: 'complete', inventory: true })
  await identityFixture(bea, { player: true, party: true, sheet: 'complete', as: peerId })
  await server.install(arin, characterId)
  await server.install(bea, beaId)
  const stacks = arin.waitForResponse((r) => r.url().includes('/rest/v1/inventory_items'))
  await arin.goto(`./#/campaign/${campaignId}/inventory`)
  await bea.goto(`./#/campaign/${campaignId}/party`)
  const potionStack = ((await (await stacks).json()) as { id: string; quantity: number }[]).find(
    (row) => row.quantity === 3,
  )!
  // The trade fixture knows the satchel's potion stack, as the SQL join would.
  server.inventories[characterId]!.push({
    item_id: potionStack.id,
    definition_id: '60000000-0000-4000-8000-0000000000f1',
    name: 'Poción de curación',
    icon: 'flask-conical',
    rarity: 'uncommon',
    category: 'consumable',
    quantity: 3,
  })

  await arin.getByRole('button', { name: /Poción de curación, cantidad 3/ }).click()
  const card = arin.locator('.item-card-drawer')
  const more = card.getByRole('button', { name: 'Más acciones' })
  await more.click()
  const menu = arin.getByRole('menu', { name: 'Más acciones' })
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Descartar…',
    'Ofrecer en trueque a…',
    'Dar a…',
  ])
  await audit(arin)
  // Discard from the menu opens the folded row and lands on its amount.
  await arin.getByRole('menuitem', { name: 'Descartar…' }).click()
  await expect(card.getByRole('textbox', { name: 'Cuántos descartar' })).toBeFocused()
  await expect(card.getByRole('button', { name: 'Descartar…' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  // Escape closes the menu first and leaves the card open. Pressing it before the menu is open
  // would rightly close the card, so wait for the menu.
  await more.click()
  await expect(menu).toBeVisible()
  await arin.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(card).toBeVisible()
  await expect(more).toBeFocused()
  await more.click()
  await arin.getByRole('menuitem', { name: 'Dar a…' }).click()
  const share = card.getByRole('region', { name: 'Dar Poción de curación' })
  await expect(share.getByRole('heading', { name: 'Dar Poción de curación' })).toBeFocused()
  await share.getByRole('button', { name: 'Cuántos: uno más' }).click()
  const people = share.getByRole('group', { name: 'A quién' })
  await expect(people.getByRole('button')).toHaveText(['Bea', 'Cato'])
  await audit(arin)
  await people.getByRole('button', { name: 'Bea' }).click()
  await expect(arin.getByText('Invitación enviada a Bea.')).toBeVisible()
  await expect(more).toBeFocused()
  await expect(card.locator('.item-card-live')).toContainText(
    'Esperando a que Bea acepte el trueque.',
  )

  const invite = bea.getByRole('dialog', { name: 'Arin quiere comerciar contigo' })
  await invite.getByRole('button', { name: 'Abrir el trueque' }).click({ timeout: 15_000 })
  const beaWindow = bea.getByRole('dialog', { name: 'Trueque con Arin' })
  await expect(beaWindow.getByRole('button', { name: 'Poción de curación, ×2' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(beaWindow.getByText('Arin ha aceptado esta oferta')).toBeVisible({
    timeout: 10_000,
  })
  const offer = server.calls.find((c) => c.method === 'set_trade_offer' && c.actor === characterId)
  expect(offer?.body.offer_items).toEqual([{ item_id: potionStack.id, quantity: 2 }])
  expect(offer?.body.offer_gold).toBe(0)
  await beaWindow.getByRole('button', { name: 'Aceptar el trato' }).click()
  await expect(bea.getByRole('dialog', { name: 'Trato cerrado' })).toBeVisible({
    timeout: 10_000,
  })
  expect(server.calls.filter((c) => c.method === 'confirm_trade').map((c) => c.actor)).toEqual([
    characterId,
    beaId,
  ])
  await arinContext.close()
  await beaContext.close()
})
