import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { beaId, campaignId, characterId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'
import { tabletopServer } from './fixtures/tabletop.ts'

// RYT-131 (ADR 046): the one table screen for combat. With a map the map fills the screen under a
// turn plate that moves and shrinks; without one it is the "now and next" order in columns.
const sizes = [
  { name: '820', width: 820, height: 1180 },
  { name: '1280', width: 1280, height: 720 },
  { name: '1920', width: 1920, height: 1080 },
]
const secret = ['Wyvern Secreta', 'Lich Verdadero', 'Nota secreta del DM']
const evidenceDir = 'docs/evidence/ui-review/ryt-131'

type Role = 'dm' | 'player'

async function prepare(
  page: Page,
  role: Role,
  options: { modules?: string[]; closed?: boolean } = {},
) {
  const server = tabletopServer({ closedToPlayers: options.closed })
  const combat = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    sheet: 'complete',
    modules: options.modules ?? ['party', 'combat', 'tabletop'],
    player: role === 'player',
  })
  await combat.install(page)
  await server.install(page)
  return { server, combat }
}

/** Arin, Bea, a table alias for a secret creature, a hidden creature and `goblins` goblins. */
function seedFight(combat: ReturnType<typeof combatServer>, goblins = 13) {
  const { encounter_id: id } = combat.act('create_encounter', {
    encounter_name: 'Emboscada del puente',
  }) as { encounter_id: string }
  combat.act('add_combatants', {
    target_encounter: id,
    entries: [
      { kind: 'character', character_id: characterId },
      { kind: 'character', character_id: beaId },
      { kind: 'npc', name: 'Lich Verdadero', public_name: 'Figura Encapuchada', max_hp: 40 },
      { kind: 'npc', name: 'Wyvern Secreta', hidden: true, max_hp: 30, dm_notes: secret[2] },
      { kind: 'npc', name: 'Goblin', count: goblins, max_hp: 7, armor_class: 12 },
    ],
  })
  const encounter = combat.encounters.find((e) => e.id === id)!
  encounter.combatants.forEach((c, index) => (c.initiative = 100 - index))
  combat.act('set_encounter_status', { target_encounter: id, new_status: 'active' })
  const pass = () =>
    combat.act('advance_turn', {
      target_encounter: id,
      direction: 1,
      expected_active: encounter.active,
      request_id: crypto.randomUUID(),
    })
  return { id, pass }
}

function putSceneOnTable(server: ReturnType<typeof tabletopServer>) {
  const scene = server.act('save_tabletop_scene', {
    target_campaign: campaignId,
    target_scene: null,
    expected_revision: null,
    request_id: 'scene',
    fields: {
      name: 'Puente de Vado',
      map_kind: 'blank',
      ground: 'grass',
      cols: 20,
      rows: 12,
      items: [{ kind: 'token', x: 4, y: 4, w: 1, h: 1, label: 'Centinela', data: {} }],
    },
  }) as { id: string }
  server.act('set_tabletop_live', {
    target_campaign: campaignId,
    request_id: 'live',
    patch: { scene_id: scene.id, view_x: 10, view_y: 6 },
  })
  return scene.id
}

async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page })
    .include('body')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
}

/** The DOM carries nothing the table projection hides. */
async function expectNothingHidden(page: Page) {
  const html = await page.content()
  for (const text of secret) expect(html).not.toContain(text)
}

async function begin(page: Page) {
  await page
    .getByRole('dialog', { name: 'Pantalla de mesa' })
    .getByRole('button', { name: 'Empezar' })
    .click()
}

const plate = (page: Page) => page.getByRole('complementary', { name: 'Placa de turno' })

for (const role of ['dm', 'player'] as const)
  for (const size of sizes) {
    test(`RYT-131 without a map ${role} sees the whole order at ${size.name}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize(size)
      const { combat } = await prepare(page, role)
      const { id } = seedFight(combat)
      // The way in is the fight's own screen, for either role.
      await page.goto(
        role === 'dm'
          ? `./#/campaign/${campaignId}/combat/${id}`
          : `./#/campaign/${campaignId}/combat`,
      )
      await page.getByRole('link', { name: 'Pantalla de mesa' }).click()
      const order = page.locator('.tt-order')
      await expect(order).toBeVisible({ timeout: 15_000 })

      // No app chrome, no start tap: the order is the screen.
      await expect(page.getByRole('banner')).toHaveCount(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByRole('heading', { level: 1, name: 'Emboscada del puente' }),
      ).toBeVisible()
      await expect(order.locator('.tt-order-now .tt-order-actor')).toHaveText('Arin')
      await expect(order.locator('.tt-order-next .tt-order-after')).toHaveText('Bea')

      // All 16 visible combatants, none of the rest, laid out without scrolling.
      const rows = order.locator('.tt-order-row')
      await expect(rows).toHaveCount(16)
      const list = order.locator('.tt-order-list')
      const layout = await list.evaluate((el) => ({
        scrolls: el.scrollHeight > el.clientHeight + 1,
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        font: parseFloat(getComputedStyle(el.querySelector('.tt-order-name')!).fontSize),
      }))
      expect(layout.scrolls).toBe(false)
      expect(layout.columns).toBe(size.width >= 1000 ? 3 : 2)
      expect(layout.font).toBeGreaterThanOrEqual(size.width >= 1000 ? 28 : 26)
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)

      // The acting row is marked by a chevron and a state, not by colour alone.
      const acting = order.locator('.tt-order-row[aria-current="step"]')
      await expect(acting).toHaveCount(1)
      await expect(acting).toContainText('Arin')
      await expect(acting.locator('.tt-order-mark svg')).toBeVisible()
      expect(await acting.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700')
      await expect(order.getByText('Figura Encapuchada')).toBeVisible()
      await expectNothingHidden(page)

      await expectTouchTargets(page, '.tt-status button:visible')
      await audit(page)

      if (process.env.RYT_EVIDENCE)
        await page.screenshot({ path: `${evidenceDir}/order-${role}-${size.name}.png` })
      expect(errors).toEqual([])
    })

    test(`RYT-131 with a map ${role} sees the map under a turn plate at ${size.name}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize(size)
      const { combat, server } = await prepare(page, role)
      const { id } = seedFight(combat)
      putSceneOnTable(server)
      await page.goto(
        role === 'dm'
          ? `./#/campaign/${campaignId}/combat/${id}`
          : `./#/campaign/${campaignId}/combat`,
      )
      await page.getByRole('link', { name: 'Pantalla de mesa' }).click()
      await begin(page)

      const turn = plate(page)
      await expect(turn).toBeVisible({ timeout: 15_000 })
      await expect(turn).toContainText('Ronda 1')
      await expect(turn).toContainText('Arin')
      await expect(turn).toContainText('Bea')
      await expect(page.locator('.tt-order')).toHaveCount(0)
      await expect(page.locator('.tt-world')).toBeVisible()
      // The map fills the screen.
      const frame = await page.locator('.tt-table').boundingBox()
      expect(frame).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height })
      await expectNothingHidden(page)
      await expectTouchTargets(page, '.tt-plate button:visible, .tt-status button:visible')
      await audit(page)

      if (process.env.RYT_EVIDENCE)
        await page.screenshot({ path: `${evidenceDir}/map-${role}-${size.name}.png` })
      expect(errors).toEqual([])
    })
  }

test('RYT-131 a Player whose map is closed still gets the order', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat, server } = await prepare(page, 'player', {
    modules: ['party', 'combat'],
    closed: true,
  })
  seedFight(combat)
  putSceneOnTable(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expectNothingHidden(page)
})

test('RYT-131 Escape and the visible key leave the screen', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat, server } = await prepare(page, 'player')
  seedFight(combat)
  await page.goto(`./#/campaign/${campaignId}/combat`)
  const heading = page.getByRole('heading', { level: 1, name: 'Emboscada del puente' })
  await expect(heading).toBeVisible({ timeout: 15_000 })

  // Without a map: Escape goes back to where the screen was opened from.
  await page.getByRole('link', { name: 'Pantalla de mesa' }).click()
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')
  await expect(heading).toBeVisible()
  expect(page.url()).not.toContain('tabletop-table')

  // The visible key does the same.
  await page.getByRole('link', { name: 'Pantalla de mesa' }).click()
  await expect(page.locator('.tt-order')).toBeVisible()
  const leave = page.getByRole('button', { name: 'Salir de la pantalla de mesa' })
  await leave.focus()
  await expect(leave).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(heading).toBeVisible()

  // With a map, Escape works from the start card too.
  putSceneOnTable(server)
  await page.getByRole('link', { name: 'Pantalla de mesa' }).click()
  await expect(page.getByRole('dialog', { name: 'Pantalla de mesa' })).toBeVisible({
    timeout: 15_000,
  })
  await page.keyboard.press('Escape')
  await expect(heading).toBeVisible()

  // A screen opened on its own (the TV) goes to the campaign.
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await expect(page.getByRole('dialog', { name: 'Pantalla de mesa' })).toBeVisible({
    timeout: 15_000,
  })
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(new RegExp(`#/campaign/${campaignId}$`))
})

test('RYT-131 each turn change is announced once and the acting row follows it', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat } = await prepare(page, 'dm')
  const { pass } = seedFight(combat)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  const order = page.locator('.tt-order')
  await expect(order).toBeVisible({ timeout: 15_000 })
  const live = page.locator('.tt-table > .visually-hidden[aria-live="polite"]')
  await expect(live).toHaveText('')
  await live.evaluate((el) => {
    const seen: string[] = []
    ;(window as unknown as { announced: string[] }).announced = seen
    new MutationObserver(() => {
      const text = el.textContent ?? ''
      if (text && seen.at(-1) !== text) seen.push(text)
    }).observe(el, { childList: true, characterData: true, subtree: true })
  })

  pass()
  await expect(order.locator('.tt-order-row[aria-current="step"]')).toContainText('Bea', {
    timeout: 20_000,
  })
  await expect(live).toHaveText('Turno de Bea, ronda 1')
  await expect(order.locator('.tt-order-now .tt-order-actor')).toHaveText('Bea')
  pass()
  await expect(order.locator('.tt-order-row[aria-current="step"]')).toContainText('Figura', {
    timeout: 20_000,
  })
  await expect(live).toHaveText('Turno de Figura Encapuchada, ronda 1')
  // Polling again with nothing new says nothing more.
  await page.waitForTimeout(5_000)
  expect(
    await page.evaluate(() => (window as unknown as { announced: string[] }).announced),
  ).toEqual(['Turno de Bea, ronda 1', 'Turno de Figura Encapuchada, ronda 1'])
})

test('RYT-131 the plate moves by pointer and keys, shrinks, and keeps the choice on the device', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat, server } = await prepare(page, 'dm')
  seedFight(combat, 3)
  putSceneOnTable(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await begin(page)
  const turn = plate(page)
  await expect(turn).toBeVisible({ timeout: 15_000 })
  await expect(turn).toHaveAttribute('data-corner', 'top-left')
  await expect(turn).toHaveAttribute('data-size', 'full')

  // Keyboard: the handle's arrow keys choose a corner, and the move is said.
  const move = turn.getByRole('button', { name: /^Mover la placa de turno/ })
  await move.focus()
  await page.keyboard.press('ArrowRight')
  await expect(turn).toHaveAttribute('data-corner', 'top-right')
  await expect(turn.getByRole('status')).toHaveText('Placa de turno en la esquina superior derecha')
  await page.keyboard.press('ArrowDown')
  await expect(turn).toHaveAttribute('data-corner', 'bottom-right')
  // The bottom corners stay above the status bar.
  const bar = (await page.locator('.tt-status').boundingBox())!
  expect((await turn.boundingBox())!.y + (await turn.boundingBox())!.height).toBeLessThanOrEqual(
    bar.y + 1,
  )
  // A plain press steps to the next corner clockwise.
  await move.click()
  await expect(turn).toHaveAttribute('data-corner', 'bottom-left')

  // Pointer: dragging follows the pointer and snaps to the corner it is released in.
  const handle = (await move.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(900, 120, { steps: 6 })
  await expect(turn).toHaveClass(/is-dragging/)
  await page.mouse.up()
  await expect(turn).toHaveAttribute('data-corner', 'top-right')

  // Shrinking leaves the acting name alone; growing brings the next one back.
  await turn.getByRole('button', { name: 'Reducir la placa de turno' }).click()
  await expect(turn).toHaveAttribute('data-size', 'small')
  await expect(turn).toContainText('Arin')
  await expect(turn).not.toContainText('Después')
  await expectTouchTargets(page, '.tt-plate button:visible')
  await audit(page)

  // The choice survives a reload.
  await page.reload()
  await begin(page)
  await expect(plate(page)).toHaveAttribute('data-corner', 'top-right', { timeout: 15_000 })
  await expect(plate(page)).toHaveAttribute('data-size', 'small')
  await plate(page).getByRole('button', { name: 'Ampliar la placa de turno' }).click()
  await expect(plate(page)).toContainText('Después')
  await page.reload()
  await begin(page)
  await expect(plate(page)).toHaveAttribute('data-size', 'full', { timeout: 15_000 })
})

test('RYT-131 the plate works when the device blocks storage', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  await page.addInitScript(() => {
    const blocked = (key: string) => key === 'rytta-table-plate'
    const get = Storage.prototype.getItem
    const set = Storage.prototype.setItem
    Storage.prototype.getItem = function (key: string) {
      if (blocked(key)) throw new DOMException('blocked', 'SecurityError')
      return get.call(this, key)
    }
    Storage.prototype.setItem = function (key: string, value: string) {
      if (blocked(key)) throw new DOMException('blocked', 'SecurityError')
      return set.call(this, key, value)
    }
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { combat, server } = await prepare(page, 'dm')
  seedFight(combat, 3)
  putSceneOnTable(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await begin(page)
  const turn = plate(page)
  await expect(turn).toHaveAttribute('data-corner', 'top-left', { timeout: 15_000 })
  await turn.getByRole('button', { name: /^Mover la placa de turno/ }).click()
  await expect(turn).toHaveAttribute('data-corner', 'top-right')
  await page.reload()
  await begin(page)
  await expect(plate(page)).toHaveAttribute('data-corner', 'top-left', { timeout: 15_000 })
  expect(errors).toEqual([])
})

test('RYT-131 the table screen says what it cannot show', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat } = await prepare(page, 'dm')
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await expect(page.getByText('Nada en la mesa')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/empieza un combate/)).toBeVisible()
  await audit(page)
  // A fight that starts turns the same screen into the order.
  seedFight(combat, 3)
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 20_000 })
})

// Evidence: both themes and languages, with and without a map, at the three sizes.
test('RYT-131 evidence captures', async ({ page }) => {
  test.skip(!process.env.RYT_EVIDENCE, 'Evidence captures run with RYT_EVIDENCE')
  test.setTimeout(300_000)
  const { combat, server } = await prepare(page, 'dm')
  seedFight(combat)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  for (const scene of [false, true]) {
    if (scene) putSceneOnTable(server)
    for (const language of ['es', 'en'])
      for (const theme of ['default', 'parchment'])
        for (const size of sizes) {
          // The start card asks for full screen, and a full-screen window cannot be resized.
          await page.evaluate(() => document.fullscreenElement && document.exitFullscreen())
          await page.setViewportSize(size)
          await page.evaluate(
            ([l, t]) => {
              localStorage.setItem('rytta-language', l!)
              localStorage.setItem('rytta-theme', t!)
            },
            [language, theme],
          )
          await page.reload()
          if (scene) {
            await page.locator('.tt-start-button').click()
            await expect(page.locator('.tt-plate')).toBeVisible({ timeout: 15_000 })
            await page.waitForTimeout(600)
          } else await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
          await page.screenshot({
            path: `${evidenceDir}/${scene ? 'map' : 'order'}-${theme === 'default' ? 'hearth' : 'parchment'}-${language}-${size.name}.png`,
          })
        }
  }
})
