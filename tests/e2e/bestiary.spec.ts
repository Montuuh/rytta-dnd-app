import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { campaignId, identityFixture } from './fixtures/identity.ts'
import { expectTouchTargets } from './fixtures/audit.ts'
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

async function openBestiary(page: Page) {
  await page.goto(`./#/campaign/${campaignId}/members?panel=bestiary`)
  await expect(page.getByRole('heading', { level: 2, name: 'Bestiario' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('330 criaturas', { exact: true })).toBeVisible({ timeout: 15_000 })
}

async function pick(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).first().click()
}

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
  await expect(pane.getByText('Fuerza 27, modificador +8, salvación +8')).toBeAttached()
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
  // ui-ux F1: Escape closes only the dialog; the stat block sheet stays and gets focus back.
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
  // ui-ux R2: tags and alignment come from the SRD type line ("Bestia Mediana, sin alineamiento").
  await expect(editor.getByRole('textbox', { name: 'Etiquetas' })).toHaveValue('')
  await expect(editor.getByRole('textbox', { name: 'Alineamiento' })).toHaveValue(
    'sin alineamiento',
  )
  // ui-ux F3: closing with changes asks first; keeping on editing keeps the draft.
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
  if (sheet(info)) await page.keyboard.press('Escape')

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
  if (sheet(info)) await page.keyboard.press('Escape')

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
  await page.locator('.bst-row-main').nth(25).focus()
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
  const at = (await plate.boundingBox())!
  const name = (await heading.boundingBox())!
  if (phone(info)) expect(name.y).toBeGreaterThanOrEqual(at.y + at.height)
  else expect(name.x).toBeGreaterThanOrEqual(at.x + at.width)
  await audit(page)
  await evidence(page, info, 'plate', 'RYT-088')

  // Tap: the viewer opens directly, with the credit of the painted art.
  await plate.click()
  // The viewer stacks above the phone sheet (also named after the creature).
  const viewer = page.locator('.bst-art-viewer')
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
  await audit(page, '.bst-art-viewer')
  await expectTouchTargets(page, '.bst-art-viewer button:visible, .bst-art-label a')
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
    'Recuperar la ilustración original',
  ])
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
