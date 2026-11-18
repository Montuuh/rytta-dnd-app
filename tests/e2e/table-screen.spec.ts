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
function seedFight(
  combat: ReturnType<typeof combatServer>,
  goblins = 13,
  options: { long?: boolean } = {},
) {
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
      ...(options.long
        ? [
            {
              kind: 'npc',
              name: 'Guardiana',
              public_name: 'Guardiana Ancestral de la Cripta Olvidada de Vadoscuro',
              max_hp: 20,
            },
            { kind: 'npc', name: 'Archimandrita Ceremonial del Templo Hundido', max_hp: 20 },
          ]
        : []),
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
  return { id, pass, encounter }
}

/** The screen's own network answers (as_table), for the "nothing hidden crosses the wire" check. */
function watchTableResponses(page: Page) {
  const bodies: Promise<string>[] = []
  page.on('response', (response) => {
    const request = response.request()
    if (
      /\/rpc\/get_(combat_state|tabletop)$/.test(response.url()) &&
      request.postData()?.includes('"as_table":true')
    )
      bodies.push(response.text().catch(() => ''))
  })
  return async () => {
    const all = await Promise.all(bodies)
    expect(all.length).toBeGreaterThan(0)
    for (const text of secret) expect(all.join('\n')).not.toContain(text)
  }
}

/** The way in from the fight's screen: a Player follows the link; the DM's opens a new tab. */
async function openScreen(page: Page, role: Role) {
  const link = page.getByRole('link', { name: /Pantalla de mesa/ })
  if (role === 'player') return link.click()
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  // The fixture backend is per page, so the new tab is followed here at its address.
  await page.goto((await link.getAttribute('href'))!)
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
      const checkWire = watchTableResponses(page)
      await openScreen(page, role)
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
      await checkWire()
      // The tokens scale with the display (they sat at 44px).
      if (size.width >= 1280)
        expect(
          await order.locator('.tt-order-now .combat-token').evaluate((el) => el.clientWidth),
        ).toBeGreaterThan(60)

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
      const checkWire = watchTableResponses(page)
      await openScreen(page, role)
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
      await checkWire()
      await expectTouchTargets(page, '.tt-turnplate button:visible, .tt-status button:visible')
      await audit(page)

      if (process.env.RYT_EVIDENCE)
        await page.screenshot({ path: `${evidenceDir}/map-${role}-${size.name}.png` })
      expect(errors).toEqual([])
    })
  }

test('RYT-131 a Player whose map is closed gets the order without hammering the map', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const frames: string[] = []
  const calls: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/rpc/get_tabletop')) calls.push(request.url())
  })
  const { combat, server } = await prepare(page, 'player', {
    modules: ['party', 'combat'],
    closed: true,
  })
  // Later routes win: watch the realtime socket the combat fixture otherwise swallows.
  await page.routeWebSocket(/realtime\/v1\/websocket/, (socket) => {
    socket.onMessage((message) => frames.push(String(message)))
  })
  seedFight(combat)
  putSceneOnTable(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  // No start card: there is no map to play sound for.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expectNothingHidden(page)
  // One refused call, no retry and no fast poll; and no channel on a table it cannot read.
  const settled = calls.length
  await page.waitForTimeout(7_000)
  expect(settled).toBe(1)
  expect(calls.length).toBe(1)
  expect(frames.join('\n')).toContain('encounters:')
  expect(frames.join('\n')).not.toContain('tabletop:')
})

test('RYT-131 without a map a Player gets an honest message for each failure', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat } = await prepare(page, 'player', { modules: ['party', 'combat'], closed: true })
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  // No fight yet: what comes next is a fight, never a scene this Player cannot see.
  await expect(page.getByText('No hay combate ahora')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/en cuanto el DM empiece un combate/)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/escena/)).toHaveCount(0)
  await audit(page)
  seedFight(combat, 2)
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 20_000 })

  // The fight itself cannot be read (the network): a load failure with a retry, not "forbidden".
  await page.route(/\/rpc\/get_combat_state$/, (route) => route.abort('connectionrefused'))
  await page.reload()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('La mesa no se cargó', { timeout: 20_000 })
  await expect(alert).not.toContainText('no puede ver')
  await expect(alert.getByRole('button', { name: 'Reintentar' })).toBeVisible()
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
  await page.getByRole('link', { name: /Pantalla de mesa/ }).click()
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')
  await expect(heading).toBeVisible()
  expect(page.url()).not.toContain('tabletop-table')

  // The visible key does the same.
  await page.getByRole('link', { name: /Pantalla de mesa/ }).click()
  await expect(page.locator('.tt-order')).toBeVisible()
  const leave = page.getByRole('button', { name: 'Salir de la pantalla de mesa' })
  await leave.focus()
  await expect(leave).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(heading).toBeVisible()

  // With a map, Escape works from the start card too.
  putSceneOnTable(server)
  await page.getByRole('link', { name: /Pantalla de mesa/ }).click()
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
  await expect(page).toHaveURL(new RegExp(`#/campaign/${campaignId}(/party)?$`))
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
    let last = ''
    new MutationObserver(() => {
      const text = el.textContent ?? ''
      if (text && text !== last) seen.push(text)
      last = text
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
  // hover waits until the plate has stopped moving to its new corner, so the press lands on the handle.
  await move.hover()
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
  await expectTouchTargets(page, '.tt-turnplate button:visible')
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

/** Rows keep to their own space: none overlaps another or the status bar, names stay in two lines. */
async function expectRowsApart(page: Page) {
  const problems = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.tt-order-list')!
    const listBox = list.getBoundingClientRect()
    const bar = document.querySelector('.tt-status')!.getBoundingClientRect()
    const rows = [...list.querySelectorAll<HTMLElement>('.tt-order-row')]
    const rects = rows.map((row) => row.getBoundingClientRect())
    const out: string[] = []
    if (listBox.bottom > bar.top + 1) out.push('the list runs under the status bar')
    rows.forEach((row, i) => {
      const rect = rects[i]!
      const name = row.querySelector<HTMLElement>('.tt-order-name')!
      const box = name.getBoundingClientRect()
      const line = parseFloat(getComputedStyle(name).lineHeight)
      const label = row.textContent?.slice(0, 30)
      if (box.top < rect.top - 1 || box.bottom > rect.bottom + 1)
        out.push(`name leaves its row: ${label}`)
      if (box.height > line * 2 + 2) out.push(`name takes more than two lines: ${label}`)
      if (name.scrollWidth > name.clientWidth + 1) out.push(`name runs sideways: ${label}`)
      rects.forEach((other, j) => {
        if (j <= i) return
        const across = Math.min(rect.right, other.right) - Math.max(rect.left, other.left)
        const down = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top)
        if (across > 1 && down > 1) out.push(`rows overlap: ${label}`)
      })
    })
    return out
  })
  expect(problems).toEqual([])
}

for (const size of sizes.slice(0, 2))
  for (const zoom of ['100%', '150%']) {
    test(`RYT-131 long names stay in their rows at ${size.name}px and ${zoom} text`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.setViewportSize(size)
      const { combat } = await prepare(page, 'player')
      seedFight(combat, 9, { long: true })
      await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
      await expect(page.locator('.tt-order-row')).toHaveCount(14, { timeout: 15_000 })
      await page.evaluate((fontSize) => (document.documentElement.style.fontSize = fontSize), zoom)
      await expect(page.getByText('Guardiana Ancestral de la Cripta')).toBeVisible()
      await expectRowsApart(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      if (process.env.RYT_EVIDENCE)
        await page.screenshot({
          path: `${evidenceDir}/order-long-names-${size.name}-${zoom.replace('%', '')}.png`,
        })
    })
  }

test('RYT-131 the order follows a re-ordered and a shortened fight', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { combat } = await prepare(page, 'player')
  const { encounter } = seedFight(combat, 5)
  const idOf = (name: string) => encounter.combatants.find((c) => c.name === name)!.id
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  const rows = page.locator('.tt-order-row')
  const acting = page.locator('.tt-order-row[aria-current="step"]')
  await expect(rows).toHaveCount(8, { timeout: 15_000 })
  await expect(acting).toContainText('Arin')

  // A total changed mid-round moves its row; the acting row stays Arin's.
  encounter.combatants.find((c) => c.name === 'Goblin 5')!.initiative = 110
  await expect(rows.first()).toContainText('Goblin 5', { timeout: 20_000 })
  await expect(acting).toContainText('Arin')

  // A combatant removed from the fight leaves the order.
  combat.act('remove_combatant', { target_combatant: idOf('Goblin 2') })
  await expect(rows).toHaveCount(7, { timeout: 20_000 })
  await expect(page.locator('.tt-order-list')).not.toContainText('Goblin 2')
  await expect(acting).toContainText('Arin')

  // The acting combatant removed: the turn passes on and the row mark follows it.
  combat.act('remove_combatant', { target_combatant: idOf('Arin') })
  await expect(acting).toContainText('Bea', { timeout: 20_000 })
  await expect(rows).toHaveCount(6)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('RYT-131 a hidden creature’s turn is announced without a name', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat } = await prepare(page, 'player')
  const { encounter } = seedFight(combat, 3)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
  const live = page.locator('.tt-table > .visually-hidden[aria-live="polite"]')
  // The fixture cannot pass the turn to a hidden creature, so the DM's pick is set directly.
  encounter.active = encounter.combatants.find((c) => c.name === 'Wyvern Secreta')!.id
  await expect(live).toHaveText('Un turno fuera de vista, ronda 1', { timeout: 20_000 })
  await expect(page.locator('.tt-order-actor')).toHaveText('Turno oculto')
  await expect(page.locator('.tt-order-next')).toHaveCount(0)
  await expect(page.locator('.tt-order-row[aria-current="step"]')).toHaveCount(0)
  await expectNothingHidden(page)
})

test('RYT-131 a turned table mirrors the plate’s arrow keys and its announced corner', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.setViewportSize(sizes[1]!)
  const { combat, server } = await prepare(page, 'dm')
  seedFight(combat, 3)
  const scene = putSceneOnTable(server)
  server.act('set_tabletop_live', {
    target_campaign: campaignId,
    request_id: 'turned',
    patch: {
      scene_id: scene,
      screen: { diagonal_in: 32, px_w: 1920, px_h: 1080, base_mm: 25.4, fine: 1, flip: true },
    },
  })
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  await begin(page)
  const turn = plate(page)
  await expect(turn).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.tt-table')).toHaveClass(/is-flipped/)
  const move = turn.getByRole('button', { name: /^Mover la placa de turno/ })
  await move.focus()
  // Right on the screen is left in the turned frame: the plate is already at the left, so it stays.
  await page.keyboard.press('ArrowRight')
  await expect(turn).toHaveAttribute('data-corner', 'top-left')
  // Left on the screen moves it to the other side of its frame, and the corner named is the screen's.
  await page.keyboard.press('ArrowLeft')
  await expect(turn).toHaveAttribute('data-corner', 'top-right')
  await expect(turn.getByRole('status')).toHaveText(
    'Placa de turno en la esquina inferior izquierda',
  )
  // The plate is where the screen says: at the bottom left of the physical screen.
  const box = (await turn.boundingBox())!
  expect(box.x + box.width / 2).toBeLessThan(640)
  expect(box.y + box.height / 2).toBeGreaterThan(360)
})

test('RYT-131 the table screen at 390px: order and map', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const { combat, server } = await prepare(page, 'player')
  seedFight(combat)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  const order = page.locator('.tt-order')
  await expect(order).toBeVisible({ timeout: 15_000 })
  // One column; the list may scroll here, and the acting row is in view.
  expect(
    await order
      .locator('.tt-order-list')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
  ).toBe(1)
  await expect(order.locator('.tt-order-row[aria-current="step"]')).toBeInViewport()
  await expectNothingHidden(page)
  await expectTouchTargets(page, '.tt-status button:visible')
  await audit(page)
  if (process.env.RYT_EVIDENCE) await page.screenshot({ path: `${evidenceDir}/order-390.png` })

  putSceneOnTable(server)
  await page.reload()
  await begin(page)
  const turn = plate(page)
  await expect(turn).toBeVisible({ timeout: 15_000 })
  const box = (await turn.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await expectTouchTargets(page, '.tt-turnplate button:visible, .tt-status button:visible')
  await audit(page)
  if (process.env.RYT_EVIDENCE) await page.screenshot({ path: `${evidenceDir}/map-390.png` })
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
            await expect(page.locator('.tt-turnplate')).toBeVisible({ timeout: 15_000 })
            await page.waitForTimeout(600)
          } else await expect(page.locator('.tt-order')).toBeVisible({ timeout: 15_000 })
          await page.screenshot({
            path: `${evidenceDir}/${scene ? 'map' : 'order'}-${theme === 'default' ? 'hearth' : 'parchment'}-${language}-${size.name}.png`,
          })
        }
  }
})
