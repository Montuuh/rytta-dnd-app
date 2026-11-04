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
  const open = page.getByRole('button', { name: 'Filtros' })
  await open.click()
  const filters = page.getByRole('dialog', { name: 'Filtrar y ordenar' })
  await expect(filters).toBeVisible()
  await expect(page.locator('.mantine-Popover-dropdown')).toHaveCount(0)
  await filters.getByText('Muerto viviente', { exact: true }).click()
  await filters.getByRole('button', { name: /^Ver \d+ criaturas?$/ }).click()
  await expect(filters).toHaveCount(0)
  await expect(open).toBeFocused()
  await expect(page.getByRole('button', { name: /^Zombi/ }).first()).toBeVisible()
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
  await expect(dialog.getByLabel('Cuántas')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(
    detail(page, info).getByRole('button', { name: 'Añadir a un encuentro' }),
  ).toBeFocused()
  await detail(page, info).getByRole('button', { name: 'Añadir a un encuentro' }).click()
  await dialog.getByLabel('Cuántas').fill('2')
  await dialog.getByLabel('Nombre para la mesa').fill('Sombra alada')
  await dialog.locator('label', { hasText: /^Tirar 17d10 \+ 85$/ }).click()
  await expect(
    dialog.getByText('Se creará 1 contador: Aliento de fuego (recarga 5–6).'),
  ).toBeVisible()
  await audit(page, '[role="dialog"]')
  await expectTouchTargets(dialog, 'button:visible')
  await evidence(page, info, 'add-dialog', 'RYT-048')
  await dialog.getByRole('button', { name: 'Añadir 2 criaturas' }).click()
  await expect(dialog.getByText('2 × Dragón rojo joven añadidas a Cripta.')).toBeVisible()
  const added = server.encounters.find((e) => e.id === created.encounter_id)!.combatants
  expect(added.map((c) => [c.name, c.public_name, c.srd_id])).toEqual([
    ['Dragón rojo joven 1', 'Sombra alada 1', 'young-red-dragon'],
    ['Dragón rojo joven 2', 'Sombra alada 2', 'young-red-dragon'],
  ])
  expect(added[0]!.trackers?.some((t) => t.kind === 'recharge' && t.min === 5)).toBe(true)

  // The console shows the alias, the trackers and the stat block of the creature.
  await dialog.getByRole('link', { name: 'Abrir el encuentro' }).click()
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

  // Customise: the SRD wolf becomes a campaign creature that remembers its origin.
  await page.getByRole('searchbox', { name: 'Buscar criatura' }).fill('lobo')
  await pick(page, /^Lobo · Wolf/)
  await detail(page, info).getByRole('button', { name: 'Personalizar' }).click()
  let editor = page.getByRole('dialog', { name: 'Nueva criatura' })
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
  await expect(page.getByText('Lobo de sombra guardada en el bestiario.')).toBeVisible()
  const wolf = server.templates.find((t) => t.name === 'Lobo de sombra')!
  expect(wolf).toMatchObject({
    srd_id: 'wolf',
    hp_formula: '2d8+2',
    challenge: '1/4',
    creature_type: 'beast',
  })
  expect((wolf.stat_block as { sections: unknown[] }).sections.length).toBeGreaterThan(0)
  await expect(detail(page, info).getByText('Basada en Lobo')).toBeVisible({ timeout: 15_000 })
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
  await expect(page.getByText('Capitán orco guardada en el bestiario.')).toBeVisible()
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
  await expect(page.getByText('Bandit Captain guardada en el bestiario.')).toBeVisible()
  expect(server.templates.find((t) => t.name === 'Bandit Captain')).toMatchObject({
    armor_class: 15,
    max_hp: 65,
    hp_formula: '10d8+20',
    challenge: '2',
  })
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
