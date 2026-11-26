import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { identityFixture } from './fixtures/identity.ts'
import { capture, expectTouchTargets, limitMatrix } from './fixtures/audit.ts'
import {
  homebrewPackId,
  libraryServer,
  offerCampaigns,
  srdLibraryPackId,
} from './fixtures/library.ts'

// RYT-093: the content library manager. Editors upload the bundled SRD, edit entries as drafts
// and publish versions; everyone else never sees it.
const phone = (name: string) => name.endsWith('mobile')

async function audit(page: Page, scope = '#main-content') {
  // Dialogs scale in: measure them once the transition ends.
  await page
    .locator(scope)
    .first()
    .evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))),
    )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectTouchTargets(page.locator(scope).first(), 'button:visible, a:visible')
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .include(scope)
    .analyze()
  expect(axe.violations).toEqual([])
}

test('an editor opens the published SRD 5.2.1, keeps its place and edits a creature', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await identityFixture(page)
  const server = libraryServer({ srd: true })
  await server.install(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil/ }).click()
  await page.getByRole('menuitem', { name: 'Biblioteca de contenido' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Biblioteca de contenido' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Biblioteca de contenido · Rytta')
  // RYT-167: the SRD is already in the library; nothing offers to upload it.
  await expect(page.getByRole('button', { name: /Subir el SRD|Completar el SRD/ })).toHaveCount(0)
  await audit(page)
  await page.locator('[data-pack]').first().click()

  // The SRD opens on its creatures, sorted by their Spanish names.
  await expect(
    page.getByRole('heading', { level: 2, name: 'Documento de referencia del sistema 5.2.1' }),
  ).toBeVisible()
  // The list renders after the pack's entries arrive.
  await expect(page.locator('.lib-entry-list .lib-row-name').nth(300)).toBeAttached()
  const names = await page.locator('.lib-entry-list .lib-row-name').allTextContents()
  expect(names.length).toBeGreaterThan(300)
  expect(names).toEqual([...names].sort(new Intl.Collator('es').compare))
  await expect(page.getByText(/cambios sin publicar/)).toHaveCount(0)

  if (phone(info.project.name)) {
    // Coming back from an entry keeps the list position and focuses the entry just left.
    const row = page.locator('.lib-entry-list a').nth(40)
    await row.scrollIntoViewIfNeeded()
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled).toBeGreaterThan(1000)
    await row.click()
    await expect(page.locator('#lib-entry-title')).toBeFocused()
    await page.getByRole('link', { name: 'Documento de referencia del sistema 5.2.1' }).click()
    await expect(row).toBeFocused()
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrolled)).toBeLessThan(4)
  }

  // Search ignores accents and puts the exact name first.
  const firstRow = page.locator('.lib-entry-list .lib-row-name').first()
  await page.getByRole('searchbox').fill('dragon rojo')
  await expect(firstRow).toContainText('Dragón rojo')
  await page.getByRole('searchbox').fill('lobo')
  await expect(firstRow).toHaveText('Lobo')

  // The wolf's numbers and stat blocks come from the published SRD.
  await page.getByRole('link', { name: /^Lobo VD 1\/4 · Bestia/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Lobo' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Nombre (inglés)' })).toHaveValue('Wolf')
  await expect(page.getByText(/^VD 1\/4 · Bestia · CA \d+ · PG \d+$/)).toBeVisible()
  await expect(page.getByText(/^Lobo · Bestia Mediana/)).toBeVisible()
  await expect(page.getByText(/^Wolf · Medium Beast/)).toBeVisible()

  // The stat block editor edits library data: no campaign side or private notes.
  const editBlock = page.locator('.lib-blocks').getByRole('button', { name: 'Editar' }).first()
  await editBlock.click()
  const blockEditor = page.getByRole('dialog', { name: /^Lobo · / })
  await expect(blockEditor).toBeVisible()
  await expect(blockEditor.getByText('Bando', { exact: true })).toHaveCount(0)
  await expect(blockEditor.getByText('Notas privadas')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(blockEditor).toHaveCount(0)
  await expect(editBlock).toBeFocused()

  // A failed save shows inside the stat block editor; the next attempt stores it and closes.
  await editBlock.click()
  await blockEditor.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Lobo gris')
  const failure = '**/rest/v1/rpc/save_content_entry'
  await page.route(failure, (route) => route.fulfill({ status: 500, body: '{}' }))
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor.getByRole('alert')).toContainText('No se pudo contactar con el servidor')
  await expect(blockEditor.getByRole('button', { name: 'Guardar criatura' })).toBeFocused()
  // Discarding after the failure leaves the entry as it was: nothing waits to be saved.
  await page.keyboard.press('Escape')
  await page
    .getByRole('dialog', { name: '¿Descartar los cambios?' })
    .getByRole('button', {
      name: 'Descartar cambios',
    })
    .click()
  await expect(blockEditor).toHaveCount(0)
  await expect(page.getByText(/^Lobo · Bestia Mediana/)).toBeVisible()
  await expect(page.getByText('Cambios sin guardar')).toHaveCount(0)
  // The next attempt stores it and closes.
  await editBlock.click()
  await blockEditor.getByRole('textbox', { name: 'Nombre', exact: true }).first().fill('Lobo gris')
  await page.unroute(failure)
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor).toHaveCount(0)
  await expect(editBlock).toBeFocused()
  await expect(page.getByText(/^Lobo gris · Bestia Mediana/)).toBeVisible()

  // Another editor saves while a stat block is open on a clean form: the stat block editor stays
  // open and the form takes the new version, but the block never replaces that save silently.
  // It joins the form under the conflict banner, which can store it on top.
  const wolf = server.entries().find((e) => e.key === 'wolf')!
  const blockName = blockEditor.getByRole('textbox', { name: 'Nombre', exact: true }).first()
  await editBlock.click()
  await blockName.fill('Lobo pardo')
  Object.assign(wolf, { name_en: 'Grey wolf', revision: wolf.revision + 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('textbox', { name: 'Nombre (inglés)' })).toHaveValue('Grey wolf')
  await expect(blockEditor).toBeVisible()
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor).toHaveCount(0)
  const keepMine = page.getByRole('button', { name: 'Guardar mis cambios encima' })
  await expect(keepMine).toBeFocused()
  expect((wolf.data.es as { name: string }).name).toBe('Lobo gris')
  await keepMine.click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  expect(wolf.name_en).toBe('Grey wolf')
  expect((wolf.data.es as { name: string }).name).toBe('Lobo pardo')

  // With edits of its own, a stat block refused as stale joins them under the conflict banner.
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Wolf')
  Object.assign(wolf, { name_es: 'Lobo ajeno', revision: wolf.revision + 1 })
  await editBlock.click()
  await blockName.fill('Lobo mío')
  await blockEditor.getByRole('button', { name: 'Guardar criatura' }).click()
  await expect(blockEditor).toHaveCount(0)
  await expect(keepMine).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: /^No se ha guardado/ })).toBeVisible()
  await keepMine.click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  expect(wolf.name_en).toBe('Wolf')
  expect((wolf.data.es as { name: string }).name).toBe('Lobo mío')

  if (phone(info.project.name)) {
    // One screen at a time: the editor replaces the list, and its back link returns to it.
    await expect(page.getByRole('searchbox')).toBeHidden()
    await page.getByRole('link', { name: 'Documento de referencia del sistema 5.2.1' }).click()
    await expect(page.getByRole('searchbox')).toBeVisible()
    // Each screen change focuses the screen that replaced the pressed link.
    await page.getByRole('link', { name: 'Paquetes', exact: true }).click()
    const packRow = page.locator('[data-pack]').first()
    await expect(packRow).toBeFocused()
    await packRow.click()
    await expect(page.locator('#lib-entries-title')).toBeFocused()
    await page.getByRole('link', { name: /^Lobo VD 1\/4/ }).click()
    await expect(page.getByRole('searchbox')).toBeHidden()
  } else await expect(page.getByRole('searchbox')).toBeVisible()
  await audit(page)
  await capture(page, `docs/evidence/RYT-093/creature-${info.project.name}.png`)
})

test('RYT-166 the SRD items and classes edit in their own forms', async ({ page }, info) => {
  test.setTimeout(90_000)
  await identityFixture(page)
  const server = libraryServer({ srd: true })
  await server.install(page)
  const items = () => server.entries().filter((e) => e.kind === 'item')
  expect(items()).toHaveLength(197)

  // An item opens in its own form; the price is saved in copper.
  await page.goto(`./library/${srdLibraryPackId}/item`)
  await page.getByRole('searchbox').fill('espada larga')
  await page.getByRole('link', { name: /^Espada larga/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Espada larga' })).toBeFocused()
  await expect(page.getByRole('combobox', { name: 'Categoría' })).toHaveValue('Armas')
  await expect(page.getByRole('textbox', { name: 'Dados de daño' })).toHaveValue('1d8')
  const price = page.getByRole('textbox', { name: 'Precio (po)' })
  await expect(price).toHaveValue('15')
  await audit(page)
  await price.fill('20')
  await page.getByRole('checkbox', { name: 'Arrojadiza' }).check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /Guardado/ })).toBeVisible()
  const longsword = items().find((e) => e.key === 'longsword')!
  expect(longsword.data).toMatchObject({
    index: { key: 'longsword', costCp: 2000, properties: { thrown: true, dice: '1d8' } },
  })

  // RYT-168: a class opens in its own form with its table.
  await page.goto(`./library/${srdLibraryPackId}/class`)
  await page.getByRole('link', { name: /^Guerrero/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Guerrero' })).toBeFocused()
  await expect(page.getByRole('combobox', { name: 'Dado de golpe' })).toHaveValue('d10')
  await expect(page.getByRole('combobox', { name: 'Primera salvación' })).toHaveValue('Fuerza')
  await expect(page.getByRole('textbox', { name: 'Niveles de mejora' })).toHaveValue(
    '4, 6, 8, 12, 14, 16, 19',
  )
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-168/class-form-${info.project.name}.png`)
  // A value the class cannot use is named on its own field.
  await page.getByRole('textbox', { name: 'Niveles de mejora' }).fill('4, ocho')
  await expect(page.getByText('Solo niveles de 1 a 20, separados por comas')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Niveles de mejora' })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await page.getByRole('textbox', { name: 'Niveles de mejora' }).fill('4, 8')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /Guardado/ })).toBeVisible()
  const fighter = server.entries().find((e) => e.kind === 'class' && e.key === 'fighter')!
  expect(fighter.data).toMatchObject({ index: { hitDie: 10, improvementLevels: [4, 8] } })

  // A new class without spells saves with what its form asks for; nothing is marked before.
  await page.goto(`./library/${srdLibraryPackId}/class`)
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  await expect(page.getByText('Elige uno')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Nombre (español)' }).fill('Caballero rúnico')
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Rune Knight')
  await page.getByRole('combobox', { name: 'Dado de golpe' }).click()
  await page.getByRole('option', { name: 'd10' }).click()
  await page.getByRole('combobox', { name: 'Primera salvación' }).click()
  await page.getByRole('option', { name: 'Fuerza' }).click()
  await page.getByRole('combobox', { name: 'Segunda salvación' }).click()
  await page.getByRole('option', { name: 'Constitución' }).click()
  await page.getByRole('textbox', { name: 'Habilidades a elegir' }).fill('2')
  await page.getByRole('checkbox', { name: 'Cualquier habilidad' }).check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Caballero rúnico' })).toBeFocused()
  const rune = server.entries().find((e) => e.kind === 'class' && e.key === 'rune-knight')!
  expect(rune.data).toMatchObject({
    index: { hitDie: 10, saves: ['str', 'con'], skillCount: 2, skills: 'any' },
  })
})

test('RYT-171 species, backgrounds and feats edit in their own forms', async ({ page }, info) => {
  test.setTimeout(90_000)
  await identityFixture(page)
  const server = libraryServer({ srd: true, sample: true })
  await server.install(page)

  // An SRD species opens with its table.
  await page.goto(`./library/${srdLibraryPackId}/species`)
  await page.getByRole('link', { name: /^Goliat/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Goliat' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Velocidad (pies)' })).toHaveValue('35')
  await expect(page.getByRole('textbox', { name: 'Rasgo (español)' }).first()).toHaveValue(
    'Linaje gigante',
  )
  await audit(page)

  // A new species with a trait whose option the player picks.
  await page.goto(`./library/${homebrewPackId}/species`)
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  await page.getByRole('textbox', { name: 'Nombre (español)' }).fill('Tritón')
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Triton')
  await page.getByRole('textbox', { name: 'Velocidad (pies)' }).fill('30')
  await page.getByRole('button', { name: 'Añadir rasgo' }).click()
  await page.getByRole('textbox', { name: 'Rasgo (español)' }).fill('Emisario del mar')
  await page.getByRole('textbox', { name: 'Rasgo (inglés)' }).fill('Emissary of the Sea')
  await expect(
    page.getByText('Su texto es el rasgo «species-triton-emissary-of-the-sea» de este paquete.'),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: 'El jugador elige una opción' }).check()
  await page.getByRole('textbox', { name: 'Opciones' }).fill('Tormenta | Storm\nMarea | Tide')
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-171/species-form-${info.project.name}.png`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Tritón' })).toBeFocused()
  const triton = server.entries().find((e) => e.kind === 'species' && e.key === 'triton')!
  expect(triton.data).toMatchObject({
    index: {
      speed: 30,
      traits: [{ key: 'emissary-of-the-sea', es: 'Emisario del mar', en: 'Emissary of the Sea' }],
      choices: [
        {
          trait: 'emissary-of-the-sea',
          options: [
            { key: 'storm', es: 'Tormenta', en: 'Storm' },
            { key: 'tide', es: 'Marea', en: 'Tide' },
          ],
        },
      ],
    },
  })

  // A feat names its category; a save without one is refused on its field.
  await page.goto(`./library/${homebrewPackId}/feat`)
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  await page.getByRole('textbox', { name: 'Nombre (español)' }).fill('Pendenciero')
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Brawler')
  // The save button stays focusable while blocked; pressing it names the problem on its field.
  await page.getByRole('button', { name: 'Guardar', exact: true }).click({ force: true })
  await expect(
    page.getByRole('status').filter({ hasText: 'Revisa los campos marcados' }),
  ).toBeVisible()
  await expect(page.getByText('Elige uno')).toBeVisible()
  await page.getByRole('combobox', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'De origen' }).click()
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-171/feat-form-${info.project.name}.png`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Pendenciero' })).toBeFocused()
  expect(
    server.entries().find((e) => e.kind === 'feat' && e.key === 'brawler')!.data,
  ).toMatchObject({
    index: { category: 'origin' },
  })

  // A background names its three abilities, its skills and an origin feat from the list.
  await page.goto(`./library/${homebrewPackId}/background`)
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  await page.getByRole('textbox', { name: 'Nombre (español)' }).fill('Marinero')
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Sailor')
  const abilities = page.getByRole('group', { name: /^Características/ })
  for (const name of ['Fuerza', 'Destreza', 'Sabiduría'])
    await abilities.getByRole('checkbox', { name }).check()
  // A fourth is not taken silently: the others wait until one is unticked.
  await expect(abilities.getByRole('checkbox', { name: 'Carisma' })).toBeDisabled()
  for (const name of ['Atletismo', 'Percepción'])
    await page
      .getByRole('group', { name: /^Habilidades/ })
      .getByRole('checkbox', { name })
      .check()
  await page.getByRole('combobox', { name: 'Dote de origen' }).click()
  await expect(page.getByRole('option', { name: 'Alerta · SRD' })).toBeVisible()
  await page.getByRole('option', { name: 'Pendenciero', exact: true }).click()
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-171/background-form-${info.project.name}.png`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Marinero' })).toBeFocused()
  expect(server.entries().find((e) => e.key === 'sailor')!.data).toMatchObject({
    index: {
      abilities: ['str', 'dex', 'wis'],
      skills: ['athletics', 'perception'],
      feat: 'brawler',
    },
  })
})

test('RYT-163 the owner of a private pack chooses the campaigns that see it', async ({ page }) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto(`./library/${homebrewPackId}/spell`)
  await page.getByRole('button', { name: 'Campañas' }).click()
  const dialog = page.getByRole('dialog', { name: 'Campañas de «Homebrew de la mesa»' })
  await expect(dialog.getByText('Ninguna campaña lo ve todavía.')).toBeVisible()
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('combobox', { name: 'Añadir una campaña tuya' }).click()
  await page.getByRole('option', { name: offerCampaigns[1]!.name }).click()
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(dialog.getByText('«Bosque de Ceniza» ya ve el paquete.')).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Con acceso: 1 campaña' })).toBeFocused()
  expect(server.offers.get(homebrewPackId)?.map((c) => c.id)).toEqual([offerCampaigns[1]!.id])
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Quitar Bosque de Ceniza' }).click()
  await expect(dialog.getByText(/ya no ve el paquete/)).toBeVisible()
  expect(server.offers.get(homebrewPackId)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Campañas' })).toBeFocused()
})

test('glossary entries change as drafts: text, JSON, leave guard, discard, delete and undo', async ({
  page,
}, info) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto(`./library/${homebrewPackId}/spell`)
  await page.getByRole('link', { name: /^Lanza de escarcha/ }).click()
  const name = page.getByRole('textbox', { name: 'Nombre (español)' })
  await expect(name).toHaveValue('Lanza de escarcha')
  const text = page.getByRole('textbox', { name: 'Texto (español)' })
  await expect(text).toHaveValue(
    'Lanzas un proyectil de hielo contra una criatura que veas.\n\n**Con un espacio de nivel superior.** El daño aumenta en 1d8.\n\n[[table:1]]',
  )
  await expect(
    page.getByText('Este texto tiene 1 tabla; edítala en la pestaña JSON.'),
  ).toBeVisible()
  const save = page.getByRole('button', { name: 'Guardar', exact: true })
  await name.fill('Lanza helada')
  await expect(page.getByText('Cambios sin guardar')).toBeVisible()
  await save.click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  // The button keeps keyboard focus after saving.
  await expect(save).toBeFocused()
  const entry = server.entries().find((e) => e.key === 'frost-lance')!
  expect(entry.name_es).toBe('Lanza helada')
  // The table survived the text form untouched.
  expect((entry.data.es as { blocks: unknown[] }).blocks).toHaveLength(3)
  // The state shows under the entry's name (the list beside it is hidden on phones).
  const meta = page.locator('.lib-entry-head')
  await expect(meta).toContainText('frost-lance · cambiada')
  if (!phone(info.project.name))
    await expect(page.getByRole('link', { name: /^Lanza helada.*cambiada/ })).toBeVisible()

  // JSON: an invalid edit is explained and the save is refused.
  await page.getByRole('tab', { name: 'JSON' }).click()
  const json = page.getByRole('textbox', { name: 'JSON' })
  await expect(json).toHaveValue(/"lv": 2/)
  await json.fill('{ "index": ')
  await expect(page.getByText(/^No es un JSON válido/)).toBeVisible()
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await json.fill('{ "index": { "lv": 3 } }')
  await expect(page.getByText(/^No es un JSON válido/)).toHaveCount(0)
  await page.getByRole('tab', { name: 'Formulario' }).click()
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('3')

  // Leaving with unsaved changes asks first; keeping on editing keeps them.
  await page.getByRole('link', { name: 'Homebrew de la mesa' }).first().click()
  const leave = page.getByRole('dialog', { name: '¿Descartar los cambios sin guardar?' })
  await expect(leave.getByRole('button', { name: 'Seguir editando' })).toBeFocused()
  await audit(page, '[role="dialog"]')
  await leave.getByRole('button', { name: 'Seguir editando' }).click()
  await expect(leave).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('3')
  if (!phone(info.project.name)) {
    // The open entry's own row has nothing to leave.
    await page.locator('.lib-entry-list .is-current').click()
    await expect(leave).toHaveCount(0)
  }

  // Browser back cannot be stopped: the edits wait for the entry and can be dropped there. Focus
  // moves to the row just left.
  await page.getByRole('textbox', { name: 'Nivel' }).focus()
  await page.goBack()
  await expect(page.locator('#lib-entry-title')).toHaveCount(0)
  const keptRow = page.getByRole('link', { name: /^Lanza helada.*sin guardar/ })
  await expect(keptRow).toBeVisible()
  await expect(keptRow).toBeFocused()
  await page.goForward()
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('3')
  await expect(page.getByText('Cambios sin guardar recuperados.')).toBeVisible()
  await page.getByRole('button', { name: 'Descartarlos' }).click()
  await expect(page.getByRole('textbox', { name: 'Nivel' })).toHaveValue('2')
  await expect(page.getByText('Cambios sin guardar recuperados.')).toHaveCount(0)
  // The row's mark goes with them.
  await expect(page.getByRole('link', { name: /sin guardar/ })).toHaveCount(0)

  // Someone else saves first: these edits are refused instead of saved over it.
  const conflict = page.getByText('Esta entrada ha cambiado mientras editabas.')
  await name.fill('Lanza mía')
  const stored = server.entries().find((e) => e.key === 'frost-lance')!
  Object.assign(stored, { name_es: 'Lanza ajena', revision: stored.revision + 1 })
  await save.click()
  await expect(
    page.getByRole('status').filter({ hasText: /^No se ha guardado: la entrada cambió/ }),
  ).toBeVisible()
  await expect(conflict).toBeVisible()
  // The refused save leads to the banner's two ways out.
  await expect(page.getByRole('button', { name: 'Guardar mis cambios encima' })).toBeFocused()
  expect(stored.name_es).toBe('Lanza ajena')
  await page.getByRole('button', { name: 'Descartar mis cambios' }).click()
  await expect(name).toHaveValue('Lanza ajena')
  await expect(conflict).toHaveCount(0)

  // Edits kept from before another save come back with the conflict, and can be saved over it.
  await name.fill('Lanza mía')
  await page.goBack()
  Object.assign(stored, { name_es: 'Lanza de otra', revision: stored.revision + 1 })
  await page.goForward()
  await expect(conflict).toBeVisible()
  await expect(name).toHaveValue('Lanza mía')
  await page.getByRole('button', { name: 'Guardar mis cambios encima' }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Guardado\.$/ })).toBeVisible()
  await expect(conflict).toHaveCount(0)
  await expect(page.locator('#lib-entry-title')).toBeFocused()
  expect(stored.name_es).toBe('Lanza mía')

  // Going back to the published entry asks first.
  await page.getByRole('button', { name: 'Volver a la publicada' }).click()
  const revert = page.getByRole('dialog', { name: /^¿Volver a la versión publicada/ })
  await expect(revert.locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await revert.getByRole('button', { name: 'Volver a la publicada' }).click()
  await expect(page.getByRole('textbox', { name: 'Nombre (español)' })).toHaveValue(
    'Lanza de escarcha',
  )
  await expect(meta).not.toContainText('cambiada')

  // Deleting a published entry waits for the next version, and can be undone.
  await page.locator('.lib-entry-head').getByRole('button', { name: 'Borrar' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Borrar «Lanza de escarcha»?' })
  await expect(confirm.getByText(/Los DMs la siguen viendo hasta que publiques/)).toBeVisible()
  await expect(confirm.locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Borrar' }).click()
  await expect(page.getByText('Se borra al publicar la próxima versión.')).toBeVisible()
  await expect(meta).not.toContainText('se borra al publicar')
  await expect(page.getByRole('button', { name: 'Borrar' })).toHaveCount(0)
  const undo = page.getByRole('button', { name: 'Deshacer borrado' })
  await expect(undo).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Nombre (español)' })).toBeDisabled()
  await undo.click()
  await expect(page.getByText('Se borra al publicar la próxima versión.')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Nombre (español)' })).toBeEnabled()

  // Another editor's save reaches a clean form without taking focus from the field in use.
  const level = page.getByRole('textbox', { name: 'Nivel' })
  const latest = server.entries().find((e) => e.key === 'frost-lance')!
  await level.focus()
  Object.assign(latest, {
    data: { ...latest.data, index: { ...(latest.data.index as object), lv: 5 } },
    revision: latest.revision + 1,
  })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(level).toHaveValue('5')
  await expect(level).toBeFocused()

  // Another editor deletes the entry while it has edits here: its way back takes focus, and
  // undoing the delete keeps the edits under the conflict banner.
  await name.fill('Lanza conservada')
  Object.assign(latest, { deleted: true, revision: latest.revision + 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(undo).toBeFocused()
  await undo.click()
  await expect(page.getByRole('button', { name: 'Guardar mis cambios encima' })).toBeFocused()
  await expect(name).toHaveValue('Lanza conservada')
  await page.getByRole('button', { name: 'Descartar mis cambios' }).click()
  await expect(name).toHaveValue('Lanza de escarcha')
  await audit(page)
  await capture(page, `docs/evidence/RYT-093/spell-${info.project.name}.png`)
})

test('a new subclass and a content file land as drafts after a report', async ({ page }, info) => {
  // In the light theme, where the refused count must keep its contrast.
  await page.addInitScript(() => localStorage.setItem('rytta-theme', 'parchment'))
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto(`./library/${homebrewPackId}/subclass`)
  // Changing the kind keeps focus on its select.
  const kindSelect = page.getByRole('combobox', { name: 'Tipo' })
  await kindSelect.click()
  await page.getByRole('option', { name: /^Conjuros/ }).click()
  await expect(page).toHaveURL(/\/spell$/)
  await expect(kindSelect).toBeFocused()
  await kindSelect.click()
  await page.getByRole('option', { name: /^Subclases/ }).click()
  await expect(page).toHaveURL(/\/subclass$/)
  await page.getByRole('button', { name: 'Nueva entrada' }).click()
  await page.getByRole('textbox', { name: 'Nombre (español)' }).fill('Círculo de las Mareas')
  await page.getByRole('textbox', { name: 'Nombre (inglés)' }).fill('Circle of Tides')
  await expect(page.getByRole('textbox', { name: 'Clave' })).toHaveValue('circle-of-tides')
  // RYT-168: a subclass names its class before it can be saved.
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.getByRole('combobox', { name: 'Clase' }).click()
  await page.getByRole('option', { name: 'Druida' }).click()
  await page
    .getByRole('textbox', { name: 'Texto (español)' })
    .fill('Primer párrafo.\n\n- Rasgo uno\n- Rasgo dos')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Círculo de las Mareas' })).toBeFocused()
  const created = server.entries().find((e) => e.key === 'circle-of-tides')!
  expect(created.data).toEqual({
    index: { class: 'druid' },
    es: {
      blocks: [
        { t: 'p', x: 'Primer párrafo.' },
        { t: 'ul', items: ['Rasgo uno', 'Rasgo dos'] },
      ],
    },
  })

  // A Rytta content file: two entries go in, one is refused with its reason, and the report
  // after the check still names it.
  // On phones the pack's actions sit on the list screen.
  if (phone(info.project.name))
    await page.getByRole('link', { name: 'Homebrew de la mesa' }).click()
  const importButton = page.getByRole('button', { name: 'Importar' })
  await importButton.click()
  const dialog = page.getByRole('dialog', { name: 'Importar en Homebrew de la mesa' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'subclasses.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'rytta-content',
        version: 1,
        kind: 'subclass',
        entries: [
          {
            key: 'circle-of-ash',
            name_es: 'Círculo de la Ceniza',
            data: { index: { class: 'druid' } },
          },
          {
            key: 'circle-of-embers',
            name_es: 'Círculo de las Brasas',
            name_en: 'Circle of Embers',
            data: { index: { class: 'druid' } },
          },
          { key: 'Bad Key', name_es: 'Mala', data: {} },
        ],
      }),
    ),
  })
  const refusal = 'Entrada 3 (Bad Key): Clave: minúsculas, números y guiones, 80 como mucho'
  await expect(dialog.getByText('2 entradas listas para revisar')).toBeVisible()
  await expect(dialog.getByText(refusal)).toBeVisible()
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Revisar el archivo' }).click()
  await expect(dialog.getByText('Nuevas: 1 · Se actualizan: 1 · Sin cambios: 0')).toBeVisible()
  await expect(dialog.getByText(refusal)).toBeVisible()
  await expect(dialog.getByText('2 entradas listas para revisar')).toHaveCount(0)
  await audit(page, '[role="dialog"]')
  expect(server.entries().some((e) => e.key === 'circle-of-ash')).toBe(false)
  await dialog.getByRole('button', { name: 'Importar 2 entradas' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Importadas como borrador.' }),
  ).toBeVisible()
  expect(server.entries().find((e) => e.key === 'circle-of-ash')?.published).toBeNull()
  // Closing gives focus back to what opened the dialog.
  await expect(importButton).toBeFocused()
  await audit(page)
})

test('a new pack names itself, and a published pack keeps its identifier', async ({ page }) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto('./library')
  await page.getByRole('button', { name: 'Nuevo paquete' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo paquete' })
  await expect(dialog.getByRole('textbox', { name: 'Título (español)' })).toBeFocused()
  await dialog.getByRole('textbox', { name: 'Título (español)' }).fill('Mis criaturas')
  await expect(dialog.getByRole('textbox', { name: 'Identificador' })).toHaveValue('mis-criaturas')
  await expect(dialog.getByRole('radio', { name: /Privado/ })).toBeChecked()
  await audit(page, '[role="dialog"]')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Mis criaturas' })).toBeVisible()
  expect(server.packs.find((p) => p.slug === 'mis-criaturas')).toMatchObject({
    visibility: 'private',
    version: 0,
  })
  // A new pack opens with focus on its heading. Asking to delete it moves focus to Cancel, and
  // Escape brings it back to the delete button.
  await expect(page.locator('#lib-entries-title')).toBeFocused()
  await page.getByRole('button', { name: 'Editar paquete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar paquete' }).click()
  await expect(page.getByRole('dialog', { name: '¿Borrar Mis criaturas?' })).toBeVisible()
  await expect(page.getByRole('dialog').locator('button', { hasText: 'Cancelar' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Borrar paquete' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.goto(`./library/${homebrewPackId}/spell`)
  const editButton = page.getByRole('button', { name: 'Editar paquete' })
  await editButton.click()
  const edit = page.getByRole('dialog', { name: 'Editar Homebrew de la mesa' })
  await expect(edit.getByRole('textbox', { name: 'Identificador' })).toBeDisabled()
  await expect(edit.getByRole('button', { name: 'Borrar paquete' })).toHaveCount(0)
  // Escape closes it and gives focus back to the button that opened it.
  await page.keyboard.press('Escape')
  await expect(edit).toHaveCount(0)
  await expect(editButton).toBeFocused()
  await editButton.click()
  await edit.getByRole('radio', { name: /Público/ }).check()
  // A failed save keeps the dialog open and moves focus to its reason.
  const packFailure = '**/rest/v1/rpc/save_content_pack'
  await page.route(packFailure, (route) => route.fulfill({ status: 500, body: '{}' }))
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit.getByRole('alert')).toBeFocused()
  // A retry that fails again announces its reason again.
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit.getByRole('alert')).toBeFocused()
  await page.unroute(packFailure)
  await edit.getByRole('button', { name: 'Guardar' }).click()
  await expect(edit).toHaveCount(0)
  // Who can read a published pack changes through its own call, after the metadata.
  expect(server.calls.map((c) => c.method).filter((m) => m.includes('pack'))).toEqual(
    expect.arrayContaining(['save_content_pack', 'set_content_pack_visibility']),
  )
  expect(server.packs.find((p) => p.id === homebrewPackId)?.visibility).toBe('public')
})

test('accounts that are not editors see neither the menu item nor the library', async ({
  page,
}) => {
  await identityFixture(page)
  await libraryServer({ editor: false }).install(page)
  await page.goto('./')
  await page.getByRole('button', { name: /Perfil/ }).click()
  await expect(page.getByRole('menuitem', { name: 'Mis campañas' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Biblioteca de contenido' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.goto('./library')
  await expect(page.getByRole('heading', { name: 'Solo para cuentas editoras' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo paquete' })).toHaveCount(0)
  // RYT-184: nobody who cannot write the library reaches the cover control.
  await expect(page.getByRole('region', { name: 'Portada' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Volver a mis campañas' })).toBeVisible()
  await audit(page)
})

test('RYT-174 the base pack tells where each entry comes from and keeps what the app needs', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await identityFixture(page)
  const server = libraryServer({ srd: true, origins: true })
  await server.install(page)

  // The origin filter counts the SRD entries, the changed one and the pack's own.
  await page.goto(`./library/${srdLibraryPackId}/creature`)
  await expect(page.getByRole('heading', { level: 2, name: 'Rytta' })).toBeVisible()
  const filter = page.getByRole('radiogroup', { name: 'Origen' })
  await expect(filter.getByRole('radio', { name: 'Todas 331' })).toBeChecked()
  await expect(filter.getByRole('radio', { name: 'SRD 329' })).toBeAttached()
  await expect(filter.getByRole('radio', { name: 'Modificadas 1' })).toBeAttached()
  await filter.getByText('Rytta 1').click()
  const rows = page.locator('.lib-entry-list .lib-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Lobo de ceniza')
  await expect(rows.first().locator('.lib-row-meta')).toContainText('Rytta')
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-174/origin-list-${info.project.name}.png`)

  // A changed entry says so and shows the SRD original on request.
  await filter.getByText('Modificadas 1').click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('.lib-row-meta')).toContainText('SRD, modificada por Rytta')
  await rows.first().click()
  await expect(page.getByRole('heading', { level: 2, name: 'Lobo de las cumbres' })).toBeFocused()
  await expect(page.locator('.lib-entry-head')).toContainText('SRD, modificada por Rytta')
  const original = page.getByRole('button', { name: 'Ver el original del SRD' })
  await expect(original).toHaveAttribute('aria-expanded', 'false')
  await original.press('Enter')
  const panel = page.getByRole('region', { name: 'Original del SRD' })
  await expect(panel).toContainText('Lobo')
  await expect(panel).not.toContainText('Lobo de las cumbres')
  await expect(page.getByRole('button', { name: 'Ocultar el original' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-174/origin-original-${info.project.name}.png`)

  // An entry the app's code relies on keeps its form and has no Delete. A kind that is all
  // SRD has no origin filter.
  await page.goto(`./library/${srdLibraryPackId}/class`)
  await expect(page.getByRole('link', { name: /^Guerrero/ })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Origen' })).toHaveCount(0)
  await page.getByRole('link', { name: /^Guerrero/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Guerrero' })).toBeFocused()
  await expect(page.getByText('La app usa esta entrada.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible()
  await audit(page)
  await capture(page, `docs/evidence/ui-review/ryt-174/protected-${info.project.name}.png`)
  // An unprotected entry of the same pack still offers it.
  await page.goto(`./library/${srdLibraryPackId}/creature`)
  await page.getByRole('searchbox').fill('lobo de ceniza')
  await page.getByRole('link', { name: /^Lobo de ceniza/ }).click()
  await expect(page.getByRole('button', { name: 'Borrar', exact: true })).toBeVisible()
})

test('RYT-174 the origin filter and the original read in English and the light theme', async ({
  page,
}, info) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    localStorage.setItem('rytta-language', 'en')
    localStorage.setItem('rytta-theme', 'parchment')
  })
  await identityFixture(page)
  const server = libraryServer({ srd: true, origins: true })
  await server.install(page)
  await page.goto(`./library/${srdLibraryPackId}/creature`)
  const filter = page.getByRole('radiogroup', { name: 'Origin' })
  await expect(filter.getByRole('radio', { name: 'All 331' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light')
  // With text at 150% no segment is clipped (UI review round 1).
  await page.addStyleTag({ content: 'html { font-size: 150% }' })
  const clipped = await filter.evaluate(
    (root) =>
      [...root.querySelectorAll<HTMLElement>('.lib-origin-seg')].filter((label) => {
        const box = label.getBoundingClientRect()
        const frame = label.closest('.mantine-SegmentedControl-control')!.getBoundingClientRect()
        return box.left < frame.left - 1 || box.right > frame.right + 1
      }).length + (root.scrollWidth > root.clientWidth + 1 ? 1 : 0),
  )
  expect(clipped).toBe(0)
  await capture(page, `docs/evidence/ui-review/ryt-174/origin-list-150-${info.project.name}.png`, {
    fullPage: false,
  })
  await page.addStyleTag({ content: 'html { font-size: 100% }' })
  await filter.getByText('Changed 1').click()
  const rows = page.locator('.lib-entry-list .lib-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first().locator('.lib-row-meta')).toContainText('SRD, changed by Rytta')
  await audit(page)
  await capture(
    page,
    `docs/evidence/ui-review/ryt-174/origin-list-en-light-${info.project.name}.png`,
  )
  await rows.first().click()
  await page.getByRole('button', { name: 'See the SRD original' }).click()
  await expect(page.getByRole('region', { name: 'SRD original' })).toContainText('Wolf')
  await audit(page)
  await capture(
    page,
    `docs/evidence/ui-review/ryt-174/origin-original-en-light-${info.project.name}.png`,
  )
  await page.goto(`./library/${srdLibraryPackId}/class`)
  await page.getByRole('link', { name: /^Fighter/ }).click()
  await expect(page.getByText('The app uses this entry.')).toBeVisible()
  await audit(page)
})

test('a subclass can give spellcasting to its class', async ({ page }, info) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  await page.goto(`./library/${homebrewPackId}/subclass`)
  await page.getByRole('link', { name: /^Círculo de las Brasas/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Círculo de las Brasas' })).toBeFocused()
  const caster = page.getByRole('combobox', { name: 'Progresión de espacios' })
  await expect(caster).toHaveValue('Sin conjuros')
  await expect(page.getByRole('combobox', { name: 'Característica de lanzamiento' })).toHaveCount(0)
  await caster.click()
  await page.getByRole('option', { name: 'Lanzador de tercio' }).click()
  // Spellcasting needs its ability before the entry can be saved.
  await expect(page.getByText('Elige uno')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await page.getByRole('combobox', { name: 'Característica de lanzamiento' }).click()
  await page.getByRole('option', { name: 'Inteligencia' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, `docs/evidence/ui-review/ryt-175/subclass-form-${info.project.name}.png`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /Guardado/ })).toBeVisible()
  const saved = () => server.entries().find((e) => e.key === 'circle-of-embers')!.data
  expect(saved()).toMatchObject({ index: { class: 'druid', caster: 'third', spellAbility: 'int' } })
  // Back to none: the index keeps no spellcasting field.
  await caster.click()
  await page.getByRole('option', { name: 'Sin conjuros' }).click()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect.poll(() => (saved() as { index: unknown }).index).toEqual({ class: 'druid' })
})

// RYT-184: a pack's cover is the reserved entry pack/cover, drafted and published like any entry.
const coverPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
  'base64',
)
for (const [language, scheme] of [
  ['es', 'dark'],
  ['en', 'light'],
] as const)
  test(`RYT-184 an editor sets and removes a pack's cover (${language}, ${scheme})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000)
    limitMatrix(info, language === 'es')
    const es = language === 'es'
    await page.addInitScript(
      ({ language, scheme }) => {
        localStorage.setItem('rytta-language', language)
        localStorage.setItem('rytta-color-scheme', scheme)
      },
      { language, scheme },
    )
    await identityFixture(page)
    const server = libraryServer({ sample: true })
    await server.install(page)
    await page.goto(`./library/${homebrewPackId}/spell`)
    const cover = page.getByRole('region', { name: es ? 'Portada' : 'Cover' })
    const none = cover.getByText(es ? /Sin portada: la app muestra/ : /No cover: the app shows/)
    await expect(none).toBeVisible()
    await audit(page)
    await capture(page, `test-results/ryt-184-none-${language}-${scheme}-${info.project.name}.png`)

    // A failed upload says so, keeps the editor open and a retry saves.
    const failure = '**/storage/v1/object/pack-images/**'
    await page.route(failure, (route) => route.fulfill({ status: 500, body: '{}' }))
    await cover
      .locator('input[type=file]')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: coverPng })
    const editor = page.getByRole('dialog', {
      name: es ? 'Portada de Homebrew de la mesa' : 'Cover of Table homebrew',
    })
    await expect(editor).toBeVisible()
    const use = editor.getByRole('button', { name: es ? 'Usar como portada' : 'Use as cover' })
    await use.click()
    await expect(editor.getByRole('alert')).toContainText(
      es ? 'No se pudo subir la imagen' : 'could not be uploaded',
    )
    expect(server.entries().some((e) => e.kind === 'pack')).toBe(false)
    await page.unroute(failure)
    await use.click()
    await expect(editor).toHaveCount(0)
    const change = cover.getByRole('button', { name: es ? 'Cambiar' : 'Change', exact: true })
    await expect(change).toBeFocused()
    // Saved as a draft of the reserved entry, the picture named in data.index.image.
    const saved = server.entries().filter((e) => e.kind === 'pack')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      pack_id: homebrewPackId,
      key: 'cover',
      name_en: 'Cover',
      name_es: 'Portada',
      published: null,
    })
    expect(saved[0]!.data).toEqual({
      index: {
        image: expect.stringMatching(new RegExp(`^pre/${homebrewPackId}/[0-9a-f-]{36}\\.webp$`)),
      },
    })
    await expect(
      cover.getByText(es ? /próxima versión que publiques/ : /next version you publish/),
    ).toBeVisible()
    await expect(cover.locator('[data-slot=pack-cover]')).toHaveAttribute('src', /public-test/)
    // It is not content: no kind, list row or pack line names it.
    await page.getByRole('combobox', { name: es ? 'Tipo' : 'Kind' }).click()
    await expect(page.getByRole('option', { name: /^(pack|Portada|Cover)/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.lib-entry-list')).not.toContainText(/Portada|Cover/)
    await audit(page)
    await capture(page, `test-results/ryt-184-set-${language}-${scheme}-${info.project.name}.png`)

    // Never published: removing it withdraws the draft entry.
    await cover.getByRole('button', { name: es ? 'Quitar' : 'Remove', exact: true }).click()
    await expect(none).toBeVisible()
    expect(server.entries().some((e) => e.kind === 'pack')).toBe(false)
    await expect(
      cover.getByRole('button', { name: es ? 'Subir' : 'Upload', exact: true }),
    ).toBeFocused()
  })

test('RYT-184 a published cover is saved without its picture when removed, and a save error shows', async ({
  page,
}) => {
  await identityFixture(page)
  const server = libraryServer({ sample: true })
  await server.install(page)
  const image = `pre/${homebrewPackId}/7a000000-0000-4000-8000-000000000009.webp`
  const data = { index: { image } }
  server.entries().push({
    id: '73000000-0000-4000-8000-000000000999',
    pack_id: homebrewPackId,
    kind: 'pack',
    key: 'cover',
    name_en: 'Cover',
    name_es: 'Portada',
    data,
    deleted: false,
    published: { name_en: 'Cover', name_es: 'Portada', data, version: 1 },
    revision: 1,
    updated_at: '2026-11-20T10:00:00Z',
  })
  await page.goto(`./library/${homebrewPackId}/spell`)
  const cover = page.getByRole('region', { name: 'Portada' })
  await expect(cover.getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible()
  // A save the server refuses is reported where the control is, and the cover stays.
  const failure = '**/rest/v1/rpc/save_content_entry'
  await page.route(failure, (route) => route.fulfill({ status: 500, body: '{}' }))
  await cover.getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(cover.getByRole('alert')).toBeVisible()
  await expect(cover.getByRole('button', { name: 'Cambiar', exact: true })).toBeVisible()
  await page.unroute(failure)
  await cover.getByRole('button', { name: 'Quitar', exact: true }).click()
  await expect(cover.getByRole('button', { name: 'Subir', exact: true })).toBeFocused()
  const entry = server.entries().find((e) => e.kind === 'pack')!
  expect(entry.data).toEqual({ index: {} })
  expect(entry.published?.data).toEqual(data)
  // The change list of the next version reads "Portada", not an entry of a kind named pack.
  await page.getByRole('button', { name: /Publicar versión 2/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Portada' })).toHaveText('Portada')
})
