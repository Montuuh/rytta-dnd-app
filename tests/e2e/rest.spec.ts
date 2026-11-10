import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  beaId,
  campaignId,
  catoId,
  characterId,
  dmId,
  identityFixture,
  peerId,
} from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'

// RYT-079 to RYT-082: group rest with a vote, absence, the new-character card and dice (ADR 037).
const party = `./#/campaign/${campaignId}/party`
const sheetUrl = `${party}/${characterId}`

async function audit(page: Page, path: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expectTouchTargets(
    page,
    'main button:visible:not(.glossary-term), main a.mantine-Button-root:visible, [role="dialog"] button:visible, .rest-banner button:visible',
  )
  await capture(page, path)
}

test('a Player asks the group for a long rest; the table votes around the fire', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await expect(page.locator('.hp-current')).toHaveText('30')
  const longRest = page.getByRole('button', { name: 'Descanso largo' })
  await longRest.click()
  const ask = page.getByRole('dialog', { name: '¿Pedir un descanso largo al grupo?' })
  // The check: Arin has hit points to get back.
  await expect(ask.getByText('Puntos de golpe')).toBeVisible()
  await expect(ask).toContainText('30 → 38')
  await audit(page, info.outputPath('rest-ask.png'))
  await ask.getByRole('button', { name: 'Pedir descanso' }).click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await expect(panel.getByRole('heading', { name: 'Descanso largo' })).toBeVisible()
  const seats = panel.getByRole('list', { name: '1 de 3 quieren descansar.' })
  await expect(seats.getByRole('listitem')).toHaveCount(3)
  await expect(seats.getByRole('listitem').filter({ hasText: 'Tú' })).toContainText('Sí')
  await expect(panel.getByText('Por votar: Bea y Cato.', { exact: false })).toBeVisible()
  // Cato keeps the sheet private: name and vote only.
  await panel.getByRole('button', { name: /^Cato/ }).click()
  await expect(panel.getByText('Cato no comparte su ficha con el grupo.')).toBeVisible()
  await panel.getByRole('button', { name: /^Bea/ }).click()
  await expect(panel.getByText('9 → 24')).toBeVisible()
  await audit(page, info.outputPath('rest-panel.png'))
  // The banner stays on every screen while the vote is open.
  await page.keyboard.press('Escape')
  await expect(longRest).toBeFocused()
  const banner = page.getByRole('region', { name: 'Descanso del grupo' })
  await expect(banner).toContainText('Descanso largo pedido por Arin')
  await expect(banner).toContainText('1 de 3 han votado sí')
  await page.goto(party)
  await expect(banner).toBeVisible()
  await audit(page, info.outputPath('rest-banner.png'))
  // Teammates vote; polling (realtime is the first channel) brings the outcome.
  f.restVote(beaId, 'yes')
  f.restVote(catoId, 'yes')
  await expect(banner).toContainText('El grupo ha descansado', { timeout: 15_000 })
  await banner.getByRole('button', { name: 'Ver' }).click()
  await expect(panel.getByRole('heading', { name: 'El grupo ha descansado' })).toBeVisible()
  await audit(page, info.outputPath('rest-done.png'))
  await panel.getByRole('button', { name: 'Cerrar' }).last().click()
  await banner.getByRole('button', { name: 'Ocultar este aviso' }).click()
  await expect(banner).toHaveCount(0)
  expect(f.vitalsOf(characterId)?.current_hp).toBe(38)
  expect(f.vitalsOf(beaId)?.current_hp).toBe(24)
})

test('a short rest spends hit dice: typed or rolled by Rytta, CON added per die', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Descanso corto' }).click()
  const ask = page.getByRole('dialog', { name: '¿Pedir un descanso corto al grupo?' })
  await expect(ask).toContainText('hasta 5 para curarte')
  await ask.getByRole('button', { name: 'Pedir descanso' }).click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  const dice = panel.getByRole('group', { name: /Dados de golpe que gastas/ })
  await expect(dice).toBeVisible()
  await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
  await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
  const roll = dice.getByRole('textbox', { name: 'Tu tirada' })
  await roll.fill('17')
  await expect(dice.getByText('Revisa los dados', { exact: false })).toBeVisible()
  await roll.fill('9')
  // Bard CON 14 (+2): 9 + 2 × 2 = 13.
  await expect(dice.getByRole('status')).toHaveText('Tirada 9, CON +2 por dado: +13 PG')
  await expect(panel).toContainText('30 → 38')
  await audit(page, info.outputPath('rest-short-dice.png'))
  // The sticky dock never hides the focused control (WCAG 2.4.11).
  const autoRoll = dice.getByRole('button', { name: 'Tirar por mí' })
  await page.keyboard.press('Tab')
  await expect(autoRoll).toBeFocused()
  const [button, dock] = await Promise.all([
    autoRoll.boundingBox(),
    panel.locator('.rest-dock').boundingBox(),
  ])
  expect(button!.y + button!.height).toBeLessThanOrEqual(dock!.y + 1)
  // Rytta rolls instead (reduced motion: no animation, an even result).
  await autoRoll.click()
  await expect(roll).toHaveValue(/^([2-9]|1[0-6])$/)
  await panel.getByRole('button', { name: 'Descansar', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Descansar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // One no and nobody rests.
  f.restVote(beaId, 'no')
  await expect(panel.getByRole('heading', { name: 'No se descansa' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(panel).toContainText('Han dicho «Ahora no»: Bea.')
  expect(f.vitalsOf(characterId)?.current_hp).toBe(30)
})

test('the DM launches a rest, votes for own characters and can rest the group at once', async ({
  page,
}, info) => {
  const f = await identityFixture(page, { sheet: 'complete', party: true, linkedPlayer: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  f.openRest('long', { user: peerId, character: beaId })
  await page.goto(party)
  const banner = page.getByRole('region', { name: 'Descanso del grupo' })
  await expect(banner).toContainText('Descanso largo pedido por Bea')
  await banner.getByRole('button', { name: 'Ver' }).click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await expect(
    panel.getByText('Como DM solo votas por tus personajes.', { exact: false }),
  ).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Descansar', exact: true })).toHaveCount(0)
  await audit(page, info.outputPath('rest-dm.png'))
  await panel.getByRole('button', { name: 'Descansar ya' }).click()
  await expect(panel.getByRole('heading', { name: 'El grupo ha descansado' })).toBeVisible()
  expect(f.vitalsOf(beaId)?.current_hp).toBe(24)
})

test('a Player whose request expires or is cancelled sees why', async ({ page }) => {
  const f = await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  f.openRest('long', { user: dmId, character: null })
  await page.goto(party)
  const banner = page.getByRole('region', { name: 'Descanso del grupo' })
  await expect(banner).toContainText('Descanso largo pedido por el DM')
  await banner.getByRole('button', { name: 'Votar' }).click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await panel.getByRole('button', { name: 'Ahora no' }).click()
  await expect(panel.getByRole('heading', { name: 'No se descansa' })).toBeVisible()
  await page.keyboard.press('Escape')
  f.openRest('long', { user: dmId, character: null })
  f.expireRest()
  await page.reload()
  await expect(banner).toContainText('La petición ha caducado')
})

test('the DM marks a character absent from the 3-dot menu; it leaves the party', async ({
  page,
}, info) => {
  await identityFixture(page, { linkedPlayer: true, sheet: 'complete' })
  await page.goto(`${party}/roster`)
  const row = page.getByRole('group', { name: 'Arin' })
  await expect(row).toContainText('Activo')
  const more = page.getByRole('button', { name: 'Más acciones para Arin' })
  await more.click()
  await page.getByRole('menuitem', { name: 'Marcar ausente' }).click()
  await expect(
    page.getByText('Arin está ausente: hoy no sale en el grupo', { exact: false }),
  ).toBeVisible()
  await expect(row).toContainText('Ausente')
  await audit(page, info.outputPath('roster-absent.png'))
  // Archiving waits until Arin is present again.
  await more.click()
  await expect(page.getByRole('menuitem', { name: 'Archivar personaje' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByText('Márcalo presente antes de archivarlo.')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto(party)
  await expect(page.getByRole('heading', { name: 'Arin', exact: true })).toHaveCount(0)
  await page.goto(`${party}/roster`)
  await page.getByRole('button', { name: 'Más acciones para Arin' }).click()
  await page.getByRole('menuitem', { name: 'Marcar presente' }).click()
  await expect(page.getByText('Arin vuelve a la mesa.')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Arin' })).toContainText('Activo')
})

test('an absent Player reads the sheet only and is told why', async ({ page }, info) => {
  await identityFixture(page, { player: true, sheet: 'complete', absent: true })
  await page.goto(party)
  await expect(
    page.getByText('El DM ha marcado que hoy no vienes, así que', { exact: false }),
  ).toBeVisible()
  // Not the first-character onboarding: the Player has a character, just not today.
  await expect(page.locator('.roster-welcome')).toHaveCount(0)
  await audit(page, info.outputPath('party-benched.png'))
  await page.getByRole('link', { name: 'Ver mis personajes' }).click()
  await expect(
    page.getByText('El DM ha marcado que hoy no vienes. Tu personaje', { exact: false }),
  ).toBeVisible()
  await expect(page.locator('.roster-state').first()).toContainText('Ausente')
  await page.goto(sheetUrl)
  await expect(
    page.getByText('Ausente hoy: la ficha es de solo lectura', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Descanso largo' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar la ficha' })).toHaveCount(0)
})

test('"New character" closes the party list for the Player and the DM', async ({ page }, info) => {
  await identityFixture(page, { player: true, sheet: 'complete' })
  await page.goto(party)
  const card = page.getByRole('button', { name: 'Nuevo personaje', exact: true })
  await expect(card).toHaveAccessibleDescription('Tienes 1 de 4')
  await audit(page, info.outputPath('party-new-card.png'))
  await card.click()
  await expect(page.getByLabel('Nombre del personaje')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card).toBeFocused()
})

test('3D dice roll the hit dice and fill the total', async ({ page }) => {
  const f = await identityFixture(page, { player: true, sheet: 'complete', party: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  f.openRest('short', { user: peerId, character: beaId })
  await page.goto(party)
  await page.getByRole('region', { name: 'Descanso del grupo' }).getByRole('button').first().click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  const dice = panel.getByRole('group', { name: /Dados de golpe que gastas/ })
  await dice.getByRole('button', { name: 'Gastar un dado más' }).click()
  await dice.getByRole('button', { name: 'Tirar por mí' }).click()
  // WebGL rolls take a moment; without WebGL Rytta rolls at once.
  await expect(dice.getByRole('textbox', { name: 'Tu tirada' })).toHaveValue(/^[1-8]$/, {
    timeout: 20_000,
  })
  expect(errors).toEqual([])
})

test('the fire seats a big table without overlaps, at 100 % and 150 % text', async ({
  page,
}, info) => {
  await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const names = ['Arin', 'Bea', 'Cato', 'Dorotea', 'Esmeralda', 'Fionn', 'Gwendolyn']
  const people = names.map((name, index) => ({
    id: `40000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
    name,
    own: index === 0,
    dm_controlled: false,
    controlled: index === 0,
    vote: index % 3 === 0 ? 'yes' : index % 3 === 1 ? null : 'no',
    dice_spent: 0,
    dice_roll: null,
    can_rest: index !== 5,
    shares: true,
    effect: null,
  }))
  await page.route('**/rest/v1/rpc/get_rest_state', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '70000000-0000-4000-8000-000000000001',
        kind: 'long',
        status: 'open',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        resolved_at: null,
        revision: 1,
        requester_name: 'Bea',
        mine: false,
        dm: false,
        can_cancel: false,
        participants: people,
      }),
    }),
  )
  for (const scale of ['100%', '150%']) {
    await page.goto(party)
    if (scale !== '100%') await page.addStyleTag({ content: `html { font-size: ${scale}; }` })
    await page
      .getByRole('region', { name: 'Descanso del grupo' })
      .getByRole('button', { name: 'Ver' })
      .click()
    const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
    const seats = panel.locator('.rest-seat')
    await expect(seats).toHaveCount(7)
    const boxes = await seats.evaluateAll((items) =>
      items.map((item) => {
        const r = item.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }),
    )
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        expect(
          a.right <= b.left + 1 ||
            b.right <= a.left + 1 ||
            a.bottom <= b.top + 1 ||
            b.bottom <= a.top + 1,
          `seats overlap at ${scale}`,
        ).toBe(true)
    await capture(page, info.outputPath(`rest-fire-7-${scale}.png`))
    await page.keyboard.press('Escape')
  }
})

test('a requester at 0 HP can still ask for the group and cancel', async ({ page }) => {
  const f = await identityFixture(page, { player: true, sheet: 'complete', party: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  f.vitalsOf(characterId)!.current_hp = 0
  await page.goto(sheetUrl)
  await page.getByRole('button', { name: 'Descanso largo' }).click()
  const ask = page.getByRole('dialog', { name: 'No tienes nada que recuperar' })
  await expect(ask).toContainText('Con 0 puntos de golpe no puedes descansar')
  await ask.getByRole('button', { name: 'Pedir igualmente' }).click()
  const panel = page.getByRole('dialog', { name: 'Descanso del grupo' })
  await expect(panel.getByRole('button', { name: 'Descansar', exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Cancelar petición' }).click()
  await expect(panel.getByRole('heading', { name: 'Petición cancelada' })).toBeVisible()
})
