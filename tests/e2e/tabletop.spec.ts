import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture, playerId } from './fixtures/identity.ts'
import { capture, expectTouchTargets } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'
import { tabletopServer } from './fixtures/tabletop.ts'

// RYT-055–062 (ADR 032): the tabletop library, generator, editor, table screen and Player view.
const size = (info: TestInfo) =>
  info.project.name === 'identity-mobile'
    ? 'mobile'
    : info.project.name === 'identity-tablet'
      ? 'tablet'
      : 'desktop'
const phone = (info: TestInfo) => info.project.name === 'identity-mobile'
async function evidence(page: Page, info: TestInfo, name: string) {
  const s = size(info)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/RYT-055/${name}-${s}.png` })
  await capture(page, info.outputPath(`${name}.png`))
}
async function audit(page: Page, scope = 'body', exclude?: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  let builder = new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  if (exclude) builder = builder.exclude(exclude)
  expect((await builder.analyze()).violations).toEqual([])
}

async function prepare(page: Page, modules = ['party', 'combat', 'tabletop'], player = false) {
  const server = tabletopServer()
  const combat = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules, player })
  await combat.install(page)
  await server.install(page)
  return { server, combat }
}

/** A prepared scene on the table: a free token, a hidden one, a note, an event and a secret door. */
function seedScene(server: ReturnType<typeof tabletopServer>) {
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
      fog_enabled: true,
      rooms: [{ id: 'ford', rects: [[0, 0, 12, 12]] }],
      items: [
        { kind: 'token', x: 4, y: 4, w: 1, h: 1, label: 'Centinela', data: { color: 'crimson' } },
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
        {
          kind: 'event',
          x: 8,
          y: 8,
          w: 1,
          h: 1,
          label: 'Emboscada',
          secret: { actions: { reveal_room: 'ford', show_hidden: true } },
        },
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
    patch: {
      scene_id: scene.id,
      view_x: 10,
      view_y: 6,
      screen: { diagonal_in: 32, px_w: 1920, px_h: 1080, base_mm: 25.4, fine: 1, flip: false },
    },
  })
  return scene.id
}

test('RYT-055 the DM sets up the table, generates a dungeon and works the map', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { server } = await prepare(page)
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mesa' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Aún no hay escenas')).toBeVisible()
  await audit(page, 'main')
  // RYT-063: the DM's tabletop is the one section that spans the window on wide screens.
  if (size(info) === 'desktop')
    expect((await page.locator('.tt-library').boundingBox())!.width).toBeGreaterThan(1380)

  // RYT-085: Escape closes the setup and focus goes back to the button that opened it.
  const setupButton = page.getByRole('button', { name: 'Configurar la mesa' })
  const setup = page.getByRole('dialog', { name: 'Configuración de la pantalla de mesa' })
  await setupButton.focus()
  await page.keyboard.press('Enter')
  await expect(setup).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(setup).toHaveCount(0)
  await expect(setupButton).toBeFocused()

  // Calibration: a 55-inch 4K screen and one-inch bases hold 47 × 26 whole squares.
  await setupButton.click()
  await setup.locator('label', { hasText: '55″' }).click()
  await setup.getByLabel('Ancho', { exact: true }).fill('3840')
  await setup.getByLabel('Alto', { exact: true }).fill('2160')
  await setup.locator('label', { hasText: '1 pulgada' }).click()
  await expect(setup.getByText('La mesa admite 47 × 26 casillas enteras.')).toBeVisible()
  await audit(page, '[role="dialog"]')
  await expectTouchTargets(setup, 'button:visible, label.bst-tile')
  await setup.getByRole('button', { name: 'Guardar la mesa' }).click()
  await expect(page.getByText(/47 × 26 casillas\./)).toBeVisible()
  expect(server.live.screen).toMatchObject({
    diagonal_in: 55,
    px_w: 3840,
    px_h: 2160,
    base_mm: 25.4,
  })

  // Backing out of a creation dialog returns focus to "Nueva escena".
  const newScene = page.getByRole('button', { name: 'Nueva escena' })
  await newScene.click()
  await page.getByRole('button', { name: /Cuadrícula en blanco/ }).click()
  await page.keyboard.press('Escape')
  await expect(newScene).toBeFocused()

  // Generate a dungeon that fills the table, then open its editor.
  await newScene.click()
  await page.getByRole('button', { name: /Generar un mapa/ }).click()
  const generator = page.getByRole('dialog', { name: 'Generar un mapa' })
  await expect(generator.getByRole('radio', { name: 'La mesa (47 × 26)' })).toBeChecked()
  // The preview is painted as soon as the dialog opens, before any option changes.
  await expect
    .poll(() =>
      generator.locator('canvas.tt-preview-canvas').evaluate((c: HTMLCanvasElement) => c.width),
    )
    .toBeGreaterThan(300)
  const seedField = generator.getByRole('textbox', { name: 'Semilla', exact: true })
  // RYT-063: a reroll can be taken back.
  await generator.getByRole('button', { name: 'Otro mapa' }).click()
  const rolled = await seedField.inputValue()
  await generator.getByRole('button', { name: 'Otro mapa' }).click()
  const back = generator.getByRole('button', { name: 'Volver al mapa anterior' })
  await back.click()
  await expect(seedField).toHaveValue(rolled)
  // Back to the first seed by keyboard: the key looks disabled but keeps keyboard focus.
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(back).toHaveAttribute('aria-disabled', 'true')
  await expect(back).toBeFocused()
  // An emptied seed field takes the digits typed, nothing more.
  await seedField.clear()
  await seedField.pressSequentially('77')
  await expect(seedField).toHaveValue('77')
  await seedField.fill('4242')
  // RYT-068: the place, its theme and size, then what it holds in a sentence.
  const caption = generator.locator('.tt-preview-caption')
  await expect(caption).toContainText('Mazmorra (Piedra), 47 × 26 casillas')
  await expect(caption).toContainText(/\d+ salas, \d+ pasillos, \d+ puertas y \d+ objetos\./)
  // RYT-063: key rooms come with DM notes; traps add more, written when the scene is made.
  await expect(caption).toContainText(/Para el DM: .*\d+ notas: Entrada.*Objetivo/)
  await expect(generator.locator('.tt-preview-legend')).toContainText('Nota del DM')
  // RYT-068: R rolls another seed while the focus is not in a field.
  await generator.getByRole('radio', { name: 'Normal' }).focus()
  await page.keyboard.press('r')
  await expect(seedField).not.toHaveValue('4242')
  await seedField.fill('4242')
  // A theme is a material sample; the dungeon keeps it when the DM looks at another kind.
  await generator.locator('label', { hasText: 'Bastión enano' }).click()
  await expect(generator.getByRole('radio', { name: 'Bastión enano' })).toBeChecked()
  await generator.locator('label', { hasText: 'Cueva' }).click()
  await expect(generator.getByRole('radio', { name: 'Roca' })).toBeChecked()
  await generator.locator('label', { hasText: 'Mazmorra' }).click()
  await expect(generator.getByRole('radio', { name: 'Bastión enano' })).toBeChecked()
  await expect(caption).toContainText('Mazmorra (Bastión enano), 47 × 26 casillas')
  // The swatches and the painted tiles load under the production subpath.
  const tiles = await generator
    .locator('.tt-theme-sample, .tt-theme-sample > span')
    .evaluateAll((nodes) =>
      nodes.map((n) => getComputedStyle(n).backgroundImage.replace(/^url\("?|"?\)$/g, '')),
    )
  expect(tiles.length).toBeGreaterThanOrEqual(7 * 3)
  for (const src of new Set(tiles)) expect((await page.request.get(src)).status(), src).toBe(200)
  await expect(generator.locator('.tt-preview-frame')).not.toHaveAttribute('data-loading')
  // Taverns show their hall floor, a band of wall and the yard in the sample.
  await generator.locator('label', { hasText: 'Taberna' }).click()
  const tavern = generator.locator('label', { hasText: 'Roble' }).locator('.tt-theme-sample')
  await expect(tavern.locator('.is-wall')).toHaveCount(1)
  await expect(tavern.locator('.is-ground')).toHaveCount(1)
  await generator.locator('label', { hasText: 'Mazmorra' }).click()
  await expect(generator.getByRole('radio', { name: 'Bastión enano' })).toBeChecked()
  await generator.getByRole('switch', { name: 'Trampas' }).check()
  await expect(caption).toContainText(/Trampa/)
  await expect(generator.locator('.tt-preview-items circle').first()).toBeVisible()
  await evidence(page, info, 'generator')
  await audit(page, '[role="dialog"]')
  await expectTouchTargets(generator, 'button:visible, label.bst-tile')
  await generator.getByRole('button', { name: 'Crear la escena' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mazmorra' })).toBeVisible({
    timeout: 20_000,
  })
  const scene = server.scenes.at(-1)!
  expect(scene).toMatchObject({ map_kind: 'generated', cols: 47, rows: 26, fog_enabled: true })
  expect(scene.recipe).toMatchObject({
    kind: 'dungeon',
    theme: 'dwarven',
    look: 'painted',
    version: 3,
  })
  expect((scene.rooms as unknown[]).length).toBeGreaterThan(3)
  // Rooms carry only their id and squares; passages are reveal areas of their own.
  const stored = scene.rooms as { id: string }[]
  expect(stored.some((r) => r.id.startsWith('pass-'))).toBe(true)
  const notes = server.items.filter((i) => i.kind === 'note')
  expect(notes.map((n) => n.label)).toEqual(
    expect.arrayContaining(['Entrada', 'Objetivo', 'Trampa']),
  )
  if (size(info) === 'desktop')
    expect((await page.locator('.tt-editor').boundingBox())!.width).toBeGreaterThan(1380)
  const board = page.getByRole('application', { name: 'Mapa de Mazmorra' })
  await expect(board.locator('img.tt-map')).toBeVisible()
  const doors = board.getByRole('button', { name: /^Puerta cerrada/ })
  expect(await doors.count()).toBeGreaterThan(0)
  // RYT-066: the painted props' pictures load under the production subpath and then show.
  const pictures = await board
    .locator('image.tt-prop-art[href*="tabletop/props/"]')
    .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.getAttribute('href')!))])
  expect(pictures.length).toBeGreaterThan(0)
  for (const href of pictures) expect((await page.request.get(href)).status(), href).toBe(200)
  await expect(board.locator('image.tt-prop-art[data-shown="false"]')).toHaveCount(0)
  await evidence(page, info, 'editor')
  // Room keys never sit under a DM note (they look for a free corner).
  const boxes = async (selector: string) =>
    board.locator(selector).evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect()
        return [r.left, r.top, r.right, r.bottom]
      }),
    )
  const plates = await boxes('.tt-room-numbers rect')
  const pins = await boxes('.tt-pin.is-note')
  expect(plates.length).toBeGreaterThan(3)
  for (const [l, t, r, b] of plates)
    for (const [pl, pt, pr, pb] of pins)
      expect(l < pr - 1 && r > pl + 1 && t < pb - 1 && b > pt + 1).toBe(false)

  // Measuring: a drag reads in feet and squares (SRD: one square per step, 5 feet).
  await page.keyboard.press('m')
  await expect(page.getByRole('radio', { name: 'Medir' })).toHaveAttribute('aria-checked', 'true')
  const box = (await board.boundingBox())!
  const world = (await board.locator('.tt-world').boundingBox())!
  const square = world.width / 47
  const sx = Math.max(box.x + 20, world.x + square * 2.5)
  const sy = Math.max(box.y + 20, world.y + square * 2.5)
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx + square * 3, sy + square * 1, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('.tt-readout-feet')).toHaveText('15 pies')
  await expect(page.locator('.tt-readout-squares')).toHaveText('3 casillas')
  await expect(page.getByRole('status').filter({ hasText: '15 pies, 3 casillas.' })).toHaveCount(1)
  await evidence(page, info, 'measure')

  // A free token from the Tokens panel; keyboard moves and hides it.
  await page.keyboard.press('v')
  if (phone(info)) {
    await page.getByRole('button', { name: 'Paneles' }).click()
    await page.getByRole('menuitem', { name: 'Fichas' }).click()
  } else {
    // The Tokens panel opens with the editor on wider screens; the tab toggles it.
    const tab = page.locator('.tt-dock').getByRole('button', { name: 'Fichas', exact: true })
    if ((await tab.getAttribute('aria-expanded')) !== 'true') await tab.click()
  }
  const panel = phone(info)
    ? page.getByRole('dialog', { name: 'Fichas' })
    : page.getByRole('region', { name: 'Fichas' })
  await panel.getByLabel('Nombre').fill('Caballo')
  await panel.getByRole('button', { name: 'Colocar la ficha' }).click()
  const horse = board.getByRole('button', { name: /^Caballo/ })
  await expect(horse).toBeVisible()
  // On phones the drawer closes after placing; its focus return must settle first.
  if (phone(info)) await expect(page.getByRole('dialog', { name: 'Fichas' })).toHaveCount(0)
  const placed = server.items.find((i) => i.label === 'Caballo')!
  const before = placed.x as number
  await horse.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => server.items.find((i) => i.label === 'Caballo')!.x).toBe(before + 1)
  await page.keyboard.press('h')
  await expect(board.getByRole('button', { name: 'Caballo, oculta' })).toBeVisible()

  // Without a drag: "Move to a square" waits for the square, chosen with a tap or the cursor.
  await horse.click()
  await page.getByRole('button', { name: 'Mover a una casilla' }).click()
  await expect(page.locator('.tt-strip')).toContainText('Toca la casilla a la que va Caballo')
  const start = server.items.find((i) => i.label === 'Caballo')!
  const [x0, y0] = [start.x as number, start.y as number]
  if (phone(info)) {
    // The sheet closes so the board is in front; a tap lands once it is gone.
    await expect(page.locator('.mantine-Drawer-overlay')).toHaveCount(0)
    const [tx, ty] = await squareAt(page, 47, x0, y0 + 1)
    await page.mouse.click(tx, ty)
  } else {
    await expect(board).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('status').filter({ hasText: /^Casilla \d+, \d+/ })).toHaveCount(1)
    await page.keyboard.press('Enter')
  }
  await expect.poll(() => server.items.find((i) => i.label === 'Caballo')!.y).toBe(y0 + 1)
  expect(server.items.find((i) => i.label === 'Caballo')!.x).toBe(x0)

  // Delete removes it and offers an undo that puts it back.
  await horse.focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => server.items.some((i) => i.label === 'Caballo')).toBe(false)
  await expect(board).toBeFocused()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(board).toBeFocused()
  await expect.poll(() => server.items.some((i) => i.label === 'Caballo')).toBe(true)
  await expect(board.getByRole('button', { name: 'Caballo, oculta' })).toBeVisible()

  // Doors open with a tap and say so; the scene goes on the table.
  // Keyboard first (the zoom keys may cover a door on phones), then a tap.
  const door = doors.first()
  const fogOps = () => (server.scenes.at(-1)!.fog as { ops: unknown[] }).ops.length
  const opsBefore = fogOps()
  server.failNext = 'put_tabletop_items'
  await door.focus()
  await page.keyboard.press('Enter')
  const failed = page.getByRole('alert').filter({ hasText: 'Ese cambio no se guardó' })
  await expect(failed).toBeVisible()
  expect(fogOps()).toBe(opsBefore)
  await expect(doors.first()).toBeVisible()
  await failed.getByRole('button', { name: 'Reintentar' }).press('Enter')
  await expect(board).toBeFocused()
  await expect(board.getByRole('button', { name: /^Puerta abierta/ }).first()).toBeVisible()
  await expect.poll(fogOps).toBeGreaterThan(opsBefore)
  await expect(page.getByRole('status').filter({ hasText: 'Puerta abierta.' })).toHaveCount(1)
  await page.getByRole('button', { name: phone(info) ? 'A la mesa' : 'Poner en la mesa' }).click()
  await expect(page.getByText('En la mesa', { exact: true })).toBeVisible()
  expect(server.live.scene_id).toBe(scene.id)
  await audit(page, 'main', '.tt-world')
  await expectTouchTargets(
    page.locator('.tt-editor'),
    '.tt-key:visible, .tt-tab:visible, .tt-zoom button',
  )
  expect(errors).toEqual([])
})

test('RYT-075/076 the DM deletes a scene and chooses what the table shows', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { server } = await prepare(page)
  seedScene(server)
  server.act('save_tabletop_scene', {
    target_campaign: campaignId,
    target_scene: null,
    expected_revision: null,
    request_id: 'cavern',
    fields: { name: 'Gran caverna', map_kind: 'blank', ground: 'stone', cols: 60, rows: 40 },
  })
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mesa' })).toBeVisible({
    timeout: 15_000,
  })
  // RYT-076: delete the scene on the table from its plate's menu, after a confirmation.
  const menu = page.getByRole('button', { name: 'Más opciones de Puente de Vado' })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Borrar la escena' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Borrar «Puente de Vado»?' })
  await expect(confirm).toContainText('los jugadores dejarán de verla')
  await expect(confirm).toContainText('No se puede deshacer.')
  // The safe choice holds the first focus.
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Cancelar' }).click()
  await expect(confirm).toHaveCount(0)
  // Kept: focus returns to that scene's menu.
  await expect(menu).toBeFocused()
  expect(server.scenes).toHaveLength(2)
  await menu.click()
  // The open menu passes axe (contrast of the danger item included). Mantine's menu carries a
  // focus sentinel (an empty presentation div) that axe reads as a menu child: that rule only.
  const menuAudit = await new AxeBuilder({ page })
    .include('[role="menu"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .disableRules(['aria-required-children'])
    .analyze()
  expect(menuAudit.violations).toEqual([])
  await page.getByRole('menuitem', { name: 'Borrar la escena' }).click()
  await expect(confirm).toBeVisible()
  await audit(page, '[role="dialog"]')
  await capture(page, info.outputPath('delete-confirm.png'))
  await confirm.getByRole('button', { name: 'Borrar la escena' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(menu).toHaveCount(0)
  expect(server.scenes.map((s) => s.name)).toEqual(['Gran caverna'])
  expect(server.live.scene_id).toBeNull()
  await expect(
    page.getByRole('status').filter({ hasText: 'Escena «Puente de Vado» borrada.' }),
  ).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Nueva escena' })).toBeFocused()

  // RYT-075: prepare what the table will show before the scene goes on it: tap the frame's tab,
  // then the square to centre it on (the alternative to dragging it).
  await page
    .getByRole('button', { name: /Gran caverna/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Gran caverna' })).toBeVisible()
  const label = await page.locator('.tt-frame-label').textContent()
  const [, fc, fr] = label!.match(/(\d+) × (\d+)/)!.map(Number)
  await page.locator('.tt-frame-handle').click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Toca la casilla donde centrar la mesa' }),
  ).toHaveCount(1)
  // The wait shows in words too, with a way out that needs no keyboard.
  const strip = page.locator('.tt-strip')
  await expect(strip).toContainText('Toca la casilla donde centrar la mesa')
  await expect(strip.getByRole('button', { name: 'Cancelar' })).toBeVisible()
  await capture(page, info.outputPath('frame-wait.png'))
  const [sx, sy] = await squareAt(page, 60, 40, 28)
  await page.mouse.click(sx, sy)
  // Centred on that square, kept inside the map, its edges on whole squares.
  const axis = (c: number, size: number, total: number) =>
    Math.min(Math.max(Math.round(c - size / 2), 0), total - size) + size / 2
  const expected = [axis(40.5, fc!, 60), axis(28.5, fr!, 40)]
  await page.getByRole('button', { name: phone(info) ? 'A la mesa' : 'Poner en la mesa' }).click()
  await expect.poll(() => server.live.scene_id).not.toBeNull()
  expect([server.live.view_x, server.live.view_y]).toEqual(expected)
  if (!phone(info)) {
    // On the table, dragging the tab moves what the table shows.
    // Measured once the board has settled (putting the scene on the table changes the header).
    const [ax, ay] = await squareAt(page, 60, 0, 0)
    const [bx, by] = await squareAt(page, 60, 10, 10)
    const tab = (await page.locator('.tt-frame-tab').boundingBox())!
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2)
    await page.mouse.down()
    await page.mouse.move(tab.x + tab.width / 2 - (bx - ax), tab.y + tab.height / 2 - (by - ay), {
      steps: 6,
    })
    await page.mouse.up()
    await expect.poll(() => server.live.view_x).toBe(expected[0]! - 10)
    expect(server.live.view_y).toBe(expected[1]! - 10)
  }
  expect(errors).toEqual([])
})

test('RYT-065 a Dungeon Alchemist export arrives with its grid, doors and fog areas', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { server } = await prepare(page)
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mesa' })).toBeVisible({
    timeout: 15_000,
  })
  // A 10 × 6 export at 72 px a square: two rooms, a door between them, a window.
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 720
    c.height = 432
    const x = c.getContext('2d')!
    x.fillStyle = '#6e665c'
    x.fillRect(0, 0, 720, 432)
    return c.toDataURL('image/png').split(',')[1]
  })
  const wall = (points: number[][]) => points.map(([x, y]) => ({ x, y }))
  const file = {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 6 }, pixels_per_grid: 72 },
    line_of_sight: [
      wall([
        [1, 1],
        [9, 1],
        [9, 5],
        [1, 5],
        [1, 1],
      ]),
      wall([
        [5, 1],
        [5, 2.5],
      ]),
      wall([
        [5, 3.5],
        [5, 5],
      ]),
    ],
    portals: [
      {
        position: { x: 5, y: 3 },
        bounds: wall([
          [5, 2.5],
          [5, 3.5],
        ]),
        rotation: 1.5708,
        closed: true,
        freestanding: false,
      },
      {
        position: { x: 3, y: 1 },
        bounds: wall([
          [2.5, 1],
          [3.5, 1],
        ]),
        rotation: 0,
        closed: false,
        freestanding: false,
      },
    ],
    lights: [],
    image,
  }
  await page.getByRole('button', { name: 'Nueva escena' }).click()
  await page.getByRole('button', { name: /Subir un mapa/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Subir un mapa' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'Taberna del Cruce.dd2vtt',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(JSON.stringify(file)),
  })
  await expect(
    dialog.getByText('10 × 6 casillas de 72 píxeles · 1 puerta · 3 áreas de niebla', {
      exact: false,
    }),
  ).toBeVisible()
  // The grid comes from the file: no squares-across or offset fields to fill in.
  await expect(dialog.getByLabel('Desplazamiento horizontal de la cuadrícula (px)')).toHaveCount(0)
  await expect(dialog.getByLabel('Nombre de la escena')).toHaveValue('Taberna del Cruce')
  await evidence(page, info, 'uvtt')
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Crear la escena' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Taberna del Cruce' })).toBeVisible({
    timeout: 20_000,
  })
  const scene = server.scenes.at(-1)!
  expect(scene).toMatchObject({
    map_kind: 'upload',
    cols: 10,
    rows: 6,
    cell_px: 72,
    fog_enabled: true,
  })
  expect((scene.rooms as unknown[]).length).toBe(3)
  const doors = server.items.filter((i) => i.kind === 'door')
  expect(doors).toHaveLength(1)
  expect(doors[0]).toMatchObject({ x: 5, y: 3, rotation: 90 })
  expect(((doors[0]!.data as { rooms: string[] }).rooms ?? []).length).toBe(2)
  expect(errors).toEqual([])
})

test('RYT-055 the table screen shows only what the table may see', async ({ page }, info) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { server } = await prepare(page)
  const sceneId = seedScene(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop-table`)
  const start = page.getByRole('dialog', { name: 'Pantalla de mesa' })
  await expect(start).toBeVisible({ timeout: 15_000 })
  await audit(page)
  await start.getByRole('button', { name: 'Empezar' }).click()
  await expect(start).toHaveCount(0)
  // The table projection: the visible token and the campfire; no hidden ogre, note, event or secret door.
  const table = page.locator('.tt-table')
  await expect(table.locator('.tt-token', { hasText: 'Centinela' })).toBeVisible()
  await expect(table.locator('.tt-token', { hasText: 'Ogro emboscado' })).toHaveCount(0)
  await expect(table.locator('.tt-pin')).toHaveCount(0)
  await expect(table.locator('.tt-door')).toHaveCount(0)
  await expect(table.locator('.tt-fog.is-opaque')).toHaveCount(1)
  await expect(page.getByRole('status')).toContainText('Puente de Vado')
  // The calibrated square: 32-inch 1080p with one-inch bases is about 68.8 CSS pixels at 1×.
  const token = (await table.locator('.tt-token', { hasText: 'Centinela' }).boundingBox())!
  expect(token.width).toBeGreaterThan(60)
  expect(token.width).toBeLessThan(76)
  // Firing the event reveals the ford and the ogre; a story card and a shared measure appear.
  const event = server.items.find((i) => i.kind === 'event')!
  server.act('fire_tabletop_event', {
    target_campaign: campaignId,
    target_item: event.id,
    reset: false,
    request_id: 'fire',
  })
  const card = server.act('save_tabletop_card', {
    target_campaign: campaignId,
    target_card: null,
    request_id: 'card',
    fields: {
      title: 'El vado',
      body: 'El agua corre fría bajo el puente.\n\nAlgo se mueve entre los juncos.',
    },
  }) as { id: string }
  server.act('set_tabletop_live', {
    target_campaign: campaignId,
    request_id: 'show',
    patch: {
      card_id: card.id,
      measure: {
        points: [
          [4.5, 4.5],
          [7.5, 6.5],
        ],
      },
    },
  })
  await expect(table.locator('.tt-token', { hasText: 'Ogro emboscado' })).toBeVisible({
    timeout: 10_000,
  })
  const plate = page.getByRole('region', { name: 'Historia en la mesa' })
  await expect(plate.getByRole('heading', { name: 'El vado' })).toBeVisible()
  await expect(table.locator('.tt-tape-feet')).toHaveText('15 pies')
  await evidence(page, info, 'table')
  void sceneId
  expect(errors).toEqual([])
})

test('RYT-055 Players read the scene on the table only while the module is open', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { server } = await prepare(page, ['party', 'tabletop'], true)
  seedScene(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.getByRole('heading', { level: 1, name: 'Puente de Vado' })).toBeVisible({
    timeout: 15_000,
  })
  const board = page.getByRole('img', { name: 'Mapa de Puente de Vado' })
  await expect(board.locator('.tt-token', { hasText: 'Centinela' })).toBeVisible()
  await expect(board.locator('.tt-token', { hasText: 'Ogro emboscado' })).toHaveCount(0)
  await expect(board.locator('.tt-pin')).toHaveCount(0)
  expect(
    server.calls.filter((c) => c.method === 'get_tabletop').every((c) => c.body.as_table === true),
  ).toBe(true)
  // RYT-085: the board and its zoom stack fit the viewport (above the phone bottom bar).
  const fit = await page.evaluate(() => {
    const frame = document.querySelector('.tt-player-board')!.getBoundingClientRect()
    const zoom = document.querySelector('.tt-zoom')!.getBoundingClientRect()
    const bar = document.querySelector('.bottom-nav')?.getBoundingClientRect()
    const limit = bar && bar.height > 0 ? bar.top : innerHeight
    return { frame: frame.bottom, zoom: zoom.bottom, limit }
  })
  expect(fit.frame).toBeLessThanOrEqual(fit.limit)
  expect(fit.zoom).toBeLessThanOrEqual(fit.limit)
  // A private measure: the switch, then a drag.
  await page.getByLabel('Medir').check()
  await audit(page, 'main', '.tt-world')
  void playerId
})

test('RYT-055 the tabletop stays closed to Players until the DM opens it', async ({ page }) => {
  await prepare(page, ['party'], true)
  await page.goto(`./#/campaign/${campaignId}/tabletop`)
  await expect(page.getByText('El DM aún no ha abierto la mesa.')).toBeVisible({ timeout: 15_000 })
})

async function openPanel(page: Page, info: TestInfo, name: string) {
  if (phone(info)) {
    await page.getByRole('button', { name: 'Paneles' }).click()
    await page.getByRole('menuitem', { name }).click()
    return page.getByRole('dialog', { name })
  }
  // Panel keys are disclosure buttons: aria-expanded, and the sheet is a named region.
  const tab = page.locator('.tt-dock').getByRole('button', { name, exact: true })
  if ((await tab.getAttribute('aria-expanded')) !== 'true') await tab.click()
  return page.getByRole('region', { name })
}
async function closePanel(page: Page, info: TestInfo) {
  if (!phone(info)) return
  // Choosing a prop closes the sheet by itself; Escape on the board would change the tool.
  await page.waitForTimeout(300)
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
/** The centre of a square on the board, in page pixels. */
async function squareAt(page: Page, cols: number, x: number, y: number) {
  // The board refits when the option strip changes height: wait until its box stops moving.
  const world = page.locator('.tt-viewport .tt-world')
  let box = (await world.boundingBox())!
  await expect
    .poll(async () => {
      await page.waitForTimeout(150)
      const next = (await world.boundingBox())!
      const still =
        Math.abs(next.x - box.x) + Math.abs(next.y - box.y) + Math.abs(next.width - box.width) < 0.5
      box = next
      return still
    })
    .toBe(true)
  const size = box.width / cols
  return [box.x + (x + 0.5) * size, box.y + (y + 0.5) * size] as const
}

test('RYT-056–062 story cards, audio, props, areas, fog and events from the editor', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const { server } = await prepare(page)
  const sceneId = seedScene(server)
  await page.goto(`./#/campaign/${campaignId}/tabletop/${sceneId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Puente de Vado' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('En la mesa', { exact: true })).toBeVisible()

  // Story: write a card and show it on the table.
  let panel = await openPanel(page, info, 'Historia')
  await panel.getByRole('button', { name: 'Nueva carta de historia' }).click()
  await panel.getByLabel('Título').fill('Llegada al vado')
  await panel.getByLabel('Texto para leer en voz alta').fill('Las ranas callan de golpe.')
  await panel.getByRole('button', { name: 'Guardar la carta' }).click()
  await panel.getByRole('button', { name: 'Mostrar en la mesa' }).click()
  await expect(panel.getByRole('button', { name: 'Quitar de la mesa' })).toBeVisible()
  expect(server.live.card_id).toBe(server.cards[0]!.id)
  await expectTouchTargets(panel, 'button:visible')
  await closePanel(page, info)

  // Audio: a synthesized ambience and an effect, played by the table.
  panel = await openPanel(page, info, 'Sonido')
  await panel.locator('label', { hasText: 'Lluvia' }).click()
  await expect(panel.getByText('Suena en la mesa: Lluvia')).toBeVisible()
  expect(server.live).toMatchObject({ ambience: 'rain', playing: true })
  await panel.getByRole('button', { name: 'Trueno' }).click()
  await expect.poll(() => (server.live.sound as { key: string } | null)?.key).toBe('thunder')
  await audit(page, phone(info) ? '[role="dialog"]' : '.tt-dock')
  await expectTouchTargets(panel, 'button:visible, label.bst-tile')
  await evidence(page, info, 'audio')
  await closePanel(page, info)

  // Props: find one in the library and place it with a tap.
  panel = await openPanel(page, info, 'Objetos')
  await panel.getByLabel('Buscar objetos').fill('barril')
  await panel.getByRole('button', { name: 'Barril' }).click()
  await closePanel(page, info)
  if (!phone(info))
    await expect(page.getByRole('radio', { name: 'Objeto' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  const [px, py] = await squareAt(page, 20, 1, 10)
  await page.mouse.click(px, py)
  await expect
    .poll(() => server.items.filter((i) => i.kind === 'prop' && i.data.prop === 'barrel').length)
    .toBe(1)
  // RYT-077: the placing bar turns the prop; a translucent preview shows where it goes.
  const placing = page.getByRole('group', { name: 'Colocando Barril' })
  await expect(placing).toBeVisible()
  await placing.getByRole('button', { name: 'Girar a la derecha' }).click()
  await expect(placing).toContainText('90°')
  await placing.getByRole('button', { name: 'Otra versión' }).click()
  const [gx, gy] = await squareAt(page, 20, 4, 6)
  if (!phone(info)) {
    await page.mouse.move(gx, gy)
    await expect(page.locator('.tt-prop-ghost')).toHaveCount(1)
    // R turns it again from the keyboard; Shift+R turns it back.
    await page.keyboard.press('r')
    await expect(placing).toContainText('180°')
    await page.keyboard.press('Shift+R')
    await expect(placing).toContainText('90°')
    await capture(page, info.outputPath('prop-ghost.png'))
  }
  await page.mouse.click(gx, gy)
  await expect
    .poll(
      () =>
        server.items.filter(
          (i) => i.kind === 'prop' && i.data.prop === 'barrel' && i.rotation === 90,
        ).length,
    )
    .toBe(1)

  // Areas: a 20-foot sphere left on the map lists the tokens it catches.
  await page.keyboard.press('a')
  // The option strip changes height with the tool: measure the board after it settles.
  await expect(page.locator('.tt-strip').getByText('Esfera')).toBeVisible()
  // The area options never widen the page (phones scroll the strip itself).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const [ax, ay] = await squareAt(page, 20, 4, 4)
  await page.mouse.click(ax, ay)
  await expect(page.locator('.tt-placebar .tt-caught-title')).toHaveText(/\d+ fichas? en el área/)
  await page.getByRole('button', { name: 'Dejar en el mapa' }).click()
  await expect.poll(() => server.items.filter((i) => i.kind === 'area').length).toBe(1)
  // A lasting area is an item: its origin seal takes focus, Delete removes it, Undo restores it.
  await page.keyboard.press('v')
  const seal = page.getByRole('button', { name: /^Área: / })
  await seal.focus()
  await page.keyboard.press('Enter')
  await expect(
    (phone(info)
      ? page.getByRole('dialog', { name: 'Selección' })
      : page.locator('.tt-inspector')
    ).getByText('Área', { exact: true }),
  ).toBeVisible()
  if (phone(info)) await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await seal.focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => server.items.filter((i) => i.kind === 'area').length).toBe(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect.poll(() => server.items.filter((i) => i.kind === 'area').length).toBe(1)

  // Fog: reveal the room under a tap.
  await page.keyboard.press('f')
  await expect(page.locator('.tt-strip').getByText('Sala', { exact: true })).toBeVisible()
  const [fx, fy] = await squareAt(page, 20, 3, 3)
  await page.mouse.click(fx, fy)
  await expect.poll(() => server.scenes[0]!.fog.ops.length).toBe(1)

  // Events: reach the pin by keyboard and fire it.
  await page.keyboard.press('v')
  const pin = page.getByRole('button', { name: 'Evento: Emboscada' })
  await pin.focus()
  await page.keyboard.press('Enter')
  const inspector = phone(info)
    ? page.getByRole('dialog', { name: 'Selección' })
    : page.locator('.tt-inspector')
  await inspector.getByRole('button', { name: 'Activar el evento' }).click()
  await expect(inspector.getByText('Activado', { exact: true })).toBeVisible()
  await expect.poll(() => server.items.find((i) => i.kind === 'event')!.data.fired).toBe(true)
  await evidence(page, info, 'event')

  // A write that fails says so over the board; trying again succeeds once the server answers.
  server.failNext = 'put_tabletop_items'
  if (phone(info)) {
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
    // Letters work once focus is back in the editor, after the drawer has gone.
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.keyboard.press('p')
  await expect(page.locator('.tt-strip')).toContainText('Barril')
  const props = server.items.filter((i) => i.kind === 'prop').length
  const [bx, by] = await squareAt(page, 20, 15, 9)
  await page.mouse.click(bx, by)
  const alert = page.getByRole('alert').filter({ hasText: 'Ese cambio no se guardó' })
  await expect(alert).toBeVisible()
  expect(server.items.filter((i) => i.kind === 'prop').length).toBe(props)
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect.poll(() => server.items.filter((i) => i.kind === 'prop').length).toBe(props + 1)
  await expect(alert).toHaveCount(0)
  expect(errors).toEqual([])
})
