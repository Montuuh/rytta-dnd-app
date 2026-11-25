import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import {
  capture,
  clippedLabels,
  expectTouchTargets,
  limitMatrix,
  placeholderRoom,
} from './fixtures/audit.ts'
import { combatServer } from './fixtures/combat.ts'

// ADR 028 / RYT-046..049: the DM Command Center bestiary (SRD 5.2.1 + campaign creatures).
const size = (project: string) =>
  project === 'identity-mobile' ? 'mobile' : project === 'identity-tablet' ? 'tablet' : null
const phone = (info: TestInfo) => info.project.name === 'identity-mobile'
/** Phones open the stat block in a full screen sheet; from 48em it opens in a pane beside the list. */
const sheet = (info: TestInfo) => (info.project.use.viewport?.width ?? 1440) < 768
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

/** New creature: an entry of the `···` menu beside Filters, at every width. */
async function newCreature(page: Page) {
  await page.getByRole('button', { name: 'Más acciones del bestiario' }).click()
  await page.getByRole('menuitem', { name: 'Nueva criatura' }).click()
}

/** An entry of the stat block's `···` menu. */
async function fromMenu(pane: Locator, page: Page, name: string, creature: string) {
  await pane.getByRole('button', { name: `Más acciones para ${creature}` }).click()
  await page.getByRole('menuitem', { name }).click()
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
    const addThree = pane.getByRole('button', {
      name: es ? 'Añadir 3 a Cripta' : 'Add 3 to Cripta',
      exact: true,
    })
    // The request that succeeds is held open, so the test can move focus while it runs.
    let gate: Promise<void> = Promise.resolve()
    let open = () => {}
    await page.route('**/rest/v1/rpc/add_combatants', async (route) => {
      await gate
      await route.fallback()
    })
    if (checkRetry) {
      await addThree.click()
      await expect(pane.locator('.bst-add-status').getByRole('alert')).toBeInViewport()
      await expect(addThree).toBeFocused()
      expect(fight.combatants).toHaveLength(3)
    }
    gate = new Promise<void>((resolve) => (open = resolve))
    const requested = page.waitForRequest('**/rest/v1/rpc/add_combatants')
    if (checkRetry) await addThree.press('Enter')
    else await addThree.click()
    await requested
    // UI review: focus the user moved during the request is not pulled back to the button.
    await dial.focus()
    open()
    await expect(pane.getByRole('status').filter({ hasText: `3 × ${wolf}` })).toBeVisible()
    await expect(pane.getByRole('button', { name: es ? 'Deshacer' : 'Undo' })).toBeVisible()
    await expect(dial).toHaveValue('1')
    await page.waitForTimeout(1300)
    await expect(dial).toBeFocused()

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
    await pane
      .getByRole('button', { name: es ? 'Añadir a Cripta' : 'Add to Cripta', exact: true })
      .click()
    await expect(pane.getByRole('status').filter({ hasText: `1 × ${zombie}` })).toBeVisible()
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
  // A row is one tab stop; the bookmark lives in the stat block's menu.
  await expect(row.getByRole('button')).toHaveCount(1)
  await row.locator('.bst-row-main').click()
  const pane = detail(page, info)
  await fromMenu(pane, page, 'Añadir Lobo a favoritas', 'Lobo')
  await expect(page.getByText('Lobo está en favoritas.')).toBeVisible()
  await pane.getByRole('button', { name: 'Más acciones para Lobo' }).click()
  // The entry names what it does: the bookmark is filled and the word is now "Quitar".
  await page.getByRole('menuitem', { name: 'Quitar Lobo de favoritas' }).click()
  await expect(page.getByText('Lobo se quitó de favoritas.')).toBeVisible()
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
  // RYT-179: the open panel is marked (the switcher names it on phones).
  if (page.viewportSize()!.width < 768)
    await expect(page.getByRole('button', { name: 'Bestiario, cambiar de panel' })).toBeVisible()
  else
    await expect(
      page
        .getByRole('navigation', { name: 'Centro de mando DM' })
        .getByRole('link', { name: 'Bestiario', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  await audit(page)
  await expectTouchTargets(page, '.bst-row-main:visible')
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
  await expect(page.locator('.bst-row-name').first()).toHaveText('Lobo')
  await search.fill('')
  await page.getByRole('button', { name: 'Filtros' }).click()
  const filters = phone(info)
    ? page.getByRole('dialog', { name: 'Filtros' })
    : page.locator('.mantine-Popover-dropdown')
  await filters.getByText('Muerto viviente', { exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^\d+ criaturas?$/ })).toHaveText(
    /^(1[0-9]|9) criaturas$/,
  )
  await evidence(page, info, 'filters')
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await jumpTo(page, 'Z')
  await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeVisible()
  // Favourites live on this device, in the stat block's menu.
  await page
    .getByRole('button', { name: /^Zombi/ })
    .first()
    .click()
  await fromMenu(detail(page, info), page, 'Añadir Zombi a favoritas', 'Zombi')
  if (sheet(info)) {
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
  }
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
  // Short enough that, at 150% text, the dropdown would not fit under the button.
  await page.setViewportSize({ width: info.project.use.viewport?.width ?? 1440, height: 640 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.addStyleTag({ content: 'html { font-size: 150% }' })
  const open = page.getByRole('button', { name: /^Filtros/ })
  await open.click()
  const filters = page.getByRole('dialog', { name: 'Filtros' })
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

test('the list reads like an index and the filters in force are one muted line with Clear', async ({
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
    ? page.getByRole('dialog', { name: 'Filtros' })
    : page.locator('.mantine-Popover-dropdown')
  await filters.getByText('Dragón', { exact: true }).click()
  await filters.getByText('Valor de desafío', { exact: true }).click()
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await expect(filters).toHaveCount(0)
  // Sorting by CR groups by CR; the filters in force are one muted line of words, no chips.
  await expect(
    page.getByRole('heading', { level: 3, name: /^VD 1\/8 \(1 en este grupo\)$/ }),
  ).toBeVisible()
  const line = page.locator('.bst-filter-line')
  await expect(line).toContainText('Dragón · por desafío')
  await expect(page.locator('.bst-active-chip')).toHaveCount(0)
  await expectTouchTargets(page, '.bst-filter-line button:visible')
  await audit(page)
  await evidence(page, info, 'active-filters', 'RYT-050')
  if (phone(info)) {
    // The head keeps its one row: the search, Filters and the menu side by side, and the list
    // starts right under the two lines (no stacked pills pushing it down).
    const tops = await page.evaluate(() =>
      ['#bestiary-search', '.bst-filter-button', '.bst-head-menu'].map(
        (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
      ),
    )
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(12)
    const first = await page.locator('.bst-row-main').first().boundingBox()
    expect(first!.y).toBeLessThan(470)
  }
  // Clear takes every filter off at once and focus goes to the Filters button.
  await line.getByRole('button', { name: 'Quitar filtros' }).click()
  await expect(line).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Filtros/ })).toBeFocused()
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible()
})

test('the stat block opens in a pane when the panel has room and in the sheet when large text leaves none', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'identity-desktop', 'One project walks the widths')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  for (const [width, text, pane] of [
    [820, '100%', true],
    [820, '150%', false],
    [992, '100%', true],
    [1280, '100%', true],
    [1280, '150%', true],
    [1440, '100%', true],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await openBestiary(page)
    await page.addStyleTag({ content: `html { font-size: ${text} }` })
    await page.getByRole('button', { name: /^Aboleth/ }).click()
    const detailBox = pane ? page.locator('.bst-detail') : page.locator('.bst-sheet')
    await expect(detailBox.getByRole('heading', { name: 'Aboleth' }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (pane) {
      const box = (await detailBox.boundingBox())!
      const list = (await page.locator('.bst-list').boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(270)
      expect(box.x).toBeGreaterThanOrEqual(list.x + list.width)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
    } else await expect(page.locator('.bst-detail')).toHaveCount(0)
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
  // The dialog closes and the stat block keeps one line that says what was added.
  await expect(dialog).toHaveCount(0)
  const done = detail(page, info)
  await expect(
    done.getByRole('status').filter({ hasText: '2 × Dragón rojo joven en Cripta' }),
  ).toBeVisible()
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
  await pick(page, /^Lobo/)
  await fromMenu(detail(page, info), page, 'Editar', 'Lobo')
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
  if ((info.project.use.viewport?.width ?? 1440) < 992) {
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
  await newCreature(page)
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
  await newCreature(page)
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
    ? page.getByRole('dialog', { name: 'Filtros' })
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
  await newCreature(page)
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

test('RYT-052 rows reached by Shift+Tab stay clear of the sticky search and index rows', async ({
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
      const bar = document.querySelector('.bst-index-row')!.getBoundingClientRect()
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

test('RYT-053/088 every SRD creature has art: its thumbnail opens the picture, and the menu changes and restores it', async ({
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
  // The stat block leads with a 56px thumbnail beside the name; tapping it opens the picture.
  const thumb = pane.getByRole('button', { name: 'Ver la imagen de Lobo' })
  const more = pane.getByRole('button', { name: 'Más acciones para Lobo' })
  await expect(thumb.locator('img')).toHaveAttribute('src', /bestiary\/thumbs\/wolf\.webp$/)
  await expectTouchTargets(page, '.bst-detail-inner .bst-thumb:visible')
  const heading = pane.locator('.sb-name')
  const at = await settledBox(thumb)
  const name = (await heading.boundingBox())!
  expect(at.width).toBeGreaterThanOrEqual(44)
  expect(at.width).toBeLessThanOrEqual(64)
  expect(name.x).toBeGreaterThanOrEqual(at.x + at.width)
  await audit(page)
  await evidence(page, info, 'thumb', 'RYT-088')

  // Tap: the viewer opens directly, with the credit of the painted art.
  await thumb.click()
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
  // Escape closes the viewer and gives focus back to the thumbnail.
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(thumb).toBeFocused()

  // Change: the menu opens the file picker, and the DM's image for this campaign replaces the
  // bundled art.
  await more.click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Cambiar la imagen…' }).click()
  await (await chooser).setFiles({ name: 'wolf.png', mimeType: 'image/png', buffer: png })
  await expect(
    pane.getByRole('status').filter({ hasText: 'Imagen de Lobo guardada' }),
  ).toBeVisible()
  expect((await heading.boundingBox())!.width).toBeGreaterThan(60)
  await evidence(page, info, 'saved', 'RYT-088')
  await expect
    .poll(() => server.srdImages.get('wolf'))
    .toMatch(new RegExp(`^pre/${campaignId}/srd-wolf/[0-9a-f-]{36}\\.webp$`))
  await expect(thumb.locator('img')).toHaveAttribute('src', /public-test\/art\//)
  await expect(more).toBeFocused()
  // Its viewer says it is the campaign's own image, with no third-party credit.
  await thumb.click()
  await expect(viewer).toContainText('Tu imagen para esta criatura en la campaña. Solo la ves tú.')
  await expect(viewer.getByText('Autoría')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar la imagen' }).click()
  await expect(thumb).toBeFocused()

  // Restore: with the DM's own image the menu offers to bring the art back.
  await more.click()
  for (const entry of [
    'Cambiar la imagen…',
    'Copiar prompt de arte',
    'Recuperar la ilustración original',
  ])
    await expect(page.getByRole('menuitem', { name: entry })).toBeVisible()
  // RYT-154: the same menu copies a prompt for the DM's own image, in the house style.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('menuitem', { name: 'Copiar prompt de arte' }).click()
  await expect(pane.getByRole('status').filter({ hasText: 'Prompt copiado' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^Creature portrait .*"Lobo", beast\./,
  )
  await more.click()
  await page.getByRole('menuitem', { name: 'Recuperar la ilustración original' }).click()
  await expect(
    pane.getByRole('status').filter({ hasText: 'Lobo vuelve a tener su ilustración original' }),
  ).toBeAttached()
  await expect.poll(() => server.srdImages.has('wolf')).toBe(false)
  await expect(thumb.locator('img')).toHaveAttribute('src', /bestiary\/thumbs\/wolf\.webp$/)
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more).toBeFocused()
  await audit(page)

  // Keyboard: Enter on the thumbnail opens the viewer; Escape closes only the viewer (the phone
  // sheet stays) and focus returns to the thumbnail.
  await thumb.focus()
  await page.keyboard.press('Enter')
  await expect(viewer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)
  await expect(thumb).toBeFocused()
  if (sheet(info)) await expect(page.locator('.bst-sheet')).toBeVisible()

  // Art that cannot load: the thumbnail keeps its token with the creature type glyph, and the
  // viewer says so.
  await page.route('**/bestiary/{thumbs,art}/ogre.webp', (route) => route.fulfill({ status: 404 }))
  if (sheet(info)) {
    await page.keyboard.press('Escape')
    await expect(page.locator('.bst-sheet')).toHaveCount(0)
  }
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('ogro')
  await page.locator('.bst-row-main', { hasText: /^Ogro/ }).first().click()
  const ogre = detail(page, info).getByRole('button', { name: 'Ver la imagen de Ogro' })
  await expect(ogre.locator('.combat-token-glyph')).toBeVisible()
  await ogre.click()
  await expect(viewer).toContainText('No se puede mostrar esta imagen ahora.')
  await page.keyboard.press('Escape')
  await expect(ogre).toBeFocused()
  expect(errors).toEqual([])
})

test('RYT-098 a creature row is one tab stop: its picture is not a control, the row opens the stat block', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  const row = page.locator('.bst-row', { hasText: /^Lobo/ }).first()
  const main = row.locator('.bst-row-main')
  // One button per row: no picture button, no bookmark, no badge.
  await expect(row.getByRole('button')).toHaveCount(1)
  await expect(
    row.locator('.combat-token-open, .bst-fav, .bst-source-badge, .mantine-Badge-root'),
  ).toHaveCount(0)
  await expectTouchTargets(row, '.bst-row-main')
  // Arrow keys move between rows.
  await main.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.bst-row-main').nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(main).toBeFocused()
  // A tap opens the stat block and marks the row.
  await main.click()
  await expect(main).toHaveAttribute('aria-current', 'true')
  await expect(detail(page, info).locator('.sb-name')).toHaveText('Lobo')
  await evidence(page, info, 'row-selected', 'RYT-098')
})

test('RYT-181 a campaign creature without a picture gets its thumbnail from the menu', async ({
  page,
}, info) => {
  const server = combatServer()
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
        speed: '12 m, nadar 12 m',
        abilities: { str: score, dex: score, con: score, int: score, wis: score, cha: score },
        details: { languages: 'común, dracónico' },
        cr: '17',
        sections: [
          {
            kind: 'actions',
            entries: [{ key: 'bite', name: 'Mordisco', text: ['Una dentellada muy larga.'] }],
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
  // No picture yet: a token beside the name that is not a control.
  await expect(pane.getByRole('button', { name: /^Ver la imagen/ })).toHaveCount(0)
  await expect(pane.locator('.bst-thumb')).toBeVisible()
  await pane.getByRole('button', { name: 'Más acciones para Sierpe del pantano' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Añadir una imagen…' }).click()
  await (await chooser).setFiles({ name: 'sierpe.png', mimeType: 'image/png', buffer: png })
  await expect(pane.getByRole('status').filter({ hasText: 'guardada' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(
    pane.getByRole('button', { name: 'Ver la imagen de Sierpe del pantano' }),
  ).toBeVisible()
  await expect(
    pane.getByRole('button', { name: 'Más acciones para Sierpe del pantano' }),
  ).toBeFocused()
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
  await expect(page.getByRole('navigation', { name: 'Centro de mando DM' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Bestiario' })).toHaveCount(0)
  expect(templateRequests).toEqual([])
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

// RYT-181: the bestiary at the table: a list that fits a phone screen, the stat block in table
// order, a pane beside the list, and an add that takes two taps.
test('RYT-181 names that start with the query come first and Enter opens the first result', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  const search = page.getByRole('searchbox', { name: 'Buscar criatura' })
  await search.fill('goblin')
  await expect(page.getByText('5 criaturas', { exact: true })).toBeVisible()
  const names = await page.locator('.bst-row-name').allTextContents()
  // A name or a word of it that starts with the query beats a match inside a word.
  expect(names.indexOf('Capitán hobgoblin')).toBeGreaterThan(names.indexOf('Guerrero goblin'))
  expect(names.indexOf('Capitán hobgoblin')).toBeGreaterThan(names.indexOf('Secuaz goblin'))
  expect(names[0]).toMatch(/goblin$/)
  expect(names[0]).not.toMatch(/hob/i)
  await search.press('Enter')
  await expect(detail(page, info).locator('.sb-name')).toHaveText(names[0]!)
  // Accents and case are ignored.
  await search.fill('CAPITAN')
  await expect
    .poll(async () => {
      const found = await page.locator('.bst-row-name').allTextContents()
      return found.length > 0 && found.every((name) => /^Capit/.test(name))
    })
    .toBe(true)
})

test('RYT-181 on a phone the first screen shows about seven rows of one tab stop each', async ({
  page,
}, info) => {
  test.skip(!phone(info), 'The first screen of a phone')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  const fit = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.bst-row')]
    const boxes = rows.map((row) => row.getBoundingClientRect())
    // The bottom navigation covers the last 65px of the screen.
    return {
      first: boxes[0]!.y,
      heights: boxes.slice(0, 8).map((box) => box.height),
      // A name may wrap at its spaces on a wider face (a second line of the name), the meta line
      // never does: it is one line cut with an ellipsis.
      nameLines: rows.slice(0, 8).map((row) => {
        const name = row.querySelector('.bst-row-name')!.getBoundingClientRect().height
        const line = parseFloat(getComputedStyle(row.querySelector('.bst-row-name')!).lineHeight)
        return Math.round(name / line)
      }),
      metaLines: rows.slice(0, 8).map((row) => {
        const meta = row.querySelector('.bst-row-meta')!
        return Math.round(
          meta.getBoundingClientRect().height / parseFloat(getComputedStyle(meta).lineHeight),
        )
      }),
      fully: boxes.filter((box) => box.bottom <= innerHeight - 65).length,
      badges: document.querySelectorAll('.bst-list .mantine-Badge-root, .bst-source-badge').length,
      stops: rows.slice(0, 8).map((row) => row.querySelectorAll('button, a, input').length),
    }
  })
  expect(fit.first).toBeLessThan(460)
  expect(fit.metaLines.every((lines) => lines === 1)).toBe(true)
  fit.heights.forEach((height, index) => {
    expect(height).toBeGreaterThanOrEqual(52)
    // A row with its name on one line is 56 to 66px at any face; each extra line of a long name
    // adds one line of the name (a wider fallback face wraps "Alfombra asfixiante animada").
    expect(height).toBeLessThanOrEqual(66 + (fit.nameLines[index]! - 1) * 20)
  })
  expect(fit.nameLines.filter((lines) => lines > 1).length).toBeLessThanOrEqual(2)
  expect(fit.fully).toBeGreaterThanOrEqual(6)
  expect(fit.badges).toBe(0)
  expect(fit.stops.every((stops) => stops === 1)).toBe(true)
  // The count is text and the jump strip shares its line.
  const count = (await page.getByText('330 criaturas', { exact: true }).boundingBox())!
  const strip = (await page.locator('.bst-jump').boundingBox())!
  expect(strip.x).toBeGreaterThan(count.x + count.width - 1)
  expect(Math.abs(strip.y + strip.height / 2 - (count.y + count.height / 2))).toBeLessThan(20)
  await audit(page)
  await expectTouchTargets(page, '.bst-row-main:visible, .bst-head-menu, .bst-filter-button')
  await evidence(page, info, 'first-screen', 'RYT-181')
})

test('RYT-181 the stat block reads in table order and a phone shows AC, HP and two attacks at once', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  const search = page.getByRole('searchbox', { name: 'Buscar criatura' })
  await search.fill('dragon rojo adulto')
  await search.press('Enter')
  const pane = detail(page, info)
  await expect(pane.locator('.sb-name')).toHaveText('Dragón rojo adulto')
  // Actions, then traits, then the legendary actions, then the abilities and the details.
  const order = await pane.evaluate((root) => {
    const at = (node: Element | null) => node?.getBoundingClientRect().top ?? Number.NaN
    const title = (text: string) =>
      [...root.querySelectorAll('.sb-section-title')].find((node) => node.textContent === text) ??
      null
    return {
      core: at(root.querySelector('.sb-core')),
      actions: at(title('Acciones')),
      traits: at(title('Atributos')),
      legendary: at(title('Acciones legendarias')),
      abilities: at(root.querySelector('.sb-abilities')),
      details: at(root.querySelector('.sb-details')),
    }
  })
  expect(order.core).toBeLessThan(order.actions)
  expect(order.actions).toBeLessThan(order.traits)
  expect(order.traits).toBeLessThan(order.legendary)
  expect(order.legendary).toBeLessThan(order.abilities)
  expect(order.abilities).toBeLessThan(order.details)
  await expect(pane.locator('.sb-meta')).toContainText('VD 17')
  await audit(page)
  await expectTouchTargets(page, '.bst-detail-inner button:visible, .bst-detail-inner .bst-thumb')
  await evidence(page, info, 'stat-block-order', 'RYT-181')

  if (!phone(info)) return
  // A phone's first screen: armor class, hit points and the first two attacks, above the bar.
  await page.keyboard.press('Escape')
  await expect(page.locator('.bst-sheet')).toHaveCount(0)
  await search.fill('guerrero goblin')
  await search.press('Enter')
  await expect(pane.locator('.sb-name')).toHaveText('Guerrero goblin')
  await settledBox(pane.locator('.sb-core'))
  const view = await page.evaluate(() => {
    const sheet = document.querySelector('.bst-sheet')!
    const bar = sheet.querySelector('.bst-actions')!.getBoundingClientRect()
    const core = sheet.querySelector('.sb-core')!.getBoundingClientRect()
    const entries = [...sheet.querySelectorAll('.sb-entry')].map((node) =>
      node.getBoundingClientRect(),
    )
    return {
      core: core.bottom,
      second: entries[1]!.bottom,
      barTop: bar.top,
      barHeight: bar.height,
      viewport: innerHeight,
    }
  })
  expect(view.core).toBeLessThan(view.viewport)
  expect(view.second).toBeLessThanOrEqual(view.barTop)
  expect(view.barHeight).toBeLessThan(80)
})

test('RYT-181 beside the list the stat block opens in a pane: arrows move it, Escape closes it', async ({
  page,
}, info) => {
  test.skip(phone(info), 'Phones open the stat block in a sheet')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  // Nothing open: no pane, and the rows keep a readable measure.
  await expect(page.locator('.bst-detail')).toHaveCount(0)
  expect((await page.locator('.bst-list').boundingBox())!.width).toBeLessThanOrEqual(752)
  await audit(page)
  await expectTouchTargets(page, '.bst-row-main:visible')
  const rows = page.locator('.bst-row-main')
  await rows.first().click()
  const pane = page.locator('.bst-detail')
  await expect(pane.locator('.sb-name')).toHaveText('Aboleth')
  await expect(rows.first()).toHaveAttribute('aria-current', 'true')
  const list = (await page.locator('.bst-list').boundingBox())!
  const box = (await pane.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(list.x + list.width)
  expect(box.x + box.width).toBeLessThanOrEqual((info.project.use.viewport?.width ?? 1440) + 1)
  // On a portrait tablet the narrow list shows the name and the challenge rating only.
  const meta = page.locator('.bst-row-meta').first()
  if (info.project.name === 'identity-tablet') await expect(meta).toBeHidden()
  else await expect(meta).toBeVisible()
  await expect(page.locator('.bst-row-main').first().locator('.bst-cr')).toBeVisible()
  await audit(page)
  await expectTouchTargets(page, '.bst-detail-inner button:visible, .bst-detail-inner .bst-thumb')
  await evidence(page, info, 'pane', 'RYT-181')
  // Down moves the selection and the pane follows; Up goes back.
  await rows.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
  await expect(rows.first()).not.toHaveAttribute('aria-current', 'true')
  await expect(pane.locator('.sb-name')).toHaveText('Acechador invisible')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(pane.locator('.sb-name')).toHaveText('Aboleth')
  await page.keyboard.press('ArrowDown')
  await expect(pane.locator('.sb-name')).toHaveText('Acechador invisible')
  // Escape closes the pane and focus is back on the row.
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
  await expect(rows.nth(1)).toBeFocused()
  await expect(rows.nth(1)).not.toHaveAttribute('aria-current', 'true')
})

/** A campaign with the fight "Cripta" that the DM opened last. */
async function withCrypt(page: Page, server: ReturnType<typeof combatServer>) {
  const { encounter_id: id } = server.act('create_encounter', {
    encounter_name: 'Cripta',
  }) as { encounter_id: string }
  await page.addInitScript(
    ({ id, campaign }) => sessionStorage.setItem(`rytta.combat.lastEncounter.${campaign}`, id),
    { id, campaign: campaignId },
  )
  return server.encounters.find((entry) => entry.id === id)!
}

test('RYT-181 a creature joins the encounter in two taps and Undo removes exactly those', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  const fight = await withCrypt(page, server)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  // Tap 1: the row. Tap 2: the filled action, which names the encounter.
  await page.locator('.bst-row-main', { hasText: /^Lobo/ }).first().click()
  const pane = detail(page, info)
  const add = pane.getByRole('button', { name: 'Añadir a Cripta', exact: true })
  await expect(add).toBeVisible()
  await audit(page)
  await expectTouchTargets(pane, '.bst-actions button:visible, .bst-actions a:visible')
  // The label keeps its whole line box: no descender (p, y) is cut by the button's clip.
  expect(await clippedLabels(pane, '.bst-actions .bst-action-primary')).toEqual([])
  await evidence(page, info, 'add-bar', 'RYT-181')
  // One row at every width, about 60px: the stepper, the filled action on one line, and the menu.
  const bar = pane.locator('.bst-actions')
  const barBox = (await bar.boundingBox())!
  expect(barBox.height).toBeGreaterThanOrEqual(56)
  expect(barBox.height).toBeLessThanOrEqual(72)
  const addBox = (await add.boundingBox())!
  expect(addBox.height).toBeLessThanOrEqual(48)
  expect(addBox.width).toBeGreaterThanOrEqual(110)
  const tops = await bar
    .locator('.bst-bar > *')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(4)
  // Adding does not move what the user is reading: a phone's stat block keeps its scroll position.
  const frame = pane.locator('.bst-detail-frame')
  const before = sheet(info)
    ? await frame.evaluate((node) => {
        node.scrollTop = 120
        return node.scrollTop
      })
    : 0
  await add.click()
  const status = pane.getByRole('status').filter({ hasText: '1 × Lobo en Cripta' })
  await expect(status).toBeVisible()
  await expect(add).toBeFocused()
  if (sheet(info)) {
    expect(before).toBeGreaterThan(0)
    expect(await frame.evaluate((node) => node.scrollTop)).toBe(before)
  }
  expect(fight.combatants.map((c) => c.srd_id)).toEqual(['wolf'])
  await expect(pane.getByRole('link', { name: 'Abrir el encuentro' })).toBeVisible()
  await evidence(page, info, 'added', 'RYT-181')
  // The line stays; another add replaces it, and Undo removes only the last one.
  await pane.getByRole('textbox', { name: 'Cuántas' }).fill('2')
  await pane.getByRole('button', { name: 'Añadir 2 a Cripta' }).click()
  await expect(pane.getByRole('status').filter({ hasText: '2 × Lobo en Cripta' })).toBeVisible()
  expect(fight.combatants).toHaveLength(3)
  const first = fight.combatants[0]!.id
  await pane.getByRole('button', { name: 'Deshacer' }).click()
  await expect(pane.getByRole('status').filter({ hasText: 'Quitadas de Cripta' })).toBeVisible()
  expect(fight.combatants.map((c) => c.id)).toEqual([first])
  await expect(pane.getByRole('button', { name: 'Deshacer' })).toHaveCount(0)
  // Undo takes its own button with it: focus goes to the add button, not to the page.
  await expect(add).toBeFocused()

  // If the encounter moved on and a combatant is already gone, the line says so.
  await pane.getByRole('button', { name: 'Añadir a Cripta', exact: true }).click()
  await expect(pane.getByRole('status').filter({ hasText: '1 × Lobo en Cripta' })).toBeVisible()
  fight.combatants.splice(1, 1)
  await pane.getByRole('button', { name: 'Deshacer' }).click()
  await expect(
    pane.getByRole('status').filter({ hasText: 'No se pudo quitar 1 criatura' }),
  ).toBeVisible()
  expect(fight.combatants.map((c) => c.id)).toEqual([first])
})

test('RYT-181 another encounter or a new one opens the dialog, which leaves the same line', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  const fight = await withCrypt(page, server)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('zombi')
  await page
    .locator('.bst-row-main', { hasText: /^Zombi/ })
    .first()
    .click()
  const pane = detail(page, info)
  await fromMenu(pane, page, 'Otro encuentro o uno nuevo', 'Zombi')
  const dialog = page.getByRole('dialog', { name: 'Añadir Zombi a un encuentro' })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(500)
  await audit(page, '[role="dialog"]')
  await expectTouchTargets(dialog, 'button:visible')
  await evidence(page, info, 'add-dialog', 'RYT-181')
  await dialog.getByRole('button', { name: 'Añadir a Cripta' }).click()
  // No result screen: the dialog closes and the stat block says it, with the way into the fight.
  await expect(dialog).toHaveCount(0)
  await expect(pane.getByRole('status').filter({ hasText: '1 × Zombi en Cripta' })).toBeVisible()
  await expect(pane.getByRole('link', { name: 'Abrir el encuentro' })).toHaveAttribute(
    'href',
    new RegExp(`/combat/${fight.id}`),
  )
  expect(fight.combatants.map((c) => c.srd_id)).toEqual(['zombie'])
  // After the dialog, focus is on the stat block's add button (never the list row behind a sheet).
  await expect(pane.getByRole('button', { name: 'Añadir a Cripta', exact: true })).toBeFocused()
  await pane.getByRole('button', { name: 'Deshacer' }).click()
  await expect(pane.getByRole('status').filter({ hasText: 'Quitada de Cripta' })).toBeVisible()
  expect(fight.combatants).toHaveLength(0)
})

test('RYT-181 with no encounter the filled action opens the dialog and names the new one', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await page.locator('.bst-row-main', { hasText: /^Lobo/ }).first().click()
  const pane = detail(page, info)
  await pane.getByRole('button', { name: 'Más acciones para Lobo' }).click()
  await expect(page.getByRole('menuitem', { name: 'Otro encuentro o uno nuevo' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await pane.getByRole('button', { name: 'Añadir a un encuentro' }).click()
  const dialog = page.getByRole('dialog', { name: 'Añadir Lobo a un encuentro' })
  await dialog.getByRole('textbox', { name: /Nuevo encuentro/ }).fill('Emboscada')
  await dialog.getByRole('button', { name: 'Añadir a Emboscada' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(pane.getByRole('status').filter({ hasText: '1 × Lobo en Emboscada' })).toBeVisible()
  // The fight just made is now the one the bar adds to.
  await expect(pane.getByRole('button', { name: 'Añadir a Emboscada', exact: true })).toBeVisible()
  expect(server.encounters.map((entry) => entry.name)).toEqual(['Emboscada'])
})

test('RYT-181 a quick creature with typed content asks before it is discarded', async ({
  page,
}) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await newCreature(page)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Rápida/ })
    .click()
  const quick = page.getByRole('dialog', { name: 'Criatura rápida' })
  // Untouched: Escape closes it without asking.
  await page.keyboard.press('Escape')
  await expect(quick).toHaveCount(0)
  await newCreature(page)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Rápida/ })
    .click()
  await quick.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Rata gigante')
  await page.keyboard.press('Escape')
  const discard = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await expect(discard.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  await audit(page, '[role="dialog"]')
  await discard.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(quick.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue(
    'Rata gigante',
  )
  // Cancel asks too; discarding leaves nothing saved.
  await quick.locator('form').getByRole('button', { name: 'Cancelar' }).click()
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Descartar cambios' }).click()
  await expect(quick).toHaveCount(0)
  expect(server.templates).toHaveLength(0)
})

test('RYT-181 a favourite carries a bookmark beside its name, and the empty list says where to add one', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  // Nothing in the head describes the screen to the DM.
  await expect(page.getByText('Solo los DM ven esta sección.')).toHaveCount(0)
  await page.locator('.bst-source label', { hasText: 'Favoritas' }).click()
  await expect(
    page.getByText('Añade criaturas a favoritas desde el menú ··· de su ficha.'),
  ).toBeVisible()
  await page.locator('.bst-source label', { hasText: 'Todas' }).click()
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('wolf')
  const row = page.locator('[data-row-key="srd:wolf"]')
  await row.locator('.bst-row-main').click()
  const pane = detail(page, info)
  await expect(pane.locator('.bst-fav-mark')).toHaveCount(0)
  await fromMenu(pane, page, 'Añadir Lobo a favoritas', 'Lobo')
  // A filled bookmark beside the name in the stat block and at the end of the row's name; both are
  // a mark with a visually hidden word, not a control.
  await expect(pane.locator('.sb-name-row .bst-fav-mark')).toBeVisible()
  await expect(pane.locator('.bst-fav-mark .visually-hidden')).toHaveText(/Favorita/)
  await expect(row.locator('.bst-row-name .bst-fav-mark')).toHaveCount(1)
  await expect(row.getByRole('button')).toHaveCount(1)
  // Saying it twice (add, remove, add) swaps the text of one status line that stays mounted.
  const status = page.locator('.bst-notice [role="status"]')
  await expect(status.first()).toHaveCount(1)
  await fromMenu(pane, page, 'Quitar Lobo de favoritas', 'Lobo')
  await expect(pane.locator('.bst-fav-mark')).toHaveCount(0)
  await expect(row.locator('.bst-fav-mark')).toHaveCount(0)
})

test('RYT-181 the filters sheet has one title, the common close, and marks choices by ink and underline', async ({
  page,
}, info) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.getByRole('button', { name: 'Filtros' }).click()
  const filters = phone(info)
    ? page.getByRole('dialog', { name: 'Filtros', exact: true })
    : page.locator('.mantine-Popover-dropdown')
  if (phone(info)) {
    await expect(filters.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible()
    await expect(filters.getByRole('button', { name: 'Cancelar' })).toHaveCount(0)
  }
  // The sort choices only say what they are: no help lines under them.
  await expect(filters.locator('.bst-choice-help')).toHaveCount(0)
  const epic = filters.getByRole('button', { name: /^Épicas/ })
  await epic.click()
  await filters.getByText('Dragón', { exact: true }).click()
  await filters.getByText('Valor de desafío', { exact: true }).click()
  // Selected tiles and bands: no check badge, and the underline instead of a border and fill.
  await expect(filters.locator('.bst-tier-check')).toHaveCount(0)
  await expect(filters.locator('.bst-tile-seal:visible')).toHaveCount(0)
  const marks = await filters.evaluate((root) => {
    const underline = (node: Element | null | undefined) =>
      node ? getComputedStyle(node).boxShadow : ''
    const chosen = root.querySelector('.bst-tile:has(input:checked)')
    const band = root.querySelector('.bst-tier[aria-pressed="true"]')
    const plain = root.querySelector('.bst-tile:has(input:not(:checked))')
    return {
      chosen: underline(chosen),
      band: underline(band),
      border: [chosen, plain].map((node) => (node ? getComputedStyle(node).borderTopColor : '')),
    }
  })
  expect(marks.chosen).toContain('0px -3px 0px 0px')
  expect(marks.band).toContain('0px -3px 0px 0px')
  expect(marks.border[0]).toBe(marks.border[1])
})

test('RYT-181 a narrow list beside the pane keeps each name whole', async ({ page }, info) => {
  const width = info.project.use.viewport?.width ?? 0
  test.skip(width < 768 || width > 1000, 'The tablet is where the list is narrowest')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  const search = page.getByRole('searchbox', { name: 'Buscar criatura' })
  await search.fill('goblin')
  await page
    .locator('.bst-row-main', { hasText: /^Guerrero goblin/ })
    .first()
    .click()
  await expect(page.locator('.bst-detail')).toBeVisible()
  await search.fill('manto')
  await expect(page.locator('.bst-row-name').first()).toBeVisible()
  // A name of one word takes one line: it is never broken inside the word.
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('.bst-row-name')]
      .filter((node) => !/\s/.test(node.textContent!.trim()))
      .map((node) => {
        const range = document.createRange()
        range.selectNodeContents(node.firstChild!)
        return { name: node.textContent, lines: range.getClientRects().length }
      })
      .filter((entry) => entry.lines > 1),
  )
  expect(broken).toEqual([])
  await audit(page)
})

test('RYT-181 at 150% text the search row keeps its field, its controls share a height and no segment breaks a word', async ({
  page,
}) => {
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  await page.addStyleTag({ content: 'html { font-size: 150%; }' })
  const field = page.getByRole('searchbox', { name: 'Buscar criatura' })
  await expect(field).toBeVisible()
  expect((await field.boundingBox())!.width).toBeGreaterThanOrEqual(100)
  const heights = await page
    .locator('.bst-toolbar-search > *')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2)
  // Segments never hyphenate or break inside a word: a word wider than its segment would overflow.
  const segments = await page
    .locator('.bst-source .mantine-SegmentedControl-label')
    .evaluateAll((labels) =>
      labels.map((label) => {
        const style = getComputedStyle(label)
        return {
          text: label.textContent,
          hyphens: style.hyphens,
          wrap: style.overflowWrap,
          fits: label.scrollWidth <= label.clientWidth + 1,
        }
      }),
    )
  expect(segments.length).toBeGreaterThanOrEqual(4)
  for (const segment of segments) {
    expect(segment.hyphens, segment.text ?? '').toBe('manual')
    expect(segment.wrap, segment.text ?? '').toBe('normal')
    expect(segment.fits, segment.text ?? '').toBe(true)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('RYT-181 the search placeholder fits its field at the default size', async ({
  page,
}, info) => {
  test.skip(!phone(info), 'The narrowest field')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, {
    party: true,
    inventory: true,
    sheet: 'complete',
    modules: ['party', 'combat'],
  })
  await server.install(page)
  await openBestiary(page)
  // The accessible name stays the full one; the placeholder is the short word.
  const creatures = page.getByRole('searchbox', { name: 'Buscar criatura' })
  const room = await placeholderRoom(creatures)
  expect(room.placeholder.length).toBeGreaterThan(3)
  expect(room.text).toBeLessThanOrEqual(room.room)
  // The storeroom field is as narrow: same short placeholder, same room.
  await page.goto(`./#/campaign/${campaignId}/members?panel=items`)
  const items = page.getByRole('searchbox', { name: 'Buscar objetos' })
  await expect(items).toBeVisible()
  const itemRoom = await placeholderRoom(items)
  expect(itemRoom.placeholder.length).toBeGreaterThan(3)
  expect(itemRoom.text).toBeLessThanOrEqual(itemRoom.room)
})

for (const encounter of [true, false])
  test(`RYT-181 at 150% text the add bar keeps every word readable (${encounter ? 'with' : 'without'} an encounter)`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const server = combatServer()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
    await server.install(page)
    if (encounter) await withCrypt(page, server)
    await openBestiary(page)
    await page.addStyleTag({ content: 'html { font-size: 150%; }' })
    await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
    await page.locator('.bst-row-main', { hasText: /^Lobo/ }).first().click()
    const bar = page.locator('.bst-actions')
    const add = bar.getByRole('button', {
      name: encounter ? 'Añadir a Cripta' : 'Añadir a un encuentro',
      exact: true,
    })
    await expect(add).toBeVisible()
    await page.waitForTimeout(500)
    // Not cut sideways or at the descenders, and not an ellipsis of a word or two.
    expect(await clippedLabels(bar, '.bst-action-primary')).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const width = page.viewportSize()!.width
    if (encounter) {
      // The stepper's buttons stay inside its border.
      const inside = await page.locator('.bst-bar-dial').evaluate((dial) => {
        const outer = dial.getBoundingClientRect()
        return [...dial.querySelectorAll('.bst-dial-step')].every((step) => {
          const box = step.getBoundingClientRect()
          return (
            box.left >= outer.left - 0.5 &&
            box.right <= outer.right + 0.5 &&
            box.top >= outer.top - 0.5 &&
            box.bottom <= outer.bottom + 0.5
          )
        })
      })
      expect(inside).toBe(true)
      if (width < 500) {
        // The label no longer fits beside the stepper: the filled action takes the row under it,
        // with the menu at its end, and the action keeps most of the width.
        const dial = (await page.locator('.bst-bar-dial').boundingBox())!
        const more = (await bar.locator('[data-bst-more]').boundingBox())!
        const addBox = (await add.boundingBox())!
        const barBox = (await bar.boundingBox())!
        expect(Math.abs(addBox.y + addBox.height / 2 - (more.y + more.height / 2))).toBeLessThan(8)
        expect(addBox.y).toBeGreaterThan(dial.y + dial.height - 1)
        expect(more.x).toBeGreaterThan(addBox.x + addBox.width - 1)
        expect(more.x + more.width).toBeLessThanOrEqual(barBox.x + barBox.width + 1)
        expect(addBox.width).toBeGreaterThan(barBox.width * 0.6)
      }
    }
  })

test('RYT-181 with no selection the laptop head lines up with the list', async ({ page }, info) => {
  test.skip(info.project.name !== 'identity-desktop', 'Laptop layout')
  const server = combatServer()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await identityFixture(page, { party: true, sheet: 'complete', modules: ['party', 'combat'] })
  await server.install(page)
  await openBestiary(page)
  const measure = await page.evaluate(() => {
    const width = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return {
      row: width('.bst-toolbar-search').width,
      toolbar: width('.bst-toolbar').width,
      list: width('.bst-list').width,
    }
  })
  // The search row carries 4px of padding on each side; its content is the list's measure.
  expect(Math.abs(measure.row - 8 - measure.list)).toBeLessThanOrEqual(4)
  expect(Math.abs(measure.toolbar - measure.list)).toBeLessThanOrEqual(4)
})
