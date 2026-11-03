import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { beaId, campaignId, characterId, identityFixture, peerId } from './fixtures/identity.ts'
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
  for (const control of await page.locator('[role="dialog"] button:visible').all()) {
    const box = await control.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
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

  // 1. Arin invites Bea from her teammate card.
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
  await arinWindow.getByRole('textbox', { name: 'Oro que das' }).fill('10')
  await expect(arinWindow.getByText('Guardando tu oferta…')).toBeHidden({ timeout: 5_000 })
  await expect
    .poll(() => server.calls.filter((c) => c.method === 'set_trade_offer').length)
    .toBeGreaterThanOrEqual(2)

  // 4. Bea sees the offer, adds her dagger and accepts.
  await expect(beaWindow.getByRole('img', { name: 'Poción de curación, ×2' })).toBeVisible({
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
  // Launcher: a character picker, including characters that are not shared live.
  await arin.getByRole('button', { name: 'Proponer un trueque' }).click()
  await arin.getByRole('menuitem', { name: 'Bea' }).click()
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
  await arin.getByRole('button', { name: 'Volver al trueque con Bea' }).click()
  await expect(arinWindow).toBeVisible()
  await arinWindow.getByRole('button', { name: 'Cancelar el trueque' }).click()
  await expect(arinWindow).toBeHidden()
  await expect(bea.getByText('Arin cancelled the trade.')).toBeVisible({ timeout: 10_000 })
  await arinContext.close()
  await beaContext.close()
})
