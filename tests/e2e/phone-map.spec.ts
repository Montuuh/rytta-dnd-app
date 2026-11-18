import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { beaId, campaignId, characterId, dmId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'
import { tabletopServer } from './fixtures/tabletop.ts'

// RYT-132 (ADR 046): on a phone the Player's map is the page. At 820px the page layout stays.
const evidenceDir = 'docs/evidence/ui-review/ryt-132'
const secret = ['Ogro emboscado', 'Trampa', 'CD 15 para verla', 'Emboscada oculta']
const landscape = { width: 844, height: 390 }
const longName = 'Guardián ancestral de las Colinas de Ceniza'
const longScene = 'La Cripta del Rey Hechicero bajo las Colinas de Ceniza y el Puente Roto'
const mobile = (info: TestInfo) => info.project.name === 'identity-mobile'

async function prepare(
  page: Page,
  options: { language?: string; theme?: string; player?: boolean; party?: boolean } = {},
) {
  const server = tabletopServer()
  const combat = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (options.language || options.theme)
    await page.addInitScript(
      ({ language, theme }) => {
        if (language) localStorage.setItem('rytta-language', language)
        if (theme) localStorage.setItem('rytta-theme', theme)
      },
      { language: options.language, theme: options.theme },
    )
  const fixture = await identityFixture(page, {
    party: options.party ?? true,
    sheet: 'complete',
    modules: ['party', 'combat', 'tabletop'],
    player: options.player ?? true,
    linkedPlayer: options.player === false,
  })
  await combat.install(page)
  await server.install(page)
  return { server, combat, fixture }
}

/** A scene with the own token, a hidden creature, DM notes, an event, a secret door, fog and light. */
function seedScene(
  server: ReturnType<typeof tabletopServer>,
  options: { effects?: boolean; fog?: boolean; name?: string; crowd?: boolean } = {},
) {
  const scene = server.act('save_tabletop_scene', {
    target_campaign: campaignId,
    target_scene: null,
    expected_revision: null,
    request_id: 'scene',
    fields: {
      name: options.name ?? 'Puente de Vado',
      map_kind: 'blank',
      ground: 'grass',
      cols: 20,
      rows: 12,
      fog_enabled: options.fog ?? true,
      rooms: [{ id: 'ford', rects: [[0, 0, 12, 12]] }],
      items: [
        { kind: 'token', x: 4, y: 4, w: 1, h: 1, label: 'Centinela', data: { color: 'crimson' } },
        { kind: 'token', x: 14, y: 8, w: 1, h: 1, label: 'Bandido', data: { color: 'slate' } },
        {
          kind: 'token',
          x: 6,
          y: 4,
          w: 2,
          h: 2,
          label: 'Ogro emboscado',
          hidden: true,
          data: { color: 'slate', size: 'large' },
        },
        {
          kind: 'note',
          x: 2,
          y: 2,
          w: 1,
          h: 1,
          label: 'Trampa',
          secret: { text: 'CD 15 para verla' },
        },
        { kind: 'event', x: 8, y: 8, w: 1, h: 1, label: 'Emboscada oculta', secret: {} },
        {
          kind: 'door',
          x: 10,
          y: 5.5,
          w: 1,
          h: 0.25,
          rotation: 90,
          data: { state: 'closed', secret: true },
        },
        { kind: 'prop', x: 3, y: 7, w: 1, h: 1, data: { prop: 'campfire' } },
        // Goblins one square apart: their plates must never cover each other's tokens.
        ...(options.crowd
          ? Array.from({ length: 6 }, (_, i) => ({
              kind: 'token',
              x: 6 + i,
              y: 9,
              w: 1,
              h: 1,
              label: `Duende ${i + 1}`,
              data: { color: 'slate' },
            }))
          : []),
      ],
    },
  }) as { id: string }
  server.act('set_tabletop_live', {
    target_campaign: campaignId,
    request_id: 'live',
    patch: { scene_id: scene.id, view_x: 10, view_y: 6 },
  })
  const own = server.items.find((i) => i.kind === 'token' && i.label === 'Centinela')!
  own.controllable = true
  if (options.effects) {
    own.data = { ...own.data, map_actions: ['torch', 'reveal'], light_radius: 4, light_on: false }
    server.scenes[0]!.visibility = {
      vision: true,
      lighting: true,
      radius: 12,
      explored: [],
      visible: [],
      lit: [],
      bright: [],
    }
  }
  return scene.id
}

/** Arin acts first, Bea is next; two goblins and a hidden creature complete the order. */
function seedFight(combat: ReturnType<typeof combatServer>, options: { long?: boolean } = {}) {
  const { encounter_id: id } = combat.act('create_encounter', {
    encounter_name: 'Paso del vado',
  }) as { encounter_id: string }
  combat.act('add_combatants', {
    target_encounter: id,
    entries: [
      { kind: 'character', character_id: characterId },
      { kind: 'character', character_id: beaId },
      ...(options.long
        ? [
            {
              kind: 'npc',
              name: longName,
              max_hp: 20,
            },
          ]
        : []),
      { kind: 'npc', name: 'Wyvern oculta', hidden: true, max_hp: 30 },
      { kind: 'npc', name: 'Goblin', count: 2, max_hp: 7, armor_class: 12 },
    ],
  })
  const encounter = combat.encounters.find((e) => e.id === id)!
  encounter.combatants.forEach((c, index) => (c.initiative = 100 - index))
  combat.act('set_encounter_status', { target_encounter: id, new_status: 'active' })
  return { id, encounter }
}

/** The Player projection's own answers, for "nothing hidden crosses the wire". */
function watchResponses(page: Page) {
  const bodies: Promise<string>[] = []
  page.on('response', (response) => {
    if (/\/rpc\/get_(combat_state|tabletop)$/.test(response.url()))
      bodies.push(response.text().catch(() => ''))
  })
  return async () => {
    const all = await Promise.all(bodies)
    expect(all.length).toBeGreaterThan(0)
    const text = all.join('\n')
    for (const word of [...secret, 'Wyvern oculta']) expect(text).not.toContain(word)
    // The DM's room list never reaches a Player.
    expect(text).not.toContain('"rooms"')
  }
}

async function audit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const result = await new AxeBuilder({ page })
    .include('body')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
}

const open = async (page: Page) => {
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.locator('.tt-pm, .tt-player-board')).toBeVisible({ timeout: 15_000 })
}

/** The board's scale on screen (the world's transform) and a token plate's height. */
const zoomOf = (page: Page) =>
  page.locator('.tt-world-wrap').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)

/** A two-finger pinch through the browser's own touch input (Chromium only). */
async function pinch(page: Page, from: number, to: number) {
  const box = (await page.locator('.tt-viewport').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const cdp = await page.context().newCDPSession(page)
  const points = (half: number) => [
    { x: cx - half, y: cy, id: 1 },
    { x: cx + half, y: cy, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) })
  for (let step = 1; step <= 6; step++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(from + ((to - from) * step) / 6),
    })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** The strip, the board and every key lie inside the viewport and can be pressed (a fixed layer that
 * is wider than the screen hides its overflow, so the page's own scroll width cannot tell). */
async function expectReachable(page: Page) {
  const { width, height } = page.viewportSize()!
  for (const selector of ['.tt-pm', '.tt-pm-strip', '.tt-viewport', '.tt-pm-fab', '.tt-pm-leave']) {
    for (const element of await page.locator(selector).all()) {
      const box = (await element.boundingBox())!
      expect(box.x, selector).toBeGreaterThanOrEqual(0)
      expect(box.y, selector).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, selector).toBeLessThanOrEqual(width + 0.5)
      expect(box.y + box.height, selector).toBeLessThanOrEqual(height + 0.5)
    }
  }
  for (const key of await page.locator('.tt-pm-fab, .tt-pm-leave').all())
    await key.click({ trial: true })
}

async function expectBoardIsThePage(page: Page, width: number, height: number) {
  const strip = (await page.locator('.tt-pm-strip').boundingBox())!
  const board = (await page.locator('.tt-viewport').boundingBox())!
  expect(strip).toMatchObject({ x: 0, y: 0, width })
  expect(board.x).toBe(0)
  expect(board.width).toBe(width)
  expect(Math.abs(board.y - (strip.y + strip.height))).toBeLessThanOrEqual(1)
  expect(Math.abs(board.y + board.height - height)).toBeLessThanOrEqual(1)
  // No page chrome: the header and the bottom bar are gone, not covered.
  await expect(page.locator('.app-header')).toBeHidden()
  await expect(page.locator('.bottom-nav')).toBeHidden()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true)
}

for (const view of [
  { name: 'portrait', ...{ width: 390, height: 844 } },
  { name: 'landscape', ...landscape },
])
  test(`RYT-132 the Player's map is the page on a phone in ${view.name}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize(view)
    const { server, combat } = await prepare(page)
    seedScene(server, { effects: true })
    seedFight(combat)
    const checkWire = watchResponses(page)
    await open(page)

    await expect(page.getByRole('heading', { level: 1, name: 'Puente de Vado' })).toBeAttached()
    await expectBoardIsThePage(page, view.width, view.height)

    // Now, next and the own turn, in words.
    const strip = page.locator('.tt-pm-strip')
    await expect(strip).not.toContainText('Ahora')
    await expect(strip).toContainText('Después')
    await expect(strip).toContainText('Bea')
    await expect(strip.locator('.tt-pm-now')).toContainText('Arin')
    await expect(strip).toHaveClass(/is-yours/)
    await expect(strip).toContainText('¡Te toca!')

    // What the Player may not see is in neither the page nor the network.
    const html = await page.content()
    for (const word of [...secret, 'Wyvern oculta']) expect(html).not.toContain(word)
    await expect(page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' })).toBeVisible()
    await expect(page.locator('.tt-viewport .tt-token')).toHaveCount(2)
    await expect(
      page.locator('.tt-pin, .tt-area-handle, .tt-room-numbers, .tt-door-mark'),
    ).toHaveCount(0)
    await expect(page.locator('.tt-fog')).not.toHaveCount(0)
    await checkWire()

    // Three round keys of at least 44px, and the way back.
    await expect(page.locator('.tt-pm-fab')).toHaveCount(3)
    for (const box of await page.locator('.tt-pm-fab').evaluateAll((keys) =>
      keys.map((key) => {
        const { width, height } = key.getBoundingClientRect()
        return { width, height, round: getComputedStyle(key).borderRadius }
      }),
    ))
      expect(box).toMatchObject({ width: 48, height: 48, round: '50%' })
    await expectTouchTargets(page, '.tt-pm button:visible, .tt-pm a:visible')
    await audit(page)
    if (process.env.RYT_EVIDENCE)
      await page.screenshot({ path: `${evidenceDir}/phone-${view.name}-es-dark.png` })
    expect(errors).toEqual([])
  })

/** The own token (with its name plate) is inside the board and off every floating key. */
async function expectTokenClear(page: Page) {
  const token = page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' })
  const box = (await token.boundingBox())!
  const board = (await page.locator('.tt-viewport').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(board.x)
  expect(box.x + box.width).toBeLessThanOrEqual(board.x + board.width)
  expect(box.y).toBeGreaterThanOrEqual(board.y)
  expect(box.y + box.height).toBeLessThanOrEqual(board.y + board.height)
  for (const key of await page.locator('.tt-pm-fab').all()) {
    const k = (await key.boundingBox())!
    const overlap =
      box.x < k.x + k.width &&
      k.x < box.x + box.width &&
      box.y < k.y + k.height &&
      k.y < box.y + box.height
    expect(overlap).toBe(false)
  }
}

for (const view of [{ width: 390, height: 844 }, landscape])
  test(`RYT-132 the map opens on the own token and centring keeps it clear of the keys at ${view.width}x${view.height}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    test.setTimeout(90_000)
    await page.setViewportSize(view)
    const { server } = await prepare(page)
    seedScene(server, { effects: true })
    await open(page)
    // On open: the map covers most of the board at a zoom where tokens read, token visible and clear.
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.89)
    const covered = await page.evaluate(() => {
      const board = document.querySelector('.tt-viewport')!.getBoundingClientRect()
      const world = document.querySelector('.tt-world')!.getBoundingClientRect()
      const w = Math.max(0, Math.min(board.right, world.right) - Math.max(board.left, world.left))
      const h = Math.max(0, Math.min(board.bottom, world.bottom) - Math.max(board.top, world.top))
      return (w * h) / (board.width * board.height)
    })
    expect(covered).toBeGreaterThan(0.7)
    await expectTokenClear(page)

    // Zoomed far out by a pinch, fit and then centre again: still clear of the keys.
    await pinch(page, 120, 20)
    await expect.poll(() => zoomOf(page)).toBeLessThan(0.45)
    await page.getByRole('button', { name: 'Encajar el mapa' }).click()
    await page.getByRole('button', { name: 'Centrar en mi ficha' }).click()
    await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(0.89)
    await expectTokenClear(page)
  })

test('RYT-132 one tap or one key press shows the whole map, and another returns to the token', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server, { effects: true })
  await open(page)
  const board = (await page.locator('.tt-viewport').boundingBox())!
  const worldWidth = async () => (await page.locator('.tt-world').boundingBox())!.width
  expect(await worldWidth()).toBeGreaterThan(board.width)

  // One tap: the first key says what it does and shows the whole map.
  const key = page.getByRole('button', { name: 'Encajar el mapa' })
  await expect(page.getByRole('button', { name: 'Centrar en mi ficha' })).toHaveCount(0)
  await key.click()
  await expect.poll(worldWidth).toBeLessThanOrEqual(board.width)
  // The key now goes back to the token, which stays off the keys.
  const back = page.getByRole('button', { name: 'Centrar en mi ficha' })
  await expect(back).toBeVisible()
  await back.click()
  await expect.poll(worldWidth).toBeGreaterThan(board.width)
  await expectTokenClear(page)

  // The keyboard: the board is a stop, + and - zoom, 0 fits the map.
  const stage = page.getByRole('application', { name: 'Mapa de Puente de Vado' })
  await stage.focus()
  const zoom = await zoomOf(page)
  await page.keyboard.press('+')
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(zoom)
  await page.keyboard.press('-')
  await page.keyboard.press('-')
  await expect.poll(() => zoomOf(page)).toBeLessThan(zoom)
  await page.keyboard.press('0')
  await expect.poll(worldWidth).toBeLessThanOrEqual(board.width)
  await expect(page.getByRole('button', { name: 'Centrar en mi ficha' })).toBeVisible()
  await expectReachable(page)
  await audit(page)
})

test('RYT-132 without a token the map opens framing the tokens, and the fit key stays one tap away', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server)
  server.items.find((i) => i.label === 'Centinela')!.controllable = false
  await open(page)
  // Both visible tokens are in the frame on open, and the map is not just empty grid.
  for (const name of ['Centinela', 'Bandido'])
    await expect(page.locator('.tt-viewport .tt-token', { hasText: name })).toBeInViewport()
  const board = (await page.locator('.tt-viewport').boundingBox())!
  await page.getByRole('button', { name: 'Encajar el mapa' }).click()
  await expect
    .poll(async () => (await page.locator('.tt-world').boundingBox())!.width)
    .toBeLessThanOrEqual(board.width)
})

for (const view of [{ width: 390, height: 844 }, { width: 360, height: 640 }, landscape])
  test(`RYT-132 a long name or scene title never pushes the keys off the screen at ${view.width}x${view.height}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    test.setTimeout(120_000)
    await page.setViewportSize(view)
    const { server, combat } = await prepare(page)
    seedScene(server, { effects: true, name: longScene })
    const { id, encounter } = seedFight(combat, { long: true })
    // Pass turns until the long-named creature acts.
    for (let i = 0; i < 8; i++) {
      const current = encounter.combatants.find((c) => c.id === encounter.active)
      if (current?.name === longName) break
      combat.act('advance_turn', {
        target_encounter: id,
        direction: 1,
        expected_active: encounter.active,
        request_id: crypto.randomUUID(),
      })
    }
    await open(page)
    await expect(page.locator('.tt-pm-strip')).toContainText('Guardián ancestral')
    await expectReachable(page)
    // The whole name is still in the page for assistive technology.
    await expect(page.locator('.tt-pm-name', { hasText: longName }).first()).toHaveText(longName)
    await audit(page)
    if (process.env.RYT_EVIDENCE)
      await page.screenshot({ path: `${evidenceDir}/long-names-${view.width}x${view.height}.png` })
  })

for (const view of [{ width: 390, height: 844 }, landscape])
  test(`RYT-132 a scene title that long with no fight keeps the keys reachable at ${view.width}x${view.height}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    await page.setViewportSize(view)
    const { server } = await prepare(page)
    seedScene(server, { effects: true, name: longScene })
    await open(page)
    await expect(page.locator('.tt-pm-strip')).toContainText(longScene.slice(0, 20))
    await expectReachable(page)
    await audit(page)
  })

for (const view of [
  { name: '360', width: 360, height: 640, size: '' },
  { name: '260 (390 at 150%)', width: 260, height: 563, size: '' },
  { name: '390 with text at 150%', width: 390, height: 844, size: '150%' },
])
  test(`RYT-132 the own-turn strip reflows without overlap at ${view.name}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    test.setTimeout(90_000)
    await page.setViewportSize(view)
    const { server, combat } = await prepare(page)
    seedScene(server)
    seedFight(combat)
    await open(page)
    if (view.size)
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), view.size)
    const strip = page.locator('.tt-pm-strip')
    await expect(strip).toContainText('¡Te toca!')
    type Rect = { x: number; y: number; w: number; h: number } | null
    const boxes = await strip.evaluate((el) => {
      const box = (selector: string): Rect => {
        const node = el.querySelector(selector)
        if (!node || getComputedStyle(node).display === 'none') return null
        const r = node.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }
      return {
        state: box('.tt-pm-state'),
        round: box('.tt-pm-round'),
        next: box('.tt-pm-next'),
        now: box('.tt-pm-now'),
        stripWidth: el.getBoundingClientRect().width,
      }
    })
    // "¡Te toca!" stays on one line, and nothing paints over anything else.
    expect(boxes.state!.h).toBeLessThan(30)
    const apart = (a: Rect, b: Rect) =>
      !a ||
      !b ||
      a.x + a.w <= b.x + 0.5 ||
      b.x + b.w <= a.x + 0.5 ||
      a.y + a.h <= b.y + 0.5 ||
      b.y + b.h <= a.y + 0.5
    expect(apart(boxes.state, boxes.round)).toBe(true)
    expect(apart(boxes.now, boxes.next)).toBe(true)
    expect(boxes.state!.x + boxes.state!.w).toBeLessThanOrEqual(boxes.stripWidth + 0.5)
    await expectReachable(page)
    await audit(page)
  })

test('RYT-132 Back closes the measure and the effects sheet before it leaves the map', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server, { effects: true })
  await page.goto(`./#/campaign/${campaignId}`)
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.locator('.tt-pm')).toBeVisible({ timeout: 15_000 })
  const url = page.url()
  const measure = page.getByRole('button', { name: 'Medir' })
  const effects = page.getByRole('button', { name: 'Efectos de mi ficha' })

  await measure.click()
  await expect(measure).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Arrastra por el mapa para medir')).toBeVisible()
  await page.goBack()
  await expect(measure).toHaveAttribute('aria-pressed', 'false')
  expect(page.url()).toBe(url)

  await effects.click()
  const sheet = page.getByRole('dialog', { name: 'Efectos de mi ficha' })
  await expect(sheet).toBeVisible()
  await expectTouchTargets(sheet, 'button:visible')
  await page.goBack()
  await expect(sheet).toHaveCount(0)
  expect(page.url()).toBe(url)
  await expect(effects).toBeFocused()

  // Escape closes them too and hands focus back.
  await effects.click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  // Escape works from the key itself (focus stays where the tap left it), not only from the board.
  await measure.click()
  await expect(measure).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(measure).toHaveAttribute('aria-pressed', 'false')
  await expect(measure).toBeFocused()

  // With nothing open, Back leaves the page as before.
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}(/party)?$`))
})

test('RYT-132 measuring works by touch on the phone map', async ({ page }, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server)
  await open(page)
  await page.getByRole('button', { name: 'Medir' }).click()
  // Two squares from the own token (the map opens at a zoom where seven would leave the screen).
  const world = (await page.locator('.tt-world').boundingBox())!
  const sq = world.width / 20
  const at = (await page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' }).boundingBox())!
  const [x, y] = [at.x + at.width / 2, at.y + sq / 2]
  await page.touchscreen.tap(x, y)
  await page.touchscreen.tap(x + 2 * sq, y)
  await expect(page.locator('.tt-pm-chip .tt-readout-feet')).toHaveText('10 pies')
  await page.getByRole('button', { name: 'Borrar la medida' }).click()
  await expect(page.locator('.tt-pm-chip .tt-readout-feet')).toHaveCount(0)
})

test('RYT-132 labels keep their size while a square can hold them, then give way to the monograms', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server, { crowd: true })
  await open(page)
  const name = page.locator('.tt-viewport .tt-token-name', { hasText: 'Duende 3' })
  const plate = async () => {
    const box = (await name.boundingBox())!
    return { height: box.height, zoom: await zoomOf(page) }
  }
  // Opens at a zoom where tokens read: plates show at the size of their text, no wider than three squares.
  await expect(name).toBeVisible()
  const opened = await plate()
  expect(opened.zoom).toBeGreaterThanOrEqual(0.59)
  expect(opened.height).toBeGreaterThanOrEqual(14)
  // One line, at most two squares wide and under 40% of a square tall: it cannot bury its neighbours.
  const shape = (await name.boundingBox())!
  expect(shape.width).toBeLessThanOrEqual(2 * 64 * opened.zoom + 1)
  expect(shape.height).toBeLessThanOrEqual(0.4 * 64 * opened.zoom + 1)

  // A pinch zooms in; the plate keeps its size on screen (the map and tokens grew).
  await pinch(page, 40, 120)
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(opened.zoom * 1.4)
  await expect(name).toBeVisible()
  const closer = await plate()
  expect(Math.abs(closer.height - opened.height)).toBeLessThanOrEqual(1.5)

  // Zoomed far out the squares are small: no plate may cover the neighbours, the tokens show alone.
  await pinch(page, 120, 15)
  await expect.poll(() => zoomOf(page)).toBeLessThan(0.5)
  await expect(page.locator('.tt-world-wrap')).toHaveAttribute('data-labels', 'hidden')
  await expect(page.locator('.tt-viewport .tt-token-name:visible')).toHaveCount(0)
  await expect(page.locator('.tt-viewport .tt-token')).toHaveCount(8)
})

test('RYT-132 notices that ask for something stay on the phone map', async ({ page }, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  // A rest the DM asked for: the Player can still read it and vote.
  const { server, fixture } = await prepare(page)
  seedScene(server)
  fixture.openRest('long', { user: dmId, character: null })
  await open(page)
  const banner = page.getByRole('region', { name: 'Descanso del grupo' })
  await expect(banner).toBeVisible()
  await expectTouchTargets(banner, 'button:visible')
  const strip = (await page.locator('.tt-pm-strip').boundingBox())!
  expect((await banner.boundingBox())!.y).toBeGreaterThanOrEqual(strip.y + strip.height - 1)
  await expectReachable(page)
  await banner.getByRole('button', { name: 'Votar' }).click()
  await expect(page.getByRole('dialog', { name: 'Descanso del grupo' })).toBeVisible()
  await audit(page)
})

for (const view of [{ width: 390, height: 844 }, landscape])
  test(`RYT-132 the notices stack and stay readable with every one showing at ${view.width}x${view.height}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    test.setTimeout(90_000)
    await page.setViewportSize(view)
    await page.route('**/version.json*', (route) =>
      route.fulfill({ json: { id: 'older-build', builtAt: '2026-01-01T00:00:00Z' } }),
    )
    const { server, fixture } = await prepare(page, { player: false, party: false })
    seedScene(server)
    fixture.openRest('long', { user: dmId, character: null })
    await page.goto(`./#/campaign/${campaignId}/party`)
    await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
    await expect(page.getByText('Estás viendo la mesa como Arin')).toBeVisible()
    await page.goto(`./#/campaign/${campaignId}/tabletop`)
    await expect(page.locator('.tt-pm')).toBeVisible({ timeout: 15_000 })
    const preview = page.locator('.preview-banner')
    const rest = page.getByRole('region', { name: 'Descanso del grupo' })
    const update = page.locator('.update-notice')
    await expect(preview).toBeVisible()
    await expect(rest).toBeVisible()
    await expect(update).toBeVisible()
    const leave = page.getByRole('button', { name: 'Volver a vista DM' })
    await leave.click({ trial: true })
    // No notice paints over another, and the Player's view is still left in one tap.
    const boxes = await Promise.all(
      [preview, rest, update].map(async (notice) => (await notice.boundingBox())!),
    )
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        expect(
          a.x + a.width <= b.x + 0.5 ||
            b.x + b.width <= a.x + 0.5 ||
            a.y + a.height <= b.y + 0.5 ||
            b.y + b.height <= a.y + 0.5,
        ).toBe(true)
    // In landscape the map keeps most of the height.
    if (view.width > view.height) {
      const strip = (await page.locator('.tt-pm-strip').boundingBox())!
      const top = Math.max(...boxes.slice(0, 2).map((b) => b.y + b.height))
      expect(view.height - top).toBeGreaterThan(view.height * 0.55)
      expect(strip.height).toBeLessThan(80)
    }
    for (const key of await page.locator('.tt-pm-fab').all()) await key.click({ trial: true })
    await audit(page)
    if (process.env.RYT_EVIDENCE)
      await page.screenshot({ path: `${evidenceDir}/notices-${view.width}x${view.height}.png` })
    await leave.click()
    await expect(page.locator('.tt-pm')).toHaveCount(0)
  })

test("RYT-132 initiative puts the Player's own roll first and the count second", async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server, combat } = await prepare(page)
  seedScene(server)
  const { encounter } = seedFight(combat)
  encounter.status = 'initiative'
  for (const c of encounter.combatants) c.initiative = undefined
  await open(page)
  const now = page.locator('.tt-pm-now')
  await expect(now.locator('.tt-pm-name')).toHaveText('Te falta tirar iniciativa')
  await expect(now.locator('.tt-pm-label')).toContainText('listos')
})

test('RYT-132 a DM in the Player view can still leave it from the phone map', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page, { player: false, party: false })
  seedScene(server)
  await page.goto(`./#/campaign/${campaignId}/party`)
  await page.getByRole('switch', { name: 'Vista jugador', exact: true }).click()
  await expect(page.getByText('Estás viendo la mesa como Arin')).toBeVisible()
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.locator('.tt-pm')).toBeVisible({ timeout: 15_000 })
  const leave = page.getByRole('button', { name: 'Volver a vista DM' })
  await expect(leave).toBeVisible()
  await expectTouchTargets(page.locator('.preview-banner'), 'button:visible')
  await expectReachable(page)
  await leave.click()
  await expect(page.locator('.tt-pm')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Mesa' })).toBeVisible()
})

test('RYT-132 rotating the phone keeps the own token on screen, and the sheet closes with the mode', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server, { effects: true })
  await open(page)
  await expectTokenClear(page)
  // Pan the view by hand, then turn the phone: the world point at the centre stays there.
  await page.setViewportSize(landscape)
  await expect(page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' })).toBeInViewport()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' })).toBeInViewport()
  // Past the phone threshold the page layout returns and the open sheet is gone, not waiting.
  await page.getByRole('button', { name: 'Efectos de mi ficha' }).click()
  await expect(page.getByRole('dialog', { name: 'Efectos de mi ficha' })).toBeVisible()
  await page.setViewportSize({ width: 820, height: 1180 })
  await expect(page.locator('.tt-pm')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Efectos de mi ficha' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.tt-pm')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Efectos de mi ficha' })).toHaveCount(0)
  await expect(page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' })).toBeInViewport()
})

test('RYT-132 a tap on the map does not draw the keyboard cursor', async ({ page }, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server)
  await open(page)
  await page.getByRole('button', { name: 'Medir' }).click()
  const board = (await page.locator('.tt-viewport').boundingBox())!
  await page.touchscreen.tap(board.x + 100, board.y + 200)
  await expect(page.locator('.tt-viewport rect[stroke="var(--app-focus)"]')).toHaveCount(0)
})

test('RYT-132 the keys show a visible focus and the strip leads back to the campaign', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server, { effects: true })
  await open(page)
  await page.getByRole('link', { name: 'Volver a la campaña' }).focus()
  // The board is a stop (zoom keys), then the three keys.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('application', { name: 'Mapa de Puente de Vado' })).toBeFocused()
  for (const name of ['Encajar el mapa', 'Medir', 'Efectos de mi ficha']) {
    await page.keyboard.press('Tab')
    const key = page.getByRole('button', { name })
    await expect(key).toBeFocused()
    const ring = await key.evaluate((el) => {
      const style = getComputedStyle(el)
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
    })
    expect(ring.style).not.toBe('none')
    expect(ring.width).toBeGreaterThanOrEqual(2)
  }
  await page.getByRole('link', { name: 'Volver a la campaña' }).click()
  await expect(page).toHaveURL(new RegExp(`/campaign/${campaignId}(/party)?$`))
  await expect(page.locator('.tt-pm')).toHaveCount(0)
})

test('RYT-132 without a fight the strip names the scene; without a token the key fits the map', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server)
  server.items.find((i) => i.label === 'Centinela')!.controllable = false
  await open(page)
  await expect(page.locator('.tt-pm-strip')).toContainText('Puente de Vado')
  await expect(page.locator('.tt-pm-strip')).not.toContainText('Ahora')
  await expect(page.getByRole('button', { name: 'Centrar en mi ficha' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Encajar el mapa' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Efectos de mi ficha' })).toHaveCount(0)
  await audit(page)
})

test('RYT-132 at 820px the Player keeps the page layout', async ({ page }, info) => {
  test.skip(info.project.name !== 'identity-tablet', 'The page layout is checked at 820px.')
  test.setTimeout(90_000)
  const { server, combat } = await prepare(page)
  seedScene(server)
  seedFight(combat)
  await open(page)
  await expect(page.locator('.tt-pm')).toHaveCount(0)
  await expect(page.locator('.app-header')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Medir' })).toBeVisible()
  await expect(page.locator('.tt-zoom')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Puente de Vado' })).toBeVisible()
  await expect(page.locator('.tt-pin, .tt-area-handle, .tt-room-numbers')).toHaveCount(0)
  await expect(page.locator('.tt-viewport .tt-token', { hasText: 'Ogro emboscado' })).toHaveCount(0)
  // The name plates stay at the size they always had on the page layout.
  expect(
    await page
      .locator('.tt-token-name')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBe(13)
  await audit(page)
  if (process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `${evidenceDir}/tablet-820-es-dark.png` })
})

for (const language of ['es', 'en'])
  for (const theme of ['default', 'parchment'])
    for (const view of [
      { name: 'portrait', ...{ width: 390, height: 844 } },
      { name: 'landscape', ...landscape },
    ])
      test(`RYT-132 evidence ${view.name} ${theme} ${language}`, async ({ page }, info) => {
        test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
        test.setTimeout(90_000)
        await page.setViewportSize(view)
        const { server, combat } = await prepare(page, { language, theme })
        seedScene(server, { effects: true })
        const { id, encounter } = seedFight(combat)
        await open(page)
        const strip = page.locator('.tt-pm-strip')
        await expect(strip).toContainText(language === 'es' ? '¡Te toca!' : 'Your turn!')
        await expectBoardIsThePage(page, view.width, view.height)
        await audit(page)
        await expectTouchTargets(page, '.tt-pm button:visible, .tt-pm a:visible')
        if (process.env.RYT_EVIDENCE)
          await page.screenshot({
            path: `${evidenceDir}/phone-${view.name}-${language}-${theme}-yours.png`,
          })
        // Another creature acts: the strip says who, with who is next.
        combat.act('advance_turn', {
          target_encounter: id,
          direction: 1,
          expected_active: encounter.active,
          request_id: crypto.randomUUID(),
        })
        await expect(strip).not.toHaveClass(/is-yours/, { timeout: 20_000 })
        await expect(strip.locator('.tt-pm-now')).toContainText('Bea')
        await expect(strip.locator('.tt-pm-now')).toContainText(language === 'es' ? 'Ahora' : 'Now')
        await page.getByRole('button', { name: language === 'es' ? 'Medir' : 'Measure' }).click()
        await audit(page)
        if (process.env.RYT_EVIDENCE)
          await page.screenshot({
            path: `${evidenceDir}/phone-${view.name}-${language}-${theme}-measure.png`,
          })
      })

for (const view of [{ width: 390, height: 844 }, landscape])
  test(`RYT-132 evidence of an open map, fitted, centred and zoomed at ${view.width}x${view.height}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info) || !process.env.RYT_EVIDENCE, 'Captured for the review only.')
    test.setTimeout(90_000)
    await page.setViewportSize(view)
    const { server, combat } = await prepare(page)
    seedScene(server, { effects: true, fog: false })
    server.scenes[0]!.visibility = undefined
    seedFight(combat)
    await open(page)
    const name = `${evidenceDir}/open-${view.width}x${view.height}`
    await expect(page.locator('.tt-viewport .tt-token')).toHaveCount(2)
    await page.screenshot({ path: `${name}-opened.png` })
    await pinch(page, 120, 15)
    await expect.poll(() => zoomOf(page)).toBeLessThan(0.5)
    await page.screenshot({ path: `${name}-zoomed-out.png` })
    await page.getByRole('button', { name: 'Encajar el mapa' }).click()
    await page.screenshot({ path: `${name}-fitted.png` })
    await page.getByRole('button', { name: 'Centrar en mi ficha' }).click()
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(0.88)
    await page.screenshot({ path: `${name}-centred.png` })
    const centred = await zoomOf(page)
    await pinch(page, 40, 110)
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(centred)
    await page.screenshot({ path: `${name}-pinched.png` })
  })
