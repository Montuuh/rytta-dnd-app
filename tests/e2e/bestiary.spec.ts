import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'

// ADR 028 / RYT-046..049: the DM Command Center bestiary (SRD 5.2.1 + campaign creatures).
const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
const phone = (info: TestInfo) => info.project.name === 'identity-mobile'
/** Below 62em the stat block opens in a full screen sheet instead of the side pane. */
const sheet = (info: TestInfo) => (info.project.use.viewport?.width ?? 1440) < 992
async function evidence(page: Page, info: TestInfo, name: string, ticket = 'RYT-046') {
  const s = size(info.project.name)
  if (s && process.env.RYT_EVIDENCE)
    await page.screenshot({ path: `docs/evidence/${ticket}/${name}-${s}.png` })
}
async function audit(page: Page, scope = 'body') {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (
      await new AxeBuilder({ page })
        .include(scope)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([])
}
/** The stat block of the selected creature: the side pane, or the full screen sheet on phones. */
const detail = (page: Page, info: TestInfo): Locator =>
  sheet(info) ? page.locator('.bst-sheet') : page.locator('.bst-detail')

/** The phone and tablet sheet slides in: a box measured once it has stopped moving. */
async function settledBox(locator: Locator) {
  let last = Number.NaN
  await expect
    .poll(async () => {
      const y = (await locator.boundingBox())?.y ?? Number.NaN
      const still = Math.abs(y - last) < 0.5
      last = y
      return still
    })
    .toBe(true)
  return (await locator.boundingBox())!
}

async function openBestiary(page: Page) {
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByRole('heading', { level: 2, name: 'Bestiario' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 15_000 })
}

/** Rows far down the list are not mounted until reached: the jump strip brings a group in. */
async function jumpTo(page: Page, group: string) {
  await page
    .getByRole('navigation', { name: 'Saltar a un grupo' })
    .getByRole('button', { name: group, exact: true })
    .click()
}

async function pick(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click()
}

for (const [language, theme] of [
  ['es', 'default'],
  ['en', 'default'],
  ['es', 'parchment'],
  ['en', 'parchment'],
] as const) {
  test(`RYT-145 encounter bestiary keeps search and compares, adds and adjusts creatures (${language}, ${theme})`, async ({
    page,
  }, info) => {
    limitMatrix(info, language === 'es' && theme === 'default')
    test.setTimeout(90_000)
    const es = language === 'es'
    const wolf = es ? 'Lobo' : 'Wolf'
    const zombie = es ? 'Zombi' : 'Zombie'
    const server = combatServer()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-theme', theme)
      },
      { language, theme },
    )
    await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
    await server.install(page)
    const name = 'Cripta'
    const { encounter_id: encounterId } = server.act('create_encounter', {
      encounter_name: name,
    }) as { encounter_id: string }
    const fight = server.encounters.find((entry) => entry.id === encounterId)!
    const checkRetry = es && theme === 'default' && phone(info)
    if (checkRetry) {
      let firstRequest = ''
      let attempts = 0
      await page.route('**/rest/v1/rpc/add_combatants', async (route) => {
        attempts += 1
        const body = route.request().postDataJSON() as { request_id: string }
        if (attempts === 1) {
          firstRequest = body.request_id
          server.act('add_combatants', body)
          await route.abort('failed')
          return
        }
        if (attempts === 2) expect(body.request_id).toBe(firstRequest)
        await route.fallback()
      })
    }

    await page.goto(`./#/campaign/${campaignId}/combat/${encounterId}`)
    await page
      .getByRole('link', { name: es ? 'Añadir desde el bestiario' : 'Add from the bestiary' })
      .click()
    await expect(page).toHaveURL(new RegExp(`encounter=${encounterId}`))
    if (!es && theme === 'parchment') {
      await page.addStyleTag({ content: 'html { font-size: 150%; }' })
      const favourites = page.locator('.bst-source label').getByText('Favourites', { exact: true })
      await expect(favourites).toBeVisible()
      const segment = (await page.locator('.bst-source').boundingBox())!
      const label = (await favourites.boundingBox())!
      expect(label.x + label.width).toBeLessThanOrEqual(segment.x + segment.width)
    }
    const search = page.getByRole('searchbox', {
      name: es ? 'Buscar criatura' : 'Search creatures',
    })
    await search.fill('wolf')
    const wolfRow = page.locator('[data-row-key="srd:wolf"]')
    await wolfRow.getByRole('button', { name: es ? 'Comparar a Lobo' : 'Compare Wolf' }).click()
    await wolfRow.locator('.bst-row-main').click()
    const pane = detail(page, info)
    await expect(pane.getByRole('heading', { name: wolf, exact: true }).first()).toBeVisible()
    if (sheet(info)) await expect(pane.getByText(name, { exact: true })).toBeVisible()
    const dial = pane.getByRole('textbox', { name: es ? 'Cuántas' : 'How many' })
    await dial.fill('3')
    await capture(page, info.outputPath('contextual-bestiary.png'), { fullPage: false })
    await expectTouchTargets(pane, '.bst-actions button:visible', { height: 44, width: 44 })
    await audit(page, sheet(info) ? '[role="dialog"]' : 'body')
    const addThree = pane.getByRole('button', { name: es ? 'Añadir 3' : 'Add 3', exact: true })
    await addThree.click()
    if (checkRetry) {
      await expect(pane.locator('.bst-encounter-add').getByRole('alert')).toBeInViewport()
      await expect(addThree).toBeFocused()
      expect(fight.combatants).toHaveLength(3)
      await addThree.press('Enter')
    }
    await expect(pane.getByRole('status').filter({ hasText: `3 × ${wolf}` })).toBeVisible()
    await expect(dial).toHaveValue('1')

    if (sheet(info)) {
      await page.keyboard.press('Escape')
      await expect(page.locator('.bst-sheet')).toHaveCount(0)
      await expect(wolfRow.locator('.bst-row-main')).toBeFocused()
    }
    await expect(search).toHaveValue('wolf')
    await search.fill('zombie')
    const zombieRow = page.locator('[data-row-key="srd:zombie"]')
    await zombieRow
      .getByRole('button', { name: es ? 'Comparar a Zombi' : 'Compare Zombie' })
      .click()
    const comparison = page.getByRole('region', {
      name: es ? /Comparar criaturas/ : /Compare creatures/,
    })
    await expect(comparison).toContainText(wolf)
    await expect(comparison).toContainText(zombie)
    await expect(comparison).toContainText(es ? 'VD 1/4' : 'CR 1/4')
    await expect(comparison).toContainText(es ? 'Enemigo' : 'Enemy')
    await capture(page, info.outputPath('creature-comparison.png'), { fullPage: false })
    await comparison.getByRole('button', { name: zombie, exact: true }).click()
    await pane.getByRole('button', { name: es ? 'Añadir' : 'Add', exact: true }).click()
    await expect(pane.getByRole('status').filter({ hasText: `Cripta: ${zombie}` })).toBeVisible()
    expect(fight.combatants.map((creature) => creature.srd_id)).toEqual([
      'wolf',
      'wolf',
      'wolf',
      'zombie',
    ])

    if (sheet(info)) await page.keyboard.press('Escape')
    await expect(search).toHaveValue('zombie')
    await page.getByRole('link', { name: es ? 'Volver al encuentro' : 'Back to encounter' }).click()
    await expect(page).toHaveURL(new RegExp(`/combat/${encounterId}`))
    await page
      .locator('.combat-rail:visible .combat-row', { hasText: `${wolf} 2` })
      .first()
      .click()
    await page
      .getByRole('button', { name: es ? 'Ajustar este ejemplar' : 'Adjust this instance' })
      .click()
    const stats = page.getByRole('dialog', {
      name: new RegExp(`${es ? 'Ajustar ejemplar' : 'Adjust instance'}.*${wolf} 2`),
    })
    const oldHp = fight.combatants[1]!.max_hp
    await stats.getByRole('textbox', { name: es ? 'PG máximos' : 'Max HP', exact: true }).fill('32')
    await expect(stats.getByText(`${oldHp} → 32`, { exact: false })).toBeVisible()
    await capture(page, info.outputPath('adjust-instance.png'), { fullPage: false })
    await audit(page, '[role="dialog"]')
    await stats.getByRole('button', { name: es ? 'Guardar valores' : 'Save stats' }).click()
    await expect(stats).toHaveCount(0)
    expect(fight.combatants.slice(0, 3).map((creature) => creature.max_hp)).toEqual([
      oldHp,
      32,
      oldHp,
    ])
    expect(server.templates).toHaveLength(0)
  })
}

test('RYT-145 the DM saves a separate campaign variant from an official reference', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('wolf')
  const row = page.locator('[data-row-key="srd:wolf"]')
  await row.getByRole('button', { name: 'Añadir Lobo a favoritas' }).click()
  await expect(page.getByText('Lobo está en favoritas.')).toBeVisible()
  await row.getByRole('button', { name: 'Quitar Lobo de favoritas' }).click()
  await expect(page.getByText('Lobo se quitó de favoritas.')).toBeVisible()
  await row.locator('.bst-row-main').click()
  const pane = detail(page, info)
  await pane.getByRole('button', { name: 'Más acciones para Lobo' }).click()
  await page.getByRole('menuitem', { name: 'Crear variante de campaña' }).click()
  const editor = page.getByRole('dialog', { name: 'Variante de campaña de Lobo' })
  await expect(
    editor.getByText('Nueva plantilla de campaña para usar en futuros encuentros.'),
  ).toBeVisible()
  await editor.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Lobo del umbral')
  await editor.getByText(/cambio[s]? respecto a Lobo/).click()
  await expect(editor.getByText('Nombre · Lobo → Lobo del umbral')).toBeVisible()
  await capture(page, info.outputPath('campaign-variant.png'), { fullPage: false })
  await audit(page, '[role="dialog"]')
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(
    pane.getByRole('heading', { name: 'Lobo del umbral', exact: true }).first(),
  ).toBeVisible()
  expect(server.templates).toHaveLength(1)
  expect(server.templates[0]).toMatchObject({
    name: 'Lobo del umbral',
    srd_id: 'wolf',
    challenge: '1/4',
  })
  expect(server.templates[0]?.srd_override).toBeFalsy()
  if (sheet(info)) await page.keyboard.press('Escape')
  await expect(row).toBeVisible()
})

test('RYT-046 the DM searches the SRD catalogue and reads a full stat block', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await expect(page.getByRole('tab', { name: 'Bestiario' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await audit(page)
  await expectTouchTargets(page, '.bst-row-main:visible, .bst-fav:visible')
  await evidence(page, info, 'list')

  // Search works in both languages and without accents; Enter opens the best match.
  const search = page.getByRole('searchbox', { name: 'Buscar criatura' })
  await search.fill('dragon rojo adulto')
  await expect(page.getByText('1 criatura', { exact: true })).toBeVisible()
  await search.press('Enter')
  const pane = detail(page, info)
  await expect(pane.getByRole('heading', { name: 'Dragón rojo adulto' }).first()).toBeVisible()
  await expect(page).toHaveURL(/creature=srd%3Aadult-red-dragon|creature=srd:adult-red-dragon/)
  for (const section of ['Atributos', 'Acciones', 'Acciones legendarias'])
    await expect(pane.getByRole('heading', { name: section, exact: true })).toBeVisible()
  // RYT-091: short wide sheets show a second copy at the top of the reading; one is always hidden.
  await expect(
    pane.locator('.sb-abilities:visible').getByText('Fuerza 27, modificador +8, salvación +8'),
  ).toBeAttached()
  await expect(pane.getByText(/SRD 5\.2\.1, p\. \d+/)).toBeVisible()
  // Rules terms in the stat block open the glossary.
  await expect(pane.locator('.glossary-term').first()).toBeVisible()
  await audit(page)
  await evidence(page, info, 'stat-block')
  if (sheet(info)) {
    // The sheet closes with Escape and focus returns to the list.
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
  }

  // English names find Spanish rows; filters narrow the list and say how many remain.
  await search.fill('Wolf')
  await expect(page.getByRole('button', { name: /^Lobo · Wolf/ })).toBeVisible()
  await search.fill('')
  await page.getByRole('button', { name: 'Filtros' }).click()
  const filters = phone(info)
    ? page.getByRole('dialog', { name: 'Filtrar y ordenar' })
    : page.locator('.mantine-Popover-dropdown')
  await filters.getByText('Muerto viviente', { exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^\d+ criaturas?$/ })).toHaveText(
    /^(1[0-9]|9) criaturas$/,
  )
  await evidence(page, info, 'filters')
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await jumpTo(page, 'Z')
  await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeVisible()
  // Favourites live on this device.
  await page.getByRole('button', { name: 'Añadir Zombi a favoritas' }).click()
  await page.locator('.bst-source label', { hasText: 'Favoritas' }).click()
  await expect(page.getByText('1 criatura', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the filters dropdown fits a short screen and keeps its results button in reach', async ({
  page,
}, info) => {
  test.skip(phone(info), 'Phones use the filters drawer')
  const server = combatServer()
  await page.setViewportSize({ width: info.project.use.viewport?.width ?? 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('button', { name: 'Filtros' }).click()
  const filters = page.locator('.mantine-Popover-dropdown')
  await expect(page.getByRole('button', { name: /^Filtros/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(filters).toHaveRole('dialog')
  // The dropdown stays inside the viewport and scrolls inside instead of the page.
  const box = (await filters.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(900)
  await filters.getByText('Muerto viviente', { exact: true }).click()
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await expect(filters).toHaveCount(0)
  await jumpTo(page, 'Z')
  await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeVisible()
})

test('with large text and little room, the filters open in a side sheet', async ({
  page,
}, info) => {
  test.skip(phone(info), 'Phones always use the bottom sheet')
  const server = combatServer()
  await page.setViewportSize({ width: info.project.use.viewport?.width ?? 1440, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.addStyleTag({ content: 'html { font-size: 150% }' })
  const open = page.getByRole('button', { name: /^Filtros/ })
  await open.click()
  const filters = page.getByRole('dialog', { name: 'Filtrar y ordenar' })
  await expect(filters).toBeVisible()
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.mantine-Popover-dropdown')).toHaveCount(0)
  await filters.getByText('Muerto viviente', { exact: true }).click()
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await expect(filters).toHaveCount(0)
  await expect(open).toBeFocused()
  await jumpTo(page, 'Z')
  await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeVisible()
})

test('the list reads like an index and active filters stay visible as removable chips', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  // Without a query the rows sit under letter rules; the challenge rating is a chip on the row.
  await expect(
    page.getByRole('heading', { level: 3, name: /^A \(\d+ en este grupo\)$/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /^Aboleth .* VD 10$/ })).toBeVisible()
  // "/" jumps to the search from the list.
  await page.getByRole('button', { name: /^Aboleth/ }).focus()
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox', { name: 'Buscar criatura' })).toBeFocused()

  await page.getByRole('button', { name: 'Filtros' }).click()
  const filters = phone(info)
    ? page.getByRole('dialog', { name: 'Filtrar y ordenar' })
    : page.locator('.mantine-Popover-dropdown')
  await filters.getByText('Dragón', { exact: true }).click()
  await filters.getByText('Valor de desafío', { exact: true }).click()
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await expect(filters).toHaveCount(0)
  // Sorting by CR groups by CR; each filter is a chip that names what it removes.
  await expect(
    page.getByRole('heading', { level: 3, name: /^VD 1\/8 \(1 en este grupo\)$/ }),
  ).toBeVisible()
  const summary = page.getByRole('group', { name: 'Filtros aplicados' })
  await expect(summary.getByRole('button', { name: 'Quitar el filtro Dragón' })).toBeVisible()
  await expectTouchTargets(page, '.bst-active-chip:visible, .bst-active-clear:visible')
  await audit(page)
  await evidence(page, info, 'active-filters', 'RYT-050')
  await summary.getByRole('button', { name: 'Quitar el filtro Dragón' }).click()
  // Focus stays in the summary on the chip that took its place.
  await expect(
    summary.getByRole('button', { name: 'Quitar el filtro Orden: valor de desafío' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(summary).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Filtros/ })).toBeFocused()
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible()
})

test('a laptop with large text reads the stat block in the sheet instead of a squeezed pane', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'identity-desktop', 'Laptop widths only')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  for (const [width, text, split] of [
    [992, '100%', false],
    [1280, '100%', true],
    [1280, '150%', false],
    [1440, '100%', true],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await openBestiary(page)
    await page.addStyleTag({ content: `html { font-size: ${text} }` })
    await page.getByRole('button', { name: /^Aboleth/ }).click()
    const pane = split ? page.locator('.bst-detail') : page.locator('.bst-sheet')
    await expect(pane.getByRole('heading', { name: 'Aboleth' }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (split) {
      const box = (await pane.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(400)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    }
  }
})

test('RYT-046/048 the DM adds SRD creatures to an encounter with an alias and rolled hit points', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  const created = server.act('create_encounter', {
    encounter_name: 'Cripta',
    request_id: 'crypt',
  }) as { encounter_id: string }
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('dragon rojo joven')
  await pick(page, /^Dragón rojo joven/)
  await detail(page, info).getByRole('button', { name: 'Añadir a un encuentro' }).click()
  const dialog = page.getByRole('dialog', { name: 'Añadir Dragón rojo joven a un encuentro' })
  await expect(dialog).toBeVisible()
  // UI review F1: Escape closes only the dialog; the stat block sheet stays and gets focus back.
  await expect(dialog.getByRole('textbox', { name: 'Cuántas' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    detail(page, info).getByRole('button', { name: 'Añadir a un encuentro' }),
  ).toBeFocused()
  await detail(page, info).getByRole('button', { name: 'Añadir a un encuentro' }).click()
  await dialog.getByRole('textbox', { name: 'Cuántas' }).fill('2')
  // Table options fold under one summary line.
  await dialog.getByRole('button', { name: /^Opciones de mesa/ }).click()
  await dialog.getByLabel('Nombre para la mesa').fill('Sombra alada')
  await dialog.locator('label', { hasText: /^Tirar 17d10 \+ 85/ }).click()
  await expect(
    dialog.getByText('Se creará 1 contador: Aliento de fuego (recarga 5–6).'),
  ).toBeVisible()
  await audit(page, '[role="dialog"]')
  await expectTouchTargets(dialog, 'button:visible')
  await evidence(page, info, 'add-dialog', 'RYT-048')
  await dialog.getByRole('button', { name: 'Añadir 2 a Cripta' }).click()
  // The success state names the fight and takes over the dialog title.
  const done = page.getByRole('dialog', { name: 'En el encuentro' })
  await expect(done.getByText('En Cripta: 2 × Dragón rojo joven.')).toBeVisible()
  const added = server.encounters.find((e) => e.id === created.encounter_id)!.combatants
  expect(added.map((c) => [c.name, c.public_name, c.srd_id])).toEqual([
    ['Dragón rojo joven 1', 'Sombra alada 1', 'young-red-dragon'],
    ['Dragón rojo joven 2', 'Sombra alada 2', 'young-red-dragon'],
  ])
  expect(added[0]!.trackers?.some((t) => t.kind === 'recharge' && t.min === 5)).toBe(true)

  // The console shows the alias, the trackers and the stat block of the creature.
  await done.getByRole('link', { name: 'Abrir el encuentro' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Cripta' })).toBeVisible({
    timeout: 15_000,
  })
  await page
    .locator('.combat-rail:visible .combat-row', { hasText: 'Dragón rojo joven 1' })
    .first()
    .click()
  const creature = page.locator('.combat-detail:visible').first()
  await expect(creature.getByText('La mesa ve: Sombra alada 1')).toBeVisible()
  await expect(creature.getByRole('heading', { name: 'Contadores' })).toBeVisible()
  // The toggle is named by its visible state; the ability and the effect describe it.
  const breath = creature.getByRole('button', { name: 'Disponible · recarga 5–6' })
  await expect(breath).toHaveAccessibleDescription(/Aliento de fuego .*Marcar .* como gastada/)
  await breath.click()
  await expect.poll(() => added[0]!.trackers?.find((t) => t.kind === 'recharge')?.spent).toBe(true)
  await creature.getByRole('button', { name: 'Ficha de Dragón rojo joven' }).click()
  await expect(creature.getByRole('heading', { name: 'Acciones', exact: true })).toBeVisible()
  await evidence(page, info, 'console-creature', 'RYT-048')
  await creature.getByRole('button', { name: 'Revelar que es Dragón rojo joven 1' }).click()
  await expect.poll(() => added[0]!.public_name).toBeUndefined()
  expect(errors).toEqual([])
})

test('RYT-047/049 the DM customises an SRD creature, builds one from an archetype and pastes one', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)

  // Edit (RYT-089): the SRD wolf gets a campaign version that keeps its origin; the official one
  // never changes.
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await pick(page, /^Lobo · Wolf/)
  await detail(page, info).getByRole('button', { name: 'Editar', exact: true }).click()
  let editor = page.getByRole('dialog', { name: 'Editar Lobo en esta campaña' })
  await expect(editor).toBeVisible()
  await editor.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Lobo de sombra')
  // UI review R2: tags and alignment come from the SRD type line ("Bestia Mediana, sin alineamiento").
  await expect(editor.getByRole('textbox', { name: 'Etiquetas' })).toHaveValue('')
  await expect(editor.getByRole('textbox', { name: 'Alineamiento' })).toHaveValue(
    'sin alineamiento',
  )
  // UI review F3: closing with changes asks first; keeping on editing keeps the draft.
  await page.keyboard.press('Escape')
  const discard = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await expect(discard.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  await discard.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(editor.getByRole('textbox', { name: 'Nombre', exact: true }).first()).toHaveValue(
    'Lobo de sombra',
  )
  await audit(page, '[role="dialog"]')
  await evidence(page, info, 'editor', 'RYT-047')
  if (sheet(info)) {
    await editor.locator('.bst-editor-switch label', { hasText: 'Vista previa' }).click()
    await expect(editor.getByRole('heading', { name: 'Lobo de sombra' })).toBeVisible()
    await evidence(page, info, 'editor-preview', 'RYT-047')
    await editor.locator('.bst-editor-switch label', { hasText: 'Editar' }).click()
  } else await expect(editor.getByRole('heading', { name: 'Lobo de sombra' })).toBeVisible()
  await expect(editor.getByText(/Por sus números parece VD/)).toBeVisible()
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(page.getByText('Guardado solo en esta campaña: Lobo de sombra.')).toBeVisible()
  const wolf = server.templates.find((t) => t.name === 'Lobo de sombra')!
  expect(wolf).toMatchObject({
    srd_id: 'wolf',
    srd_override: true,
    hp_formula: '2d8+2',
    challenge: '1/4',
    creature_type: 'beast',
  })
  expect((wolf.stat_block as { sections: unknown[] }).sections.length).toBeGreaterThan(0)
  await expect(detail(page, info).getByText('Modificada en esta campaña')).toBeVisible({
    timeout: 15_000,
  })
  // The saved creature opens in the sheet once the list knows it: close it only when it is there.
  if (sheet(info)) {
    await expect(page.locator('.bst-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
  }

  // Archetype and CR: a leader draft with SRD-median numbers.
  await page.getByRole('button', { name: 'Nueva criatura' }).click()
  const start = page.getByRole('dialog', { name: '¿Cómo quieres empezar?' })
  await audit(page, '[role="dialog"]')
  await evidence(page, info, 'start', 'RYT-049')
  await start.getByRole('button', { name: /Arquetipo y VD/ }).click()
  const arch = page.getByRole('dialog', { name: 'Arquetipo y valor de desafío' })
  await arch.getByRole('textbox', { name: 'Nombre' }).fill('Capitán orco')
  await arch.getByText('Líder', { exact: true }).click()
  await expect(arch.getByRole('radio', { name: /Líder/ })).toBeChecked()
  await evidence(page, info, 'archetype', 'RYT-049')
  await arch.getByRole('button', { name: 'Crear borrador' }).click()
  editor = page.getByRole('dialog', { name: 'Nueva criatura' })
  await expect(editor.getByRole('textbox', { name: 'Nombre', exact: true }).first()).toHaveValue(
    'Capitán orco',
  )
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(page.getByText('Guardado en el bestiario: Capitán orco.')).toBeVisible()
  const captain = server.templates.find((t) => t.name === 'Capitán orco')!
  expect(captain).toMatchObject({ challenge: '2', creature_type: 'monstrosity' })
  // The saved creature opens in the sheet once the list knows it: close it only when it is there.
  if (sheet(info)) {
    await expect(page.locator('.bst-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
  }

  // Paste: a 2014 block from a book becomes a draft to review.
  await page.getByRole('button', { name: 'Nueva criatura' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Pegar texto/ })
    .click()
  const paste = page.getByRole('dialog', { name: 'Pegar una ficha' })
  await paste.getByRole('textbox', { name: 'Texto de la ficha' }).fill(`Bandit Captain
Medium humanoid (any race), any non-lawful alignment
Armor Class 15 (studded leather)
Hit Points 65 (10d8 + 20)
Speed 30 ft.
STR DEX CON INT WIS CHA
15 (+2) 16 (+3) 14 (+2) 14 (+2) 11 (+0) 14 (+2)
Challenge 2 (450 XP)
Actions
Scimitar. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.`)
  await paste.getByRole('button', { name: 'Leer la ficha' }).click()
  editor = page.getByRole('dialog', { name: 'Nueva criatura' })
  await expect(editor.getByRole('textbox', { name: 'Nombre', exact: true }).first()).toHaveValue(
    'Bandit Captain',
  )
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(page.getByText('Guardado en el bestiario: Bandit Captain.')).toBeVisible()
  expect(server.templates.find((t) => t.name === 'Bandit Captain')).toMatchObject({
    armor_class: 15,
    max_hp: 65,
    hp_formula: '10d8+20',
    challenge: '2',
  })
  expect(errors).toEqual([])
})

test('RYT-051 bestiary instruments: CR bands, glyph tiles, size bases and dials', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)

  // Filters: a CR band is a toggle; type and size are native checkboxes painted as tiles.
  await page.getByRole('button', { name: 'Filtros' }).click()
  const filters = phone(info)
    ? page.getByRole('dialog', { name: 'Filtrar y ordenar' })
    : page.locator('.mantine-Popover-dropdown')
  const epic = filters.getByRole('button', { name: /^Épicas/ })
  await epic.click()
  await expect(epic).toHaveAttribute('aria-pressed', 'true')
  await expect(filters.getByText('Valor de desafío: 17 a 30')).toBeVisible()
  await filters.getByText('Dragón', { exact: true }).click()
  await expect(filters.getByRole('checkbox', { name: 'Dragón' })).toBeChecked()
  await filters.getByText('Gargantuesco', { exact: true }).click()
  await expect(filters.getByRole('checkbox', { name: 'Gargantuesco' })).toBeChecked()
  await audit(page, phone(info) ? '[role="dialog"]' : '.mantine-Popover-dropdown')
  await expectTouchTargets(filters, '.bst-tile:visible, .bst-tier:visible')
  await evidence(page, info, 'filters', 'RYT-051')
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await expect(page.getByRole('button', { name: /^Dragón rojo anciano/ })).toBeVisible()

  // Archetype: the CR is a spin button, size and type are radio tiles.
  await page.getByRole('button', { name: 'Nueva criatura' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Arquetipo y VD/ })
    .click()
  const arch = page.getByRole('dialog', { name: 'Arquetipo y valor de desafío' })
  await arch.getByRole('textbox', { name: 'Nombre' }).fill('Sierpe del pantano')
  const cr = arch.getByRole('spinbutton', { name: 'VD' })
  await expect(cr).toHaveAttribute('aria-valuetext', 'VD 2')
  await cr.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(cr).toHaveAttribute('aria-valuetext', 'VD 4')
  await arch.getByRole('button', { name: 'Restar a VD' }).click()
  await expect(cr).toHaveAttribute('aria-valuetext', 'VD 3')
  await expect(arch.getByText('700 PX · bonificador de competencia +2')).toBeVisible()
  await arch.getByText('Grande', { exact: true }).click()
  await expect(arch.getByRole('radio', { name: 'Grande' })).toBeChecked()
  await arch.getByText('Dragón', { exact: true }).click()
  await expect(arch.getByRole('radio', { name: 'Dragón' })).toBeChecked()
  await audit(page, '[role="dialog"]')
  await evidence(page, info, 'archetype', 'RYT-051')
  await arch.getByRole('button', { name: 'Crear borrador' }).click()
  const editor = page.getByRole('dialog', { name: 'Nueva criatura' })
  await expect(editor.getByRole('radio', { name: 'Grande' })).toBeChecked()
  await expect(editor.getByRole('spinbutton', { name: 'VD' })).toHaveAttribute(
    'aria-valuetext',
    'VD 3',
  )
  // Ability dials step by one; the saving throw is a seal checkbox.
  const strength = editor.getByRole('textbox', { name: 'Puntuación de Fuerza' })
  const before = Number(await strength.inputValue())
  await editor.getByRole('button', { name: 'Sumar a Puntuación de Fuerza' }).click()
  await expect(strength).toHaveValue(String(before + 1))
  await editor.locator('.bst-ability-field', { hasText: 'Fuerza' }).locator('.bst-seal').click()
  await editor.getByText('d10', { exact: true }).click()
  await expect(editor.getByRole('radio', { name: 'd10' })).toBeChecked()
  await audit(page, '[role="dialog"]')
  await evidence(page, info, 'editor', 'RYT-051')
  await editor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(page.getByText('Guardado en el bestiario: Sierpe del pantano.')).toBeVisible()
  expect(server.templates.find((t) => t.name === 'Sierpe del pantano')).toMatchObject({
    challenge: '3',
    creature_type: 'dragon',
  })
  expect(errors).toEqual([])
})

test('RYT-052 rows reached by Shift+Tab stay clear of the sticky search row', async ({
  page,
}, info) => {
  test.skip(!sheet(info), 'The search row is sticky only without the side pane')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.locator('.bst-row-main').nth(20).focus()
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Shift+Tab')
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      if (!el.closest('.bst-list')) return 0
      const bar = document.querySelector('.bst-toolbar-search')!.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return Math.max(0, Math.min(r.bottom, bar.bottom) - r.top)
    })
    expect(covered).toBe(0)
  }
})

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
  'base64',
)

test('RYT-053/088 every SRD creature has art: the stat block leads with its plate, which views, changes and restores it', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const server = combatServer()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  // List rows show the bundled thumbnail.
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  const row = page.locator('.bst-row', { hasText: /^Lobo/ }).first()
  await expect(row.locator('.combat-token img')).toHaveAttribute(
    'src',
    /bestiary\/thumbs\/wolf\.webp$/,
  )
  await row.locator('.bst-row-main').click()
  const pane = detail(page, info)
  // RYT-088: the stat block leads with the creature's plate. The print opens the viewer; the pencil
  // in its corner changes the image.
  const plate = pane.getByRole('button', { name: 'Ver la imagen de Lobo' })
  const pencil = pane.getByRole('button', { name: 'Cambiar la imagen de Lobo' })
  await expect(plate.locator('img')).toHaveAttribute('src', /bestiary\/art\/wolf\.webp$/)
  await expectTouchTargets(page, '.bst-detail-inner .bst-plate-edit:visible')
  // Above the name on phones; in its own column beside the stat block on wider panes. (The phone
  // sheet's own title is also named after the creature.)
  const heading = pane.locator('.sb-name')
  const at = await settledBox(plate)
  const name = (await heading.boundingBox())!
  if (phone(info)) expect(name.y).toBeGreaterThanOrEqual(at.y + at.height)
  else expect(name.x).toBeGreaterThanOrEqual(at.x + at.width)
  await audit(page)
  await evidence(page, info, 'plate', 'RYT-088')

  // Tap: the viewer opens directly, with the credit of the painted art.
  await plate.click()
  // The viewer stacks above the phone sheet (also named after the creature).
  const viewer = page.locator('.image-viewer-content')
  await expect(viewer.getByRole('heading', { name: 'Lobo' })).toBeVisible()
  await expect(viewer.getByRole('img', { name: 'Imagen de Lobo' })).toHaveAttribute(
    'src',
    /bestiary\/art\/wolf\.webp$/,
  )
  // The credit: author, licence and source.
  for (const term of ['Autoría', 'Licencia', 'Fuente'])
    await expect(viewer.getByText(term, { exact: true })).toBeVisible()
  await expect(viewer.getByText('© Rytta', { exact: true })).toBeVisible()
  await expect(viewer.getByRole('link', { name: /Créditos de arte de Rytta/ })).toHaveAttribute(
    'href',
    /docs\/bestiary-art-credits\.md$/,
  )
  await audit(page, '.image-viewer-content')
  await expectTouchTargets(page, '.image-viewer-content button:visible, .bst-art-label a')
  await evidence(page, info, 'viewer', 'RYT-088')
  // Escape closes the viewer and gives focus back to the plate.
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(plate).toBeFocused()

  // Change: without the DM's own image the pencil opens the file picker directly, and the DM's image
  // for this campaign replaces the bundled art.
  const chooser = page.waitForEvent('filechooser')
  await pencil.click()
  await (await chooser).setFiles({ name: 'wolf.png', mimeType: 'image/png', buffer: png })
  // The saved notice is shown in words under the plate; the heading keeps its width.
  await expect(
    pane.getByRole('status').filter({ hasText: 'Imagen de Lobo guardada' }),
  ).toBeVisible()
  expect((await heading.boundingBox())!.width).toBeGreaterThan(60)
  const status = pane.locator('.combat-image-status')
  expect((await status.boundingBox())!.y).toBeGreaterThan(at.y + at.height - 1)
  await evidence(page, info, 'saved', 'RYT-088')
  await expect
    .poll(() => server.srdImages.get('wolf'))
    .toMatch(new RegExp(`^pre/${campaignId}/srd-wolf/[0-9a-f-]{36}\\.webp$`))
  await expect(plate.locator('img')).toHaveAttribute('src', /public-test\/art\//)
  await expect(pencil).toBeFocused()
  // Its viewer says it is the campaign's own image, with no third-party credit.
  await plate.click()
  await expect(viewer).toContainText('Tu imagen para esta criatura en la campaña. Solo la ves tú.')
  await expect(viewer.getByText('Autoría')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar la imagen' }).click()
  await expect(plate).toBeFocused()

  // Restore: with the DM's own image the pencil opens a short menu; restoring brings the art back.
  await pencil.click()
  await expect(page.getByRole('menuitem')).toHaveText([
    'Cambiar la imagen…',
    'Copiar prompt de arte',
    'Recuperar la ilustración original',
  ])
  // RYT-154: the same menu copies a prompt for the DM's own image, in the house style.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('menuitem', { name: 'Copiar prompt de arte' }).click()
  await expect(pane.getByRole('status').filter({ hasText: 'Prompt copiado' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^Creature portrait .*"Lobo", beast\./,
  )
  await pencil.click()
  await page.getByRole('menuitem', { name: 'Recuperar la ilustración original' }).click()
  await expect(
    pane.getByRole('status').filter({ hasText: 'Lobo vuelve a tener su ilustración original' }),
  ).toBeAttached()
  await expect.poll(() => server.srdImages.has('wolf')).toBe(false)
  await expect(plate.locator('img')).toHaveAttribute('src', /bestiary\/art\/wolf\.webp$/)
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(pencil).toBeFocused()
  await audit(page)

  // Keyboard: Enter on the plate opens the viewer; Escape closes only the viewer (the phone sheet
  // stays) and focus returns to the plate.
  await plate.focus()
  await page.keyboard.press('Enter')
  await expect(viewer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(plate).toBeFocused()
  if (sheet(info)) await expect(page.locator('.bst-sheet')).toBeVisible()

  // Art that cannot load: the plate keeps its square with the creature type glyph, and the viewer
  // says so.
  await page.route('**/bestiary/{thumbs,art}/ogre.webp', (route) => route.fulfill({ status: 404 }))
  if (sheet(info)) {
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
  }
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('ogro')
  await page.locator('.bst-row-main', { hasText: /^Ogro/ }).first().click()
  const ogre = detail(page, info).getByRole('button', { name: 'Ver la imagen de Ogro' })
  await expect(ogre.locator('.bst-plate-glyph')).toBeVisible()
  await ogre.click()
  await expect(viewer).toContainText('No se puede mostrar esta imagen ahora.')
  await page.keyboard.press('Escape')
  await expect(ogre).toBeFocused()
  expect(errors).toEqual([])
})

test('RYT-098 a picture in the list opens the viewer; the row beside it keeps opening the stat block', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  const row = page.locator('.bst-row', { hasText: /^Lobo/ }).first()
  const picture = row.getByRole('button', { name: 'Ver la imagen de Lobo' })
  const main = row.locator('.bst-row-main')
  // Two sibling buttons, never one inside the other.
  await expect(main.getByRole('button')).toHaveCount(0)
  await expect(picture.locator('xpath=ancestor::button')).toHaveCount(0)
  await expectTouchTargets(row, '.combat-token-open')
  await picture.click()
  const viewer = page.getByRole('dialog', { name: 'Lobo', exact: true })
  await expect(viewer.getByRole('img', { name: 'Imagen de Lobo' })).toHaveAttribute(
    'src',
    /bestiary\/art\/wolf\.webp$/,
  )
  await expect(viewer.getByText('Autoría', { exact: true })).toBeVisible()
  await audit(page, '.image-viewer-content')
  await evidence(page, info, 'row-viewer', 'RYT-098')
  // The picture did not select the creature; Escape returns focus to it.
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(picture).toBeFocused()
  await expect(main).not.toHaveAttribute('aria-current', 'true')
  // Arrow keys still move between rows from the picture.
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.bst-row-main').nth(1)).toBeFocused()
  // A tap on the row beside the picture opens the stat block, as before.
  await main.click()
  await expect(main).toHaveAttribute('aria-current', 'true')
  await expect(detail(page, info).locator('.sb-name')).toHaveText('Lobo')
})

test('RYT-046 Players never reach the bestiary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const server = combatServer()
  await identityFixture(page, {
    player: true,
    party: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  const templateRequests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('list_combatant_templates')) templateRequests.push(r.url())
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('tab', { name: 'Bestiario' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Bestiario' })).toHaveCount(0)
  expect(templateRequests).toEqual([])
})

test('RYT-091 the stat block uses the room under its plate: it flows in the pane and keeps a stat column in wide sheets', async ({
  page,
}, info) => {
  test.skip(phone(info), 'Phones keep the plate above the name (RYT-088 test)')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('dragón rojo adulto')
  await page
    .locator('.bst-row', { has: page.getByText('Dragón rojo adulto', { exact: true }) })
    .first()
    .locator('.bst-row-main')
    .click()
  const pane = detail(page, info)
  const plate = pane.locator('.combat-creature-image.is-plate')
  await expect(plate.locator('img')).toBeVisible()
  const box = async (locator: Locator) => (await locator.boundingBox())!
  const at = await settledBox(plate)
  const name = await box(pane.locator('.sb-name'))
  const core = await box(pane.locator('.sb-core'))
  const abilities = await box(pane.locator('.sb-abilities:visible'))
  const frame = await box(pane.locator('.bst-detail-frame'))
  const tiles = await pane
    .locator('.sb-abilities:visible .sb-ability')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().y)))
  // The name sits beside the plate in both layouts.
  expect(name.x).toBeGreaterThanOrEqual(at.x + at.width)
  if (sheet(info)) {
    // Wide sheet: a stat column (plate, numbers, abilities in two rows of three) beside the reading.
    expect(Math.abs(abilities.x - at.x)).toBeLessThan(2)
    expect(abilities.width).toBeLessThanOrEqual(at.width + 1)
    expect(new Set(tiles).size).toBe(2)
    expect(core.y).toBeGreaterThan(at.y + at.height)
    // Tall enough for the whole column: it stays in view while the reading scrolls.
    await page.locator('.bst-sheet').evaluate((node) => (node.scrollTop = 600))
    await expect.poll(async () => Math.round((await box(plate)).y)).toBe(Math.round(at.y))
    await expect(pane.locator('.sb-main')).toContainText('Acciones legendarias')
    // A shorter screen (iPad landscape): the column keeps the plate and the numbers, in view above the
    // action bar, and the abilities lead the reading as one row of six.
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.locator('.bst-sheet').evaluate((node) => (node.scrollTop = 0))
    const reading = pane.locator('.sb-main .sb-abilities')
    await expect(reading).toBeVisible()
    await expect(pane.locator('.sb-aside .sb-abilities')).toBeHidden()
    const row = await reading
      .locator('.sb-ability')
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().y)))
    expect(new Set(row).size).toBe(1)
    await page.locator('.bst-sheet').evaluate((node) => (node.scrollTop = 900))
    const column = await box(pane.locator('.sb-aside'))
    const bar = await box(pane.locator('.bst-actions'))
    expect(column.y).toBeGreaterThan(0)
    expect(column.y + column.height).toBeLessThanOrEqual(bar.y)
    // A notice under the plate makes the column taller than the room: it scrolls with the page
    // instead of hiding its end under the bar.
    await pane.locator('.sb-aside').evaluate((node) => {
      const extra = document.createElement('div')
      extra.style.height = '200px'
      node.append(extra)
    })
    await expect
      .poll(() => pane.locator('.sb-aside').evaluate((node) => node.hasAttribute('data-unstuck')))
      .toBe(true)
    await expect(pane.locator('.sb-aside')).toHaveCSS('position', 'static')
  } else {
    // Side pane: the core numbers beside the plate, everything after them under it at full width.
    expect(core.x).toBeGreaterThanOrEqual(at.x + at.width)
    expect(abilities.y).toBeGreaterThanOrEqual(at.y + at.height)
    expect(abilities.width).toBeGreaterThan(frame.width - 2)
    expect(new Set(tiles).size).toBe(1)
    // Shift+Tab back to the pencil scrolls it clear of the pinned actions (WCAG 2.4.11).
    const term = pane.locator('.sb-main a, .sb-main button').first()
    await term.focus()
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.keyboard.press('Shift+Tab')
    const pencil = pane.getByRole('button', { name: 'Cambiar la imagen de Dragón rojo adulto' })
    await expect(pencil).toBeFocused()
    const bar = await box(pane.locator('.bst-actions'))
    expect((await box(pencil)).y).toBeGreaterThanOrEqual(bar.y + bar.height)
  }
  await audit(page)
  await expectTouchTargets(page, '.bst-detail-inner .bst-plate-edit:visible')
  await evidence(page, info, 'stat-block', 'RYT-091')
})

test('RYT-091 a campaign creature that gets its first image keeps its stat column clear of the action bar', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'identity-tablet', 'The short wide sheet is a tablet layout')
  const server = combatServer()
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  const score = { score: 20, mod: 5, save: 5 }
  server.act('save_combatant_template', {
    target_template: null,
    expected_revision: null,
    data: {
      name: 'Sierpe del pantano',
      side: 'enemy',
      max_hp: 256,
      armor_class: 19,
      initiative_bonus: 2,
      legendary_max: 0,
      notes: '',
      stat_block: {
        name: 'Sierpe del pantano',
        meta: 'Dragón Enorme, caótico malvado',
        ac: '19',
        initiative: '+12 (22)',
        hp: '256 (19d12 + 133)',
        speed:
          '12 m, excavar 9 m, trepar 12 m, nadar 12 m, volar 24 m (levitar); en su forma de niebla, 3 m y volar 9 m; en la guarida, trepar 18 m y nadar 18 m',
        abilities: { str: score, dex: score, con: score, int: score, wis: score, cha: score },
        details: { languages: 'común, dracónico' },
        cr: '17',
        sections: [
          {
            kind: 'actions',
            entries: [
              { key: 'bite', name: 'Mordisco', text: ['Una dentellada muy larga. '.repeat(40)] },
            ],
          },
        ],
      },
    },
    request_id: crypto.randomUUID(),
  })
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByText('331 criaturas', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('sierpe')
  await page
    .locator('.bst-row', { has: page.getByText('Sierpe del pantano', { exact: true }) })
    .first()
    .locator('.bst-row-main')
    .click()
  const pane = detail(page, info)
  // No image yet: the token beside the name, no stat column.
  await expect(pane.locator('.sb-aside')).toHaveCount(0)
  await pane
    .getByLabel('Añadir una imagen de Sierpe del pantano')
    .setInputFiles({ name: 'sierpe.png', mimeType: 'image/png', buffer: png })
  await expect(pane.getByRole('status').filter({ hasText: 'guardada' })).toBeVisible({
    timeout: 15_000,
  })
  // The plate, its notice and a long speed arrive with the column, which no longer fits the short
  // sheet: it is checked again and scrolls with the page instead of ending under the bar.
  const aside = pane.locator('.sb-aside')
  await expect(aside).toBeVisible()
  await expect.poll(() => aside.evaluate((node) => node.hasAttribute('data-unstuck'))).toBe(true)
  await expect(aside).toHaveCSS('position', 'static')
})

// RYT-117: 330 creatures mount only the groups near the viewport.
test('RYT-117 the list mounts a bounded number of rows; jumps, search and keys reach the rest', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await openBestiary(page)
  expect(await page.locator('.bst-row').count()).toBeLessThan(120)
  // The jump strip reaches a group whose rows were not mounted; the heading keeps its count.
  await jumpTo(page, 'Z')
  await expect(page.getByRole('heading', { level: 3, name: /^Z/ })).toBeInViewport()
  await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeVisible()
  expect(await page.locator('.bst-row').count()).toBeLessThan(120)
  // Search is complete: a creature from an unmounted group is found.
  const search = page.getByRole('searchbox', { name: 'Buscar criatura' })
  await search.fill('dragon rojo adulto')
  await expect(page.getByRole('button', { name: /^Dragón rojo adulto/ })).toBeVisible()
  await search.fill('')
  // Home and End walk the whole list, including groups that were not mounted yet.
  await page
    .getByRole('button', { name: /^Aboleth/ })
    .first()
    .focus()
  await page.keyboard.press('End')
  await expect(page.locator('.bst-row-main:focus')).toContainText('Zombi')
  await page.keyboard.press('Home')
  await expect(page.locator('.bst-row-main:focus')).toContainText('Aboleth')
  expect(errors).toEqual([])
})

test('RYT-117 a deep link to a late creature scrolls its row into view and opens it', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary&creature=srd:zombie`)
  await expect(detail(page, info).getByRole('heading', { name: 'Zombi' }).first()).toBeVisible({
    timeout: 30_000,
  })
  expect(await page.locator('.bst-row').count()).toBeLessThan(120)
  await expect(page.locator('.bst-row[data-current]')).toHaveCount(1)
  if (!sheet(info)) await expect(page.locator('.bst-row[data-current]')).toBeInViewport()
})

test('RYT-117 clearing a search restores the exact alphabetical groups, without duplicate keys', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('supabase')) problems.push(m.text())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await openBestiary(page)
  const strip = () => page.locator('.bst-jump-item').allTextContents()
  const before = await strip()
  expect(new Set(before).size).toBe(before.length)
  expect(before).toEqual([...before].sort((a, b) => a.localeCompare(b, 'es')))
  const search = page.getByRole('searchbox', { name: 'Buscar criatura' })
  for (const word of ['dra', 'a']) {
    await search.pressSequentially(word)
    await expect(page.locator('.bst-jump-item')).toHaveCount(0)
    for (let i = 0; i < word.length; i++) await search.press('Backspace')
    await expect(search).toHaveValue('')
    await expect.poll(strip).toEqual(before)
    // The groups never repeat a letter, however the list was reached.
    const heads = await page.locator('.bst-group-head > span:first-child').allTextContents()
    expect(heads).toEqual(before.filter((letter) => heads.includes(letter)))
    expect(new Set(heads).size).toBe(heads.length)
  }
  expect(problems).toEqual([])
})

test('RYT-117 Back closes a creature like Escape: same row, scroll and focus', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await openBestiary(page)
  await jumpTo(page, 'M')
  const row = page.getByRole('button', { name: /^Momia/ }).first()
  await expect(row).toBeVisible()
  // Let the jump finish settling before measuring and clicking.
  await page.waitForTimeout(900)
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const topBefore = (await row.boundingBox())!.y
  // Dispatched on the row: Playwright's own click would scroll sticky bars out of the way first.
  await row.dispatchEvent('click')
  await expect(detail(page, info).getByRole('heading', { name: /Momia/ }).first()).toBeVisible()
  await page.goBack()
  await expect(page.locator('.bst-row[data-current]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Momia/ }).first()).toBeFocused()
  // The row is where it was on screen (not back at the top of a 330-row list).
  const back = (await page
    .getByRole('button', { name: /^Momia/ })
    .first()
    .boundingBox())!
  if (sheet(info)) expect(Math.abs(back.y - topBefore)).toBeLessThan(120)
  // A second open and the close button end on the same row, with no extra history entry left.
  await page
    .getByRole('button', { name: /^Momia/ })
    .first()
    .click()
  await expect(page.locator('.bst-row[data-current]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Momia/ }).first()).toBeFocused()
})

test('RYT-117 jumps and keyboard walks release what they mounted', async ({ page }) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await openBestiary(page)
  for (const letter of ['M', 'Z', 'D', 'S', 'B', 'V']) await jumpTo(page, letter)
  await jumpTo(page, 'A')
  await page
    .getByRole('button', { name: /^Aboleth/ })
    .first()
    .focus()
  await page.keyboard.press('End')
  await page.keyboard.press('Home')
  for (let i = 0; i < 120; i++) await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.locator('.bst-row').count()).toBeLessThan(160)
  expect(await page.evaluate(() => document.querySelectorAll('.bst-list *').length)).toBeLessThan(
    2600,
  )
})

test('RYT-117 the jump strip stays pinned below the search row while the list scrolls', async ({
  page,
}, info) => {
  test.skip(!sheet(info), 'Beside the stat block the strip sticks inside the list column')
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await openBestiary(page)
  await jumpTo(page, 'M')
  const strip = page.locator('.bst-jump')
  const searchRow = page.locator('.bst-toolbar-search')
  await expect(strip).toBeInViewport()
  const bar = (await searchRow.boundingBox())!
  const stripBox = (await strip.boundingBox())!
  // Under the pinned search row, not over it, and the jumped-to heading is clear of both.
  expect(stripBox.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1)
  const head = (await page.getByRole('heading', { level: 3, name: /^M/ }).boundingBox())!
  expect(head.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height - 1)
})

test('RYT-117 closing a creature opened by a deep link focuses its row', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await combatServer().install(page)
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary&creature=srd:zombie`)
  await expect(detail(page, info).getByRole('heading', { name: 'Zombi' }).first()).toBeVisible({
    timeout: 30_000,
  })
  if (sheet(info)) {
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeFocused()
  }
})
