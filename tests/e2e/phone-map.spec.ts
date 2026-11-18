import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { beaId, campaignId, characterId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'
import { tabletopServer } from './fixtures/tabletop.ts'

// RYT-132 (ADR 046): on a phone the Player's map is the page. At 820px the page layout stays.
const evidenceDir = 'docs/evidence/ui-review/ryt-132'
const secret = ['Ogro emboscado', 'Trampa', 'CD 15 para verla', 'Emboscada oculta']
const landscape = { width: 844, height: 390 }
const mobile = (info: TestInfo) => info.project.name === 'identity-mobile'

async function prepare(page: Page, options: { language?: string; theme?: string } = {}) {
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
  await identityFixture(page, {
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat', 'tabletop'],
    player: true,
  })
  await combat.install(page)
  await server.install(page)
  return { server, combat }
}

/** A scene with the own token, a hidden creature, DM notes, an event, a secret door, fog and light. */
function seedScene(
  server: ReturnType<typeof tabletopServer>,
  options: { effects?: boolean; fog?: boolean } = {},
) {
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
function seedFight(combat: ReturnType<typeof combatServer>) {
  const { encounter_id: id } = combat.act('create_encounter', {
    encounter_name: 'Paso del vado',
  }) as { encounter_id: string }
  combat.act('add_combatants', {
    target_encounter: id,
    entries: [
      { kind: 'character', character_id: characterId },
      { kind: 'character', character_id: beaId },
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

for (const view of [{ width: 390, height: 844 }, landscape])
  test(`RYT-132 centring keeps the own token clear of the floating keys at ${view.width}x${view.height}`, async ({
    page,
  }, info) => {
    test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
    test.setTimeout(90_000)
    await page.setViewportSize(view)
    const { server } = await prepare(page)
    seedScene(server, { effects: true })
    await open(page)
    const before = await zoomOf(page)
    await page.getByRole('button', { name: 'Centrar en mi ficha' }).click()
    const token = page.locator('.tt-viewport .tt-token', { hasText: 'Centinela' })
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(before)
    const box = (await token.boundingBox())!
    const board = (await page.locator('.tt-viewport').boundingBox())!
    // The token (with its name plate) is inside the board and off every key.
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
  await measure.click()
  await page.getByRole('application').focus()
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
  const world = (await page.locator('.tt-world').boundingBox())!
  const sq = world.width / 20
  await page.touchscreen.tap(world.x + 3.5 * sq, world.y + 3.5 * sq)
  await page.touchscreen.tap(world.x + 10.5 * sq, world.y + 3.5 * sq)
  await expect(page.locator('.tt-pm-chip .tt-readout-feet')).toHaveText('35 pies')
  await page.getByRole('button', { name: 'Borrar la medida' }).click()
  await expect(page.locator('.tt-pm-chip .tt-readout-feet')).toHaveCount(0)
})

test('RYT-132 labels keep their size at every zoom, and a pinch zooms the map', async ({
  page,
}, info) => {
  test.skip(!mobile(info), 'The phone layout runs at the 390px project.')
  test.setTimeout(90_000)
  const { server } = await prepare(page)
  seedScene(server)
  await open(page)
  const name = page.locator('.tt-viewport .tt-token-name', { hasText: 'Bandido' })
  const plate = async () => {
    const box = (await name.boundingBox())!
    return { width: box.width, height: box.height, zoom: await zoomOf(page) }
  }
  const fitted = await plate()
  // Readable from the start (it was 13px times the zoom of the fitted board, about 4px).
  expect(fitted.height).toBeGreaterThanOrEqual(14)

  // The pinch (two touches spreading apart) zooms in; the buttons below are not involved.
  await pinch(page, 40, 120)
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(fitted.zoom * 1.5)
  const closer = await plate()
  expect(Math.abs(closer.height - fitted.height)).toBeLessThanOrEqual(1.5)
  expect(Math.abs(closer.width - fitted.width)).toBeLessThanOrEqual(2)

  // And back out, past the fit: the same size again.
  await pinch(page, 120, 20)
  await expect.poll(() => zoomOf(page)).toBeLessThan(closer.zoom / 2)
  const farther = await plate()
  expect(Math.abs(farther.height - fitted.height)).toBeLessThanOrEqual(1.5)
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
  for (const name of ['Centrar en mi ficha', 'Medir', 'Efectos de mi ficha']) {
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
    await page.screenshot({ path: `${name}-fitted.png` })
    const fitted = await zoomOf(page)
    await page.getByRole('button', { name: 'Centrar en mi ficha' }).click()
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(fitted)
    await page.screenshot({ path: `${name}-centred.png` })
    const centred = await zoomOf(page)
    await pinch(page, 40, 110)
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(centred)
    await page.screenshot({ path: `${name}-pinched.png` })
  })
